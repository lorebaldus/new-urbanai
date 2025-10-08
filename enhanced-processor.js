// Enhanced UrbanAI Document Processor for Render
// This service will process all documents from the MongoDB queue
import * as cheerio from 'cheerio';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { MongoClient, ObjectId } from 'mongodb';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'urbanai-docs';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('🚀 Enhanced UrbanAI Processor starting on Render...');

// Start HTTP server for health check
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/process' && req.method === 'POST') {
        // Trigger manual processing
        triggerProcessing().then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Processing triggered' }));
        }).catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        });
    } else if (req.url === '/status') {
        // Status endpoint
        getProcessingStatus().then(status => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
        }).catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Enhanced UrbanAI Processor is running');
    }
});
server.listen(PORT, () => {
    console.log(`🌐 Enhanced processor server running on port ${PORT}`);
});

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
let mongodb;
let pineconeIndex;

// Token estimation and chunking functions
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}

function createSemanticChunks(content, documentTitle) {
    const baseChunkSize = 2200;
    const minOverlap = 50;
    const maxOverlap = 100;
    const MAX_TOKENS = 6000;
    
    const isLegalDoc = /art\.|articolo|comma|decreto|legge|dgr|circolare/i.test(content);
    
    if (isLegalDoc) {
        return createLegalDocumentChunks(content, documentTitle);
    }
    
    const chunks = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let i = 0;
    
    while (i < sentences.length) {
        const sentence = sentences[i].trim();
        const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + sentence;
        
        if (estimateTokens(potentialChunk) > MAX_TOKENS || potentialChunk.length > baseChunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim() + '.');
                
                // Create overlap
                const overlapSize = Math.min(maxOverlap, Math.max(minOverlap, currentChunk.length * 0.1));
                const overlap = currentChunk.slice(-overlapSize);
                currentChunk = overlap + (overlap ? '. ' : '') + sentence;
            } else {
                chunks.push(sentence.trim() + '.');
                currentChunk = '';
            }
        } else {
            currentChunk = potentialChunk;
        }
        i++;
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim() + '.');
    }
    
    return chunks.filter(chunk => chunk.length > 50);
}

function createLegalDocumentChunks(content, documentTitle) {
    const chunks = [];
    const articles = content.split(/(?=Art\.|Articolo\s+\d+)/i);
    
    for (let article of articles) {
        if (article.trim().length < 100) continue;
        
        const subChunks = createSemanticChunks(article, documentTitle);
        chunks.push(...subChunks);
    }
    
    return chunks.length > 0 ? chunks : createSemanticChunks(content, documentTitle);
}

// Database connection
async function connectDatabases() {
    try {
        console.log('📡 Connecting to MongoDB...');
        mongodb = new MongoClient(MONGODB_URI);
        await mongodb.connect();
        console.log('✅ MongoDB connected');
        
        console.log('📡 Connecting to Pinecone...');
        pineconeIndex = pinecone.index(PINECONE_INDEX);
        console.log('✅ Pinecone connected');
        
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Get unprocessed documents from MongoDB
async function getUnprocessedDocuments() {
    try {
        const db = mongodb.db('urbanai');
        const collection = db.collection('documents');
        
        const unprocessed = await collection.find({
            $or: [
                { processed: { $ne: true } },
                { processed: { $exists: false } }
            ]
        }).toArray();
        
        console.log(`📋 Found ${unprocessed.length} unprocessed documents`);
        return unprocessed;
    } catch (error) {
        console.error('❌ Error getting unprocessed documents:', error);
        return [];
    }
}

// Get processed but unembedded documents
async function getUnembeddedDocuments() {
    try {
        const db = mongodb.db('urbanai');
        const collection = db.collection('documents');
        
        const unembedded = await collection.find({
            processed: true,
            $or: [
                { embedded: { $ne: true } },
                { embedded: { $exists: false } }
            ]
        }).toArray();
        
        console.log(`🧠 Found ${unembedded.length} processed but unembedded documents`);
        return unembedded;
    } catch (error) {
        console.error('❌ Error getting unembedded documents:', error);
        return [];
    }
}

// Process a single document
async function processSingleDocument(doc) {
    try {
        console.log(`\n🔄 Processing: ${doc.title}`);
        
        let content = '';
        
        if (doc.url && doc.url.endsWith('.pdf')) {
            // Download and extract PDF
            console.log(`📥 Downloading PDF: ${doc.url}`);
            const pdfData = await downloadPDFFromURL(doc.url);
            content = await extractPDFText(pdfData);
        } else if (doc.content) {
            // Use existing content
            content = doc.content;
        } else {
            console.log(`⚠️ No content or URL found for: ${doc.title}`);
            return false;
        }
        
        if (!content || content.length < 100) {
            console.log(`⚠️ Content too short for: ${doc.title}`);
            return false;
        }
        
        console.log(`📝 Content extracted: ${content.length} characters`);
        
        // Create semantic chunks
        const chunks = createSemanticChunks(content, doc.title);
        console.log(`📑 Created ${chunks.length} chunks`);
        
        // Update document in MongoDB
        const db = mongodb.db('urbanai');
        const collection = db.collection('documents');
        
        await collection.updateOne(
            { _id: doc._id },
            {
                $set: {
                    content: content,
                    chunks: chunks,
                    processed: true,
                    processedAt: new Date(),
                    chunkCount: chunks.length,
                    contentLength: content.length
                }
            }
        );
        
        console.log(`✅ Processed and saved: ${doc.title}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to process ${doc.title}:`, error);
        return false;
    }
}

// Create embeddings for a document
async function createEmbeddingsForDocument(doc) {
    try {
        console.log(`\n🧠 Creating embeddings for: ${doc.title}`);
        
        if (!doc.chunks || doc.chunks.length === 0) {
            console.log(`⚠️ No chunks found for: ${doc.title}`);
            return false;
        }
        
        const vectors = [];
        
        for (let i = 0; i < doc.chunks.length; i++) {
            const chunk = doc.chunks[i];
            console.log(`🔄 Embedding chunk ${i + 1}/${doc.chunks.length}`);
            
            try {
                // Create embedding with retry logic
                let embedding;
                let retries = 0;
                const maxRetries = 3;
                
                while (retries < maxRetries) {
                    try {
                        const response = await openai.embeddings.create({
                            model: 'text-embedding-ada-002',
                            input: chunk
                        });
                        embedding = response.data[0].embedding;
                        break;
                    } catch (error) {
                        retries++;
                        if (error.message.includes('rate limit')) {
                            console.log(`⏱️ Rate limited, waiting ${retries * 5} seconds...`);
                            await new Promise(resolve => setTimeout(resolve, retries * 5000));
                        } else {
                            throw error;
                        }
                    }
                }
                
                if (!embedding) {
                    throw new Error('Failed to create embedding after retries');
                }
                
                // Prepare vector for Pinecone
                vectors.push({
                    id: `${doc._id}_chunk_${i}`,
                    values: embedding,
                    metadata: {
                        documentId: doc._id.toString(),
                        title: doc.title,
                        source: doc.source || 'unknown',
                        chunkIndex: i,
                        content: chunk.substring(0, 1000), // Truncate for metadata
                        type: 'document_chunk'
                    }
                });
                
                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Failed to create embedding for chunk ${i + 1}:`, error);
            }
        }
        
        if (vectors.length === 0) {
            console.log(`❌ No embeddings created for: ${doc.title}`);
            return false;
        }
        
        // Upload to Pinecone in batches
        console.log(`📤 Uploading ${vectors.length} vectors to Pinecone...`);
        const batchSize = 100;
        
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await pineconeIndex.upsert(batch);
            console.log(`📤 Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
        }
        
        // Update document as embedded
        const db = mongodb.db('urbanai');
        const collection = db.collection('documents');
        
        await collection.updateOne(
            { _id: doc._id },
            {
                $set: {
                    embedded: true,
                    embeddedAt: new Date(),
                    vectorCount: vectors.length
                }
            }
        );
        
        console.log(`✅ Created ${vectors.length} embeddings for: ${doc.title}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to create embeddings for ${doc.title}:`, error);
        return false;
    }
}

// Download PDF from URL
async function downloadPDFFromURL(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https:') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }
            
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const uint8Array = new Uint8Array(buffer);
                resolve(uint8Array);
            });
        }).on('error', reject);
    });
}

// Extract text from PDF
async function extractPDFText(uint8Array) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        return fullText.trim();
    } catch (error) {
        console.error('PDF extraction error:', error);
        return '';
    }
}

// Get processing status
async function getProcessingStatus() {
    try {
        const db = mongodb.db('urbanai');
        const collection = db.collection('documents');
        
        const total = await collection.countDocuments();
        const processed = await collection.countDocuments({ processed: true });
        const embedded = await collection.countDocuments({ embedded: true });
        
        return {
            success: true,
            total,
            processed,
            embedded,
            completionRate: total > 0 ? Math.round((processed / total) * 100) : 0,
            embeddingRate: total > 0 ? Math.round((embedded / total) * 100) : 0
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Main processing function
async function processAllDocuments() {
    console.log('\n🚀 Starting comprehensive document processing...');
    
    let processedCount = 0;
    let embeddedCount = 0;
    
    // Step 1: Process unprocessed documents
    const unprocessed = await getUnprocessedDocuments();
    
    for (const doc of unprocessed) {
        const success = await processSingleDocument(doc);
        if (success) {
            processedCount++;
        }
        
        // Small delay between documents
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n✅ Processed ${processedCount}/${unprocessed.length} documents`);
    
    // Step 2: Create embeddings for processed documents
    const unembedded = await getUnembeddedDocuments();
    
    for (const doc of unembedded) {
        const success = await createEmbeddingsForDocument(doc);
        if (success) {
            embeddedCount++;
        }
        
        // Longer delay between embedding operations (rate limiting)
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log(`\n✅ Created embeddings for ${embeddedCount}/${unembedded.length} documents`);
    
    // Final status
    const finalStatus = await getProcessingStatus();
    console.log('\n🎉 Processing complete!');
    console.log(`📊 Final Status: ${finalStatus.processed}/${finalStatus.total} processed (${finalStatus.completionRate}%), ${finalStatus.embedded}/${finalStatus.total} embedded (${finalStatus.embeddingRate}%)`);
    
    return finalStatus;
}

// Trigger processing function
async function triggerProcessing() {
    if (!mongodb) {
        const connected = await connectDatabases();
        if (!connected) {
            throw new Error('Database connection failed');
        }
    }
    
    return await processAllDocuments();
}

// Auto-start processing
async function startProcessor() {
    const connected = await connectDatabases();
    if (connected) {
        console.log('🎯 Starting automatic processing in 10 seconds...');
        setTimeout(() => {
            triggerProcessing().catch(error => {
                console.error('❌ Processing failed:', error);
                // Retry in 30 minutes
                setTimeout(startProcessor, 30 * 60 * 1000);
            });
        }, 10000);
    }
}

// Start the processor
startProcessor();