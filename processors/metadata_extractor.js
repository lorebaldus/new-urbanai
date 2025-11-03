// Rich Legal Metadata Extractor
// Extracts comprehensive metadata from Italian legal documents

export class LegalMetadataExtractor {
    constructor() {
        // Italian legal document types and their patterns
        this.documentTypes = {
            'legge': {
                patterns: [/(?:Legge|L\.)\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Parlamento',
                prefix: 'L',
                description: 'Legge ordinaria dello Stato'
            },
            'decreto_legge': {
                patterns: [/(?:D\.L\.|Decreto\s+Legge)\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Governo',
                prefix: 'DL',
                description: 'Decreto Legge'
            },
            'decreto_legislativo': {
                patterns: [/(?:D\.Lgs\.|Decreto\s+Legislativo)\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Governo',
                prefix: 'DLgs',
                description: 'Decreto Legislativo'
            },
            'decreto_presidente': {
                patterns: [/(?:DPR|D\.P\.R\.|Decreto\s+del\s+Presidente)\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Presidente della Repubblica',
                prefix: 'DPR',
                description: 'Decreto del Presidente della Repubblica'
            },
            'regolamento': {
                patterns: [/Regolamento\s*(?:n\.)?\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Varie',
                prefix: 'Reg',
                description: 'Regolamento'
            },
            'circolare': {
                patterns: [/Circolare\s*(?:n\.)?\s*(\d+(?:\/\d+)?)/gi],
                authority: 'Ministero',
                prefix: 'Circ',
                description: 'Circolare ministeriale'
            }
        };

        // Urban planning specific topics
        this.urbanisticTopics = {
            'pianificazione': {
                keywords: ['piano regolatore', 'prg', 'pgt', 'put', 'pianificazione', 'zonizzazione', 'destinazione urbanistica'],
                weight: 10,
                description: 'Pianificazione territoriale e urbanistica'
            },
            'edilizia': {
                keywords: ['permesso di costruire', 'scia', 'cila', 'dia', 'edilizia libera', 'costruzione', 'edificio'],
                weight: 10,
                description: 'Procedure e titoli edilizi'
            },
            'vincoli': {
                keywords: ['vincolo paesaggistico', 'beni culturali', 'tutela', 'soprintendenza', 'autorizzazione paesaggistica'],
                weight: 8,
                description: 'Vincoli e tutele'
            },
            'esproprio': {
                keywords: ['esproprio', 'espropriazione', 'pubblica utilità', 'indennità'],
                weight: 7,
                description: 'Procedure espropriative'
            },
            'ambiente': {
                keywords: ['ambiente', 'impatto ambientale', 'via', 'vas', 'sostenibilità'],
                weight: 6,
                description: 'Ambiente e sostenibilità'
            },
            'standard': {
                keywords: ['standard urbanistici', 'servizi pubblici', 'verde pubblico', 'parcheggi'],
                weight: 6,
                description: 'Standard urbanistici'
            },
            'abuso': {
                keywords: ['abuso edilizio', 'demolizione', 'sanatoria', 'condono'],
                weight: 8,
                description: 'Abusi edilizi e sanatorie'
            },
            'procedimento': {
                keywords: ['procedimento amministrativo', 'autorizzazione', 'conferenza servizi', 'silenzio assenso'],
                weight: 5,
                description: 'Procedimenti amministrativi'
            }
        };

        // Legal status indicators
        this.statusKeywords = {
            'vigente': ['vigente', 'in vigore', 'efficace'],
            'abrogato': ['abrogato', 'abrogata', 'cessato', 'non più vigente'],
            'modificato': ['modificato', 'modificata', 'come modificato', 'novellato'],
            'sospeso': ['sospeso', 'sospesa', 'temporaneamente sospeso'],
            'decaduto': ['decaduto', 'decaduta', 'scaduto']
        };

        // Cross-reference patterns
        this.referencePatterns = {
            'internal_article': /(?:art\.|articolo)\s*(\d+)/gi,
            'internal_comma': /comma\s*(\d+)/gi,
            'internal_letter': /lett\.\s*([a-z])\)/gi,
            'external_law': /(?:legge|l\.)\s*(\d+\/\d+)/gi,
            'external_dpr': /(?:dpr|d\.p\.r\.)\s*(\d+\/\d+)/gi,
            'external_dlgs': /(?:d\.lgs\.|decreto\s+legislativo)\s*(\d+\/\d+)/gi,
            'testo_unico': /(?:testo\s+unico|t\.u\.)/gi,
            'costituzione': /costituzione/gi,
            'codice_civile': /codice\s+civile/gi
        };

        console.log('🏷️ LegalMetadataExtractor initialized with Italian legal patterns');
    }

    extractMetadata(parsedDocument, originalConfig = {}) {
        console.log(`🔍 Extracting metadata from: ${parsedDocument.metadata.title}`);

        const enhanced = {
            // Basic information (from parser + config)
            ...parsedDocument.metadata,
            ...originalConfig,

            // Enhanced document classification
            document_classification: this.classifyDocument(parsedDocument),
            
            // Rich topic analysis
            topic_analysis: this.analyzeTopics(parsedDocument),
            
            // Legal status analysis
            status_analysis: this.analyzeStatus(parsedDocument),
            
            // Structural analysis
            structure_analysis: this.analyzeStructure(parsedDocument),
            
            // Cross-reference analysis
            reference_analysis: this.analyzeReferences(parsedDocument),
            
            // Authority and jurisdiction
            authority_analysis: this.analyzeAuthority(parsedDocument),
            
            // Temporal analysis
            temporal_analysis: this.analyzeTemporal(parsedDocument),
            
            // Quality metrics
            quality_metrics: this.calculateQualityMetrics(parsedDocument),
            
            // Processing metadata
            processing_info: {
                extracted_at: new Date().toISOString(),
                extractor_version: '1.0.0',
                confidence_score: this.calculateConfidenceScore(parsedDocument)
            }
        };

        console.log(`✅ Enhanced metadata extracted - confidence: ${enhanced.processing_info.confidence_score}%`);
        return enhanced;
    }

    classifyDocument(parsedDocument) {
        const text = parsedDocument.fullText.toLowerCase();
        const classification = {
            primary_type: 'unknown',
            secondary_types: [],
            confidence: 0,
            detected_patterns: []
        };

        let bestMatch = null;
        let bestScore = 0;

        // Check each document type
        for (const [type, config] of Object.entries(this.documentTypes)) {
            for (const pattern of config.patterns) {
                const matches = [...text.matchAll(pattern)];
                if (matches.length > 0) {
                    const score = matches.length * 10 + (type === parsedDocument.metadata.type ? 20 : 0);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = {
                            type,
                            config,
                            matches: matches.map(m => m[0]),
                            number: matches[0][1]
                        };
                    }
                }
            }
        }

        if (bestMatch) {
            classification.primary_type = bestMatch.type;
            classification.confidence = Math.min(95, bestScore);
            classification.detected_patterns = bestMatch.matches;
            classification.authority = bestMatch.config.authority;
            classification.formal_citation = `${bestMatch.config.prefix} ${bestMatch.number}`;
        }

        return classification;
    }

    analyzeTopics(parsedDocument) {
        const text = parsedDocument.fullText.toLowerCase();
        const analysis = {
            primary_topics: [],
            secondary_topics: [],
            topic_scores: {},
            urbanistic_relevance: 0
        };

        // Calculate scores for each topic
        for (const [topic, config] of Object.entries(this.urbanisticTopics)) {
            let score = 0;
            const foundKeywords = [];

            for (const keyword of config.keywords) {
                const keywordRegex = new RegExp(keyword.replace(/\s+/g, '\\s+'), 'gi');
                const matches = text.match(keywordRegex);
                if (matches) {
                    score += matches.length * config.weight;
                    foundKeywords.push({
                        keyword,
                        count: matches.length
                    });
                }
            }

            if (score > 0) {
                analysis.topic_scores[topic] = {
                    score,
                    found_keywords: foundKeywords,
                    description: config.description
                };
            }
        }

        // Classify topics by score
        const sortedTopics = Object.entries(analysis.topic_scores)
            .sort(([,a], [,b]) => b.score - a.score);

        analysis.primary_topics = sortedTopics.slice(0, 3).map(([topic, data]) => ({
            topic,
            score: data.score,
            description: data.description
        }));

        analysis.secondary_topics = sortedTopics.slice(3, 6).map(([topic, data]) => ({
            topic,
            score: data.score,
            description: data.description
        }));

        // Calculate overall urbanistic relevance
        const totalScore = Object.values(analysis.topic_scores).reduce((sum, data) => sum + data.score, 0);
        analysis.urbanistic_relevance = Math.min(100, Math.round(totalScore / 10));

        return analysis;
    }

    analyzeStatus(parsedDocument) {
        const text = parsedDocument.fullText.toLowerCase();
        const analysis = {
            current_status: 'vigente',
            confidence: 50,
            status_indicators: [],
            modification_history: [],
            effective_date: null,
            expiration_date: null
        };

        // Check status keywords
        for (const [status, keywords] of Object.entries(this.statusKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    analysis.status_indicators.push({
                        status,
                        keyword,
                        found: true
                    });
                    
                    if (status !== 'vigente') {
                        analysis.current_status = status;
                        analysis.confidence = 80;
                    }
                }
            }
        }

        // Look for modification indicators
        const modificationPatterns = [
            /(?:modificato|sostituito|integrato)\s+(?:da|dall[''])\s*([^.]+)/gi,
            /(?:come\s+modificato\s+da)\s*([^.]+)/gi
        ];

        modificationPatterns.forEach(pattern => {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                analysis.modification_history.push({
                    type: 'modification',
                    description: match[1].trim(),
                    source_text: match[0]
                });
            });
        });

        return analysis;
    }

    analyzeStructure(parsedDocument) {
        const analysis = {
            total_articles: parsedDocument.articles?.length || 0,
            article_distribution: {},
            structural_complexity: 'simple',
            has_annexes: false,
            hierarchical_depth: 1
        };

        // Analyze article distribution
        if (parsedDocument.articles) {
            const commaDistribution = {};
            
            parsedDocument.articles.forEach(article => {
                const commaCount = article.commas?.length || 0;
                commaDistribution[commaCount] = (commaDistribution[commaCount] || 0) + 1;
                
                if (commaCount > 5) {
                    analysis.hierarchical_depth = Math.max(analysis.hierarchical_depth, 2);
                }
            });

            analysis.article_distribution = {
                total: analysis.total_articles,
                with_commas: Object.keys(commaDistribution).filter(k => k > 0).length,
                avg_commas_per_article: analysis.total_articles > 0 ? 
                    parsedDocument.articles.reduce((sum, art) => sum + (art.commas?.length || 0), 0) / analysis.total_articles : 0
            };
        }

        // Determine complexity
        if (analysis.total_articles > 100) {
            analysis.structural_complexity = 'very_complex';
        } else if (analysis.total_articles > 50) {
            analysis.structural_complexity = 'complex';
        } else if (analysis.total_articles > 20) {
            analysis.structural_complexity = 'moderate';
        }

        // Check for annexes
        const text = parsedDocument.fullText.toLowerCase();
        if (text.includes('allegato') || text.includes('tabella') || text.includes('schema')) {
            analysis.has_annexes = true;
        }

        return analysis;
    }

    analyzeReferences(parsedDocument) {
        const text = parsedDocument.fullText;
        const analysis = {
            internal_references: {},
            external_references: {},
            reference_density: 0,
            total_references: 0
        };

        // Count different types of references
        for (const [refType, pattern] of Object.entries(this.referencePatterns)) {
            const matches = [...text.matchAll(pattern)];
            
            if (matches.length > 0) {
                const category = refType.startsWith('internal_') ? 'internal_references' : 'external_references';
                
                analysis[category][refType] = {
                    count: matches.length,
                    examples: matches.slice(0, 3).map(m => m[0]),
                    targets: matches.map(m => m[1]).filter(Boolean)
                };
                
                analysis.total_references += matches.length;
            }
        }

        // Calculate reference density (references per 1000 characters)
        analysis.reference_density = Math.round((analysis.total_references * 1000) / parsedDocument.textLength);

        return analysis;
    }

    analyzeAuthority(parsedDocument) {
        const text = parsedDocument.fullText.toLowerCase();
        const analysis = {
            issuing_authority: 'unknown',
            competent_authorities: [],
            territorial_scope: 'national',
            administrative_level: 'state'
        };

        // Detect issuing authority
        const classification = parsedDocument.metadata.document_classification || this.classifyDocument(parsedDocument);
        if (classification.authority) {
            analysis.issuing_authority = classification.authority;
        }

        // Detect competent authorities mentioned in text
        const authorities = [
            { name: 'Comune', level: 'municipal', keywords: ['comune', 'comunale', 'sindaco', 'giunta comunale'] },
            { name: 'Regione', level: 'regional', keywords: ['regione', 'regionale', 'giunta regionale'] },
            { name: 'Provincia', level: 'provincial', keywords: ['provincia', 'provinciale'] },
            { name: 'Ministero', level: 'national', keywords: ['ministero', 'ministeriale', 'ministro'] },
            { name: 'Soprintendenza', level: 'special', keywords: ['soprintendenza', 'soprintendente'] }
        ];

        authorities.forEach(authority => {
            const mentions = authority.keywords.filter(keyword => text.includes(keyword)).length;
            if (mentions > 0) {
                analysis.competent_authorities.push({
                    name: authority.name,
                    level: authority.level,
                    mentions
                });
            }
        });

        // Determine territorial scope
        if (text.includes('regione') || text.includes('regionale')) {
            analysis.territorial_scope = 'regional';
            analysis.administrative_level = 'regional';
        } else if (text.includes('comune') || text.includes('comunale')) {
            analysis.territorial_scope = 'municipal';
            analysis.administrative_level = 'municipal';
        }

        return analysis;
    }

    analyzeTemporal(parsedDocument) {
        const text = parsedDocument.fullText;
        const analysis = {
            publication_date: parsedDocument.metadata.date || null,
            effective_date: null,
            important_dates: [],
            temporal_references: [],
            has_deadlines: false
        };

        // Extract dates
        const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g;
        const dates = [...text.matchAll(datePattern)];
        
        dates.forEach(match => {
            analysis.important_dates.push({
                date: match[0],
                context: text.substring(Math.max(0, match.index - 50), match.index + 50)
            });
        });

        // Look for temporal keywords
        const temporalKeywords = [
            'entro', 'scadenza', 'termine', 'decorso', 'giorni', 'mesi', 'anni',
            'dall\'entrata in vigore', 'dalla pubblicazione'
        ];

        temporalKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword)) {
                analysis.has_deadlines = true;
                analysis.temporal_references.push(keyword);
            }
        });

        return analysis;
    }

    calculateQualityMetrics(parsedDocument) {
        const metrics = {
            completeness_score: 0,
            structure_score: 0,
            metadata_richness: 0,
            overall_quality: 0
        };

        // Completeness score (based on content length and structure)
        const textLength = parsedDocument.textLength;
        if (textLength > 10000) metrics.completeness_score = 95;
        else if (textLength > 5000) metrics.completeness_score = 80;
        else if (textLength > 1000) metrics.completeness_score = 60;
        else metrics.completeness_score = 30;

        // Structure score (based on articles found)
        const articleCount = parsedDocument.articles?.length || 0;
        if (articleCount > 20) metrics.structure_score = 95;
        else if (articleCount > 10) metrics.structure_score = 80;
        else if (articleCount > 5) metrics.structure_score = 60;
        else if (articleCount > 0) metrics.structure_score = 40;
        else metrics.structure_score = 20;

        // Metadata richness (based on extracted metadata fields)
        const metadataFields = [
            parsedDocument.metadata.title,
            parsedDocument.metadata.number,
            parsedDocument.metadata.date,
            parsedDocument.metadata.type
        ].filter(Boolean).length;

        metrics.metadata_richness = (metadataFields / 4) * 100;

        // Overall quality (weighted average)
        metrics.overall_quality = Math.round(
            (metrics.completeness_score * 0.4) +
            (metrics.structure_score * 0.4) +
            (metrics.metadata_richness * 0.2)
        );

        return metrics;
    }

    calculateConfidenceScore(parsedDocument) {
        const factors = [];

        // Factor 1: Document type detection confidence
        const classification = this.classifyDocument(parsedDocument);
        factors.push(classification.confidence || 50);

        // Factor 2: Structure detection quality
        const hasArticles = parsedDocument.articles && parsedDocument.articles.length > 0;
        factors.push(hasArticles ? 80 : 40);

        // Factor 3: Metadata completeness
        const requiredFields = ['title', 'number', 'type'];
        const presentFields = requiredFields.filter(field => parsedDocument.metadata[field]).length;
        factors.push((presentFields / requiredFields.length) * 100);

        // Factor 4: Content length adequacy
        const textLength = parsedDocument.textLength;
        if (textLength > 5000) factors.push(90);
        else if (textLength > 1000) factors.push(70);
        else factors.push(40);

        return Math.round(factors.reduce((sum, factor) => sum + factor, 0) / factors.length);
    }

    // Enhanced metadata for chunks
    enhanceChunkMetadata(chunk, documentMetadata) {
        const enhanced = {
            ...chunk.metadata,
            
            // Document-level metadata
            document_metadata: documentMetadata,
            
            // Chunk-specific enhancements
            chunk_topics: this.analyzeChunkTopics(chunk.text),
            chunk_references: this.analyzeChunkReferences(chunk.text),
            chunk_complexity: this.analyzeChunkComplexity(chunk),
            
            // Contextual information
            context_info: {
                position_percentage: this.calculatePositionPercentage(chunk, documentMetadata),
                legal_context: this.determineLegalContext(chunk),
                relevance_indicators: this.extractRelevanceIndicators(chunk.text)
            }
        };

        return enhanced;
    }

    analyzeChunkTopics(text) {
        const lowerText = text.toLowerCase();
        const chunkTopics = [];

        for (const [topic, config] of Object.entries(this.urbanisticTopics)) {
            let score = 0;
            const foundKeywords = [];

            for (const keyword of config.keywords) {
                if (lowerText.includes(keyword)) {
                    score += config.weight;
                    foundKeywords.push(keyword);
                }
            }

            if (score > 0) {
                chunkTopics.push({
                    topic,
                    score,
                    keywords: foundKeywords,
                    relevance: Math.min(100, score * 2)
                });
            }
        }

        return chunkTopics.sort((a, b) => b.score - a.score);
    }

    analyzeChunkReferences(text) {
        const references = [];

        for (const [type, pattern] of Object.entries(this.referencePatterns)) {
            const matches = [...text.matchAll(pattern)];
            if (matches.length > 0) {
                references.push({
                    type,
                    count: matches.length,
                    examples: matches.slice(0, 2).map(m => m[0])
                });
            }
        }

        return references;
    }

    analyzeChunkComplexity(chunk) {
        return {
            token_count: chunk.tokens,
            sentence_count: chunk.text.split(/[.!?]+/).length - 1,
            legal_terms: this.countLegalTerms(chunk.text),
            reference_density: (chunk.metadata.references?.length || 0) / chunk.tokens * 100,
            readability: this.calculateReadability(chunk.text)
        };
    }

    countLegalTerms(text) {
        const legalTerms = [
            'articolo', 'comma', 'lettera', 'decreto', 'legge', 'regolamento',
            'autorizzazione', 'permesso', 'procedimento', 'vincolo', 'tutela'
        ];

        return legalTerms.filter(term => text.toLowerCase().includes(term)).length;
    }

    calculateReadability(text) {
        // Simple readability score based on sentence and word length
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 0);
        
        if (sentences.length === 0 || words.length === 0) return 50;
        
        const avgWordsPerSentence = words.length / sentences.length;
        const avgCharsPerWord = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        
        // Simple formula: lower is more readable
        const complexity = (avgWordsPerSentence * 0.5) + (avgCharsPerWord * 2);
        
        return Math.max(0, Math.min(100, 100 - complexity));
    }

    calculatePositionPercentage(chunk, documentMetadata) {
        const totalChunks = documentMetadata.processing_info?.total_chunks || 100;
        return Math.round((chunk.position_in_doc / totalChunks) * 100);
    }

    determineLegalContext(chunk) {
        const hierarchy = chunk.metadata.hierarchy || [];
        
        if (hierarchy.includes('articolo')) {
            return hierarchy.includes('comma') ? 'article_comma' : 'article_main';
        }
        
        return 'document_general';
    }

    extractRelevanceIndicators(text) {
        const indicators = [];
        const lowerText = text.toLowerCase();
        
        // High relevance indicators
        if (lowerText.includes('definizioni')) indicators.push('definitions');
        if (lowerText.includes('sanzioni')) indicators.push('sanctions');
        if (lowerText.includes('procedura') || lowerText.includes('procedimento')) indicators.push('procedure');
        if (lowerText.includes('requisiti')) indicators.push('requirements');
        if (lowerText.includes('obblighi')) indicators.push('obligations');
        
        return indicators;
    }

    // Test method
    testExtraction(parsedDocument) {
        console.log('🧪 Testing metadata extraction...');
        
        const metadata = this.extractMetadata(parsedDocument);
        
        console.log('📊 Metadata Results:');
        console.log(`   - Document type: ${metadata.document_classification.primary_type}`);
        console.log(`   - Confidence: ${metadata.processing_info.confidence_score}%`);
        console.log(`   - Primary topics: ${metadata.topic_analysis.primary_topics.map(t => t.topic).join(', ')}`);
        console.log(`   - Status: ${metadata.status_analysis.current_status}`);
        console.log(`   - Complexity: ${metadata.structure_analysis.structural_complexity}`);
        console.log(`   - Quality: ${metadata.quality_metrics.overall_quality}/100`);
        
        return metadata;
    }
}