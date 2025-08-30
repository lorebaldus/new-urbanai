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
              return res.status(400).json({ error: 'Not initialized'
  });
          }

          const { question } = req.body;

          const completion = await openai.chat.completions.create({
              messages: [
                  {
                      role: 'system',
                      content: `Sei UrbanAI, un assistente 
  specializzato ESCLUSIVAMENTE in pianificazione urbana, normative 
  urbanistiche, edilizia e territorio italiano.

  REGOLE SEVERE:
  - Rispondi SOLO a domande su: urbanistica, edilizia, normative 
  comunali, piani regolatori, permessi di costruire, vincoli 
  territoriali, zonizzazioni, PRG, PGT, regolamenti edilizi, standard 
  urbanistici, opere di urbanizzazione
  - Se la domanda NON riguarda l'urbanistica, rispondi SEMPRE: "Mi 
  dispiace, sono UrbanAI e posso aiutarti solo con questioni di 
  pianificazione urbana e normative edilizie. Potresti riformulare la 
  tua domanda su argomenti urbanistici come permessi di costruire, 
  piani regolatori, vincoli paesaggistici o zonizzazioni?"
  - Non dare mai consigli su: cucina, viaggi, salute, finanza, sport, 
  intrattenimento, relazioni, tecnologia non urbanistica, o altri 
  argomenti non correlati
  - Usa sempre riferimenti normativi italiani (DPR 380/01, Legge 
  Urbanistica 1150/42, Codice dei Beni Culturali, etc.)
  - Sii preciso, tecnico e professionale nelle risposte urbanistiche
  - Se non sei sicuro che la domanda sia urbanistica, chiedi 
  chiarimenti specificando il tuo ambito di competenza`
                  },
                  { role: 'user', content: question }
              ],
              model: 'gpt-3.5-turbo',
              max_tokens: 500,
              temperature: 0.2
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
