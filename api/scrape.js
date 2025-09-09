import { MongoClient } from 'mongodb';
  import axios from 'axios';
  import * as cheerio from 'cheerio';

  const client = new MongoClient(process.env.MONGODB_URI);

  export default async function handler(req, res) {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      const { url, type = 'normattiva' } = req.body;

      if (!url) {
          return res.status(400).json({ error: 'URL is required' });
      }

      try {
          await client.connect();
          const db = client.db(process.env.MONGODB_DB);

          // Controlla se il documento è già stato processato
          const existing = await db.collection('documents').findOne({ url
  });
          if (existing) {
              return res.json({ message: 'Document already processed',
  documentId: existing._id });
          }

          console.log(`Scraping ${type} document: ${url}`);

          let content, title;

          if (type === 'normattiva') {
              const result = await scrapeNormattiva(url);
              content = result.content;
              title = result.title;
          } else {
              throw new Error('Unsupported document type');
          }

          // Salva in MongoDB
          const document = {
              url,
              type,
              title,
              content,
              scraped_at: new Date(),
              processed: false,
              chunks: [],
              embeddings_created: false
          };

          const result = await
  db.collection('documents').insertOne(document);

          res.json({
              message: 'Document scraped successfully',
              documentId: result.insertedId,
              title,
              contentLength: content.length
          });

      } catch (error) {
          console.error('Scraping error:', error);
          res.status(500).json({ error: error.message });
      } finally {
          await client.close();
      }
  }

  async function scrapeNormattiva(url) {
      try {
          const response = await axios.get(url, {
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; UrbanAI/1.0)'
              },
              timeout: 30000
          });

          const $ = cheerio.load(response.data);

          // Estrai il titolo
          const title = $('h1').first().text().trim() ||
                       $('.titolo').text().trim() ||
                       $('title').text().trim();

          // Estrai il contenuto principale
          let content = '';

          // Normattiva ha diverse strutture, proviamo vari selettori
          const contentSelectors = [
              '.contenuto-articolo',
              '.testo-articolo',
              '.corpo-norma',
              '.contenuto',
              'article',
              '.main-content'
          ];

          for (const selector of contentSelectors) {
              const element = $(selector);
              if (element.length > 0) {
                  content = element.text().trim();
                  break;
              }
          }

          // Se non troviamo contenuto con i selettori, prendiamo tutto il 
  body
          if (!content) {
              content = $('body').text().trim();
          }

          // Pulisci il contenuto
          content = content
              .replace(/\s+/g, ' ')
              .replace(/\n\s*\n/g, '\n')
              .trim();

          if (!content || content.length < 100) {
              throw new Error('No meaningful content found');
          }

          return { title, content };

      } catch (error) {
          throw new Error(`Failed to scrape Normattiva: ${error.message}`);
      }
  }
