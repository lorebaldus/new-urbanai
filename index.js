const express = require('express');
  const cors = require('cors');
  const path = require('path');
  const { Pinecone } = require('@pinecone-database/pinecone');
  const OpenAI = require('openai');

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static('./'));

  let isInitialized = false;
  let openai = null;

  app.get('/health', (req, res) => {
      res.json({
          status: 'ok',
          initialized: isInitialized,
          timestamp: new Date().toISOString()
      });
  });

  app.post('/api/initialize', async (req, res) => {
      try {
          if (!process.env.OPENAI_API_KEY) {
              throw new Error('OPENAI_API_KEY missing');
          }

          openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          isInitialized = true;

          res.json({ success: true, message: 'Initialized' });
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  });

  app.post('/api/query', async (req, res) => {
      try {
          if (!isInitialized) {
              return res.status(400).json({ error: 'Not initialized' });
          }

          const { question } = req.body;
          const completion = await openai.chat.completions.create({
              messages: [
                  { role: 'system', content: 'You are UrbanAI assistant.' },
                  { role: 'user', content: question }
              ],
              model: 'gpt-3.5-turbo',
              max_tokens: 500
          });

          res.json({
              success: true,
              answer: completion.choices[0].message.content
          });
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  });

  app.get('/', (req, res) => {
      res.sendFile(path.resolve('./index.html'));
  });

  module.exports = app;
