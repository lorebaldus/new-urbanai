// Index Manager - Orchestrates Document Indexing to Pinecone
// Coordinates embedding generation and vector database operations

import { PineconeClient } from './pinecone_client.js';
import { EmbeddingService } from './embedding_service.js';

export class IndexManager {
    constructor(config = {}) {
        this.config = {
            // Vector database config
            pineconeNamespace: config.namespace || 'laws-national',
            
            // Processing config
            batchSize: config.batchSize || 100,
            processingDelay: config.processingDelay || 500,
            
            // Quality filters
            minQualityScore: config.minQualityScore || 50,
            minTokens: config.minTokens || 20,
            maxTokens: config.maxTokens || 8000,
            
            // Logging
            logProgress: config.logProgress !== false,
            logDetailedStats: config.logDetailedStats || false,
            
            ...config
        };

        // Initialize services
        this.pineconeClient = new PineconeClient();
        this.embeddingService = new EmbeddingService();
        
        // Processing statistics
        this.stats = {
            documentsProcessed: 0,
            chunksProcessed: 0,
            chunksIndexed: 0,
            chunksSkipped: 0,
            totalTokens: 0,
            totalCost: 0,
            errors: [],
            startTime: null,
            endTime: null
        };

        console.log(`📋 IndexManager initialized for namespace: ${this.config.pineconeNamespace}`);
        console.log(`⚙️ Batch size: ${this.config.batchSize}, Min quality: ${this.config.minQualityScore}`);
    }

    async indexDocument(processedDocument, options = {}) {
        const {
            namespace = this.config.pineconeNamespace,
            skipQualityFilter = false,
            dryRun = false
        } = options;

        console.log(`\n🚀 Starting document indexing...`);
        console.log(`📄 Document: ${processedDocument.document_metadata?.title || 'Unknown'}`);
        console.log(`📊 Total chunks: ${processedDocument.chunks?.length || 0}`);
        console.log(`🎯 Target namespace: ${namespace}`);

        this.stats.startTime = new Date();
        this.stats.documentsProcessed++;

        try {
            // Step 1: Validate and filter chunks
            console.log(`\n1️⃣ Validating and filtering chunks...`);
            const validChunks = this.filterChunks(processedDocument.chunks, skipQualityFilter);
            
            if (validChunks.length === 0) {
                console.log(`⚠️ No valid chunks found for indexing`);
                return this.getIndexingResult(processedDocument, [], 'no_valid_chunks');
            }

            console.log(`✅ ${validChunks.length}/${processedDocument.chunks.length} chunks passed validation`);

            // Step 2: Estimate costs
            console.log(`\n2️⃣ Estimating processing costs...`);
            const costEstimate = this.embeddingService.estimateCost(validChunks);
            console.log(`💰 Estimated cost: $${costEstimate.estimatedCost.toFixed(6)}`);
            console.log(`🔢 Estimated tokens: ${costEstimate.totalTokens.toLocaleString()}`);

            if (dryRun) {
                console.log(`🧪 DRY RUN - Stopping before actual processing`);
                return this.getIndexingResult(processedDocument, validChunks, 'dry_run', costEstimate);
            }

            // Step 3: Connect to services
            console.log(`\n3️⃣ Connecting to services...`);
            await this.ensureConnections();

            // Step 4: Generate embeddings
            console.log(`\n4️⃣ Generating embeddings...`);
            const embeddingResult = await this.embeddingService.generateEmbeddings(validChunks, {
                batchSize: this.config.batchSize,
                logProgress: this.config.logProgress
            });

            console.log(`✅ Generated ${embeddingResult.embeddings.length} embeddings`);
            this.updateStats(embeddingResult.stats);

            // Step 5: Upsert to Pinecone
            console.log(`\n5️⃣ Upserting vectors to Pinecone...`);
            const upsertResult = await this.pineconeClient.upsertVectors(
                embeddingResult.embeddings,
                namespace,
                {
                    batchSize: this.config.batchSize,
                    logProgress: this.config.logProgress
                }
            );

            console.log(`✅ Upserted ${upsertResult.upsertedCount} vectors to namespace: ${namespace}`);
            this.stats.chunksIndexed = upsertResult.upsertedCount;

            // Step 6: Verify indexing
            console.log(`\n6️⃣ Verifying indexing...`);
            const verificationResult = await this.verifyIndexing(namespace, embeddingResult.embeddings.slice(0, 3));

            this.stats.endTime = new Date();
            const finalResult = this.getIndexingResult(
                processedDocument, 
                validChunks, 
                'success', 
                embeddingResult.stats,
                upsertResult,
                verificationResult
            );

            this.logFinalStats(finalResult);
            return finalResult;

        } catch (error) {
            this.stats.errors.push({
                type: 'indexing_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });

            console.error(`❌ Document indexing failed:`, error.message);
            
            this.stats.endTime = new Date();
            return this.getIndexingResult(processedDocument, [], 'error', null, null, null, error);
        }
    }

    async indexMultipleDocuments(documents, options = {}) {
        const {
            namespace = this.config.pineconeNamespace,
            continueOnError = true,
            maxConcurrent = 1
        } = options;

        console.log(`\n🚀 Starting batch indexing of ${documents.length} documents...`);
        
        const results = [];
        const errors = [];

        for (let i = 0; i < documents.length; i++) {
            const document = documents[i];
            const docTitle = document.document_metadata?.title || `Document ${i + 1}`;
            
            try {
                console.log(`\n📄 Processing document ${i + 1}/${documents.length}: ${docTitle}`);
                
                const result = await this.indexDocument(document, { namespace });
                results.push(result);

                // Delay between documents to avoid rate limits
                if (i < documents.length - 1) {
                    await this.sleep(this.config.processingDelay);
                }

            } catch (error) {
                console.error(`❌ Failed to index document ${i + 1}:`, error.message);
                errors.push({ documentIndex: i, document: docTitle, error: error.message });
                
                if (!continueOnError) {
                    break;
                }
            }
        }

        return {
            results,
            errors,
            summary: {
                total: documents.length,
                successful: results.filter(r => r.status === 'success').length,
                failed: errors.length,
                totalChunksIndexed: results.reduce((sum, r) => sum + (r.stats?.chunksIndexed || 0), 0),
                totalCost: results.reduce((sum, r) => sum + (r.embeddingStats?.totalCost || 0), 0)
            }
        };
    }

    filterChunks(chunks, skipQualityFilter = false) {
        if (!chunks || !Array.isArray(chunks)) {
            console.log(`⚠️ Invalid chunks array provided`);
            return [];
        }

        const filtered = chunks.filter((chunk, index) => {
            // Check required fields
            if (!chunk.chunk_id) {
                console.log(`⚠️ Chunk ${index} missing chunk_id, skipping`);
                this.stats.chunksSkipped++;
                return false;
            }

            if (!chunk.text || typeof chunk.text !== 'string') {
                console.log(`⚠️ Chunk ${index} missing text, skipping`);
                this.stats.chunksSkipped++;
                return false;
            }

            // Check text length
            if (chunk.text.length < this.config.minTokens * 4) {
                if (this.config.logDetailedStats) {
                    console.log(`⚠️ Chunk ${index} too short, skipping`);
                }
                this.stats.chunksSkipped++;
                return false;
            }

            // Check token limit
            const tokens = chunk.tokens || this.estimateTokens(chunk.text);
            if (tokens > this.config.maxTokens) {
                console.log(`⚠️ Chunk ${index} exceeds token limit (${tokens}), skipping`);
                this.stats.chunksSkipped++;
                return false;
            }

            // Quality filter (unless skipped)
            if (!skipQualityFilter) {
                const qualityScore = chunk.quality_score || 0;
                if (qualityScore < this.config.minQualityScore) {
                    if (this.config.logDetailedStats) {
                        console.log(`⚠️ Chunk ${index} quality too low (${qualityScore}), skipping`);
                    }
                    this.stats.chunksSkipped++;
                    return false;
                }
            }

            this.stats.chunksProcessed++;
            return true;
        });

        if (this.config.logProgress) {
            console.log(`🔍 Quality filter results:`);
            console.log(`   - Processed: ${this.stats.chunksProcessed}`);
            console.log(`   - Skipped: ${this.stats.chunksSkipped}`);
            console.log(`   - Pass rate: ${((this.stats.chunksProcessed / chunks.length) * 100).toFixed(1)}%`);
        }

        return filtered;
    }

    async ensureConnections() {
        // Connect to Pinecone
        if (!this.pineconeClient.isConnected) {
            await this.pineconeClient.connect();
        }

        // Test embedding service
        await this.embeddingService.testEmbedding();
        
        console.log(`✅ All services connected successfully`);
    }

    async verifyIndexing(namespace, sampleVectors) {
        if (!sampleVectors || sampleVectors.length === 0) {
            return { verified: false, reason: 'no_samples' };
        }

        try {
            console.log(`🔍 Verifying indexing with ${sampleVectors.length} sample vectors...`);
            
            // Wait a moment for indexing to propagate
            await this.sleep(2000);
            
            // Try to fetch a few vectors
            const sampleIds = sampleVectors.slice(0, 3).map(v => v.id);
            const fetchResult = await this.pineconeClient.fetchVectors(sampleIds, namespace);
            
            const foundVectors = Object.keys(fetchResult.vectors).length;
            const verified = foundVectors > 0;
            
            console.log(`✅ Verification: ${foundVectors}/${sampleIds.length} vectors found`);
            
            return {
                verified,
                samplesTested: sampleIds.length,
                samplesFound: foundVectors,
                verification_details: fetchResult
            };

        } catch (error) {
            console.error(`⚠️ Verification failed:`, error.message);
            return {
                verified: false,
                error: error.message
            };
        }
    }

    updateStats(embeddingStats) {
        this.stats.totalTokens += embeddingStats.totalTokens || 0;
        this.stats.totalCost += embeddingStats.totalCost || 0;
    }

    getIndexingResult(document, chunks, status, embeddingStats = null, upsertResult = null, verificationResult = null, error = null) {
        const processingTime = this.stats.endTime && this.stats.startTime 
            ? this.stats.endTime - this.stats.startTime 
            : null;

        return {
            status,
            document_id: document.document_id || 'unknown',
            document_title: document.document_metadata?.title || 'Unknown',
            timestamp: new Date().toISOString(),
            
            // Processing details
            chunks_total: document.chunks?.length || 0,
            chunks_processed: chunks.length,
            chunks_indexed: this.stats.chunksIndexed,
            chunks_skipped: this.stats.chunksSkipped,
            
            // Service results
            embeddingStats,
            upsertResult,
            verificationResult,
            
            // Performance
            processing_time_ms: processingTime,
            
            // Configuration used
            config: {
                namespace: this.config.pineconeNamespace,
                batchSize: this.config.batchSize,
                minQualityScore: this.config.minQualityScore
            },
            
            // Error details
            error: error ? {
                message: error.message,
                type: error.constructor.name
            } : null,
            
            // Overall stats
            stats: { ...this.stats }
        };
    }

    logFinalStats(result) {
        console.log(`\n📊 INDEXING COMPLETED - FINAL STATS:`);
        console.log(`=`.repeat(60));
        console.log(`📄 Document: ${result.document_title}`);
        console.log(`✅ Status: ${result.status.toUpperCase()}`);
        console.log(`📊 Chunks indexed: ${result.chunks_indexed}/${result.chunks_total}`);
        console.log(`💰 Total cost: $${result.embeddingStats?.totalCost?.toFixed(6) || '0.000000'}`);
        console.log(`🔢 Total tokens: ${result.embeddingStats?.totalTokens?.toLocaleString() || '0'}`);
        console.log(`⏱️ Processing time: ${result.processing_time_ms}ms`);
        console.log(`🎯 Namespace: ${result.config.namespace}`);
        
        if (result.verificationResult?.verified) {
            console.log(`✅ Verification: PASSED`);
        } else {
            console.log(`⚠️ Verification: ${result.verificationResult?.reason || 'FAILED'}`);
        }
        
        console.log(`=`.repeat(60));
    }

    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Health check method
    async healthCheck() {
        try {
            console.log(`🏥 Running IndexManager health check...`);
            
            // Check Pinecone connection
            const pineconeHealth = await this.pineconeClient.healthCheck();
            
            // Check embedding service
            const embeddingTest = await this.embeddingService.testEmbedding();
            
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                pinecone: {
                    connected: pineconeHealth.connected,
                    indexName: pineconeHealth.indexName,
                    totalVectors: pineconeHealth.totalVectors
                },
                embedding: {
                    model: embeddingTest.dimension ? this.embeddingService.config.model : 'unavailable',
                    dimension: embeddingTest.dimension,
                    test_successful: embeddingTest.success
                },
                config: this.config
            };

            console.log(`✅ Health check passed`);
            return health;

        } catch (error) {
            console.error(`❌ Health check failed:`, error.message);
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Reset stats for new session
    resetStats() {
        this.stats = {
            documentsProcessed: 0,
            chunksProcessed: 0,
            chunksIndexed: 0,
            chunksSkipped: 0,
            totalTokens: 0,
            totalCost: 0,
            errors: [],
            startTime: null,
            endTime: null
        };
        
        this.embeddingService.resetStats();
        console.log(`📊 IndexManager stats reset`);
    }
}