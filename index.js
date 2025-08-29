// Entry point for Vercel deployment
  const express = require('express');
  const cors = require('cors');
  const path = require('path');

  // Import your modules
  const DocumentProcessor = require('./src/documentProcessor');
  const VectorStore = require('./src/vectorStore');
  const QueryEngine = require('./src/queryEngine');

  class UrbanAIServer {
      constructor() {
          this.app = express();
          this.port = process.env.PORT || 3000;
          this.setupMiddleware();
          this.setupRoutes();

          // Initialize components
          this.documentProcessor = new DocumentProcessor();
          this.vectorStore = null;
          this.queryEngine = null;
          this.isInitialized = false;
      }

      setupMiddleware() {
          this.app.use(cors());
          this.app.use(express.json());
          this.app.use(express.static(path.join(__dirname, './')));

          // Request logging
          this.app.use((req, res, next) => {
              console.log(`${new Date().toISOString()} - ${req.method} 
  ${req.path}`);
              next();
          });
      }

      setupRoutes() {
          // Health check
          this.app.get('/health', (req, res) => {
              res.json({
                  status: 'ok',
                  initialized: this.isInitialized,
                  timestamp: new Date().toISOString()
              });
          });

          // Initialize the system
          this.app.post('/api/initialize', async (req, res) => {
              try {
                  if (this.isInitialized) {
                      return res.json({ message: 'System already initialized'
   });
                  }

                  console.log('Initializing UrbanAI system...');
                  await this.initializeSystem();

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

          // Process documents
          this.app.post('/api/process-documents', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  console.log('Processing documents...');
                  const docsPath = path.join(__dirname, './docs');

                  // Process documents
                  const chunks = await
  this.documentProcessor.processAllDocuments(docsPath);

                  // Store in vector database
                  await this.vectorStore.upsertDocuments(chunks);

                  // Save processed chunks
                  await this.vectorStore.saveProcessedChunks(chunks,
  path.join(__dirname, './docs'));

                  res.json({
                      success: true,
                      message: `Processed ${chunks.length} document chunks`,
                      chunksProcessed: chunks.length
                  });

              } catch (error) {
                  console.error('Document processing error:', error);
                  res.status(500).json({
                      error: 'Document processing failed',
                      details: error.message
                  });
              }
          });

          // Query the system
          this.app.post('/api/query', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  const { question, options = {} } = req.body;

                  if (!question) {
                      return res.status(400).json({ error: 'Question is 
  required' });
                  }

                  console.log(`Processing query: "${question}"`);
                  const result = await this.queryEngine.query(question,
  options);

                  res.json({
                      success: true,
                      ...result
                  });

              } catch (error) {
                  console.error('Query error:', error);
                  res.status(500).json({
                      error: 'Query failed',
                      details: error.message
                  });
              }
          });

          // Get document summary for specific document
          this.app.get('/api/summarize/:documentName', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  const { documentName } = req.params;
                  const documentPath = path.join(__dirname, './docs',
  documentName);

                  const summary = await
  this.queryEngine.summarizeDocument(documentPath);

                  res.json({
                      success: true,
                      summary,
                      document: documentName
                  });

              } catch (error) {
                  console.error('Summarization error:', error);
                  res.status(500).json({
                      error: 'Summarization failed',
                      details: error.message
                  });
              }
          });

          // Get summary of all documents
          this.app.get('/api/summarize', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  const summary = await
  this.queryEngine.summarizeDocument(null);

                  res.json({
                      success: true,
                      summary,
                      document: 'all documents'
                  });

              } catch (error) {
                  console.error('Summarization error:', error);
                  res.status(500).json({
                      error: 'Summarization failed',
                      details: error.message
                  });
              }
          });

          // Extract key points for a topic
          this.app.post('/api/extract-key-points', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  const { topic } = req.body;

                  if (!topic) {
                      return res.status(400).json({ error: 'Topic is 
  required' });
                  }

                  const result = await
  this.queryEngine.extractKeyPoints(topic);

                  res.json({
                      success: true,
                      ...result
                  });

              } catch (error) {
                  console.error('Key points extraction error:', error);
                  res.status(500).json({
                      error: 'Key points extraction failed',
                      details: error.message
                  });
              }
          });

          // Get system stats
          this.app.get('/api/stats', async (req, res) => {
              try {
                  if (!this.isInitialized) {
                      return res.status(400).json({ error: 'System not 
  initialized' });
                  }

                  const stats = await this.vectorStore.getIndexStats();

                  res.json({
                      success: true,
                      vectorDatabase: stats,
                      systemStatus: {
                          initialized: this.isInitialized,
                          uptime: process.uptime()
                      }
                  });

              } catch (error) {
                  console.error('Stats error:', error);
                  res.status(500).json({
                      error: 'Failed to get stats',
                      details: error.message
                  });
              }
          });

          // List available documents
          this.app.get('/api/documents', (req, res) => {
              try {
                  const docsPath = path.join(__dirname, './docs');
                  const fs = require('fs');

                  const documents = fs.readdirSync(docsPath)
                      .filter(file => file.endsWith('.pdf'))
                      .map(file => ({
                          name: file,
                          path: path.join(docsPath, file),
                          size: fs.statSync(path.join(docsPath, file)).size
                      }));

                  res.json({
                      success: true,
                      documents,
                      count: documents.length
                  });

              } catch (error) {
                  console.error('Documents listing error:', error);
                  res.status(500).json({
                      error: 'Failed to list documents',
                      details: error.message
                  });
              }
          });

          // Root route serves index.html
          this.app.get('/', (req, res) => {
              res.sendFile(path.join(__dirname, 'index.html'));
          });
      }

      async initializeSystem() {
          try {
              // Check required environment variables
              if (!process.env.OPENAI_API_KEY) {
                  throw new Error('OPENAI_API_KEY environment variable is 
  required');
              }

              // Initialize vector store
              this.vectorStore = new VectorStore(
                  process.env.PINECONE_API_KEY,
                  process.env.OPENAI_API_KEY
              );
              await this.vectorStore.initialize();

              // Initialize query engine
              this.queryEngine = new QueryEngine(
                  process.env.OPENAI_API_KEY,
                  this.vectorStore
              );

              this.isInitialized = true;
              console.log('✅ UrbanAI system initialized successfully');

          } catch (error) {
              console.error('System initialization failed:', error);
              throw error;
          }
      }
  }

  // Create server instance and export the Express app for Vercel
  const server = new UrbanAIServer();

  module.exports = server.app;
