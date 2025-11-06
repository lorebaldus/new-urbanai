// Query Engine - Multi-Corpus Search with Legal Context Integration
// Handles queries across legal and urban planning documents with result merging

import { PineconeClient } from './pinecone_client.js';
import { EmbeddingService } from './embedding_service.js';

export class QueryEngine {
    constructor(config = {}) {
        this.config = {
            // Default namespaces
            namespaces: {
                base: process.env.PINECONE_NAMESPACE_BASE || '__default__',
                laws: process.env.PINECONE_NAMESPACE_LAWS || '__default__',
                jurisprudence: process.env.PINECONE_NAMESPACE_JURISPRUDENCE || '__default__',
                regional: process.env.PINECONE_NAMESPACE_REGIONAL || '__default__'
            },

            // Query parameters
            defaultTopK: 10,
            maxTopK: 100,
            defaultThreshold: 0.5,  // Lowered from 0.7 to allow more relevant matches

            // Search weights for different namespaces
            namespaceWeights: {
                '__default__': 1.0,         // Default namespace (used for initial testing)
                'urbanistica-base': 1.0,    // Existing urban planning content
                'laws-national': 0.9,       // National laws (slightly lower)
                'jurisprudence': 0.8,       // Court decisions
                'laws-regional': 0.85       // Regional laws
            },
            
            // Result merging
            enableResultMerging: true,
            maxMergedResults: 20,
            diversityBoost: 0.1,         // Boost diverse document types
            
            // Legal context enhancement
            enableLegalContext: true,
            legalContextBoost: 0.15,     // Boost for legal documents
            
            // Performance
            enableParallelQueries: true,
            queryTimeout: 30000,         // 30 second timeout
            
            ...config
        };

        // Initialize services
        this.pineconeClient = new PineconeClient();
        this.embeddingService = new EmbeddingService();
        
        // Query statistics
        this.stats = {
            queriesExecuted: 0,
            averageLatency: 0,
            totalTokensUsed: 0,
            totalCost: 0,
            namespaceUsage: {},
            errorCount: 0
        };

        console.log(`🔍 QueryEngine initialized with ${Object.keys(this.config.namespaces).length} namespaces`);
        console.log(`📊 Default topK: ${this.config.defaultTopK}, Threshold: ${this.config.defaultThreshold}`);
    }

    async query(queryText, options = {}) {
        const startTime = Date.now();
        
        const {
            topK = this.config.defaultTopK,
            threshold = this.config.defaultThreshold,
            namespaces = null, // If null, search all configured namespaces
            filters = {},
            includeMetadata = true,
            enableReranking = true,
            searchMode = 'hybrid' // 'hybrid', 'legal_only', 'urban_only'
        } = options;

        console.log(`\n🔍 Executing query: "${queryText.substring(0, 100)}..."`);
        console.log(`⚙️ Mode: ${searchMode}, TopK: ${topK}, Threshold: ${threshold}`);

        try {
            // Step 1: Determine target namespaces based on search mode
            const targetNamespaces = this.selectNamespaces(searchMode, namespaces);
            console.log(`🎯 Target namespaces: ${targetNamespaces.join(', ')}`);

            // Step 2: Generate query embedding
            console.log(`🤖 Generating query embedding...`);
            const queryEmbedding = await this.generateQueryEmbedding(queryText);

            // Step 3: Execute multi-namespace search
            console.log(`🚀 Executing multi-namespace search...`);
            const searchResults = await this.executeMultiNamespaceSearch(
                queryEmbedding,
                targetNamespaces,
                topK,
                filters,
                includeMetadata
            );

            // Step 4: Process and enhance results
            console.log(`⚡ Processing and enhancing results...`);
            const enhancedResults = this.enhanceResults(searchResults, queryText);

            // Step 5: Apply relevance threshold
            const filteredResults = this.applyThreshold(enhancedResults, threshold);

            // Step 6: Rerank if enabled
            const finalResults = enableReranking 
                ? this.rerankResults(filteredResults, queryText)
                : filteredResults;

            // Step 7: Prepare final response
            const endTime = Date.now();
            const latency = endTime - startTime;
            
            this.updateQueryStats(latency, finalResults);

            const response = this.formatQueryResponse(
                queryText,
                finalResults,
                {
                    latency,
                    targetNamespaces,
                    searchMode,
                    topK,
                    threshold,
                    totalResults: enhancedResults.length,
                    filteredResults: finalResults.length
                }
            );

            console.log(`✅ Query completed in ${latency}ms with ${finalResults.length} results`);
            return response;

        } catch (error) {
            this.stats.errorCount++;
            console.error(`❌ Query failed:`, error.message);
            
            return {
                query: queryText,
                results: [],
                error: {
                    message: error.message,
                    type: error.constructor.name
                },
                metadata: {
                    latency: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    selectNamespaces(searchMode, explicitNamespaces) {
        if (explicitNamespaces) {
            return Array.isArray(explicitNamespaces) ? explicitNamespaces : [explicitNamespaces];
        }

        switch (searchMode) {
            case 'legal_only':
                return [
                    this.config.namespaces.laws,
                    this.config.namespaces.jurisprudence,
                    this.config.namespaces.regional
                ];
            
            case 'urban_only':
                return [this.config.namespaces.base];
            
            case 'hybrid':
            default:
                return Object.values(this.config.namespaces);
        }
    }

    async generateQueryEmbedding(queryText) {
        try {
            const response = await this.embeddingService.openai.embeddings.create({
                model: this.embeddingService.config.model,
                input: [queryText],
                dimensions: this.embeddingService.config.dimension
            });

            const tokens = response.usage.total_tokens;
            const cost = (tokens / 1000) * this.embeddingService.config.costPer1kTokens;
            
            this.stats.totalTokensUsed += tokens;
            this.stats.totalCost += cost;

            console.log(`✅ Query embedding generated (${tokens} tokens, $${cost.toFixed(6)})`);
            
            return response.data[0].embedding;

        } catch (error) {
            console.error(`❌ Failed to generate query embedding:`, error.message);
            throw error;
        }
    }

    async executeMultiNamespaceSearch(queryEmbedding, namespaces, topK, filters, includeMetadata) {
        if (!this.pineconeClient.isConnected) {
            await this.pineconeClient.connect();
        }

        const adjustedTopK = Math.min(topK * 2, this.config.maxTopK); // Get more results for better reranking

        if (this.config.enableParallelQueries && namespaces.length > 1) {
            // Parallel execution for multiple namespaces
            console.log(`🚀 Executing parallel queries across ${namespaces.length} namespaces...`);
            
            const searchPromises = namespaces.map(async (namespace) => {
                try {
                    const result = await this.pineconeClient.queryVectors(
                        queryEmbedding,
                        namespace,
                        {
                            topK: adjustedTopK,
                            filter: filters[namespace] || {},
                            includeMetadata,
                            includeValues: false
                        }
                    );
                    
                    // Track namespace usage
                    this.stats.namespaceUsage[namespace] = (this.stats.namespaceUsage[namespace] || 0) + 1;
                    
                    return { namespace, result };
                } catch (error) {
                    console.error(`⚠️ Query failed for namespace ${namespace}:`, error.message);
                    return { namespace, result: { matches: [] }, error: error.message };
                }
            });

            const results = await Promise.all(searchPromises);
            
            // Merge results from all namespaces
            return this.mergeNamespaceResults(results, adjustedTopK);

        } else {
            // Sequential execution or single namespace
            console.log(`🔄 Executing sequential queries...`);
            
            const allResults = [];
            for (const namespace of namespaces) {
                try {
                    const result = await this.pineconeClient.queryVectors(
                        queryEmbedding,
                        namespace,
                        {
                            topK: adjustedTopK,
                            filter: filters[namespace] || {},
                            includeMetadata,
                            includeValues: false
                        }
                    );
                    
                    this.stats.namespaceUsage[namespace] = (this.stats.namespaceUsage[namespace] || 0) + 1;
                    
                    // Add namespace info to matches
                    const enhancedMatches = result.matches.map(match => ({
                        ...match,
                        source_namespace: namespace
                    }));
                    
                    allResults.push(...enhancedMatches);
                    
                } catch (error) {
                    console.error(`⚠️ Query failed for namespace ${namespace}:`, error.message);
                }
            }

            return allResults;
        }
    }

    mergeNamespaceResults(namespaceResults, topK) {
        const allMatches = [];

        namespaceResults.forEach(({ namespace, result, error }) => {
            if (error) {
                console.warn(`⚠️ Namespace ${namespace} returned error: ${error}`);
                return;
            }

            if (result.matches) {
                const enhancedMatches = result.matches.map(match => ({
                    ...match,
                    source_namespace: namespace,
                    namespace_weight: this.config.namespaceWeights[namespace] || 1.0
                }));
                
                allMatches.push(...enhancedMatches);
            }
        });

        // Sort by adjusted score (original score * namespace weight)
        allMatches.sort((a, b) => {
            const scoreA = a.score * (a.namespace_weight || 1.0);
            const scoreB = b.score * (b.namespace_weight || 1.0);
            return scoreB - scoreA;
        });

        return allMatches.slice(0, topK);
    }

    enhanceResults(results, queryText) {
        return results.map(match => {
            const enhanced = { ...match };
            
            // Add legal context boost
            if (this.config.enableLegalContext && this.isLegalDocument(match)) {
                enhanced.score += this.config.legalContextBoost;
                enhanced.legal_context_boost = this.config.legalContextBoost;
            }

            // Add diversity boost for different document types
            enhanced.score += this.calculateDiversityBoost(match);

            // Extract key information for display
            enhanced.display_info = this.extractDisplayInfo(match);

            // Calculate relevance indicators
            enhanced.relevance_indicators = this.calculateRelevanceIndicators(match, queryText);

            return enhanced;
        });
    }

    isLegalDocument(match) {
        const metadata = match.metadata || {};
        const legalTypes = ['legge', 'decreto', 'regolamento', 'dpr', 'dlgs', 'sentenza'];
        return legalTypes.includes(metadata.document_type?.toLowerCase());
    }

    calculateDiversityBoost(match) {
        const metadata = match.metadata || {};
        const docType = metadata.document_type?.toLowerCase();
        
        // Boost different document types to ensure diversity
        const diversityMap = {
            'legge': 0.05,
            'decreto': 0.04,
            'regolamento': 0.03,
            'sentenza': 0.06,    // Boost jurisprudence slightly more
            'dpr': 0.04,
            'dlgs': 0.04
        };

        return (diversityMap[docType] || 0) * this.config.diversityBoost;
    }

    extractDisplayInfo(match) {
        const metadata = match.metadata || {};
        
        return {
            title: metadata.document_title || metadata.article_title || 'Untitled',
            type: metadata.document_type || 'unknown',
            number: metadata.document_number || '',
            date: metadata.document_date || '',
            authority: metadata.authority || '',
            article: metadata.article_number || '',
            source_namespace: match.source_namespace || 'unknown',
            quality_score: metadata.quality_score || 0,
            tokens: metadata.tokens || 0
        };
    }

    calculateRelevanceIndicators(match, queryText) {
        const metadata = match.metadata || {};
        const indicators = [];

        // High similarity score
        if (match.score > 0.85) {
            indicators.push('high_similarity');
        }

        // Legal document relevance
        if (this.isLegalDocument(match)) {
            indicators.push('legal_document');
        }

        // Urban planning relevance
        if (metadata.urbanistic_relevance && metadata.urbanistic_relevance > 50) {
            indicators.push('urban_planning');
        }

        // Recent document
        if (metadata.document_date) {
            const docYear = new Date(metadata.document_date).getFullYear();
            if (docYear > 2000) {
                indicators.push('recent');
            }
        }

        // High quality content
        if (metadata.quality_score > 80) {
            indicators.push('high_quality');
        }

        return indicators;
    }

    applyThreshold(results, threshold) {
        return results.filter(match => match.score >= threshold);
    }

    rerankResults(results, queryText) {
        // Simple reranking based on text matching and legal relevance
        return results.sort((a, b) => {
            // Primary: similarity score
            if (Math.abs(b.score - a.score) > 0.1) {
                return b.score - a.score;
            }

            // Secondary: legal document type preference
            const aIsLegal = this.isLegalDocument(a);
            const bIsLegal = this.isLegalDocument(b);
            
            if (aIsLegal && !bIsLegal) return -1;
            if (!aIsLegal && bIsLegal) return 1;

            // Tertiary: quality score
            const aQuality = a.metadata?.quality_score || 0;
            const bQuality = b.metadata?.quality_score || 0;
            
            return bQuality - aQuality;
        });
    }

    formatQueryResponse(query, results, metadata) {
        return {
            query,
            results: results.map((match, index) => ({
                rank: index + 1,
                id: match.id,
                score: Number(match.score.toFixed(4)),
                content: this.extractContentPreview(match),
                metadata: match.display_info,
                relevance_indicators: match.relevance_indicators || [],
                source: {
                    namespace: match.source_namespace,
                    weight_applied: match.namespace_weight || 1.0,
                    legal_boost: match.legal_context_boost || 0
                }
            })),
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                total_namespaces_searched: metadata.targetNamespaces.length,
                query_cost: this.stats.totalCost
            },
            stats: this.getQueryStats()
        };
    }

    extractContentPreview(match, maxLength = 300) {
        // Try to extract content from different possible fields
        const content = match.metadata?.text || 
                       match.metadata?.content || 
                       match.metadata?.article_content ||
                       'Content not available';
        
        if (content.length <= maxLength) {
            return content;
        }
        
        return content.substring(0, maxLength) + '...';
    }

    updateQueryStats(latency, results) {
        this.stats.queriesExecuted++;
        
        // Update average latency
        this.stats.averageLatency = (
            (this.stats.averageLatency * (this.stats.queriesExecuted - 1)) + latency
        ) / this.stats.queriesExecuted;
    }

    getQueryStats() {
        return {
            total_queries: this.stats.queriesExecuted,
            average_latency_ms: Math.round(this.stats.averageLatency),
            total_tokens_used: this.stats.totalTokensUsed,
            total_cost: Number(this.stats.totalCost.toFixed(6)),
            namespace_usage: this.stats.namespaceUsage,
            error_count: this.stats.errorCount
        };
    }

    // Specialized query methods for different use cases

    async searchLaws(queryText, options = {}) {
        return this.query(queryText, {
            ...options,
            searchMode: 'legal_only',
            namespaces: [this.config.namespaces.laws]
        });
    }

    async searchJurisprudence(queryText, options = {}) {
        return this.query(queryText, {
            ...options,
            searchMode: 'legal_only',
            namespaces: [this.config.namespaces.jurisprudence]
        });
    }

    async searchUrbanPlanning(queryText, options = {}) {
        return this.query(queryText, {
            ...options,
            searchMode: 'urban_only'
        });
    }

    async semanticSearch(queryText, options = {}) {
        return this.query(queryText, {
            ...options,
            searchMode: 'hybrid',
            enableReranking: true,
            threshold: 0.6 // Lower threshold for semantic search
        });
    }

    // Health check and diagnostics
    async healthCheck() {
        try {
            console.log(`🏥 Running QueryEngine health check...`);
            
            // Test query embedding generation
            const testEmbedding = await this.generateQueryEmbedding("test query");
            
            // Test Pinecone connection
            const pineconeHealth = await this.pineconeClient.healthCheck();
            
            // Test simple query
            const testQuery = await this.query("test", { topK: 1 });
            
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                embedding_service: {
                    working: testEmbedding.length === this.embeddingService.config.dimension
                },
                pinecone: {
                    connected: pineconeHealth.connected,
                    namespaces_available: Object.keys(pineconeHealth.namespaces || {}).length
                },
                query_execution: {
                    working: !testQuery.error
                },
                stats: this.getQueryStats()
            };

        } catch (error) {
            console.error(`❌ Health check failed:`, error.message);
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}