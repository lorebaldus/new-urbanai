import { chromium } from 'playwright';
import cheerio from 'cheerio';
import { MongoClient } from 'mongodb';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import cron from 'node-cron';

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'urbanai-docs';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('🚂 UrbanAI Scraper starting on Railway...');

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
let mongodb;

async function connectDatabases() {
    try {
        // MongoDB connection
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        mongodb = client.db('urbanai');
        console.log('✅ MongoDB connected');

        // Pinecone connection
        const index = pinecone.index(PINECONE_INDEX);
        console.log('✅ Pinecone connected');
        
        return { mongodb, pinecone: index };
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

async function scrapeGazzettaUfficiale() {
    console.log('🔍 Starting Gazzetta Ufficiale scraping...');
    
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Navigate to Gazzetta Ufficiale
        await page.goto('https://www.gazzettaufficiale.it/ricerca/serie_generale/1', {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        console.log('📄 Analyzing recent documents...');
        
        // Extract document links
        const documentLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/atto/"]'));
            return links.map(link => ({
                url: link.href,
                title: link.textContent.trim(),
                date: new Date().toISOString().split('T')[0]
            })).slice(0, 5); // Process only 5 most recent
        });

        console.log(`📋 Found ${documentLinks.length} documents to process`);

        // Process each document
        for (const doc of documentLinks) {
            await processDocument(page, doc);
        }

    } catch (error) {
        console.error('❌ Scraping error:', error);
    } finally {
        await browser.close();
        console.log('✅ Scraping completed');
    }
}

async function processDocument(page, doc) {
    try {
        console.log(`📖 Processing: ${doc.title}`);
        
        await page.goto(doc.url, { waitUntil: 'networkidle' });
        
        const content = await page.evaluate(() => {
            const contentEl = document.querySelector('.contenuto-atto, .testo-atto, main');
            return contentEl ? contentEl.textContent.trim() : '';
        });

        if (content.length < 100) {
            console.log('⚠️  Document too short, skipping');
            return;
        }

        // Generate embedding
        const embedding = await createEmbedding(content.substring(0, 8000));
        
        // Store in databases
        await storeDocument({
            title: doc.title,
            url: doc.url,
            content: content,
            date: doc.date,
            source: 'gazzetta_ufficiale',
            embedding: embedding
        });

        console.log(`✅ Stored: ${doc.title.substring(0, 50)}...`);
        
    } catch (error) {
        console.error(`❌ Error processing ${doc.title}:`, error);
    }
}

async function createEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('❌ Embedding creation failed:', error);
        return null;
    }
}

async function storeDocument(document) {
    try {
        // Store in MongoDB
        await mongodb.collection('documents').updateOne(
            { url: document.url },
            { $set: document },
            { upsert: true }
        );

        // Store in Pinecone (if embedding exists)
        if (document.embedding) {
            const index = pinecone.index(PINECONE_INDEX);
            await index.upsert([{
                id: Buffer.from(document.url).toString('base64'),
                values: document.embedding,
                metadata: {
                    title: document.title,
                    url: document.url,
                    source: document.source,
                    date: document.date
                }
            }]);
        }

    } catch (error) {
        console.error('❌ Storage failed:', error);
    }
}

// Main function
async function main() {
    try {
        await connectDatabases();
        await scrapeGazzettaUfficiale();
        console.log('🎉 Scraping cycle completed successfully');
    } catch (error) {
        console.error('💥 Main process failed:', error);
        process.exit(1);
    }
}

// Schedule scraping every 6 hours
cron.schedule('0 */6 * * *', () => {
    console.log('⏰ Scheduled scraping starting...');
    main();
});

// Run immediately on startup
console.log('🚀 Running initial scraping...');
main();

// Keep the service alive
process.on('SIGTERM', () => {
    console.log('👋 Scraper shutting down gracefully');
    process.exit(0);
});