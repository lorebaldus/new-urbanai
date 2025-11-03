import OpenAI from 'openai';
import { QueryRouter } from './query_router.js';
import { ResponseGenerator } from './response_generator.js';
import { QueryEngine } from '../vector-db/query_engine.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize enhanced query components
let queryRouter = null;
let responseGenerator = null;
let queryEngine = null;

// Simple in-memory cache (in production, use Redis or similar)
const responseCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

    const { question, enhanced = false } = req.body;
    
    if (!question || question.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Question is required' 
        });
    }

    const startTime = Date.now();
    
    try {
        console.log(`Processing query: ${question} (enhanced: ${enhanced})`);

        // Use enhanced pipeline if requested and available
        if (enhanced && await isEnhancedModeAvailable()) {
            try {
                const enhancedResponse = await handleEnhancedQuery(question, startTime);
                return res.status(200).json({
                    success: true,
                    ...enhancedResponse,
                    knowledgeBaseUsed: true,
                    enhanced: true
                });
            } catch (enhancedError) {
                console.warn('Enhanced query failed, falling back to standard:', enhancedError.message);
                // Fall through to standard processing
            }
        }

        // Standard OpenAI processing (existing logic)
        const standardResponse = await handleStandardQuery(question);
        return res.status(200).json({
            success: true,
            ...standardResponse,
            knowledgeBaseUsed: false,
            enhanced: false,
            response_time_ms: Date.now() - startTime
        });

    } catch (error) {
        console.error('Query processing error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Errore del server',
            message: 'Problema temporaneo con il servizio AI. Riprova tra qualche istante.',
            fallback: true,
            response_time_ms: Date.now() - startTime
        });
    }
}

// Enhanced query handler with vector database and legal sources
async function handleEnhancedQuery(question, startTime) {
    // Check cache first
    const cacheKey = `enhanced:${question.toLowerCase().trim()}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
        console.log('✅ Returning cached enhanced response');
        return {
            ...cached,
            from_cache: true,
            response_time_ms: Date.now() - startTime
        };
    }

    // Initialize components if needed
    await initializeEnhancedComponents();

    // Step 1: Classify query
    const classification = queryRouter.classifyQuery(question);
    console.log(`🎯 Query classified as: ${classification.strategy}`);

    // Step 2: Query vector database with routing
    const searchResults = await queryEngine.queryMultipleNamespaces(
        await generateQueryEmbedding(question),
        classification.namespaces,
        {
            topK: 8,
            filter: classification.filters,
            mergeResults: true,
            weights: classification.weights
        }
    );

    console.log(`📊 Found ${searchResults.matches?.length || 0} relevant sources`);

    // Step 3: Generate enhanced response
    const response = responseGenerator.generateResponse(
        question,
        searchResults.matches || [],
        classification,
        {
            search_metadata: searchResults.metadata,
            processing_time_ms: Date.now() - startTime
        }
    );

    // Step 4: Cache response
    setCachedResponse(cacheKey, response);

    return response;
}

// Standard query handler (existing OpenAI logic)
async function handleStandardQuery(question) {
    // Check cache first
    const cacheKey = `standard:${question.toLowerCase().trim()}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
        console.log('✅ Returning cached standard response');
        return {
            answer: cached.answer,
            from_cache: true
        };
    }

    // Generate response using OpenAI (existing logic)
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

    const response = {
        answer: completionResponse.choices[0].message.content,
        confidence: 0.7, // Default confidence for standard responses
        sources: [],
        sourcesFound: 0,
        contextUsed: false
    };

    // Cache response
    setCachedResponse(cacheKey, response);

    return response;
}

// Initialize enhanced components lazily
async function initializeEnhancedComponents() {
    if (!queryRouter) {
        queryRouter = new QueryRouter();
    }
    if (!responseGenerator) {
        responseGenerator = new ResponseGenerator();
    }
    if (!queryEngine) {
        queryEngine = new QueryEngine();
        // Test connection but don't fail if unavailable
        try {
            await queryEngine.pineconeClient.connect();
        } catch (error) {
            console.warn('Pinecone connection failed, enhanced mode limited:', error.message);
        }
    }
}

// Check if enhanced mode is available
async function isEnhancedModeAvailable() {
    const requiredEnvVars = [
        'OPENAI_API_KEY',
        'PINECONE_API_KEY'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.log(`⚠️ Enhanced mode unavailable - missing: ${missingVars.join(', ')}`);
        return false;
    }
    
    return true;
}

// Generate query embedding for vector search
async function generateQueryEmbedding(question) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: question,
            dimensions: 1536
        });
        
        return response.data[0].embedding;
    } catch (error) {
        console.error('Failed to generate query embedding:', error);
        throw new Error('Could not generate query embedding');
    }
}

// Simple cache implementation
function getCachedResponse(key) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCachedResponse(key, data) {
    responseCache.set(key, {
        data,
        timestamp: Date.now()
    });
    
    // Simple cache cleanup
    if (responseCache.size > 1000) {
        const oldestKey = responseCache.keys().next().value;
        responseCache.delete(oldestKey);
    }
}

// Cache cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}, 5 * 60 * 1000); // Cleanup every 5 minutes