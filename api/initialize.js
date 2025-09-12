 import { MongoClient } from 'mongodb';
  import axios from 'axios';
  import * as cheerio from 'cheerio';
  import pdf from 'pdf-parse';

  const MONGODB_URI = process.env.MONGODB_URI;

  export default async function handler(req, res) {
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { action, command, ...params } = req.body;

      try {
          // Handle commands
          const cmd = action || command;

          if (cmd === 'admin' || cmd === 'stats') {
              return await handleAdmin(req, res);
          }

          if (cmd === 'bulk-scrape' || cmd === 'scrape-2024') {
              return await handleBulkScrape(req, res, params);
          }

          if (cmd === 'scrape-single') {
              return await handleScrape(req, res, params);
          }

          // Default response
          return res.status(200).json({
              success: true,
              message: 'UrbanAI system initialized',
              availableCommands: ['admin', 'bulk-scrape', 'scrape-single'],
              timestamp: new Date().toISOString()
          });

      } catch (error) {
          console.error('Initialize handler error:', error);
          return res.status(500).json({
              success: false,
              error: 'Internal server error',
              message: error.message
          });
      }
  }

  async function handleAdmin(req, res) {
      try {
          const client = new MongoClient(MONGODB_URI);
          await client.connect();
          const db = client.db('urbanai');
          const documentsCollection = db.collection('documents');

          const totalDocuments = await documentsCollection.countDocuments();
          const processedDocuments = await documentsCollection.countDocuments({
  processed: true });
          const embeddedDocuments = await documentsCollection.countDocuments({ embedded:
  true });

          await client.close();

          return res.status(200).json({
              success: true,
              statistics: {
                  totalDocuments,
                  processedDocuments,
                  embeddedDocuments,
                  completionRate: totalDocuments > 0 ? Math.round((processedDocuments /
  totalDocuments) * 100) : 0
              },
              message: `Database: ${totalDocuments} docs, ${processedDocuments} 
  processed`
          });

      } catch (error) {
          return res.status(500).json({
              success: false,
              error: 'Failed to fetch statistics',
              message: error.message
          });
      }
  }

  async function handleBulkScrape(req, res, params) {
      const { source = 'regioni', year = 2024 } = params;

      try {
          console.log(`Starting bulk scrape for ${source} year ${year}`);

          const pdfUrls = await findPdfsForYear(year, source);
          console.log(`Found ${pdfUrls.length} PDFs for year ${year}`);

          if (pdfUrls.length === 0) {
              return res.status(200).json({
                  success: true,
                  message: `No PDFs found for ${source} year ${year}`,
                  totalFound: 0
              });
          }

          // Process 3 documents to avoid timeout
          const maxDocs = Math.min(pdfUrls.length, 3);
          const docsToProcess = pdfUrls.slice(0, maxDocs);
          const processedResults = [];

          for (const pdfUrl of docsToProcess) {
              try {
                  console.log(`Processing: ${pdfUrl}`);

                  const scrapeResult = await scrapeSinglePDF(pdfUrl,
  `gazzetta_${source}`);
                  if (scrapeResult.success) {
                      processedResults.push({
                          url: pdfUrl,
                          documentId: scrapeResult.documentId,
                          title: scrapeResult.title
                      });
                  }

                  await new Promise(resolve => setTimeout(resolve, 1000));

              } catch (error) {
                  console.error(`Error processing ${pdfUrl}:`, error);
              }
          }

          return res.status(200).json({
              success: true,
              year: year,
              totalFound: pdfUrls.length,
              processed: processedResults.length,
              remaining: pdfUrls.length - maxDocs,
              results: processedResults,
              message: `Processed ${processedResults.length} documents. ${pdfUrls.length 
  - maxDocs} remaining.`
          });

      } catch (error) {
          return res.status(500).json({
              success: false,
              error: 'Bulk scrape failed',
              message: error.message
          });
      }
  }

  async function handleScrape(req, res, params) {
      const { url, source = 'manual' } = params;

      if (!url) {
          return res.status(400).json({ success: false, error: 'URL is required' });
      }

      try {
          const result = await scrapeSinglePDF(url, source);
          return res.status(200).json(result);
      } catch (error) {
          return res.status(500).json({
              success: false,
              error: 'Scrape failed',
              message: error.message
          });
      }
  }

  async function findPdfsForYear(year, source = 'regioni') {
      try {
          const formData = new URLSearchParams();
          formData.append('anno', year.toString());
          formData.append('submit', 'Cerca');

          const response = await axios.post(
              'https://www.gazzettaufficiale.it/ricerca/regioni/risultati',
              formData,
              {
                  headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
                  },
                  timeout: 15000
              }
          );

          if (response.status === 200) {
              const $ = cheerio.load(response.data);
              const urls = [];

              $('a[href*=".pdf"]').each((i, element) => {
                  let pdfUrl = $(element).attr('href');
                  if (pdfUrl) {
                      if (pdfUrl.startsWith('/')) {
                          pdfUrl = 'https://www.gazzettaufficiale.it' + pdfUrl;
                      }
                      urls.push(pdfUrl);
                  }
              });

              return [...new Set(urls)];
          }

          return [];

      } catch (error) {
          console.error('Error finding PDFs:', error);
          return [];
      }
  }

  async function scrapeSinglePDF(url, source) {
      const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
          }
      });

      const pdfData = await pdf(response.data);
      const content = pdfData.text.replace(/\s+/g, ' ').trim();
      const title = url.split('/').pop().replace('.pdf', '') || 'PDF Document';

      if (content.length < 50) {
          throw new Error('Document content too short');
      }

      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      const db = client.db('urbanai');
      const documentsCollection = db.collection('documents');

      const existingDoc = await documentsCollection.findOne({ url: url });
      if (existingDoc) {
          await client.close();
          return {
              success: true,
              message: 'Document already exists',
              documentId: existingDoc._id.toString(),
              title: existingDoc.title
          };
      }

      const document = {
          url: url,
          title: title,
          content: content,
          source: source,
          documentType: 'pdf',
          contentLength: content.length,
          createdAt: new Date(),
          processed: false,
          embedded: false
      };

      const result = await documentsCollection.insertOne(document);
      await client.close();

      return {
          success: true,
          documentId: result.insertedId.toString(),
          title: title,
          contentLength: content.length,
          message: 'Document scraped successfully'
      };
  }
