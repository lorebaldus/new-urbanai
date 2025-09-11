  import { MongoClient, ObjectId } from 'mongodb';
  import { Pinecone } from '@pinecone-database/pinecone';
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

          if (!document.processed || !document.chunks) {
              return res.status(400).json({ error: 'Document must be processed first' });
          }

          if (document.embeddings_created) {
              return res.json({ message: 'Embeddings already created', vectorsCount:
  document.chunks.length });
          }

          console.log(`Creating embeddings for: ${document.title}`);

          // Inizializza Pinecone
          const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
          const index = pc.index(process.env.PINECONE_INDEX_NAME);

          // Genera embeddings per tutti i chunks
          const vectors = [];
          for (let i = 0; i < document.chunks.length; i++) {
              const chunk = document.chunks[i];

              // Genera embedding
              const embeddingResponse = await openai.embeddings.create({
                  model: 'text-embedding-ada-002',
                  input: chunk.text
              });

              const embedding = embeddingResponse.data[0].embedding;

              // Prepara il vettore per Pinecone
              vectors.push({
                  id: `${documentId}_chunk_${i}`,
                  values: embedding,
                  metadata: {
                      document_id: documentId,
                      chunk_index: i,
                      text: chunk.text,
                      source: chunk.source,
                      url: document.url,
                      type: document.type,
                      scraped_at: document.scraped_at
                  }
              });

              console.log(`Created embedding for chunk ${i + 1}/${document.chunks.length}`);
          }

          // Upload su Pinecone in batch
          await index.upsert(vectors);

          // Aggiorna documento in MongoDB
          await db.collection('documents').updateOne(
              { _id: new ObjectId(documentId) },
              {
                  $set: {
                      embeddings_created: true,
                      embeddings_created_at: new Date(),
                      pinecone_vectors_count: vectors.length
                  }
              }
          );

          res.json({
              message: 'Embeddings created and uploaded successfully',
              documentId,
              vectorsUploaded: vectors.length,
              pineconeIndex: process.env.PINECONE_INDEX_NAME
          });

      } catch (error) {
          console.error('Embedding error:', error);
          res.status(500).json({ error: error.message });
      } finally {
          await client.close();
      }
  }
