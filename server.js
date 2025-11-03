// server.js - Express.js wrapper for Render deployment
import express from 'express';
import queryHandler from './api/query.js';

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'UrbanAI API',
    version: '2.0.0-phase1',
    features: {
      enhanced_mode: !!process.env.PINECONE_API_KEY,
      legal_knowledge_base: true,
      embedding_dimensions: process.env.EMBEDDING_DIMENSIONS || '1024'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

// Main query endpoint
app.post('/api/query', async (req, res) => {
  try {
    // Create Vercel-compatible request/response objects
    const mockReq = {
      method: 'POST',
      body: req.body,
      headers: req.headers
    };
    
    const mockRes = {
      statusCode: 200,
      headers: {},
      
      setHeader(name, value) {
        this.headers[name] = value;
      },
      
      status(code) {
        this.statusCode = code;
        return {
          json: (data) => {
            res.status(code).json(data);
          }
        };
      }
    };
    
    // Call the Vercel handler
    await queryHandler(mockReq, mockRes);
    
  } catch (error) {
    console.error('❌ Query handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: {
      health: 'GET /',
      healthCheck: 'GET /health',
      query: 'POST /api/query'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🎉 ============================================');
  console.log('   UrbanAI API Server - Phase 1');
  console.log('============================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/`);
  console.log(`🔍 Query: http://localhost:${PORT}/api/query`);
  console.log(`⚡ Enhanced: ${process.env.PINECONE_API_KEY ? 'Enabled ✅' : 'Disabled ❌'}`);
  console.log(`📐 Dimensions: ${process.env.EMBEDDING_DIMENSIONS || '1024'}`);
  console.log('============================================');
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;