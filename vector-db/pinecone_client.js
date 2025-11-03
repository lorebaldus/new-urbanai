// Pinecone Client with Multi-Namespace Support
// Manages vector operations for different legal document corpora

import { Pinecone } from '@pinecone-database/pinecone';

export class PineconeClient {
    constructor(config = {}) {
        this.config = {
            apiKey: process.env.PINECONE_API_KEY,
            indexName: process.env.PINECONE_INDEX || 'urbanai-docs',
            dimension: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'), // Pinecone serverless compatible
            namespaces: {
                base: process.env.PINECONE_NAMESPACE_BASE || 'urbanistica-base',
                laws: process.env.PINECONE_NAMESPACE_LAWS || 'laws-national',
                jurisprudence: process.env.PINECONE_NAMESPACE_JURISPRUDENCE || 'jurisprudence',
                regional: process.env.PINECONE_NAMESPACE_REGIONAL || 'laws-regional'
            },
            batchSize: 100, // Max vectors per upsert
            ...config
        };

        if (!this.config.apiKey) {
            throw new Error('PINECONE_API_KEY environment variable is required');
        }

        this.pinecone = new Pinecone({ apiKey: this.config.apiKey });
        this.index = null;
        this.isConnected = false;

        console.log(`🌲 PineconeClient initialized for index: ${this.config.indexName}`);
        console.log(`📂 Namespaces configured:`, this.config.namespaces);
    }

    async connect() {
        try {
            console.log(`🔗 Connecting to Pinecone index: ${this.config.indexName}...`);
            
            this.index = this.pinecone.index(this.config.indexName);
            
            // Test connection
            const stats = await this.getIndexStats();
            console.log(`✅ Connected to Pinecone. Index stats:`, stats);
            
            this.isConnected = true;
            return true;

        } catch (error) {
            console.error(`❌ Failed to connect to Pinecone:`, error.message);
            throw error;
        }
    }

    async getIndexStats() {
        if (!this.index) {
            throw new Error('Not connected to Pinecone index');
        }

        const stats = await this.index.describeIndexStats();
        
        return {
            dimension: stats.dimension,
            indexFullness: stats.indexFullness,
            totalVectorCount: stats.totalVectorCount,
            namespaces: stats.namespaces || {}
        };
    }

    async getNamespaceStats(namespace) {
        const stats = await this.getIndexStats();
        return stats.namespaces[namespace] || { vectorCount: 0 };
    }

    async upsertVectors(vectors, namespace, options = {}) {
        if (!this.isConnected) {
            await this.connect();
        }

        const {
            batchSize = this.config.batchSize,
            logProgress = true
        } = options;

        console.log(`📤 Upserting ${vectors.length} vectors to namespace: ${namespace}`);
        
        if (vectors.length === 0) {
            console.log(`⚠️ No vectors to upsert`);
            return { upsertedCount: 0 };
        }

        let totalUpserted = 0;
        const batches = this.createBatches(vectors, batchSize);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            
            try {
                if (logProgress) {
                    console.log(`📤 Batch ${i + 1}/${batches.length}: upserting ${batch.length} vectors...`);
                }

                await this.index.namespace(namespace).upsert(batch);
                totalUpserted += batch.length;

                if (logProgress && i > 0 && i % 5 === 0) {
                    console.log(`✅ Progress: ${totalUpserted}/${vectors.length} vectors upserted`);
                }

                // Rate limiting: small delay between batches
                if (i < batches.length - 1) {
                    await this.sleep(100);
                }

            } catch (error) {
                console.error(`❌ Failed to upsert batch ${i + 1}:`, error.message);
                
                // Retry once with exponential backoff
                try {
                    console.log(`🔄 Retrying batch ${i + 1}...`);
                    await this.sleep(1000 * Math.pow(2, i % 3));
                    await this.index.namespace(namespace).upsert(batch);
                    totalUpserted += batch.length;
                    console.log(`✅ Retry successful for batch ${i + 1}`);
                } catch (retryError) {
                    console.error(`💥 Retry failed for batch ${i + 1}:`, retryError.message);
                    throw retryError;
                }
            }
        }

        console.log(`✅ Successfully upserted ${totalUpserted} vectors to ${namespace}`);
        
        return {
            upsertedCount: totalUpserted,
            batches: batches.length,
            namespace
        };
    }

    async queryVectors(queryVector, namespace, options = {}) {
        if (!this.isConnected) {
            await this.connect();
        }

        const {
            topK = 10,
            filter = {},
            includeMetadata = true,
            includeValues = false
        } = options;

        console.log(`🔍 Querying namespace ${namespace} with topK=${topK}`);

        try {
            const queryRequest = {
                vector: queryVector,
                topK,
                includeMetadata,
                includeValues
            };

            if (Object.keys(filter).length > 0) {
                queryRequest.filter = filter;
                console.log(`🔍 Applying filter:`, filter);
            }

            const results = await this.index.namespace(namespace).query(queryRequest);
            
            console.log(`✅ Query returned ${results.matches?.length || 0} matches`);
            
            return {
                matches: results.matches || [],
                namespace,
                query: {
                    topK,
                    filter,
                    includeMetadata,
                    includeValues
                }
            };

        } catch (error) {
            console.error(`❌ Query failed for namespace ${namespace}:`, error.message);
            throw error;
        }
    }

    async queryMultipleNamespaces(queryVector, namespaces, options = {}) {
        const {
            topK = 10,
            filter = {},
            mergeResults = true,
            weights = {}
        } = options;

        console.log(`🔍 Multi-namespace query across: ${namespaces.join(', ')}`);

        const results = {};
        const queryPromises = namespaces.map(async (namespace) => {
            try {
                const result = await this.queryVectors(queryVector, namespace, {
                    topK,
                    filter: filter[namespace] || {},
                    includeMetadata: true,
                    includeValues: false
                });
                
                // Apply namespace weight if specified
                if (weights[namespace]) {
                    result.matches = result.matches.map(match => ({
                        ...match,
                        score: match.score * weights[namespace],
                        namespace_weight: weights[namespace]
                    }));
                }
                
                return { namespace, result };
            } catch (error) {
                console.error(`❌ Query failed for namespace ${namespace}:`, error.message);
                return { namespace, result: { matches: [] }, error: error.message };
            }
        });

        const allResults = await Promise.all(queryPromises);
        
        allResults.forEach(({ namespace, result, error }) => {
            results[namespace] = result;
            if (error) {
                results[namespace].error = error;
            }
        });

        if (mergeResults) {
            const mergedMatches = this.mergeQueryResults(results, topK);
            return {
                matches: mergedMatches,
                namespaces: namespaces,
                individual_results: results,
                merged: true
            };
        }

        return {
            individual_results: results,
            namespaces: namespaces,
            merged: false
        };
    }

    mergeQueryResults(namespaceResults, topK) {
        const allMatches = [];

        Object.entries(namespaceResults).forEach(([namespace, result]) => {
            if (result.matches) {
                result.matches.forEach(match => {
                    allMatches.push({
                        ...match,
                        source_namespace: namespace
                    });
                });
            }
        });

        // Sort by score (descending) and take top-k
        allMatches.sort((a, b) => b.score - a.score);
        
        return allMatches.slice(0, topK);
    }

    async deleteVectors(ids, namespace) {
        if (!this.isConnected) {
            await this.connect();
        }

        console.log(`🗑️ Deleting ${ids.length} vectors from namespace: ${namespace}`);

        try {
            await this.index.namespace(namespace).deleteMany(ids);
            console.log(`✅ Successfully deleted ${ids.length} vectors`);
            
            return {
                deletedCount: ids.length,
                namespace
            };

        } catch (error) {
            console.error(`❌ Failed to delete vectors:`, error.message);
            throw error;
        }
    }

    async deleteNamespace(namespace) {
        if (!this.isConnected) {
            await this.connect();
        }

        console.log(`🗑️ Deleting entire namespace: ${namespace}`);

        try {
            await this.index.namespace(namespace).deleteAll();
            console.log(`✅ Successfully deleted namespace: ${namespace}`);
            
            return { namespace, deleted: true };

        } catch (error) {
            console.error(`❌ Failed to delete namespace ${namespace}:`, error.message);
            throw error;
        }
    }

    async fetchVectors(ids, namespace) {
        if (!this.isConnected) {
            await this.connect();
        }

        console.log(`📥 Fetching ${ids.length} vectors from namespace: ${namespace}`);

        try {
            const result = await this.index.namespace(namespace).fetch(ids);
            
            console.log(`✅ Fetched ${Object.keys(result.vectors || {}).length} vectors`);
            
            return {
                vectors: result.vectors || {},
                namespace
            };

        } catch (error) {
            console.error(`❌ Failed to fetch vectors:`, error.message);
            throw error;
        }
    }

    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    formatVectorForUpsert(id, values, metadata = {}) {
        return {
            id: String(id),
            values: Array.isArray(values) ? values : [values],
            metadata: this.sanitizeMetadata(metadata)
        };
    }

    sanitizeMetadata(metadata) {
        // Pinecone metadata restrictions:
        // - Values must be strings, numbers, booleans, or arrays of strings
        // - No nested objects allowed
        // - Max 40KB per metadata
        
        const sanitized = {};
        
        Object.entries(metadata).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                return; // Skip null/undefined values
            }
            
            if (Array.isArray(value)) {
                // Convert array elements to strings
                sanitized[key] = value.map(v => String(v));
            } else if (typeof value === 'object') {
                // Convert objects to JSON strings
                sanitized[key] = JSON.stringify(value);
            } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = value;
            } else {
                // Convert other types to strings
                sanitized[key] = String(value);
            }
        });

        return sanitized;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility methods for namespace management
    getNamespaceName(type) {
        const namespaceMap = {
            'base': this.config.namespaces.base,
            'laws': this.config.namespaces.laws,
            'jurisprudence': this.config.namespaces.jurisprudence,
            'regional': this.config.namespaces.regional
        };
        
        return namespaceMap[type] || type;
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const stats = await this.getIndexStats();
            
            const health = {
                connected: this.isConnected,
                indexName: this.config.indexName,
                dimension: stats.dimension,
                totalVectors: stats.totalVectorCount,
                indexFullness: stats.indexFullness,
                namespaces: {},
                timestamp: new Date().toISOString()
            };

            // Get stats for each configured namespace
            for (const [key, namespace] of Object.entries(this.config.namespaces)) {
                try {
                    const nsStats = await this.getNamespaceStats(namespace);
                    health.namespaces[namespace] = {
                        vectorCount: nsStats.vectorCount || 0
                    };
                } catch (error) {
                    health.namespaces[namespace] = {
                        vectorCount: 0,
                        error: error.message
                    };
                }
            }

            return health;

        } catch (error) {
            return {
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Test method
    async testConnection() {
        console.log('🧪 Testing Pinecone connection...');
        
        try {
            const health = await this.healthCheck();
            
            console.log('📊 Pinecone Health Check:');
            console.log(`   - Connected: ${health.connected}`);
            console.log(`   - Index: ${health.indexName}`);
            console.log(`   - Dimension: ${health.dimension}`);
            console.log(`   - Total vectors: ${health.totalVectors}`);
            console.log(`   - Index fullness: ${health.indexFullness}`);
            
            console.log('📂 Namespace Status:');
            Object.entries(health.namespaces).forEach(([namespace, stats]) => {
                console.log(`   - ${namespace}: ${stats.vectorCount} vectors`);
                if (stats.error) {
                    console.log(`     ⚠️ Error: ${stats.error}`);
                }
            });
            
            return health;

        } catch (error) {
            console.error('❌ Connection test failed:', error.message);
            throw error;
        }
    }
}