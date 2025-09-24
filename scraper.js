import * as cheerio from 'cheerio';
import https from 'https';
import http from 'http';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
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
    apiKey: PINECONE_API_KEY
});
let mongodb;

// Enhanced chunking functions
function createSemanticChunks(content, documentTitle) {
    const baseChunkSize = 2200; // Slightly smaller for overlap
    const minOverlap = 50;
    const maxOverlap = 100;
    
    // Detect if it's a legal document
    const isLegalDoc = /art\.|articolo|comma|decreto|legge|dgr|circolare/i.test(content);
    
    if (isLegalDoc) {
        return createLegalChunks(content, documentTitle);
    } else {
        return createGeneralChunks(content, documentTitle, baseChunkSize, minOverlap, maxOverlap);
    }
}

function createLegalChunks(content, documentTitle) {
    const chunks = [];
    const sections = content.split(/(?=Art\.|Articolo|ARTICOLO|Comma)/i);
    
    let currentChunk = '';
    let chunkIndex = 0;
    const maxChunkSize = 2500;
    
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i].trim();
        
        if (currentChunk.length + section.length <= maxChunkSize) {
            currentChunk += (currentChunk ? '\n\n' : '') + section;
        } else {
            if (currentChunk) {
                chunks.push({
                    content: currentChunk.trim(),
                    metadata: {
                        type: 'legal_section',
                        chunkIndex: chunkIndex++,
                        hasArticles: /art\.|articolo/i.test(currentChunk)
                    }
                });
            }
            
            // Smart overlap: take last complete sentence
            const overlap = getSmartOverlap(currentChunk, 80);
            currentChunk = overlap + section;
        }
    }
    
    if (currentChunk) {
        chunks.push({
            content: currentChunk.trim(),
            metadata: {
                type: 'legal_section',
                chunkIndex: chunkIndex,
                hasArticles: /art\.|articolo/i.test(currentChunk)
            }
        });
    }
    
    return chunks.map(chunk => chunk.content);
}

function createGeneralChunks(content, documentTitle, chunkSize, minOverlap, maxOverlap) {
    const chunks = [];
    let position = 0;
    
    while (position < content.length) {
        const endPos = Math.min(position + chunkSize, content.length);
        let chunkText = content.substring(position, endPos);
        
        // If not at end and we cut mid-sentence, extend to sentence end
        if (endPos < content.length) {
            const sentenceEnd = content.indexOf('.', endPos);
            if (sentenceEnd !== -1 && sentenceEnd - endPos < 100) {
                chunkText = content.substring(position, sentenceEnd + 1);
            }
        }
        
        chunks.push(chunkText.trim());
        
        // Smart overlap for next chunk
        const overlap = getSmartOverlap(chunkText, Math.min(maxOverlap, chunkText.length * 0.05));
        position = endPos - overlap;
        
        if (position >= content.length) break;
    }
    
    return chunks;
}

function getSmartOverlap(text, targetSize) {
    if (!text || targetSize <= 0) return '';
    
    const maxOverlap = Math.min(targetSize, text.length);
    const startPos = Math.max(0, text.length - maxOverlap);
    
    // Try to find last complete sentence
    const lastDot = text.lastIndexOf('.', text.length - 10);
    if (lastDot > startPos) {
        return text.substring(lastDot + 1).trim();
    }
    
    // Fallback: find last word boundary
    const overlap = text.substring(startPos);
    const lastSpace = overlap.lastIndexOf(' ');
    if (lastSpace > 10) {
        return overlap.substring(lastSpace + 1).trim();
    }
    
    return overlap.trim();
}

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
            try {
                const index = pinecone.index(PINECONE_INDEX);
                await index.upsert([{
                    id: Buffer.from(document.url + document.title).toString('base64'),
                    values: document.embedding,
                    metadata: {
                        title: document.title,
                        url: document.url,
                        source: document.source,
                        date: document.date
                    }
                }]);
                console.log(`✅ Pinecone stored: ${document.title.substring(0, 50)}...`);
            } catch (pineconeError) {
                console.log(`⚠️  Pinecone failed, MongoDB still stored: ${pineconeError.message}`);
            }
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

async function scrapeAllPiemontePDFs() {
    console.log('📚 Starting comprehensive Piemonte PDF scraping...');
    
    try {
        const url = 'https://www.regione.piemonte.it/web/temi/ambiente-territorio/territorio/urbanistica/normativa-urbanistica#NormativaRegionale';
        const html = await fetchPage(url);
        
        console.log('🔍 Analyzing all PDF documents in Normativa Regionale section...');
        
        const $ = cheerio.load(html);
        const pdfDocuments = [];
        
        // Extract all PDF links from the page
        $('a[href*=".pdf"]').each((i, el) => {
            const href = $(el).attr('href');
            let title = $(el).text().trim();
            
            // If title is empty, try to get it from parent elements or nearby text
            if (!title || title.length < 5) {
                title = $(el).closest('li, p, div').text().trim();
                if (title.length > 100) {
                    title = title.substring(0, 100) + '...';
                }
            }
            
            if (href && title.length > 5) {
                let fullUrl = href;
                if (href.startsWith('/')) {
                    fullUrl = 'https://www.regione.piemonte.it' + href;
                } else if (href.startsWith('http://')) {
                    // Keep HTTP as is - our download function now supports it
                    fullUrl = href;
                } else if (!href.startsWith('http')) {
                    fullUrl = 'https://www.regione.piemonte.it/' + href;
                }
                
                // Extract approximate date from title or URL if possible
                let docDate = new Date().toISOString().split('T')[0];
                const yearMatch = title.match(/\b(20\d{2})\b/) || href.match(/\b(20\d{2})\b/);
                if (yearMatch) {
                    docDate = `${yearMatch[1]}-01-01`;
                }
                
                // Generate source identifier
                const sourceId = `piemonte_pdf_${i + 1}`;
                
                pdfDocuments.push({
                    url: fullUrl,
                    title: `Piemonte Normativa - ${title}`,
                    date: docDate,
                    source: sourceId,
                    type: 'pdf'
                });
            }
        });

        console.log(`📋 Found ${pdfDocuments.length} PDF documents to process`);
        
        // Filter out documents we've already processed to avoid duplicates
        const knownUrls = [
            'https://www.regione.piemonte.it/governo/bollettino/abbonati/2025/13/attach/dgr_00905_1050_24032025.pdf',
            'http://www.regione.piemonte.it/governo/bollettino/abbonati/2021/32/attach/dgr_03671_1050_06082021.pdf'
        ];
        
        const newPdfDocuments = pdfDocuments.filter(doc => 
            !knownUrls.some(knownUrl => doc.url.includes(knownUrl) || knownUrl.includes(doc.url))
        );
        
        console.log(`📋 Processing ${newPdfDocuments.length} new PDF documents (excluding already processed)`);

        // Process all PDF documents (limit to reasonable number to avoid overload)
        const maxPdfs = Math.min(newPdfDocuments.length, 15); // Process up to 15 PDFs
        for (let i = 0; i < maxPdfs; i++) {
            const pdfDoc = newPdfDocuments[i];
            console.log(`📄 Processing PDF ${i + 1}/${maxPdfs}: ${pdfDoc.title}`);
            await processSinglePDF(pdfDoc);
            
            // Add longer delay between PDFs to be respectful to the server
            if (i < maxPdfs - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (newPdfDocuments.length > 15) {
            console.log(`⚠️  Found ${newPdfDocuments.length} total PDFs, processed first 15. Remaining will be processed in future runs.`);
        }

        console.log('✅ Comprehensive Piemonte PDF scraping completed');

    } catch (error) {
        console.error('❌ Comprehensive Piemonte PDF scraping error:', error);
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

async function downloadPDF(url) {
    return new Promise((resolve, reject) => {
        // Support both HTTP and HTTPS
        const httpModule = url.startsWith('https:') ? https : http;
        
        httpModule.get(url, (response) => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                // Convert Buffer to Uint8Array for PDF.js
                const uint8Array = new Uint8Array(buffer);
                resolve(uint8Array);
            });
        }).on('error', reject);
    });
}

async function extractPDFText(uint8Array, metadata = {}) {
    // Strategy 1: Standard PDF.js extraction
    try {
        console.log('📄 Attempting standard PDF extraction...');
        const loadingTask = pdfjsLib.getDocument({ 
            data: uint8Array,
            standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
        });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        
        const result = fullText.trim();
        if (result && result.length > 100) {
            console.log('✅ Standard extraction successful');
            return result;
        }
    } catch (error) {
        console.warn('⚠️  Standard PDF extraction failed:', error.message);
    }
    
    // Strategy 2: Alternative PDF.js settings for corrupted files
    try {
        console.log('📄 Attempting alternative PDF extraction...');
        const loadingTask = pdfjsLib.getDocument({ 
            data: uint8Array,
            disableFontFace: true,
            isEvalSupported: false,
            disableRange: true,
            disableStream: true
        });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str || '').join(' ');
                fullText += pageText + '\n\n';
            } catch (pageError) {
                console.warn(`⚠️  Page ${i} extraction failed, continuing...`);
                continue;
            }
        }
        
        const result = fullText.trim();
        if (result && result.length > 50) {
            console.log('✅ Alternative extraction successful');
            return result;
        }
    } catch (error) {
        console.warn('⚠️  Alternative PDF extraction failed:', error.message);
    }
    
    console.error('❌ All PDF extraction strategies failed');
    
    // Log failure for manual review
    if (metadata.url && metadata.title) {
        await logExtractionFailure(metadata.url, metadata.title, 'All extraction strategies failed');
    }
    
    return null;
}

async function logExtractionFailure(url, title, reason) {
    try {
        const failure = {
            timestamp: new Date().toISOString(),
            url: url,
            title: title,
            reason: reason,
            needsManualReview: true
        };
        
        if (mongodb) {
            await mongodb.collection('extraction_failures').insertOne(failure);
            console.log('📝 Logged extraction failure for manual review');
        }
    } catch (error) {
        console.error('❌ Failed to log extraction failure:', error);
    }
}

async function processSpecificDocuments() {
    console.log('📄 Processing specific legislative documents...');
    
    // PDF Documents
    const pdfDocuments = [
        {
            url: 'https://www.regione.piemonte.it/governo/bollettino/abbonati/2025/13/attach/dgr_00905_1050_24032025.pdf',
            title: 'DGR Piemonte 905/2025 - 24 marzo 2025',
            date: '2025-03-24',
            source: 'dgr_piemonte_905_2025',
            type: 'pdf'
        },
        {
            url: 'http://www.regione.piemonte.it/governo/bollettino/abbonati/2021/32/attach/dgr_03671_1050_06082021.pdf',
            title: 'DGR Piemonte 3671/2021 - 6 agosto 2021',
            date: '2021-08-06',
            source: 'dgr_piemonte_3671_2021',
            type: 'pdf'
        }
    ];
    
    // HTML/Web Documents
    const webDocuments = [
        {
            url: 'http://arianna.cr.piemonte.it/iterlegcoordweb/dettaglioLegge.do?urnLegge=urn:nir:regione.piemonte:legge:2020;15',
            title: 'Legge Regione Piemonte 15/2020',
            date: '2020-01-01',
            source: 'legge_piemonte_15_2020',
            type: 'web'
        },
        {
            url: 'http://www.regione.piemonte.it/governo/bollettino/abbonati/2021/03/siste/00000145.htm',
            title: 'Bollettino Piemonte 2021/03 - Documento 145',
            date: '2021-03-01',
            source: 'bollettino_piemonte_2021_145',
            type: 'web'
        },
        {
            url: 'http://www.regione.piemonte.it/governo/bollettino/abbonati/2020/28/siste/00000110.htm',
            title: 'Bollettino Piemonte 2020/28 - Documento 110',
            date: '2020-07-01',
            source: 'bollettino_piemonte_2020_110',
            type: 'web'
        }
    ];
    
    // Process PDFs
    for (const pdfDoc of pdfDocuments) {
        await processSinglePDF(pdfDoc);
    }
    
    // Process web documents
    for (const webDoc of webDocuments) {
        await processSingleWebDocument(webDoc);
    }
}

async function processSinglePDF(pdfDoc) {
    try {
        console.log(`📥 Downloading PDF: ${pdfDoc.title}`);
        const uint8Array = await downloadPDF(pdfDoc.url);
        
        console.log(`📖 Extracting text from: ${pdfDoc.title}`);
        const content = await extractPDFText(uint8Array, { url: pdfDoc.url, title: pdfDoc.title });
        
        if (!content || content.length < 100) {
            console.log(`⚠️  PDF content extraction failed or too short for: ${pdfDoc.title}`);
            return;
        }
        
        console.log(`📝 Content extracted: ${content.length} characters from ${pdfDoc.title}`);
        
        // Split into semantic chunks
        const chunks = createSemanticChunks(content, pdfDoc.title);
        
        console.log(`📚 Split ${pdfDoc.title} into ${chunks.length} chunks`);
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunkTitle = `${pdfDoc.title} - Parte ${i + 1}/${chunks.length}`;
            
            try {
                console.log(`📖 Processing ${pdfDoc.title} chunk: ${i + 1}/${chunks.length}`);
                
                const embedding = await createEmbedding(chunks[i]);
                
                await storeDocument({
                    title: chunkTitle,
                    url: pdfDoc.url,
                    content: chunks[i],
                    date: pdfDoc.date,
                    source: pdfDoc.source,
                    embedding: embedding,
                    documentType: 'pdf',
                    part: i + 1,
                    totalParts: chunks.length
                });
                
                console.log(`✅ Stored ${pdfDoc.title} chunk: ${i + 1}/${chunks.length}`);
                
                // Small delay to avoid overwhelming the APIs
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Error processing ${pdfDoc.title} chunk ${i + 1}:`, error);
            }
        }
        
        console.log(`🎉 Successfully processed PDF: ${pdfDoc.title}`);
        
    } catch (error) {
        console.error(`❌ Failed to process PDF ${pdfDoc.title}:`, error);
    }
}

async function processSingleWebDocument(webDoc) {
    try {
        console.log(`🌐 Processing web document: ${webDoc.title}`);
        
        const html = await fetchPage(webDoc.url);
        const $ = cheerio.load(html);
        
        // Extract content using multiple selectors for different page structures
        let content = '';
        
        // Try specific content selectors first
        const contentSelectors = [
            '.contenuto-legge, .testo-legge',  // Arianna legislative texts
            '.content-main, .page-content',    // General content
            'main, article, .text-content',    // Semantic content
            '.bollettino-content, .documento', // Bollettino specific
            'body'  // Fallback
        ];
        
        for (const selector of contentSelectors) {
            const extracted = $(selector).text().trim();
            if (extracted && extracted.length > 200) {
                content = extracted;
                break;
            }
        }
        
        // Clean content
        content = content.replace(/\s+/g, ' ').trim();
        
        if (!content || content.length < 100) {
            console.log(`⚠️  Web document content too short for: ${webDoc.title}`);
            return;
        }
        
        console.log(`📝 Content extracted: ${content.length} characters from ${webDoc.title}`);
        
        // Split into semantic chunks
        const chunks = createSemanticChunks(content, webDoc.title);
        
        console.log(`📚 Split ${webDoc.title} into ${chunks.length} chunks`);
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunkTitle = `${webDoc.title} - Parte ${i + 1}/${chunks.length}`;
            
            try {
                console.log(`📖 Processing ${webDoc.title} chunk: ${i + 1}/${chunks.length}`);
                
                const embedding = await createEmbedding(chunks[i]);
                
                await storeDocument({
                    title: chunkTitle,
                    url: webDoc.url,
                    content: chunks[i],
                    date: webDoc.date,
                    source: webDoc.source,
                    embedding: embedding,
                    documentType: 'web',
                    part: i + 1,
                    totalParts: chunks.length
                });
                
                console.log(`✅ Stored ${webDoc.title} chunk: ${i + 1}/${chunks.length}`);
                
                // Small delay to avoid overwhelming the APIs
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Error processing ${webDoc.title} chunk ${i + 1}:`, error);
            }
        }
        
        console.log(`🎉 Successfully processed web document: ${webDoc.title}`);
        
    } catch (error) {
        console.error(`❌ Failed to process web document ${webDoc.title}:`, error);
    }
}

// Main function
async function main() {
    try {
        await connectDatabases();
        await scrapeGazzettaUfficiale();
        await processNormativeContent();
        await scrapePiemonteNormativa();
        await processSpecificDocuments();
        await scrapeAllPiemontePDFs();
        console.log('🎉 Scraping cycle completed successfully');
    } catch (error) {
        console.error('💥 Main process failed:', error);
        process.exit(1);
    }
}

// Schedule scraping every 6 hours
cron.schedule('0 */2 * * *', () => {
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