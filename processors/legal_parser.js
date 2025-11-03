// Legal Document Parser
// Parses HTML from Italian legal sources and extracts structured content

export class LegalParser {
    constructor() {
        // Italian legal document patterns
        this.patterns = {
            article: /(?:Art\.|Articolo)\s*(\d+(?:\s*-\s*\w+)?)/gi,
            comma: /(?:Comma|,)\s*(\d+)/gi,
            letter: /(?:lettera|lett\.)\s*([a-z])\)/gi,
            number: /(?:numero|n\.)\s*(\d+)/gi,
            paragraph: /(?:paragrafo|par\.)\s*(\d+)/gi,
            
            // Document metadata patterns
            lawNumber: /(?:Legge|L\.)\s*(\d+(?:\/\d+)?)/gi,
            decreeNumber: /(?:DPR|D\.P\.R\.|Decreto)\s*(\d+(?:\/\d+)?)/gi,
            dlgsNumber: /(?:D\.Lgs\.|D\.L\.|Decreto\s+Legislativo)\s*(\d+(?:\/\d+)?)/gi,
            date: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g,
            
            // Legal references
            reference: /(?:vedasi|vedi|si rinvia|cfr\.)\s*(?:art\.|articolo)\s*(\d+)/gi,
            modification: /(?:modificato|sostituito|integrato)\s*(?:da|dall[''])\s*([^.]+)/gi
        };

        // HTML selectors for different legal document structures
        this.selectors = {
            // Normattiva.it specific
            normattiva: {
                mainContent: ['.corpo-articolo', '.content-main', '.document-content', '.art-content'],
                articles: ['.articolo', '[id^="art"]', '.art'],
                title: ['h1', '.title', '.doc-title'],
                metadata: ['.metadata', '.doc-info', '.header-info']
            },
            
            // Gazzetta Ufficiale
            gazzetta: {
                mainContent: ['.documento', '.content', '.text'],
                articles: ['.articolo', '.art'],
                title: ['h1', '.titolo'],
                metadata: ['.intestazione', '.metadata']
            },
            
            // Generic fallback
            generic: {
                mainContent: ['main', '.content', '.document', 'body'],
                articles: ['[id*="art"]', '.article', '.articolo'],
                title: ['h1', '.title'],
                metadata: ['.metadata', '.info']
            }
        };

        console.log('📖 LegalParser initialized with Italian legal patterns');
    }

    parseDocument(html, documentConfig = {}) {
        console.log(`🔍 Parsing document: ${documentConfig.title || 'Unknown'}`);
        
        // Detect source type for appropriate selectors
        const sourceType = this.detectSourceType(html, documentConfig.source);
        const selectors = this.selectors[sourceType] || this.selectors.generic;
        
        // Clean HTML and extract text
        const cleanedHtml = this.cleanHtml(html);
        
        // Extract main content using appropriate selectors
        const mainContent = this.extractMainContent(cleanedHtml, selectors);
        
        // Parse document structure
        const structure = this.parseDocumentStructure(mainContent, selectors);
        
        // Extract articles with hierarchy
        const articles = this.extractArticles(mainContent, selectors);
        
        // Extract metadata
        const metadata = this.extractDocumentMetadata(mainContent, documentConfig);
        
        // Get full text
        const fullText = this.extractCleanText(mainContent);
        
        const result = {
            sourceType,
            metadata,
            structure,
            articles,
            fullText,
            textLength: fullText.length,
            articleCount: articles.length
        };

        console.log(`✅ Parsed document: ${result.articleCount} articles, ${result.textLength} chars`);
        return result;
    }

    detectSourceType(html, configSource) {
        if (configSource) return configSource;
        
        if (html.includes('normattiva.it') || html.includes('normattiva')) return 'normattiva';
        if (html.includes('gazzettaufficiale.it') || html.includes('gazzetta')) return 'gazzetta';
        return 'generic';
    }

    cleanHtml(html) {
        // Remove problematic elements
        const elementsToRemove = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
            /<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi,
            /<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi,
            /<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi,
            /<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi,
            /<!--[\s\S]*?-->/g
        ];

        let cleaned = html;
        elementsToRemove.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        return cleaned;
    }

    extractMainContent(html, selectors) {
        // Try selectors in order of preference
        for (const selector of selectors.mainContent) {
            const match = this.extractBySelector(html, selector);
            if (match && match.length > 1000) { // Minimum content length
                console.log(`✅ Found main content using selector: ${selector}`);
                return match;
            }
        }
        
        console.log('⚠️ No specific content area found, using full HTML');
        return html;
    }

    extractBySelector(html, selector) {
        // Simple CSS selector matching for most common cases
        if (selector.startsWith('.')) {
            const className = selector.slice(1);
            const classRegex = new RegExp(`<[^>]*class[^>]*\\b${className}\\b[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
            const match = classRegex.exec(html);
            return match ? match[1] : null;
        } else if (selector.startsWith('#')) {
            const id = selector.slice(1);
            const idRegex = new RegExp(`<[^>]*id[^>]*\\b${id}\\b[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
            const match = idRegex.exec(html);
            return match ? match[1] : null;
        } else {
            // Tag selector
            const tagRegex = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'gi');
            const match = tagRegex.exec(html);
            return match ? match[1] : null;
        }
    }

    parseDocumentStructure(content, selectors) {
        const structure = {
            type: this.detectDocumentType(content),
            sections: [],
            hierarchy: []
        };

        // Extract headings and sections
        const headingPatterns = [
            /<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi,
            /<div[^>]*class[^>]*titolo[^>]*>([^<]+)<\/div>/gi,
            /<p[^>]*class[^>]*title[^>]*>([^<]+)<\/p>/gi
        ];

        headingPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const level = match[1] ? parseInt(match[1]) : 3;
                const title = this.cleanText(match[2] || match[1]);
                
                if (title && title.length > 3 && title.length < 200) {
                    structure.sections.push({
                        level,
                        title,
                        position: match.index
                    });
                }
            }
        });

        // Build hierarchy
        structure.hierarchy = this.buildHierarchy(structure.sections);
        
        console.log(`📋 Document structure: ${structure.sections.length} sections, type: ${structure.type}`);
        return structure;
    }

    detectDocumentType(content) {
        const text = content.toLowerCase();
        
        if (text.includes('legge') && /l\.\s*\d+\/\d+/.test(text)) return 'legge';
        if (text.includes('decreto') && /d\.?p\.?r\.?\s*\d+\/\d+/.test(text)) return 'decreto_presidente';
        if (text.includes('decreto') && /d\.?lgs\.?\s*\d+\/\d+/.test(text)) return 'decreto_legislativo';
        if (text.includes('regolamento')) return 'regolamento';
        if (text.includes('circolare')) return 'circolare';
        if (text.includes('sentenza')) return 'sentenza';
        
        return 'documento_generico';
    }

    extractArticles(content, selectors) {
        const articles = [];
        let articleCounter = 0;

        // Try multiple strategies to find articles
        const strategies = [
            () => this.extractArticlesBySelector(content, selectors),
            () => this.extractArticlesByPattern(content),
            () => this.extractArticlesByTextPattern(content)
        ];

        for (const strategy of strategies) {
            const found = strategy();
            if (found.length > 0) {
                console.log(`✅ Found ${found.length} articles using strategy`);
                return found;
            }
        }

        console.log('⚠️ No articles found using any strategy');
        return articles;
    }

    extractArticlesBySelector(content, selectors) {
        const articles = [];
        
        // This is a simplified implementation since we don't have cheerio
        // Look for article patterns in HTML directly
        const articleRegex = /<div[^>]*class[^>]*articolo[^>]*>([\s\S]*?)<\/div>/gi;
        let match;
        
        while ((match = articleRegex.exec(content)) !== null) {
            const articleHtml = match[1];
            const text = this.extractCleanText(articleHtml);
            
            if (text.length > 50) {
                const articleMatch = text.match(/^(?:Art\.|Articolo)\s*(\d+(?:\s*-\s*[^.\n]+)?)/i);
                const articleNumber = articleMatch ? articleMatch[1].trim() : `${articles.length + 1}`;
                
                articles.push({
                    number: articleNumber,
                    title: this.extractArticleTitle(text),
                    content: text,
                    commas: this.extractCommas(text),
                    position: articles.length,
                    length: text.length
                });
            }
        }
        
        return articles;
    }

    extractArticlesByPattern(content) {
        const articles = [];
        
        // Split content by article patterns
        const articleSplits = content.split(/(?=(?:Art\.|Articolo)\s*\d+)/gi);
        
        articleSplits.forEach((section, index) => {
            if (index === 0 && !section.match(/^(?:Art\.|Articolo)/i)) {
                return; // Skip preamble
            }

            const text = this.cleanText(section);
            if (text.length < 50) return; // Skip very short sections

            const articleMatch = text.match(/^(?:Art\.|Articolo)\s*(\d+(?:\s*-\s*[^.]+)?)/i);
            const articleNumber = articleMatch ? articleMatch[1].trim() : `${index}`;

            // Extract commas within this article
            const commas = this.extractCommas(text);

            articles.push({
                number: articleNumber,
                title: this.extractArticleTitle(text),
                content: text,
                commas,
                position: index,
                length: text.length
            });
        });

        return articles;
    }

    extractArticlesByTextPattern(content) {
        const articles = [];
        const text = this.extractCleanText(content);
        
        // Find all article occurrences
        const articleMatches = [...text.matchAll(/(?:Art\.|Articolo)\s*(\d+(?:\s*-\s*[^.\n]+)?)/gi)];
        
        for (let i = 0; i < articleMatches.length; i++) {
            const match = articleMatches[i];
            const nextMatch = articleMatches[i + 1];
            
            const startPos = match.index;
            const endPos = nextMatch ? nextMatch.index : text.length;
            
            const articleText = text.substring(startPos, endPos).trim();
            
            if (articleText.length > 50) {
                const commas = this.extractCommas(articleText);
                
                articles.push({
                    number: match[1].trim(),
                    title: this.extractArticleTitle(articleText),
                    content: articleText,
                    commas,
                    position: i,
                    length: articleText.length
                });
            }
        }

        return articles;
    }

    extractCommas(articleText) {
        const commas = [];
        
        // Split by comma patterns
        const commaSplits = articleText.split(/(?=(?:\d+\.|\d+\)|Comma\s*\d+))/gi);
        
        commaSplits.forEach((section, index) => {
            const text = this.cleanText(section);
            if (text.length < 20) return;

            const commaMatch = text.match(/^(?:(\d+)\.|\((\d+)\)|Comma\s*(\d+))/i);
            const commaNumber = commaMatch ? (commaMatch[1] || commaMatch[2] || commaMatch[3]) : `${index + 1}`;

            if (text.length > 20) {
                commas.push({
                    number: commaNumber,
                    content: text,
                    length: text.length
                });
            }
        });

        return commas;
    }

    extractArticleTitle(articleText) {
        // Try to extract title from first line after article number
        const lines = articleText.split('\n').map(line => line.trim()).filter(line => line);
        
        if (lines.length < 2) return '';
        
        const firstLine = lines[0];
        const secondLine = lines[1];
        
        // Title is often on the first line after the article number
        const titleMatch = firstLine.match(/^(?:Art\.|Articolo)\s*\d+(?:\s*-\s*(.+))?/i);
        if (titleMatch && titleMatch[1]) {
            return titleMatch[1].trim();
        }
        
        // Or on the second line
        if (secondLine && secondLine.length < 100 && !secondLine.includes('.')) {
            return secondLine;
        }
        
        return '';
    }

    extractDocumentMetadata(content, config) {
        const text = this.extractCleanText(content);
        
        const metadata = {
            source: config.source || 'unknown',
            title: config.title || this.extractTitle(content),
            number: config.number || this.extractDocumentNumber(text),
            type: config.type || this.detectDocumentType(text),
            date: this.extractDate(text),
            status: this.extractStatus(text),
            authority: this.extractAuthority(text),
            topics: this.extractTopics(text),
            references: this.extractReferences(text)
        };

        return metadata;
    }

    extractTitle(content) {
        // Try to find title in common locations
        const titlePatterns = [
            /<title[^>]*>([^<]+)<\/title>/i,
            /<h1[^>]*>([^<]+)<\/h1>/i,
            /<div[^>]*class[^>]*title[^>]*>([^<]+)<\/div>/i
        ];

        for (const pattern of titlePatterns) {
            const match = pattern.exec(content);
            if (match && match[1]) {
                return this.cleanText(match[1]);
            }
        }

        return '';
    }

    extractDocumentNumber(text) {
        const patterns = [
            /(?:Legge|L\.)\s*(\d+(?:\/\d+)?)/i,
            /(?:DPR|D\.P\.R\.)\s*(\d+(?:\/\d+)?)/i,
            /(?:D\.Lgs\.|Decreto\s+Legislativo)\s*(\d+(?:\/\d+)?)/i
        ];

        for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match && match[1]) {
                return match[1];
            }
        }

        return '';
    }

    extractDate(text) {
        const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
        return dateMatch ? dateMatch[0] : '';
    }

    extractStatus(text) {
        if (text.includes('abrogato') || text.includes('abrogata')) return 'abrogato';
        if (text.includes('modificato') || text.includes('modificata')) return 'modificato';
        return 'vigente';
    }

    extractAuthority(text) {
        const authorities = [
            'Presidente della Repubblica',
            'Parlamento',
            'Consiglio dei Ministri',
            'Ministero',
            'Regione',
            'Comune'
        ];

        for (const authority of authorities) {
            if (text.toLowerCase().includes(authority.toLowerCase())) {
                return authority;
            }
        }

        return '';
    }

    extractTopics(text) {
        const topicKeywords = {
            'urbanistica': ['urbanistica', 'urbanistico', 'piano regolatore', 'PRG', 'zonizzazione'],
            'edilizia': ['edilizia', 'edilizio', 'costruzione', 'permesso di costruire', 'SCIA'],
            'ambiente': ['ambiente', 'ambientale', 'paesaggio', 'vincolo paesaggistico'],
            'beni_culturali': ['beni culturali', 'patrimonio', 'tutela', 'conservazione'],
            'procedimento': ['procedimento', 'autorizzazione', 'licenza', 'permesso']
        };

        const topics = [];
        const lowerText = text.toLowerCase();

        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                topics.push(topic);
            }
        }

        return topics;
    }

    extractReferences(text) {
        const references = [];
        
        // Find references to other articles
        const refMatches = [...text.matchAll(/(?:vedasi|vedi|si rinvia|cfr\.)\s*(?:art\.|articolo)\s*(\d+)/gi)];
        refMatches.forEach(match => {
            references.push({
                type: 'internal_article',
                target: match[1],
                text: match[0]
            });
        });

        // Find references to other laws
        const lawMatches = [...text.matchAll(/(?:Legge|L\.)\s*(\d+\/\d+)/gi)];
        lawMatches.forEach(match => {
            references.push({
                type: 'external_law',
                target: match[1],
                text: match[0]
            });
        });

        return references;
    }

    buildHierarchy(sections) {
        const hierarchy = [];
        const stack = [];

        sections.forEach(section => {
            // Pop sections with higher or equal level
            while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
                stack.pop();
            }

            // Add parent reference
            section.parent = stack.length > 0 ? stack[stack.length - 1] : null;
            section.children = [];

            // Add to parent's children
            if (section.parent) {
                section.parent.children.push(section);
            } else {
                hierarchy.push(section);
            }

            stack.push(section);
        });

        return hierarchy;
    }

    cleanText(text) {
        if (!text) return '';
        
        return text
            .replace(/\s+/g, ' ')           // Multiple spaces to single
            .replace(/\n\s*\n/g, '\n')      // Multiple newlines to single
            .replace(/^\s+|\s+$/g, '')      // Trim
            .replace(/\u00A0/g, ' ')        // Non-breaking spaces
            .replace(/[""]/g, '"')          // Smart quotes
            .replace(/['']/g, "'")          // Smart apostrophes
            .replace(/&nbsp;/g, ' ')        // HTML entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    extractCleanText(html) {
        // Remove all HTML tags and get clean text
        const text = html
            .replace(/<[^>]*>/g, ' ')       // Remove all HTML tags
            .replace(/\s+/g, ' ')           // Multiple spaces to single
            .trim();
        
        return this.cleanText(text);
    }

    // Utility method for testing
    testParse(htmlContent, documentConfig = {}) {
        console.log('🧪 Testing legal parser...');
        const result = this.parseDocument(htmlContent, documentConfig);
        
        console.log('📊 Parse Results:');
        console.log(`   - Document type: ${result.metadata.type}`);
        console.log(`   - Title: ${result.metadata.title}`);
        console.log(`   - Number: ${result.metadata.number}`);
        console.log(`   - Articles: ${result.articleCount}`);
        console.log(`   - Text length: ${result.textLength} chars`);
        console.log(`   - Topics: ${result.metadata.topics.join(', ')}`);
        
        return result;
    }
}