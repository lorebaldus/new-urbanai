import { MongoClient } from 'mongodb';

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

          if (cmd === 'test-db') {
              return await testDatabase(req, res);
          }

          // Default response
          return res.status(200).json({
              success: true,
              message: 'UrbanAI system initialized - Extended',
              availableCommands: ['admin', 'test-db'],
              timestamp: new Date().toISOString(),
              environment: {
                  mongodb: MONGODB_URI ? 'SET' : 'MISSING'
              }
          });

      } catch (error) {
          console.error('Initialize handler error:', error);
          return res.status(500).json({
              success: false,
              error: 'Internal server error',
              message: error.message,
              stack: error.stack
          });
      }
  }

  async function handleAdmin(req, res) {
      try {
          if (!MONGODB_URI) {
              return res.status(500).json({
                  success: false,
                  error: 'MongoDB not configured'
              });
          }

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

  async function testDatabase(req, res) {
      try {
          if (!MONGODB_URI) {
              return res.status(400).json({
                  success: false,
                  error: 'MongoDB URI not configured'
              });
          }

          const client = new MongoClient(MONGODB_URI);
          await client.connect();
          await client.close();

          return res.status(200).json({
              success: true,
              message: 'Database connection successful'
          });

      } catch (error) {
          return res.status(500).json({
              success: false,
              error: 'Database connection failed',
              message: error.message
          });
      }
  }
