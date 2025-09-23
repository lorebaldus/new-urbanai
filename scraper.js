import * as cheerio from 'cheerio';
import https from 'https';
import { MongoClient } from 'mongodb';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import cron from 'node-cron';

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT || 'us-east-1-aws';
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'urbanai-docs';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('🚂 UrbanAI Scraper starting on Render...');

// Start HTTP server for Render health check
import http from 'http';
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('UrbanAI Scraper is running');
});
server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ 
    apiKey: PINECONE_API_KEY,
    environment: PINECONE_ENVIRONMENT 
});
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
    
    try {
        // Use simple HTTP fetch instead of browser
        const url = 'https://www.gazzettaufficiale.it/ricerca/serie_generale/1';
        const html = await fetchPage(url);
        
        console.log('📄 Analyzing recent documents...');
        
        const $ = cheerio.load(html);
        const documentLinks = [];
        
        // Extract document links using Cheerio
        $('a[href*="/atto/"]').each((i, el) => {
            if (i < 5) { // Only first 5
                documentLinks.push({
                    url: $(el).attr('href'),
                    title: $(el).text().trim(),
                    date: new Date().toISOString().split('T')[0]
                });
            }
        });

        console.log(`📋 Found ${documentLinks.length} documents to process`);

        // Process each document
        for (const doc of documentLinks) {
            await processDocument(doc);
        }

        console.log('✅ Scraping completed');

    } catch (error) {
        console.error('❌ Scraping error:', error);
    }
}

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function processDocument(doc) {
    try {
        console.log(`📖 Processing: ${doc.title}`);
        
        const html = await fetchPage(doc.url);
        const $ = cheerio.load(html);
        
        const content = $('.contenuto-atto, .testo-atto, main').text().trim();

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


async function scrapePiemonteNormativa() {
    console.log('🏔️ Starting Regione Piemonte normativa scraping...');
    
    try {
        const url = 'https://www.regione.piemonte.it/web/temi/ambiente-territorio/territorio/urbanistica/normativa-urbanistica';
        const html = await fetchPage(url);
        
        console.log('📄 Analyzing Piemonte normative documents...');
        
        const $ = cheerio.load(html);
        const documentLinks = [];
        
        // Extract normative document links
        $('a[href*=".pdf"], a[href*="/normativa"], a[href*="/legge"], a[href*="/decreto"]').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            
            if (title.length > 10 && href) {
                let fullUrl = href;
                if (href.startsWith('/')) {
                    fullUrl = 'https://www.regione.piemonte.it' + href;
                }
                
                documentLinks.push({
                    url: fullUrl,
                    title: title,
                    date: new Date().toISOString().split('T')[0]
                });
            }
        });

        console.log(`📋 Found ${documentLinks.length} Piemonte documents to process`);

        // Process first 10 documents
        for (let i = 0; i < Math.min(documentLinks.length, 10); i++) {
            const doc = documentLinks[i];
            await processPiemonteDocument(doc);
        }

        console.log('✅ Piemonte scraping completed');

    } catch (error) {
        console.error('❌ Piemonte scraping error:', error);
    }
}

async function processPiemonteDocument(doc) {
    try {
        console.log(`📖 Processing Piemonte doc: ${doc.title}`);
        
        // Skip PDF files for now (would need different handling)
        if (doc.url.includes('.pdf')) {
            console.log('⚠️  PDF skipped, will implement later');
            return;
        }
        
        const html = await fetchPage(doc.url);
        const $ = cheerio.load(html);
        
        // Extract main content from typical Piemonte page structure
        let content = $('.content-main, .page-content, .text-content, main, article').text().trim();
        
        if (!content) {
            content = $('body').text().trim();
        }
        
        // Clean and limit content
        content = content.replace(/\s+/g, ' ').trim();
        
        if (content.length < 100) {
            console.log('⚠️  Document too short, skipping');
            return;
        }
        
        // Limit content size for embedding
        if (content.length > 3000) {
            content = content.substring(0, 3000) + '...';
        }

        const embedding = await createEmbedding(content);
        
        await storeDocument({
            title: `Regione Piemonte - ${doc.title}`,
            url: doc.url,
            content: content,
            date: doc.date,
            source: 'regione_piemonte',
            embedding: embedding
        });

        console.log(`✅ Stored Piemonte: ${doc.title.substring(0, 50)}...`);
        
    } catch (error) {
        console.error(`❌ Error processing Piemonte doc ${doc.title}:`, error);
    }
}

async function processNormativeContent() {
    console.log('📚 Processing normative content...');
    
    // Contenuto DPR 380/2001 come testo diretto
    const normativeTexts = [
        {
            title: 'DPR 380/2001 - Testo Unico Edilizia - Art. 1 (Ambito di applicazione)',
            content: `Il presente testo unico disciplina l'attività edilizia, stabilisce i presupposti, le condizioni, i modi, i tempi e gli strumenti per gli interventi disciplinati dalla presente normativa. Le disposizioni del presente testo unico si applicano a tutto il territorio nazionale e si riferiscono agli interventi di trasformazione urbanistica ed edilizia del territorio.`,
            source: 'dpr_380_2001',
            url: 'https://biblus.acca.it/download/dpr-380-2001-testo-unico-edilizia/'
        },
        {
            title: 'DPR 380/2001 - Definizioni degli interventi edilizi',
            content: `Gli interventi di trasformazione urbanistica ed edilizia del territorio sono definiti come segue: a) "interventi di manutenzione ordinaria", gli interventi edilizi che riguardano le opere di riparazione, rinnovamento e sostituzione delle finiture degli edifici e quelle necessarie ad integrare o mantenere in efficienza gli impianti tecnologici esistenti; b) "interventi di manutenzione straordinaria", le opere e le modifiche necessarie per rinnovare e sostituire parti anche strutturali degli edifici; c) "interventi di restauro e di risanamento conservativo", gli interventi edilizi rivolti a conservare l'organismo edilizio e ad assicurarne la funzionalità mediante un insieme sistematico di opere che, nel rispetto degli elementi tipologici, formali e strutturali dell'organismo stesso; d) "interventi di ristrutturazione edilizia", gli interventi rivolti a trasformare gli organismi edilizi mediante un insieme sistematico di opere che possono portare ad un organismo edilizio in tutto o in parte diverso dal precedente.`,
            source: 'dpr_380_2001',
            url: 'https://biblus.acca.it/download/dpr-380-2001-testo-unico-edilizia/'
        }
    ];
    
    for (const text of normativeTexts) {
        try {
            console.log(`📖 Processing: ${text.title}`);
            
            const embedding = await createEmbedding(text.content);
            
            await storeDocument({
                title: text.title,
                url: text.url,
                content: text.content,
                date: new Date().toISOString().split('T')[0],
                source: text.source,
                embedding: embedding
            });
            
            console.log(`✅ Stored: ${text.title}`);
            
        } catch (error) {
            console.error(`❌ Error processing ${text.title}:`, error);
        }
    }
}

// Main function
async function main() {
    try {
        await connectDatabases();
        await scrapeGazzettaUfficiale();
        await processNormativeContent();
        await scrapePiemonteNormativa();
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