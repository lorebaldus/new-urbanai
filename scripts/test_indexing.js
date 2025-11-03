#!/usr/bin/env node

// Complete Indexing Test - Tests L.1150/1942 Indexing to Pinecone
// Tests: Document Processing → Embedding Generation → Vector Database Upload

import fs from 'fs/promises';
import path from 'path';
import { main as processDocument } from './test_full_processing.js';
import { IndexManager } from '../vector-db/index_manager.js';
import { QueryEngine } from '../vector-db/query_engine.js';

async function main() {
    console.log('🧪 TESTING COMPLETE INDEXING PIPELINE TO PINECONE\\n');
    console.log('📋 This test will:');
    console.log('   1. Process L.1150/1942 (Legge Urbanistica)');
    console.log('   2. Generate embeddings with OpenAI');
    console.log('   3. Index to Pinecone namespace: laws-national');
    console.log('   4. Verify indexing with test queries');
    console.log('   5. Generate comprehensive report\\n');

    try {
        // Step 1: Process the document using existing pipeline
        console.log('1️⃣ PROCESSING DOCUMENT WITH FULL PIPELINE...');
        console.log('='.repeat(60));
        
        const processedDocument = await processDocument();
        
        if (!processedDocument || !processedDocument.chunks) {
            throw new Error('Document processing failed or returned invalid data');
        }

        console.log(`✅ Document processed successfully:`);
        console.log(`   - Document: ${processedDocument.document_metadata.title}`);
        console.log(`   - Chunks: ${processedDocument.chunks.length}`);
        console.log(`   - Total tokens: ${processedDocument.total_tokens}`);
        console.log(`   - Quality score: ${processedDocument.document_metadata.quality_metrics.overall_quality}/100`);

        // Step 2: Initialize IndexManager and perform health check
        console.log('\\n2️⃣ INITIALIZING VECTOR DATABASE SERVICES...');
        console.log('='.repeat(60));
        
        const indexManager = new IndexManager({
            namespace: 'laws-national',
            batchSize: 50, // Smaller batches for testing
            minQualityScore: 50,
            logProgress: true,
            logDetailedStats: true
        });

        console.log('🏥 Performing health check...');
        const healthCheck = await indexManager.healthCheck();
        
        if (healthCheck.status !== 'healthy') {
            console.error('❌ Health check failed:', healthCheck.error);
            throw new Error(`Services not healthy: ${healthCheck.error}`);
        }

        console.log('✅ Health check passed:');
        console.log(`   - Pinecone: ${healthCheck.pinecone.connected ? 'Connected' : 'Disconnected'}`);
        console.log(`   - Index: ${healthCheck.pinecone.indexName}`);
        console.log(`   - Total vectors: ${healthCheck.pinecone.totalVectors?.toLocaleString() || 'Unknown'}`);
        console.log(`   - Embedding model: ${healthCheck.embedding.model}`);
        console.log(`   - Embedding dimension: ${healthCheck.embedding.dimension}`);

        // Step 3: Cost estimation
        console.log('\\n3️⃣ COST ESTIMATION...');
        console.log('='.repeat(60));
        
        const embeddingService = indexManager.embeddingService;
        const costEstimate = embeddingService.estimateCost(processedDocument.chunks);
        
        console.log('💰 Cost Analysis:');
        console.log(`   - Total tokens: ${costEstimate.totalTokens.toLocaleString()}`);
        console.log(`   - Estimated cost: $${costEstimate.estimatedCost.toFixed(6)}`);
        console.log(`   - Cost per 1K tokens: $${costEstimate.costPer1kTokens}`);
        console.log(`   - Average tokens per chunk: ${Math.round(costEstimate.totalTokens / processedDocument.chunks.length)}`);

        // Ask for confirmation (in real scenario)
        console.log('\\n⚠️ Proceeding with indexing (estimated cost: $' + costEstimate.estimatedCost.toFixed(6) + ')...');

        // Step 4: Index the document
        console.log('\\n4️⃣ INDEXING DOCUMENT TO PINECONE...');
        console.log('='.repeat(60));
        
        const indexingResult = await indexManager.indexDocument(processedDocument, {
            namespace: 'laws-national',
            skipQualityFilter: false,
            dryRun: false
        });

        if (indexingResult.status !== 'success') {
            console.error('❌ Indexing failed:', indexingResult.error);
            throw new Error(`Indexing failed: ${indexingResult.error?.message}`);
        }

        console.log('✅ Indexing completed successfully:');
        console.log(`   - Status: ${indexingResult.status.toUpperCase()}`);
        console.log(`   - Chunks indexed: ${indexingResult.chunks_indexed}/${indexingResult.chunks_total}`);
        console.log(`   - Chunks skipped: ${indexingResult.chunks_skipped}`);
        console.log(`   - Processing time: ${indexingResult.processing_time_ms}ms`);
        console.log(`   - Actual cost: $${indexingResult.embeddingStats?.totalCost?.toFixed(6) || '0'}`);
        console.log(`   - Actual tokens: ${indexingResult.embeddingStats?.totalTokens?.toLocaleString() || '0'}`);
        console.log(`   - Verification: ${indexingResult.verificationResult?.verified ? 'PASSED' : 'FAILED'}`);

        // Step 5: Test queries
        console.log('\\n5️⃣ TESTING QUERIES...');
        console.log('='.repeat(60));
        
        const queryEngine = new QueryEngine();
        
        const testQueries = [
            'piano regolatore generale',
            'licenza di costruzione',
            'espropriazione per pubblica utilità',
            'zone edificabili',
            'vincoli urbanistici'
        ];

        console.log('🔍 Executing test queries...');
        const queryResults = [];

        for (const [index, query] of testQueries.entries()) {
            console.log(`\\n   Query ${index + 1}/5: "${query}"`);
            
            try {
                const result = await queryEngine.searchLaws(query, {
                    topK: 3,
                    threshold: 0.5
                });

                console.log(`   ✅ Found ${result.results.length} results`);
                
                if (result.results.length > 0) {
                    const topResult = result.results[0];
                    console.log(`   🥇 Top result: ${topResult.metadata.title}`);
                    console.log(`   📊 Score: ${topResult.score} | Article: ${topResult.metadata.article}`);
                }

                queryResults.push({
                    query,
                    results: result.results.length,
                    topScore: result.results[0]?.score || 0,
                    latency: result.metadata.latency
                });

                // Small delay between queries
                await sleep(500);

            } catch (error) {
                console.log(`   ❌ Query failed: ${error.message}`);
                queryResults.push({
                    query,
                    error: error.message
                });
            }
        }

        // Step 6: Generate comprehensive report
        console.log('\\n6️⃣ GENERATING COMPREHENSIVE REPORT...');
        console.log('='.repeat(60));
        
        const report = generateComprehensiveReport(
            processedDocument,
            indexingResult,
            queryResults,
            healthCheck,
            costEstimate
        );

        const reportPath = await saveReport(report);
        
        // Step 7: Display final summary
        console.log('\\n📊 INDEXING TEST COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log(`📄 Document: ${processedDocument.document_metadata.title}`);
        console.log(`✅ Chunks indexed: ${indexingResult.chunks_indexed}`);
        console.log(`💰 Total cost: $${indexingResult.embeddingStats?.totalCost?.toFixed(6) || '0'}`);
        console.log(`🔍 Test queries: ${queryResults.filter(q => !q.error).length}/${testQueries.length} successful`);
        console.log(`📝 Report saved: ${reportPath}`);
        console.log(`🎯 Namespace: laws-national`);
        console.log('='.repeat(60));
        
        // Display query summary
        console.log('\\n🔍 QUERY TEST SUMMARY:');
        queryResults.forEach((result, index) => {
            if (result.error) {
                console.log(`   ${index + 1}. "${result.query}" - ❌ FAILED: ${result.error}`);
            } else {
                console.log(`   ${index + 1}. "${result.query}" - ✅ ${result.results} results (score: ${result.topScore?.toFixed(3) || 'N/A'}, ${result.latency}ms)`);
            }
        });

        console.log('\\n🎉 PIPELINE TEST COMPLETED - L.1150/1942 SUCCESSFULLY INDEXED!');
        
        return {
            success: true,
            indexingResult,
            queryResults,
            report,
            reportPath
        };

    } catch (error) {
        console.error('\\n❌ INDEXING TEST FAILED:', error.message);
        console.error('\\nFull error:', error);
        
        // Save error report
        const errorReport = {
            test_status: 'FAILED',
            error: {
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            },
            test_phase: 'Unknown'
        };
        
        await saveReport(errorReport, 'ERROR');
        
        process.exit(1);
    }
}

function generateComprehensiveReport(processedDocument, indexingResult, queryResults, healthCheck, costEstimate) {
    const successfulQueries = queryResults.filter(q => !q.error);
    const averageLatency = successfulQueries.length > 0 
        ? successfulQueries.reduce((sum, q) => sum + q.latency, 0) / successfulQueries.length 
        : 0;
    
    return {
        test_summary: {
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
            document: processedDocument.document_metadata.title,
            pipeline_version: '1.0.0'
        },
        
        document_processing: {
            source_document: {
                title: processedDocument.document_metadata.title,
                type: processedDocument.document_metadata.document_classification.primary_type,
                number: processedDocument.document_metadata.number,
                date: processedDocument.document_metadata.date,
                articles: processedDocument.document_metadata.structure_analysis.total_articles
            },
            chunks_generated: {
                total: processedDocument.chunks.length,
                strategy: processedDocument.chunking_strategy,
                total_tokens: processedDocument.total_tokens,
                average_tokens_per_chunk: Math.round(processedDocument.total_tokens / processedDocument.chunks.length),
                quality_score: processedDocument.document_metadata.quality_metrics.overall_quality
            }
        },
        
        cost_analysis: {
            estimated: {
                tokens: costEstimate.totalTokens,
                cost: costEstimate.estimatedCost
            },
            actual: {
                tokens: indexingResult.embeddingStats?.totalTokens || 0,
                cost: indexingResult.embeddingStats?.totalCost || 0
            },
            variance: {
                token_difference: (indexingResult.embeddingStats?.totalTokens || 0) - costEstimate.totalTokens,
                cost_difference: (indexingResult.embeddingStats?.totalCost || 0) - costEstimate.estimatedCost
            }
        },
        
        indexing_results: {
            status: indexingResult.status,
            namespace: indexingResult.config.namespace,
            chunks_processed: indexingResult.chunks_processed,
            chunks_indexed: indexingResult.chunks_indexed,
            chunks_skipped: indexingResult.chunks_skipped,
            processing_time_ms: indexingResult.processing_time_ms,
            verification_passed: indexingResult.verificationResult?.verified || false,
            batch_size_used: indexingResult.config.batchSize
        },
        
        vector_database_status: {
            pinecone_connected: healthCheck.pinecone.connected,
            index_name: healthCheck.pinecone.indexName,
            total_vectors_in_index: healthCheck.pinecone.totalVectors,
            embedding_model: healthCheck.embedding.model,
            embedding_dimension: healthCheck.embedding.dimension
        },
        
        query_testing: {
            total_queries: queryResults.length,
            successful_queries: successfulQueries.length,
            failed_queries: queryResults.length - successfulQueries.length,
            average_latency_ms: Math.round(averageLatency),
            query_details: queryResults.map(q => ({
                query: q.query,
                status: q.error ? 'FAILED' : 'SUCCESS',
                results_found: q.results || 0,
                top_score: q.topScore || null,
                latency_ms: q.latency || null,
                error: q.error || null
            }))
        },
        
        performance_metrics: {
            total_processing_time_ms: indexingResult.processing_time_ms,
            tokens_per_second: indexingResult.processing_time_ms > 0 
                ? Math.round((indexingResult.embeddingStats?.totalTokens || 0) / (indexingResult.processing_time_ms / 1000))
                : 0,
            chunks_per_second: indexingResult.processing_time_ms > 0
                ? Math.round(indexingResult.chunks_indexed / (indexingResult.processing_time_ms / 1000))
                : 0,
            cost_per_chunk: indexingResult.chunks_indexed > 0 
                ? (indexingResult.embeddingStats?.totalCost || 0) / indexingResult.chunks_indexed
                : 0
        },
        
        recommendations: generateRecommendations(indexingResult, queryResults),
        
        technical_details: {
            node_version: process.version,
            platform: process.platform,
            memory_usage: process.memoryUsage(),
            environment_variables_present: {
                OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
                PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
                PINECONE_INDEX: !!process.env.PINECONE_INDEX
            }
        }
    };
}

function generateRecommendations(indexingResult, queryResults) {
    const recommendations = [];
    
    // Quality recommendations
    if (indexingResult.chunks_skipped > indexingResult.chunks_indexed * 0.2) {
        recommendations.push({
            type: 'quality',
            message: `High skip rate (${indexingResult.chunks_skipped} skipped). Consider lowering quality threshold.`,
            priority: 'medium'
        });
    }
    
    // Performance recommendations
    if (indexingResult.processing_time_ms > 60000) {
        recommendations.push({
            type: 'performance',
            message: 'Processing took over 1 minute. Consider increasing batch size or optimizing chunks.',
            priority: 'low'
        });
    }
    
    // Query performance
    const failedQueries = queryResults.filter(q => q.error).length;
    if (failedQueries > 0) {
        recommendations.push({
            type: 'query',
            message: `${failedQueries} test queries failed. Check query engine configuration.`,
            priority: 'high'
        });
    }
    
    // Cost optimization
    const costPerChunk = indexingResult.chunks_indexed > 0 
        ? (indexingResult.embeddingStats?.totalCost || 0) / indexingResult.chunks_indexed
        : 0;
    
    if (costPerChunk > 0.001) {
        recommendations.push({
            type: 'cost',
            message: `High cost per chunk ($${costPerChunk.toFixed(4)}). Consider optimizing chunk size.`,
            priority: 'medium'
        });
    }
    
    return recommendations;
}

async function saveReport(report, status = 'SUCCESS') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `indexing_test_${status}_${timestamp}.json`;
    
    const reportsDir = path.join(process.cwd(), 'data', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const reportPath = path.join(reportsDir, filename);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    // Also save a human-readable summary
    if (status === 'SUCCESS') {
        const summaryPath = path.join(reportsDir, `indexing_summary_${timestamp}.txt`);
        const summary = generateHumanReadableSummary(report);
        await fs.writeFile(summaryPath, summary, 'utf8');
    }
    
    return reportPath;
}

function generateHumanReadableSummary(report) {
    return `
URBANAI LEGAL KNOWLEDGE BASE - INDEXING TEST REPORT
===================================================

🗓️ Test Date: ${new Date(report.test_summary.timestamp).toLocaleString()}
📄 Document: ${report.document_processing.source_document.title}
✅ Status: ${report.test_summary.status}

DOCUMENT PROCESSING SUMMARY:
----------------------------
📑 Document Type: ${report.document_processing.source_document.type}
📊 Articles Parsed: ${report.document_processing.source_document.articles}
🧩 Chunks Generated: ${report.document_processing.chunks_generated.total}
🔤 Total Tokens: ${report.document_processing.chunks_generated.total_tokens.toLocaleString()}
📈 Quality Score: ${report.document_processing.chunks_generated.quality_score}/100

INDEXING RESULTS:
-----------------
🎯 Target Namespace: ${report.indexing_results.namespace}
✅ Chunks Indexed: ${report.indexing_results.chunks_indexed}
⏭️ Chunks Skipped: ${report.indexing_results.chunks_skipped}
⏱️ Processing Time: ${report.indexing_results.processing_time_ms}ms
🔍 Verification: ${report.indexing_results.verification_passed ? 'PASSED' : 'FAILED'}

COST ANALYSIS:
--------------
💰 Estimated Cost: $${report.cost_analysis.estimated.cost.toFixed(6)}
💰 Actual Cost: $${report.cost_analysis.actual.cost.toFixed(6)}
📊 Cost Variance: $${report.cost_analysis.variance.cost_difference.toFixed(6)}
💵 Cost per Chunk: $${report.performance_metrics.cost_per_chunk.toFixed(6)}

QUERY TESTING:
--------------
🔍 Total Queries: ${report.query_testing.total_queries}
✅ Successful: ${report.query_testing.successful_queries}
❌ Failed: ${report.query_testing.failed_queries}
⚡ Avg Latency: ${report.query_testing.average_latency_ms}ms

PERFORMANCE METRICS:
--------------------
🚀 Tokens/Second: ${report.performance_metrics.tokens_per_second.toLocaleString()}
📦 Chunks/Second: ${report.performance_metrics.chunks_per_second}
🏃 Processing Speed: ${(report.performance_metrics.chunks_per_second * 60).toFixed(1)} chunks/minute

VECTOR DATABASE STATUS:
-----------------------
🌲 Pinecone Connected: ${report.vector_database_status.pinecone_connected ? 'YES' : 'NO'}
📊 Index Name: ${report.vector_database_status.index_name}
🔢 Total Vectors: ${report.vector_database_status.total_vectors_in_index?.toLocaleString() || 'Unknown'}
🤖 Embedding Model: ${report.vector_database_status.embedding_model}
📏 Dimension: ${report.vector_database_status.embedding_dimension}

RECOMMENDATIONS:
----------------
${report.recommendations.map(r => `${r.priority.toUpperCase()}: ${r.message}`).join('\\n') || 'No specific recommendations.'}

QUERY TEST DETAILS:
-------------------
${report.query_testing.query_details.map(q => 
    `• "${q.query}" - ${q.status} (${q.results_found || 0} results, ${q.latency_ms || 'N/A'}ms)`
).join('\\n')}

===================================================
Report generated by UrbanAI Legal Knowledge Base Integration System
Pipeline Version: ${report.test_summary.pipeline_version}
`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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