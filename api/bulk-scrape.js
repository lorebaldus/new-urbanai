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
          console.log(`Fetching: ${searchUrl}`);
          const response = await axios.get(searchUrl, {
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; UrbanAI-Bot/1.0)'
              },
              timeout: 30000
          });

          console.log(`Response status: ${response.status}`);
          console.log(`Content length: ${response.data.length}`);

          const $ = cheerio.load(response.data);

          // Debug: Log the HTML structure
          console.log('Page title:', $('title').text());
          console.log('Form inputs found:', $('input').length);
          console.log('Links found:', $('a').length);
          console.log('Select elements:', $('select').length);

          // Look for year selection elements
          $('select option').each((i, el) => {
              const value = $(el).attr('value');
              const text = $(el).text();
              if (value && (value.includes('202') || text.includes('202'))) {
                  console.log(`Year option found: ${text} (value: ${value})`);
              }
          });

          // Look for any PDF links
          const allLinks = [];
          $('a').each((i, el) => {
              const href = $(el).attr('href');
              const text = $(el).text().trim();
              if (href) {
                  allLinks.push({ href, text });
              }
          });

          console.log(`Total links: ${allLinks.length}`);
          console.log('First 5 links:', allLinks.slice(0, 5));

          return []; // Return empty for now

      } catch (error) {
          console.error(`Error analyzing page:`, error.message);
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
