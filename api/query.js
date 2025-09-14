import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export default async function handler(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    console.log('Request body:', req.body);
    console.log('Request method:', req.method);
    
    const { question } = req.body;
    
    if (!question || question.trim().length === 0) {
        console.log('Question missing or empty:', question);
        return res.status(400).json({ 
            success: false, 
            error: 'Question is required',
            receivedBody: req.body
        });
    }

    try {
        console.log(`Processing query: ${question}`);

        // Generate response using OpenAI
        const completionResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system', 
                    content: 'Sei UrbanAI, un assistente esperto in urbanistica, edilizia e normative italiane. Rispondi in modo professionale, pratico e preciso.' 
                },
                { role: 'user', content: question }
            ],
            max_tokens: 800,
            temperature: 0.3
        });

        const answer = completionResponse.choices[0].message.content;

        return res.status(200).json({
            success: true,
            answer: answer,
            knowledgeBaseUsed: false,
            sourcesFound: 0,
            contextUsed: false
        });

    } catch (error) {
        console.error('Query processing error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Errore del server',
            message: 'Problema temporaneo con il servizio AI. Riprova tra qualche istante.',
            fallback: true
        });
    }
}