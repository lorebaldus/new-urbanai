// Normattiva.it Scraper for Italian Legal Documents
// Specialized scraper for https://www.normattiva.it

import { BaseScraper } from './base_scraper.js';
import * as cheerio from 'cheerio';

export class NormattivaScraper extends BaseScraper {
    constructor(config = {}) {
        super({
            source: 'normattiva',
            baseUrl: 'https://www.normattiva.it',
            rateLimitMs: 2000, // Very conservative for government site
            ...config
        });

        // Priority legal documents for urban planning
        this.priorityDocuments = {
            'L1150_1942': {
                number: '1150/1942',
                title: 'Legge Urbanistica',
                type: 'legge',
                url: '/uri-res/N2Ls?urn:nir:stato:legge:1942-08-17;1150',
                priority: 1,
                description: 'Legge fondamentale per l\'urbanistica italiana'
            },
            'DPR380_2001': {
                number: '380/2001',
                title: 'Testo Unico Edilizia',
                type: 'decreto',
                url: '/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380',
                priority: 1,
                description: 'Testo Unico delle disposizioni legislative e regolamentari in materia edilizia'
            },
            'DLGS42_2004': {
                number: '42/2004',
                title: 'Codice Beni Culturali',
                type: 'decreto',
                url: '/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2004-01-22;42',
                priority: 1,
                description: 'Codice dei beni culturali e del paesaggio'
            }
        };

        console.log(`📚 NormattivaScraper ready - ${Object.keys(this.priorityDocuments).length} priority documents`);
    }

    async scrapeSource() {
        console.log(`🚀 Starting Normattiva.it scraping session...`);
        await this.logOperation('info', 'Scraping session started', {
            priorityDocuments: Object.keys(this.priorityDocuments).length,
            baseUrl: this.config.baseUrl
        });

        const results = [];
        const errors = [];

        for (const [docId, docConfig] of Object.entries(this.priorityDocuments)) {
            try {
                console.log(`\n📖 Processing ${docId}: ${docConfig.title}...`);
                const result = await this.scrapeDocument(docConfig);
                results.push(result);
                
                await this.logOperation('info', 'Document scraped successfully', {
                    documentId: docId,
                    title: docConfig.title,
                    contentLength: result.content.length
                });

            } catch (error) {
                console.error(`❌ Failed to scrape ${docId}:`, error.message);
                errors.push({ docId, error: error.message });
                
                await this.logOperation('error', 'Document scraping failed', {
                    documentId: docId,
                    title: docConfig.title,
                    error: error.message
                });
            }

            // Add extra delay between documents to be respectful
            console.log(`⏳ Waiting 3 seconds before next document...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const summary = {
            totalDocuments: Object.keys(this.priorityDocuments).length,
            successful: results.length,
            failed: errors.length,
            errors
        };

        console.log(`\n📊 Scraping session complete:`, summary);
        await this.logOperation('info', 'Scraping session completed', summary);

        return {
            success: results,
            errors,
            summary
        };
    }

    async scrapeDocument(docConfig) {
        const fullUrl = `${this.config.baseUrl}${docConfig.url}`;
        console.log(`📡 Fetching: ${docConfig.title} from ${fullUrl}`);

        // Fetch the document page
        const response = await this.fetchUrl(fullUrl, `scraping ${docConfig.title}`);
        
        // Parse HTML content
        const parsedContent = this.parseNormativaPage(response.content, docConfig);
        
        // Save raw content
        const filename = `${docConfig.number.replace('/', '_')}_${docConfig.title.replace(/\s+/g, '_')}`;
        const savedFile = await this.saveRawDocument(response, filename, 'normattiva');

        // Return structured result
        return {
            documentId: this.generateDocumentId(docConfig),
            metadata: {
                number: docConfig.number,
                title: docConfig.title,
                type: docConfig.type,
                priority: docConfig.priority,
                description: docConfig.description,
                source: 'normattiva',
                url: fullUrl,
                scrapedAt: new Date().toISOString(),
                fileInfo: savedFile
            },
            content: parsedContent.fullText,
            structure: parsedContent.structure,
            articles: parsedContent.articles
        };
    }

    parseNormativaPage(html, docConfig) {
        const $ = cheerio.load(html);
        console.log(`🔍 Parsing HTML for ${docConfig.title}...`);

        // Remove script and style elements
        $('script, style, nav, header, footer, .sidebar').remove();

        // Find the main content area (Normattiva uses specific containers)
        const contentSelectors = [
            '.content-main',           // Primary content area
            '.art-content',           // Article content
            '.norm-content',          // Normativa content
            '#content',               // Generic content ID
            '.document-text',         // Document text
            'main'                    // HTML5 main element
        ];

        let $mainContent = null;
        for (const selector of contentSelectors) {
            $mainContent = $(selector);
            if ($mainContent.length > 0) {
                console.log(`✅ Found content using selector: ${selector}`);
                break;
            }
        }

        // Fallback to body if no specific content area found
        if (!$mainContent || $mainContent.length === 0) {
            console.log(`⚠️ No specific content area found, using body`);
            $mainContent = $('body');
        }

        // Extract articles structure
        const articles = this.extractArticles($mainContent);
        
        // Get clean full text
        const fullText = this.cleanText($mainContent.text());

        // Extract document structure
        const structure = this.extractDocumentStructure($mainContent, docConfig);

        console.log(`📊 Parsed document: ${articles.length} articles, ${fullText.length} characters`);

        return {
            fullText,
            structure,
            articles
        };
    }

    extractArticles($content) {
        const articles = [];
        
        // Common patterns for articles in Italian legal documents
        const articleSelectors = [
            '.articolo',              // CSS class for articles
            '[id^="art"]',            // IDs starting with "art"
            'div:contains("Art.")',   // Divs containing "Art."
            'p:contains("Art.")',     // Paragraphs containing "Art."
        ];

        let $articles = $();
        for (const selector of articleSelectors) {
            const found = $content.find(selector);
            if (found.length > 0) {
                $articles = $articles.add(found);
            }
        }

        // If no specific selectors work, try to find by text pattern
        if ($articles.length === 0) {
            $content.find('*').each((i, element) => {
                const text = $(element).text().trim();
                if (/^Art\.\s*\d+/.test(text)) {
                    $articles = $articles.add(element);
                }
            });
        }

        $articles.each((i, element) => {
            const $article = $(element);
            const text = this.cleanText($article.text());
            
            if (text.length > 20) { // Skip very short elements
                const articleMatch = text.match(/^Art\.\s*(\d+(?:\s*-\s*\w+)?)/);
                const articleNumber = articleMatch ? articleMatch[1] : `${i + 1}`;
                
                articles.push({
                    number: articleNumber,
                    content: text,
                    htmlContent: $article.html()
                });
            }
        });

        console.log(`🔍 Extracted ${articles.length} articles`);
        return articles;
    }

    extractDocumentStructure($content, docConfig) {
        const structure = {
            title: docConfig.title,
            number: docConfig.number,
            type: docConfig.type,
            sections: []
        };

        // Look for sections, chapters, titles
        const sectionSelectors = [
            'h1, h2, h3, h4',
            '.titolo',
            '.sezione',
            '.capitolo',
            '[class*="title"]'
        ];

        const $sections = $content.find(sectionSelectors.join(', '));
        
        $sections.each((i, element) => {
            const $section = $(element);
            const text = this.cleanText($section.text());
            
            if (text.length > 5 && text.length < 200) {
                structure.sections.push({
                    level: this.getSectionLevel(element.tagName),
                    title: text,
                    index: i
                });
            }
        });

        console.log(`📋 Document structure: ${structure.sections.length} sections`);
        return structure;
    }

    getSectionLevel(tagName) {
        const levelMap = {
            'H1': 1, 'H2': 2, 'H3': 3, 'H4': 4, 'H5': 5, 'H6': 6
        };
        return levelMap[tagName.toUpperCase()] || 3;
    }

    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')           // Multiple spaces to single space
            .replace(/\n\s*\n/g, '\n')      // Multiple newlines to single
            .replace(/^\s+|\s+$/g, '')      // Trim
            .replace(/\u00A0/g, ' ')        // Non-breaking spaces to regular spaces
            .replace(/[""]/g, '"')          // Smart quotes to regular quotes
            .replace(/['']/g, "'")          // Smart apostrophes
            .trim();
    }

    generateDocumentId(docConfig) {
        return `normattiva_${docConfig.type}_${docConfig.number.replace('/', '_')}`;
    }

    // Utility method to test a single document
    async testScrapeDocument(docId) {
        if (!this.priorityDocuments[docId]) {
            throw new Error(`Document ${docId} not found in priority list`);
        }

        console.log(`🧪 Testing scrape for document: ${docId}`);
        const result = await this.scrapeDocument(this.priorityDocuments[docId]);
        
        console.log(`✅ Test complete for ${docId}:`);
        console.log(`   - Content length: ${result.content.length} chars`);
        console.log(`   - Articles found: ${result.articles.length}`);
        console.log(`   - Sections found: ${result.structure.sections.length}`);
        
        return result;
    }
}