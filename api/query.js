// UrbanAI Serverless Query with 160k+ Knowledge Base
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const PINECONE_CONFIG = {
    apiKey: "pcsk_3WPEJY_K1FqNAfqCWnqUz6PbrfWqSTB98WXdCsAH9HsvhcUh3Aw9W3WtbvbSkQfRFnXb2T",
    indexName: "urban-ai"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY missing');
    }

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log(`🔍 Serverless query: "${question}"`);

    // Initialize clients
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const pinecone = new Pinecone({ apiKey: PINECONE_CONFIG.apiKey });
    const index = pinecone.index(PINECONE_CONFIG.indexName);

    let context = '';
    let knowledgeBaseUsed = false;
    let sourcesFound = 0;

    try {
      console.log('📡 Getting embedding...');
      
      // Get embedding for the question
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: question,
      });

      console.log('🔍 Searching 160k+ vectors...');

      // Search massive knowledge base (160k+ vectors)
      const searchResponse = await index.query({
        vector: embeddingResponse.data[0].embedding,
        topK: 10,
        includeMetadata: true,
        includeValues: false
      });

      console.log(`📊 Found ${searchResponse.matches?.length || 0} total matches`);

      // Filter high-quality results
      const relevantMatches = (searchResponse.matches || [])
        .filter(match => match.score >= 0.75)
        .slice(0, 5);

      sourcesFound = relevantMatches.length;
      console.log(`✅ Using ${sourcesFound} high-quality sources`);

      if (relevantMatches.length > 0) {
        // Build context from massive knowledge base
        const contextChunks = relevantMatches.map((match, index) => {
          const source = match.metadata?.source || 'Gazzetta Ufficiale d\'Italia';
          const text = match.metadata?.text || '';
          const relevance = (match.score * 100).toFixed(1);
          
          return `[FONTE ${index + 1}] (Rilevanza: ${relevance}%)\n${source}\n\n${text}`;
        });
        
        context = contextChunks.join('\n\n---\n\n');
        
        // Limit context length to prevent token overflow
        if (context.length > 5000) {
          context = context.substring(0, 5000) + '\n\n[...contesto troncato per lunghezza]';
        }
        
        knowledgeBaseUsed = true;
      }

    } catch (pineconeError) {
      console.error('❌ Knowledge base error:', pineconeError);
      // Continue with basic mode if knowledge base fails
    }

    console.log(`🧠 Generating response (Knowledge base: ${knowledgeBaseUsed})`);

    // Enhanced system prompt with massive knowledge base
    const systemContent = knowledgeBaseUsed 
      ? `Sei UrbanAI, un assistente AI specializzato ESCLUSIVAMENTE in pianificazione urbana, normative urbanistiche, edilizia e territorio italiano.

🏛️ HAI ACCESSO COMPLETO ALL'ARCHIVIO:
- 160,000+ documenti dalla Gazzetta Ufficiale d'Italia
- Legislazione completa dal 1946 al 2025 (79 anni)
- Serie Regioni, Serie Generale, Foglio Ordinario
- Normative nazionali, regionali e comunali

📋 ISTRUZIONI CRITICAL:
- Rispondi SOLO a domande su: urbanistica, edilizia, normative comunali, piani regolatori, permessi di costruire, vincoli territoriali, zonizzazioni, PRG, PGT, regolamenti edilizi, standard urbanistici, opere di urbanizzazione
- Se NON riguarda l'urbanistica: "Mi dispiace, sono UrbanAI e posso aiutarti solo con questioni urbanistiche"
- USA SEMPRE il contesto fornito qui sotto come base per la risposta
- CITA sempre le fonti specifiche: numeri di legge, decreti, articoli, date
- Distingui tra normative storiche e attuali quando rilevante
- Sii preciso, tecnico e professionale

📚 CONTESTO DALL'ARCHIVIO DELLA GAZZETTA UFFICIALE:
${context}

🎯 IMPORTANTE: Basa la tua risposta su questo contesto dell'archivio ufficiale italiano, citando sempre le fonti specifiche.`
      : `Sei UrbanAI, un assistente specializzato ESCLUSIVAMENTE in pianificazione urbana italiana.

Rispondi SOLO a domande su urbanistica, edilizia, normative comunali, piani regolatori, permessi di costruire, vincoli territoriali, zonizzazioni, PRG, PGT, regolamenti edilizi.

Se NON riguarda l'urbanistica: "Mi dispiace, sono UrbanAI e posso aiutarti solo con questioni urbanistiche"

Usa riferimenti normativi italiani generali (DPR 380/01, Legge Urbanistica 1150/42, etc.)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: question }
      ],
      max_tokens: knowledgeBaseUsed ? 1000 : 500,
      temperature: 0.2
    });

    console.log('✅ Response generated successfully');

    res.json({
      success: true,
      answer: response.choices[0].message.content,
      knowledgeBaseUsed: knowledgeBaseUsed,
      sourcesFound: sourcesFound,
      totalVectors: '160,000+ Italian legal documents',
      mode: 'serverless',
      debug: {
        contextLength: context.length,
        queryProcessingTime: 'optimized'
      }
    });

  } catch (error) {
    console.error('❌ Serverless query error:', error);
    res.status(500).json({ 
      error: error.message,
      knowledgeBaseUsed: false,
      mode: 'serverless'
    });
  }
}