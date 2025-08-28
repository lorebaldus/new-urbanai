const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

class VectorStore {
    constructor(pineconeApiKey, openaiApiKey) {
        this.pinecone = new Pinecone({
            apiKey: pineconeApiKey
        });
        this.openai = new OpenAI({
            apiKey: openaiApiKey
        });
        this.indexName = process.env.PINECONE_INDEX_NAME || 'urbanai-docs';
        this.embeddingModel = 'text-embedding-3-small';
    }

    async initialize() {
        try {
            // Check if index exists, create if it doesn't
            const existingIndexes = await this.pinecone.listIndexes();
            const indexExists = existingIndexes.indexes?.some(index => index.name === this.indexName);

            if (!indexExists) {
                console.log(`Creating Pinecone index: ${this.indexName}`);
                await this.pinecone.createIndex({
                    name: this.indexName,
                    dimension: 1536, // text-embedding-3-small dimension
                    metric: 'cosine',
                    spec: {
                        serverless: {
                            cloud: 'aws',
                            region: 'us-east-1'
                        }
                    }
                });
                
                // Wait for index to be ready
                await this.waitForIndexReady();
            }

            this.index = this.pinecone.Index(this.indexName);
            console.log(' Vector store initialized');
        } catch (error) {
            console.error('Error initializing vector store:', error);
            throw error;
        }
    }

    async waitForIndexReady() {
        let isReady = false;
        let attempts = 0;
        const maxAttempts = 60;

        while (!isReady && attempts < maxAttempts) {
            try {
                const indexInfo = await this.pinecone.describeIndex(this.indexName);
                isReady = indexInfo.status?.ready === true;
                
                if (!isReady) {
                    console.log('Waiting for index to be ready...');
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                    attempts++;
                }
            } catch (error) {
                console.error('Error checking index status:', error);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        if (!isReady) {
            throw new Error('Index failed to become ready within expected time');
        }

        console.log(' Index is ready');
    }

    async createEmbedding(text) {
        try {
            const response = await this.openai.embeddings.create({
                model: this.embeddingModel,
                input: text
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error creating embedding:', error);
            throw error;
        }
    }

    async upsertDocuments(chunks) {
        try {
            console.log(`Creating embeddings for ${chunks.length} chunks...`);
            
            const batchSize = 100;
            const batches = [];
            
            for (let i = 0; i < chunks.length; i += batchSize) {
                batches.push(chunks.slice(i, i + batchSize));
            }

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);

                const vectors = await Promise.all(
                    batch.map(async (chunk) => {
                        const embedding = await this.createEmbedding(chunk.text);
                        return {
                            id: chunk.id,
                            values: embedding,
                            metadata: {
                                text: chunk.text,
                                source: chunk.source,
                                chunkIndex: chunk.chunkIndex
                            }
                        };
                    })
                );

                await this.index.upsert(vectors);
                
                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(` Successfully upserted ${chunks.length} document chunks`);
        } catch (error) {
            console.error('Error upserting documents:', error);
            throw error;
        }
    }

    async query(queryText, topK = 5) {
        try {
            const queryEmbedding = await this.createEmbedding(queryText);
            
            const queryResponse = await this.index.query({
                vector: queryEmbedding,
                topK: topK,
                includeValues: false,
                includeMetadata: true
            });

            return queryResponse.matches.map(match => ({
                id: match.id,
                score: match.score,
                text: match.metadata.text,
                source: match.metadata.source,
                chunkIndex: match.metadata.chunkIndex
            }));
        } catch (error) {
            console.error('Error querying vector store:', error);
            throw error;
        }
    }

    async getIndexStats() {
        try {
            const stats = await this.index.describeIndexStats();
            return stats;
        } catch (error) {
            console.error('Error getting index stats:', error);
            throw error;
        }
    }

    async saveProcessedChunks(chunks, outputPath) {
        try {
            const processedDir = path.join(outputPath, 'processed');
            if (!fs.existsSync(processedDir)) {
                fs.mkdirSync(processedDir, { recursive: true });
            }

            const fileName = `chunks_${new Date().toISOString().split('T')[0]}.json`;
            const filePath = path.join(processedDir, fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(chunks, null, 2));
            console.log(` Saved processed chunks to ${filePath}`);
            
            return filePath;
        } catch (error) {
            console.error('Error saving processed chunks:', error);
            throw error;
        }
    }
}

module.exports = VectorStore;