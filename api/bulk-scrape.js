import { MongoClient } from 'mongodb';
  import axios from 'axios';
  import * as cheerio from 'cheerio';

  const client = new MongoClient(process.env.MONGODB_URI);

  export default async function handler(req, res) {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      const { source, startYear, endYear, maxDocuments = 1000 } = req.body;

      if (!source || source !== 'gazzetta_regioni') {
          return res.status(400).json({ error: 'Source must be gazzetta_regioni'
  });
      }

      try {
          await client.connect();
          const db = client.db(process.env.MONGODB_DB);

          console.log(`Starting bulk scrape: ${source}, years 
  ${startYear}-${endYear}`);

          const results = await scrapeGazzettaRegioni(startYear || 2024, endYear
  || 2024, maxDocuments, db);

          res.json({
              success: true,
              source,
              ...results
          });

      } catch (error) {
          console.error('Bulk scrape error:', error);
          res.status(500).json({ error: error.message });
      } finally {
          await client.close();
      }
  }

  async function scrapeGazzettaRegioni(startYear, endYear, maxDocuments, db) {
      const results = {
          totalFound: 0,
          downloaded: 0,
          processed: 0,
          embedded: 0,
          errors: []
      };

      console.log(`Scraping Gazzetta Regioni from ${startYear} to ${endYear}`);

      for (let year = startYear; year <= endYear; year++) {
          console.log(`Processing year: ${year}`);

          try {
              const pdfUrls = await findPdfsForYear(year);
              console.log(`Found ${pdfUrls.length} PDFs for year ${year}`);

              results.totalFound += pdfUrls.length;

              // Process in batches to avoid overwhelming
              const batchSize = 5;
              for (let i = 0; i < pdfUrls.length && results.downloaded <
  maxDocuments; i += batchSize) {
                  const batch = pdfUrls.slice(i, i + batchSize);

                  for (const pdfUrl of batch) {
                      if (results.downloaded >= maxDocuments) break;

                      try {
                          // Check if already exists
                          const existing = await
  db.collection('documents').findOne({ url: pdfUrl });
                          if (existing) {
                              console.log(`Skipping existing: ${pdfUrl}`);
                              continue;
                          }

                          console.log(`Processing PDF: ${pdfUrl}`);

                          // Download and process
                          const docResult = await processSingleDocument(pdfUrl,
  year);
                          if (docResult.success) {
                              results.downloaded++;

                              // Run full pipeline
                              const pipelineResult = await
  runPipeline(docResult.documentId);
                              if (pipelineResult.processed) results.processed++;
                              if (pipelineResult.embedded) results.embedded++;
                          }

                          // Rate limiting: pause between documents
                          await sleep(2000);

                      } catch (docError) {
                          console.error(`Error processing ${pdfUrl}:`,
  docError.message);
                          results.errors.push({ url: pdfUrl, error:
  docError.message });
                      }
                  }

                  // Pause between batches
                  await sleep(5000);
              }

          } catch (yearError) {
              console.error(`Error processing year ${year}:`, yearError.message);
              results.errors.push({ year, error: yearError.message });
          }
      }

      return results;
  }

  async function findPdfsForYear(year) {
      const baseUrl = 'https://www.gazzettaufficiale.it';
      const searchUrl = `${baseUrl}/ricerca/pdf/regioni/3/0/0?reset=true`;

      try {
          console.log(`Fetching search form: ${searchUrl}`);

          // Step 1: Get the search form
          const formResponse = await axios.get(searchUrl, {
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; UrbanAI-Bot/1.0)'
              },
              timeout: 30000
          });

          const $ = cheerio.load(formResponse.data);

          // Step 2: Find form data and submit with year
          const formAction = $('form').attr('action') ||
  '/ricerca/pdf/regioni/3/0/0';
          const formMethod = $('form').attr('method') || 'POST';

          console.log(`Form action: ${formAction}, method: ${formMethod}`);

          // Build form data
          const formData = new URLSearchParams();

          // Add all existing form inputs
          $('input').each((i, el) => {
              const name = $(el).attr('name');
              const value = $(el).attr('value') || '';
              if (name) {
                  formData.append(name, value);
              }
          });

          // Set the year in the select
          $('select').each((i, el) => {
              const name = $(el).attr('name');
              if (name) {
                  formData.append(name, year.toString());
                  console.log(`Setting ${name} = ${year}`);
              }
          });

          console.log('Form data:', formData.toString());

          // Step 3: Submit form to get results
          const resultsResponse = await axios({
              method: formMethod.toUpperCase(),
              url: baseUrl + formAction,
              data: formData,
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; UrbanAI-Bot/1.0)',
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Referer': searchUrl
              },
              timeout: 30000
          });

          console.log(`Results page status: ${resultsResponse.status}`);
          console.log(`Results content length: ${resultsResponse.data.length}`);

          // Step 4: Parse results page for PDF links
          const results$ = cheerio.load(resultsResponse.data);
          const pdfUrls = [];

          results$('a').each((i, el) => {
              const href = results$(el).attr('href');
              const text = results$(el).text().trim();

              if (href && (href.includes('.pdf') || href.includes('pdf'))) {
                  let fullUrl = href;
                  if (href.startsWith('/')) {
                      fullUrl = baseUrl + href;
                  }
                  pdfUrls.push(fullUrl);
                  console.log(`Found PDF: ${fullUrl} (${text})`);
              }
          });

          console.log(`Total PDFs found for ${year}: ${pdfUrls.length}`);
          return [...new Set(pdfUrls)]; // Remove duplicates

      } catch (error) {
          console.error(`Error finding PDFs for year ${year}:`, error.message);
          return [];
      }
  }

  async function processSingleDocument(url, year) {
      try {
          // Call our existing scrape API
          const response = await fetch(`${process.env.VERCEL_URL || 
  'https://urbanator.it'}/api/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  url,
                  type: 'gazzetta_pdf',
                  metadata: { year, source: 'gazzetta_regioni' }
              })
          });

          const result = await response.json();
          return { success: true, documentId: result.documentId };

      } catch (error) {
          return { success: false, error: error.message };
      }
  }

  async function runPipeline(documentId) {
      const results = { processed: false, embedded: false };

      try {
          // Process
          const processResponse = await fetch(`${process.env.VERCEL_URL || 
  'https://urbanator.it'}/api/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documentId })
          });
          const processResult = await processResponse.json();
          results.processed = processResult.chunksCreated > 0;

          if (results.processed) {
              // Embed
              const embedResponse = await fetch(`${process.env.VERCEL_URL || 
  'https://urbanator.it'}/api/embed`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentId })
              });
              const embedResult = await embedResponse.json();
              results.embedded = embedResult.vectorsUploaded > 0;
          }

      } catch (error) {
          console.error(`Pipeline error for ${documentId}:`, error);
      }

      return results;
  }

  function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }
