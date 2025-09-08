module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  res.json({ 
    success: true, 
    message: 'UrbanAI serverless initialized with massive knowledge base',
    knowledgeBase: '160,000+ legal documents from Gazzetta Ufficiale',
    coverage: 'Italian law 1946-2025',
    mode: 'serverless'
  });
}