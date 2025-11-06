// Query Router - Intelligent Classification for Multi-Corpus Legal + Urban Search
// Routes user queries to appropriate namespaces with smart weights

export class QueryRouter {
    constructor(config = {}) {
        this.config = {
            // Keyword weights for scoring
            keywordWeights: {
                legal: 1.0,
                regional: 0.8,
                urban: 0.9
            },
            
            // Minimum confidence for legal routes
            legalConfidenceThreshold: 0.1,
            regionalConfidenceThreshold: 0.3,
            
            // Default namespace weights
            defaultWeights: {
                '': 1.0,                    // Default/unnamed namespace (Pinecone default)
                'laws-national': 0.6,
                'laws-regional': 0.5,
                'laws-jurisprudence': 0.7,
                'urbanistica-base': 0.8
            },
            
            ...config
        };

        // Italian legal system keywords
        this.legalKeywords = [
            // Core legal terms
            'legge', 'norma', 'normativa', 'decreto', 'regolamento',
            'sentenza', 'giurisprudenza', 'articolo', 'comma', 'lettera',
            
            // Legal procedures
            'abusivo', 'sanzione', 'multa', 'permesso', 'autorizzazione',
            'licenza', 'concessione', 'nullaosta', 'parere', 'visto',
            'nulla-osta', 'requisiti', 'adempimenti', 'conformità',
            
            // Courts and authorities
            'cassazione', 'tar', 'consiglio stato', 'tribunale', 'corte',
            'prefettura', 'ministero', 'soprintendenza', 'regione',
            
            // Legal documents
            'dpr', 'dlgs', 'd.lgs', 'd.p.r', 'legge quadro', 'testo unico',
            'codice civile', 'codice penale', 'costituzione',
            
            // Legal procedures specific
            'ricorso', 'appello', 'istanza', 'domanda', 'richiesta',
            'procedimento', 'processo', 'giudizio', 'accertamento'
        ];

        // Regional administration keywords
        this.regionalKeywords = [
            // Italian regions
            'lombardia', 'lazio', 'veneto', 'piemonte', 'campania',
            'sicilia', 'emilia romagna', 'emilia-romagna', 'toscana',
            'puglia', 'calabria', 'sardegna', 'liguria', 'marche',
            'abruzzo', 'umbria', 'basilicata', 'molise', 'friuli',
            'trentino', 'valle aosta', 'valle d\'aosta',
            
            // Regional terms
            'regione', 'regionale', 'provinciale', 'comunale',
            'bur', 'bollettino ufficiale', 'piano territoriale regionale',
            'ptr', 'ptcp', 'piano territoriale coordinamento',
            'piano paesaggistico', 'piano casa', 'legge regionale',
            'lr', 'l.r.', 'delibera regionale', 'dgr',
            
            // Local administration
            'giunta regionale', 'consiglio regionale', 'assessorato',
            'direzione regionale', 'settore regionale'
        ];

        // Urban planning specific keywords  
        this.urbanKeywords = [
            // Planning instruments
            'urbanistica', 'urbanistico', 'piano regolatore', 'prg',
            'piano generale', 'pgtu', 'pgt', 'piano strutturale',
            'piano operativo', 'regolamento edilizio', 're',
            
            // Zoning and land use
            'zoning', 'zonizzazione', 'destinazione uso', 'destinazione d\'uso',
            'zona residenziale', 'zona commerciale', 'zona industriale',
            'zona agricola', 'zona mista', 'zona servizi',
            'area edificabile', 'area non edificabile',
            
            // Building parameters
            'volumetria', 'volume', 'altezza', 'altezza massima',
            'distanze', 'distanza minima', 'arretramento',
            'indice edificabilità', 'indice fondiario', 'indice territoriale',
            'rapporto copertura', 'superficie coperta',
            
            // Standards and facilities
            'standard urbanistici', 'standard minimi', 'parcheggi',
            'verde pubblico', 'verde privato', 'spazi pubblici',
            'servizi pubblici', 'attrezzature pubbliche',
            'opere urbanizzazione', 'urbanizzazione primaria',
            'urbanizzazione secondaria',
            
            // Building procedures
            'edificabilità', 'edificabile', 'permesso costruire',
            'scia', 'dia', 'cila', 'comunicazione inizio lavori',
            'collaudo', 'agibilità', 'abitabilità', 'certificato destinazione',
            
            // Special areas
            'vincolo paesaggistico', 'vincolo idrogeologico',
            'vincolo archeologico', 'vincolo monumentale',
            'area protetta', 'parco', 'riserva naturale'
        ];

        console.log(`🧭 QueryRouter initialized with ${this.legalKeywords.length} legal, ${this.regionalKeywords.length} regional, ${this.urbanKeywords.length} urban keywords`);
    }

    classifyQuery(query) {
        const startTime = Date.now();
        console.log(`🔍 Classifying query: "${query.substring(0, 100)}..."`);

        // Normalize query for analysis
        const normalizedQuery = this.normalizeQuery(query);
        
        // Count keyword matches
        const legalMatches = this.countMatches(normalizedQuery, this.legalKeywords);
        const regionalMatches = this.countMatches(normalizedQuery, this.regionalKeywords);
        const urbanMatches = this.countMatches(normalizedQuery, this.urbanKeywords);

        // Calculate confidence scores
        const legalScore = this.calculateScore(legalMatches, this.legalKeywords.length, this.config.keywordWeights.legal);
        const regionalScore = this.calculateScore(regionalMatches, this.regionalKeywords.length, this.config.keywordWeights.regional);
        const urbanScore = this.calculateScore(urbanMatches, this.urbanKeywords.length, this.config.keywordWeights.urban);

        // Determine classification strategy
        const classification = this.determineStrategy(
            { legal: legalScore, regional: regionalScore, urban: urbanScore },
            normalizedQuery
        );

        // Add metadata
        classification.startTime = startTime;
        classification.query_analysis = {
            legal_matches: legalMatches,
            regional_matches: regionalMatches,
            urban_matches: urbanMatches,
            scores: { legal: legalScore, regional: regionalScore, urban: urbanScore },
            extracted_region: this.extractRegion(normalizedQuery),
            query_length: query.length,
            normalized_query: normalizedQuery
        };

        console.log(`✅ Classification: ${classification.strategy} (${Date.now() - startTime}ms)`);
        console.log(`📊 Scores - Legal: ${legalScore.toFixed(2)}, Regional: ${regionalScore.toFixed(2)}, Urban: ${urbanScore.toFixed(2)}`);

        return classification;
    }

    normalizeQuery(query) {
        return query
            .toLowerCase()
            .trim()
            // Normalize common abbreviations
            .replace(/\bd\.lgs\./g, 'dlgs')
            .replace(/\bd\.p\.r\./g, 'dpr')
            .replace(/\bl\.r\./g, 'lr')
            .replace(/\bart\./g, 'articolo')
            .replace(/\bcomma\s+(\d+)/g, 'comma $1')
            // Normalize regional names
            .replace(/\bemilia-romagna/g, 'emilia romagna')
            .replace(/\bvalle d'aosta/g, 'valle aosta')
            // Remove punctuation but keep important characters
            .replace(/[^\w\s\-']/g, ' ')
            // Normalize whitespace
            .replace(/\s+/g, ' ');
    }

    countMatches(query, keywords) {
        let matches = 0;
        keywords.forEach(keyword => {
            // Use word boundaries for exact matches
            const regex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
            const keywordMatches = (query.match(regex) || []).length;
            matches += keywordMatches;
        });
        return matches;
    }

    calculateScore(matches, totalKeywords, weight) {
        if (totalKeywords === 0) return 0;
        
        // Logarithmic scoring to prevent single keyword domination
        const baseScore = Math.min(matches / Math.sqrt(totalKeywords), 1.0);
        return baseScore * weight;
    }

    determineStrategy(scores, normalizedQuery) {
        const { legal, regional, urban } = scores;
        
        // Extract region for filtering
        const extractedRegion = this.extractRegion(normalizedQuery);
        
        // Comprehensive multi-source strategy
        if (legal >= this.config.legalConfidenceThreshold &&
            regional >= this.config.regionalConfidenceThreshold &&
            urban > 0.2) {

            return {
                strategy: 'comprehensive',
                namespaces: [''],
                weights: {
                    '': 1.0
                },
                filters: extractedRegion ? { region: extractedRegion } : {},
                needsLegalDisclaimer: true,
                confidence: Math.max(legal, regional, urban),
                reasoning: 'Query contains legal, regional, and urban planning elements'
            };
        }

        // Legal + Urban combination (most common for urban law queries)
        if (legal >= this.config.legalConfidenceThreshold && urban > 0.2) {
            return {
                strategy: 'legal-urban',
                namespaces: [''],
                weights: {
                    '': 1.0
                },
                filters: {},
                needsLegalDisclaimer: true,
                confidence: Math.max(legal, urban),
                reasoning: 'Query combines legal and urban planning aspects'
            };
        }

        // Regional focus (regional laws + general urban planning)
        if (regional >= this.config.regionalConfidenceThreshold) {
            return {
                strategy: 'regional-focus',
                namespaces: [''],
                weights: {
                    '': 1.0
                },
                filters: extractedRegion ? { region: extractedRegion } : {},
                needsLegalDisclaimer: true,
                confidence: regional,
                reasoning: 'Query focuses on regional legislation'
            };
        }

        // Pure legal query
        if (legal >= this.config.legalConfidenceThreshold) {
            return {
                strategy: 'legal-only',
                namespaces: [''],
                weights: {
                    '': 1.0
                },
                filters: {},
                needsLegalDisclaimer: true,
                confidence: legal,
                reasoning: 'Query is primarily legal in nature'
            };
        }

        // High urban score with some legal context
        if (urban > 0.4 && legal > 0.1) {
            return {
                strategy: 'urban-legal-light',
                namespaces: [''],
                weights: {
                    '': 1.0
                },
                filters: {},
                needsLegalDisclaimer: true,
                confidence: urban,
                reasoning: 'Urban planning query with light legal context'
            };
        }

        // Default: pure urban planning
        return {
            strategy: 'urban-only',
            namespaces: [''],
            weights: {
                '': 1.0
            },
            filters: {},
            needsLegalDisclaimer: false,
            confidence: Math.max(urban, 0.5), // Minimum confidence for fallback
            reasoning: 'Query appears to be pure urban planning'
        };
    }

    extractRegion(query) {
        // Map of region names to standardized codes
        const regionMap = {
            'lombardia': 'LOM',
            'lazio': 'LAZ', 
            'veneto': 'VEN',
            'piemonte': 'PIE',
            'campania': 'CAM',
            'sicilia': 'SIC',
            'emilia romagna': 'EMR',
            'toscana': 'TOS',
            'puglia': 'PUG',
            'calabria': 'CAL',
            'sardegna': 'SAR',
            'liguria': 'LIG',
            'marche': 'MAR',
            'abruzzo': 'ABR',
            'umbria': 'UMB',
            'basilicata': 'BAS',
            'molise': 'MOL',
            'friuli': 'FRI',
            'trentino': 'TRE',
            'valle aosta': 'VDA'
        };

        for (const [region, code] of Object.entries(regionMap)) {
            if (query.includes(region)) {
                console.log(`🌍 Extracted region: ${region} (${code})`);
                return code;
            }
        }

        return null;
    }

    // Enhanced query preprocessing for better classification
    preprocessQuery(query) {
        // Expand common abbreviations
        const expansions = {
            'prg': 'piano regolatore generale',
            'pgt': 'piano governo territorio',
            'rue': 'regolamento urbanistico edilizio',
            'scia': 'segnalazione certificata inizio attività',
            'dia': 'denuncia inizio attività',
            'cila': 'comunicazione inizio lavori asseverata',
            'tar': 'tribunale amministrativo regionale',
            'cds': 'consiglio di stato'
        };

        let expandedQuery = query;
        Object.entries(expansions).forEach(([abbr, expansion]) => {
            const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
            expandedQuery = expandedQuery.replace(regex, expansion);
        });

        return expandedQuery;
    }

    // Get routing recommendations for query optimization
    getRoutingRecommendations(classification) {
        const recommendations = [];

        // Performance recommendations
        if (classification.namespaces.length > 2) {
            recommendations.push({
                type: 'performance',
                message: 'Consider parallel namespace queries for better performance',
                priority: 'medium'
            });
        }

        // Quality recommendations
        if (classification.confidence < 0.6) {
            recommendations.push({
                type: 'quality',
                message: 'Low classification confidence. Consider query expansion or user clarification.',
                priority: 'high'
            });
        }

        // Regional recommendations
        if (classification.query_analysis.regional_matches > 0 && !classification.query_analysis.extracted_region) {
            recommendations.push({
                type: 'regional',
                message: 'Regional terms detected but no specific region identified. Results may be generic.',
                priority: 'low'
            });
        }

        return recommendations;
    }

    // Validate classification results
    validateClassification(classification) {
        const errors = [];

        // Validate required fields
        if (!classification.strategy) {
            errors.push('Missing classification strategy');
        }

        if (!classification.namespaces || classification.namespaces.length === 0) {
            errors.push('No namespaces specified');
        }

        if (!classification.weights || Object.keys(classification.weights).length === 0) {
            errors.push('No namespace weights specified');
        }

        // Validate weight distribution
        const totalWeight = Object.values(classification.weights).reduce((sum, w) => sum + w, 0);
        if (Math.abs(totalWeight - 1.0) > 0.01) {
            errors.push(`Weights sum to ${totalWeight.toFixed(3)}, expected 1.0`);
        }

        // Validate namespace consistency
        classification.namespaces.forEach(namespace => {
            if (!classification.weights[namespace]) {
                errors.push(`Missing weight for namespace: ${namespace}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Get classification statistics
    getClassificationStats() {
        return {
            keywords: {
                legal: this.legalKeywords.length,
                regional: this.regionalKeywords.length,
                urban: this.urbanKeywords.length
            },
            thresholds: {
                legal: this.config.legalConfidenceThreshold,
                regional: this.config.regionalConfidenceThreshold
            },
            strategies_available: [
                'comprehensive',
                'legal-urban', 
                'regional-focus',
                'legal-only',
                'urban-legal-light',
                'urban-only'
            ]
        };
    }
}