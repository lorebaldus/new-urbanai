import { MongoClient, ObjectId } from 'mongodb';

  const client = new MongoClient(process.env.MONGODB_URI);

  export default async function handler(req, res) {
      try {
          await client.connect();
          const db = client.db(process.env.MONGODB_DB);

          if (req.method === 'GET') {
              // Lista tutti i documenti
              const documents = await db.collection('documents')
                  .find({})
                  .sort({ scraped_at: -1 })
                  .limit(50)
                  .toArray();

              const stats = {
                  total: await db.collection('documents').countDocuments(),
                  processed: await db.collection('documents').countDocuments({ processed:
  true }),
                  embedded: await db.collection('documents').countDocuments({
  embeddings_created: true })
              };

              res.json({ documents, stats });

          } else if (req.method === 'POST') {
              const { action, url, documentId } = req.body;

              const baseUrl = req.headers.host?.includes('localhost')
                  ? `http://${req.headers.host}`
                  : 'https://urbanator.it';

              if (action === 'scrape_and_process') {
                  // Pipeline completa: scrape → process → embed
                  const results = await runFullPipeline(url, baseUrl);
                  res.json(results);

              } else if (action === 'process_document' && documentId) {
                  // Solo processing
                  const result = await processDocument(documentId);
                  res.json(result);

              } else if (action === 'embed_document' && documentId) {
                  // Solo embedding
                  const result = await embedDocument(documentId);
                  res.json(result);

              } else {
                  res.status(400).json({ error: 'Invalid action' });
              }
          } else {
              res.status(405).json({ error: 'Method not allowed' });
          }

      } catch (error) {
          console.error('Admin error:', error);
          res.status(500).json({ error: error.message });
      } finally {
          await client.close();
      }
  }

  async function runFullPipeline(url, baseUrl) {
      const results = { steps: [] };

      try {
          // Step 1: Scrape
          const scrapeResponse = await fetch(`${baseUrl}/api/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url, type: 'normattiva' })
          });
          const scrapeData = await scrapeResponse.json();
          results.steps.push({ step: 'scrape', success: true, data: scrapeData });

          const documentId = scrapeData.documentId;

          // Step 2: Process
          const processResponse = await fetch(`${baseUrl}/api/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documentId })
          });
          const processData = await processResponse.json();
          results.steps.push({ step: 'process', success: true, data: processData });

          // Step 3: Embed
          const embedResponse = await fetch(`${baseUrl}/api/embed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documentId })
          });
          const embedData = await embedResponse.json();
          results.steps.push({ step: 'embed', success: true, data: embedData });

          results.success = true;
          results.message = `Pipeline completed: ${embedData.vectorsUploaded} vectors added`;

      } catch (error) {
          results.success = false;
          results.error = error.message;
      }

      return results;
  }
