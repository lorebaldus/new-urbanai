// OpenAI Embedding Service for Legal Documents
// Generates text-embedding-3-small embeddings with batch processing

import OpenAI from 'openai';

export class EmbeddingService {
    constructor(config = {}) {
        this.config = {
            apiKey: process.env.OPENAI_API_KEY,
            model: 'text-embedding-3-small',
            dimension: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'), // Pinecone serverless compatible
            batchSize: 100, // OpenAI recommended batch size
            maxRetries: 3,
            retryDelay: 1000,
            maxTokensPerRequest: 8191, // Model limit
            costPer1kTokens: 0.00002, // $0.00002 per 1K tokens
            ...config
        };

        if (!this.config.apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }

        this.openai = new OpenAI({ apiKey: this.config.apiKey });
        this.totalTokensUsed = 0;
        this.totalCost = 0;

        console.log(`🤖 EmbeddingService initialized with model: ${this.config.model}`);
        console.log(`📊 Batch size: ${this.config.batchSize}, Dimension: ${this.config.dimension}`);
    }

    async generateEmbeddings(chunks, options = {}) {
        const {
            batchSize = this.config.batchSize,
            logProgress = true,
            includeMetadata = true
        } = options;

        console.log(`🚀 Starting embedding generation for ${chunks.length} chunks...`);
        
        if (chunks.length === 0) {
            console.log(`⚠️ No chunks provided for embedding`);
            return { embeddings: [], stats: this.getStats() };
        }

        // Validate and prepare chunks
        const validatedChunks = this.validateChunks(chunks);
        console.log(`✅ Validated ${validatedChunks.length} chunks for embedding`);

        const batches = this.createBatches(validatedChunks, batchSize);
        const embeddings = [];

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            
            if (logProgress) {
                console.log(`📤 Processing batch ${i + 1}/${batches.length} (${batch.length} chunks)...`);
            }

            try {
                const batchEmbeddings = await this.processBatch(batch, includeMetadata);
                embeddings.push(...batchEmbeddings);

                if (logProgress && i > 0 && i % 5 === 0) {
                    console.log(`✅ Progress: ${embeddings.length}/${chunks.length} embeddings generated`);
                    console.log(`💰 Current cost: $${this.totalCost.toFixed(6)}`);
                }

                // Rate limiting between batches
                if (i < batches.length - 1) {
                    await this.sleep(100);
                }

            } catch (error) {
                console.error(`❌ Failed to process batch ${i + 1}:`, error.message);
                
                // Retry with exponential backoff
                const retryResult = await this.retryBatch(batch, i, includeMetadata);
                if (retryResult.success) {
                    embeddings.push(...retryResult.embeddings);
                    console.log(`✅ Retry successful for batch ${i + 1}`);
                } else {
                    throw new Error(`Failed to process batch ${i + 1} after ${this.config.maxRetries} retries`);
                }
            }
        }

        const stats = this.getStats();
        
        console.log(`🎉 Embedding generation completed!`);
        console.log(`📊 Total embeddings: ${embeddings.length}`);
        console.log(`💰 Total cost: $${stats.totalCost.toFixed(6)}`);
        console.log(`🔢 Total tokens: ${stats.totalTokens.toLocaleString()}`);

        return {
            embeddings,
            stats,
            timestamp: new Date().toISOString()
        };
    }

    async processBatch(chunks, includeMetadata = true) {
        // Extract texts for embedding
        const texts = chunks.map(chunk => chunk.text);
        
        // Estimate tokens for cost calculation
        const estimatedTokens = this.estimateTotalTokens(texts);
        console.log(`🔢 Estimated tokens for batch: ${estimatedTokens.toLocaleString()}`);

        // Generate embeddings
        const response = await this.openai.embeddings.create({
            model: this.config.model,
            input: texts,
            dimensions: this.config.dimension
        });

        // Update usage statistics
        const actualTokens = response.usage.total_tokens;
        this.totalTokensUsed += actualTokens;
        this.totalCost += (actualTokens / 1000) * this.config.costPer1kTokens;

        console.log(`📊 Actual tokens used: ${actualTokens.toLocaleString()}`);

        // Format embeddings with metadata
        const embeddings = response.data.map((embedding, index) => {
            const result = {
                id: chunks[index].chunk_id,
                values: embedding.embedding,
                tokens: this.estimateTokens(chunks[index].text)
            };

            if (includeMetadata) {
                result.metadata = this.prepareMetadataForVector(chunks[index]);
            }

            return result;
        });

        return embeddings;
    }

    async retryBatch(batch, batchIndex, includeMetadata) {
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                console.log(`🔄 Retry attempt ${attempt}/${this.config.maxRetries} for batch ${batchIndex + 1}...`);
                
                // Exponential backoff
                const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                await this.sleep(delay);
                
                const embeddings = await this.processBatch(batch, includeMetadata);
                return { success: true, embeddings };

            } catch (error) {
                console.error(`❌ Retry attempt ${attempt} failed:`, error.message);
                
                if (attempt === this.config.maxRetries) {
                    return { success: false, error: error.message };
                }
            }
        }
    }

    validateChunks(chunks) {
        const validated = [];
        
        chunks.forEach((chunk, index) => {
            // Validate required fields
            if (!chunk.chunk_id) {
                console.warn(`⚠️ Chunk ${index} missing chunk_id, skipping`);
                return;
            }

            if (!chunk.text || typeof chunk.text !== 'string') {
                console.warn(`⚠️ Chunk ${index} missing or invalid text, skipping`);
                return;
            }

            // Check token limit
            const tokens = this.estimateTokens(chunk.text);
            if (tokens > this.config.maxTokensPerRequest) {
                console.warn(`⚠️ Chunk ${index} exceeds token limit (${tokens} > ${this.config.maxTokensPerRequest}), truncating`);
                chunk.text = this.truncateText(chunk.text, this.config.maxTokensPerRequest);
            }

            validated.push(chunk);
        });

        return validated;
    }

    prepareMetadataForVector(chunk) {
        // Extract key metadata for Pinecone vector
        const metadata = {
            // Document identification
            document_type: chunk.metadata?.document_classification?.primary_type || 'unknown',
            document_number: chunk.metadata?.number || '',
            document_date: chunk.metadata?.date || '',
            document_title: chunk.metadata?.title || '',
            
            // Chunk information
            chunk_type: chunk.metadata?.chunk_type || 'article',
            article_number: chunk.metadata?.hierarchy?.article || '',
            article_title: chunk.metadata?.hierarchy?.articleTitle || '',
            
            // Content classification
            text_length: chunk.text.length,
            tokens: chunk.tokens || this.estimateTokens(chunk.text),
            quality_score: chunk.quality_score || 0,
            
            // Topics and relevance
            urbanistic_relevance: chunk.metadata?.urbanistic_relevance || 0,
            
            // Processing metadata
            source: chunk.metadata?.source || 'unknown',
            processed_at: new Date().toISOString()
        };

        // Add primary topics (limit to top 3)
        if (chunk.metadata?.chunk_topics && Array.isArray(chunk.metadata.chunk_topics)) {
            const topTopics = chunk.metadata.chunk_topics
                .slice(0, 3)
                .map(t => t.topic);
            if (topTopics.length > 0) {
                metadata.topics = topTopics;
            }
        }

        // Add document authority if available
        if (chunk.metadata?.authority_analysis?.issuing_authority) {
            metadata.authority = chunk.metadata.authority_analysis.issuing_authority;
        }

        // Add current status
        if (chunk.metadata?.status_analysis?.current_status) {
            metadata.status = chunk.metadata.status_analysis.current_status;
        }

        return metadata;
    }

    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    estimateTokens(text) {
        // Simple token estimation: ~4 characters per token for Italian text
        // More accurate than splitting by spaces due to Italian language characteristics
        return Math.ceil(text.length / 4);
    }

    estimateTotalTokens(texts) {
        return texts.reduce((total, text) => total + this.estimateTokens(text), 0);
    }

    estimateCost(chunks) {
        const totalTokens = chunks.reduce((total, chunk) => {
            return total + this.estimateTokens(chunk.text);
        }, 0);
        
        const estimatedCost = (totalTokens / 1000) * this.config.costPer1kTokens;
        
        return {
            totalTokens,
            estimatedCost,
            costPer1kTokens: this.config.costPer1kTokens
        };
    }

    truncateText(text, maxTokens) {
        const maxChars = maxTokens * 4; // Approximate character limit
        return text.substring(0, maxChars);
    }

    getStats() {
        return {
            totalTokens: this.totalTokensUsed,
            totalCost: this.totalCost,
            costPer1kTokens: this.config.costPer1kTokens,
            model: this.config.model,
            dimension: this.config.dimension
        };
    }

    resetStats() {
        this.totalTokensUsed = 0;
        this.totalCost = 0;
        console.log('📊 Usage statistics reset');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility method for testing embeddings
    async testEmbedding(text = "Test italiano per verifica embeddings") {
        console.log('🧪 Testing embedding generation...');
        
        try {
            const response = await this.openai.embeddings.create({
                model: this.config.model,
                input: [text],
                dimensions: this.config.dimension
            });

            const embedding = response.data[0];
            const tokens = response.usage.total_tokens;
            const cost = (tokens / 1000) * this.config.costPer1kTokens;

            console.log('✅ Test embedding successful:');
            console.log(`   - Dimension: ${embedding.embedding.length}`);
            console.log(`   - Tokens used: ${tokens}`);
            console.log(`   - Cost: $${cost.toFixed(6)}`);
            console.log(`   - Sample values: [${embedding.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

            return {
                success: true,
                dimension: embedding.embedding.length,
                tokens,
                cost,
                embedding: embedding.embedding
            };

        } catch (error) {
            console.error('❌ Test embedding failed:', error.message);
            throw error;
        }
    }
}