export default function handler(req, res) {
  res.json({ 
    status: 'ok', 
    message: 'UrbanAI serverless working!',
    timestamp: new Date().toISOString(),
    knowledgeBase: '160k+ vectors ready',
    mode: 'serverless'
  });
}