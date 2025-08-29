 // Self-contained Vercel deployment - no external requires
  // No dotenv needed - Vercel handles environment variables

  const express = require('express');
  const cors = require('cors');
  const path = require('path');
  const fs = require('fs');

  // Import dependencies that Vercel will auto-detect
  const { Pinecone } = require('@pinecone-database/pinecone');
  const OpenAI = require('openai');
  const pdfParse = require('pdf-parse');

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.static('./'));

  // Global state
  let isInitialized = false;
  let vectorStore = null;
  let openai = null;

  // Initialize OpenAI and Pinecone
  async function initializeSystem() {
      if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable is required');
      }

      openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
      });

      // Initialize Pinecone if API key exists
      if (process.env.PINECONE_API_KEY) {
          const pc = new Pinecone({
              apiKey: process.env.PINECONE_API_KEY,
          });
          vectorStore = pc;
      }

      isInitialized = true;
      console.log('✅ UrbanAI system initialized');
  }

  // Routes
  app.get('/health', (req, res) => {
      res.json({
          status: 'ok',
          initialized: isInitialized,
          timestamp: new Date().toISOString(),
          env: {
              hasOpenAI: !!process.env.OPENAI_API_KEY,
              hasPinecone: !!process.env.PINECONE_API_KEY,
          }
      });
  });

  app.post('/api/initialize', async (req, res) => {
      try {
          if (isInitialized) {
              return res.json({ message: 'System already initialized' });
          }

          await initializeSystem();
          res.json({
              success: true,
              message: 'System initialized successfully'
          });
      } catch (error) {
          console.error('Initialization error:', error);
          res.status(500).json({
              error: 'Initialization failed',
              details: error.message
          });
      }
  });

  app.post('/api/query', async (req, res) => {
      try {
          if (!isInitialized) {
              return res.status(400).json({ error: 'System not initialized'
  });
          }

          const { question } = req.body;
          if (!question) {
              return res.status(400).json({ error: 'Question is required' });
          }

          // Simple response for now
          const completion = await openai.chat.completions.create({
              messages: [
                  { role: 'system', content: 'You are UrbanAI, an assistant 
  for urban planning questions.' },
                  { role: 'user', content: question }
              ],
              model: 'gpt-3.5-turbo',
              max_tokens: 500
          });

          res.json({
              success: true,
              answer: completion.choices[0].message.content,
              sources: []
          });

      } catch (error) {
          console.error('Query error:', error);
          res.status(500).json({
              error: 'Query failed',
              details: error.message
          });
      }
  });

  app.get('/api/documents', (req, res) => {
      try {
          const docsPath = './docs';
          if (!fs.existsSync(docsPath)) {
              return res.json({ success: true, documents: [], count: 0 });
          }

          const documents = fs.readdirSync(docsPath)
              .filter(file => file.endsWith('.pdf'))
              .map(file => ({
                  name: file,
                  size: fs.statSync(path.join(docsPath, file)).size
              }));

          res.json({
              success: true,
              documents,
              count: documents.length
          });
      } catch (error) {
          res.json({ success: true, documents: [], count: 0 });
      }
  });

  // Serve index.html for root
  app.get('/', (req, res) => {
      res.sendFile(path.resolve('./index.html'));
  });

  // Catch all other routes
  app.get('*', (req, res) => {
      res.sendFile(path.resolve('./index.html'));
  });

  module.exports = app;
