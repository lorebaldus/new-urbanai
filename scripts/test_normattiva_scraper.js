#!/usr/bin/env node

// Test Script for Normattiva Scraper
// Usage: node scripts/test_normattiva_scraper.js [document_id]

import { NormattivaScraper } from '../scrapers/normattiva_scraper.js';

async function main() {
    console.log('🧪 TESTING NORMATTIVA SCRAPER\n');
    
    // Get command line argument for specific document test
    const args = process.argv.slice(2);
    const testDocumentId = args[0];

    try {
        const scraper = new NormattivaScraper();

        if (testDocumentId) {
            // Test specific document
            console.log(`🎯 Testing specific document: ${testDocumentId}\n`);
            
            const result = await scraper.testScrapeDocument(testDocumentId);
            
            console.log('\n📊 DETAILED RESULTS:');
            console.log('Document ID:', result.documentId);
            console.log('Title:', result.metadata.title);
            console.log('Type:', result.metadata.type);
            console.log('Number:', result.metadata.number);
            console.log('URL:', result.metadata.url);
            console.log('Content Length:', result.content.length, 'characters');
            console.log('Articles Found:', result.articles.length);
            console.log('Sections Found:', result.structure.sections.length);
            
            if (result.articles.length > 0) {
                console.log('\n📋 FIRST 3 ARTICLES:');
                result.articles.slice(0, 3).forEach((article, i) => {
                    console.log(`${i + 1}. Art. ${article.number}`);
                    console.log(`   Content preview: ${article.content.substring(0, 100)}...`);
                });
            }
            
            if (result.structure.sections.length > 0) {
                console.log('\n📑 DOCUMENT SECTIONS:');
                result.structure.sections.slice(0, 5).forEach((section, i) => {
                    console.log(`${i + 1}. Level ${section.level}: ${section.title}`);
                });
            }

        } else {
            // Test robots.txt first
            console.log('🤖 Testing robots.txt compliance...');
            const testUrl = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1942-08-17;1150';
            const canScrape = await scraper.canScrape(testUrl);
            console.log(`Robots.txt check: ${canScrape ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);
            
            if (!canScrape) {
                console.log('⚠️ Robots.txt blocks scraping. Exiting...');
                return;
            }

            // Test single document (L.1150/1942 - shortest and most important)
            console.log('🎯 Testing single document: L.1150/1942 (Legge Urbanistica)\n');
            
            const result = await scraper.testScrapeDocument('L1150_1942');
            
            console.log('\n✅ SINGLE DOCUMENT TEST COMPLETED');
            console.log('📊 Results:');
            console.log(`   - File saved: ${result.metadata.fileInfo.filePath}`);
            console.log(`   - Content: ${result.content.length} characters`);
            console.log(`   - Articles: ${result.articles.length} found`);
            console.log(`   - Structure: ${result.structure.sections.length} sections`);
            
            // Show preview of content
            console.log('\n📖 CONTENT PREVIEW (first 500 chars):');
            console.log(result.content.substring(0, 500) + '...');
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main };