import { ObjectId } from 'mongodb';
import { MongoClient } from 'mongodb';
  import OpenAI from 'openai';

  const client = new MongoClient(process.env.MONGODB_URI);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export default async function handler(req, res) {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      const { documentId } = req.body;

      if (!documentId) {
          return res.status(400).json({ error: 'Document ID is required' });
      }

      try {
          await client.connect();
          const db = client.db(process.env.MONGODB_DB);

          // Recupera il documento
          const document = await db.collection('documents').findOne({ _id: new
  ObjectId(documentId) });
          if (!document) {
              return res.status(404).json({ error: 'Document not found' });
          }

          if (document.processed) {
              return res.json({ message: 'Document already processed', chunks:
  document.chunks.length });
          }

          console.log(`Processing document: ${document.title}`);

          // Chunking del testo
          const chunks = await createChunks(document.content, document.title);

          // Aggiorna il documento in MongoDB
          await db.collection('documents').updateOne(
              { _id: new ObjectId(documentId) },
              {
                  $set: {
                      processed: true,
                      chunks: chunks,
                      processed_at: new Date(),
                      chunks_count: chunks.length
                  }
              }
          );

          res.json({
              message: 'Document processed successfully',
              documentId,
              chunksCreated: chunks.length
          });

      } catch (error) {
          console.error('Processing error:', error);
          res.status(500).json({ error: error.message });
      } finally {
          await client.close();
      }
  }

  async function createChunks(content, title) {
      const chunks = [];
      const chunkSize = 1000; // caratteri per chunk
      const overlap = 200; // sovrapposizione tra chunks

      // Pulisci il contenuto
      const cleanContent = content
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();

      // Dividi per paragrafi quando possibile
      const paragraphs = cleanContent.split(/\n\s*\n/);

      let currentChunk = '';
      let chunkIndex = 0;

      for (const paragraph of paragraphs) {
          if (currentChunk.length + paragraph.length < chunkSize) {
              currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
          } else {
              if (currentChunk) {
                  chunks.push({
                      index: chunkIndex++,
                      text: currentChunk,
                      length: currentChunk.length,
                      source: title
                  });
              }

              // Se il paragrafo è troppo lungo, dividilo
              if (paragraph.length > chunkSize) {
                  const subChunks = splitLongText(paragraph, chunkSize, overlap);
                  for (const subChunk of subChunks) {
                      chunks.push({
                          index: chunkIndex++,
                          text: subChunk,
                          length: subChunk.length,
                          source: title
                      });
                  }
                  currentChunk = '';
              } else {
                  currentChunk = paragraph;
              }
          }
      }

      // Aggiungi l'ultimo chunk
      if (currentChunk) {
          chunks.push({
              index: chunkIndex++,
              text: currentChunk,
              length: currentChunk.length,
              source: title
          });
      }

      return chunks;
  }

  function splitLongText(text, chunkSize, overlap) {
      const chunks = [];
      let start = 0;

      while (start < text.length) {
          let end = start + chunkSize;

          // Cerca la fine della frase più vicina
          if (end < text.length) {
              const lastPeriod = text.lastIndexOf('.', end);
              const lastSpace = text.lastIndexOf(' ', end);
              if (lastPeriod > start + chunkSize * 0.7) {
                  end = lastPeriod + 1;
              } else if (lastSpace > start + chunkSize * 0.7) {
                  end = lastSpace;
              }
          }

          chunks.push(text.substring(start, end).trim());
          start = end - overlap;
      }

      return chunks;
  }
