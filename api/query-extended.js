 export default async function handler(req, res) {
      console.log('Handler called');

      try {
          return res.status(200).json({
              success: true,
              message: 'Basic handler working',
              environment: {
                  mongodb: process.env.MONGODB_URI ? 'SET' : 'MISSING',
                  openai: process.env.OPENAI_API_KEY ? 'SET' : 'MISSING',
                  pinecone: process.env.PINECONE_API_KEY ? 'SET' : 'MISSING'
              }
          });
      } catch (error) {
          console.error('Error:', error);
          return res.status(500).json({
              success: false,
              error: error.message
          });
      }
  }
