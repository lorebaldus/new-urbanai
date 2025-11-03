#!/usr/bin/env node

// Complete Processing Pipeline Test
// Tests: HTML -> Parse -> Chunk -> Metadata -> JSON output

import fs from 'fs/promises';
import path from 'path';
import { LegalParser } from '../processors/legal_parser.js';
import { LegalChunker } from '../processors/chunker.js';
import { LegalMetadataExtractor } from '../processors/metadata_extractor.js';

async function main() {
    console.log('🧪 TESTING COMPLETE DOCUMENT PROCESSING PIPELINE\n');

    try {
        // Step 1: Create test HTML content (simulating L.1150/1942)
        console.log('1️⃣ Creating test legal document HTML...');
        const testHtml = createTestLegalHtml();
        
        const testConfig = {
            title: 'Legge 17 agosto 1942, n. 1150 - Legge Urbanistica',
            number: '1150/1942',
            type: 'legge',
            source: 'normattiva',
            date: '1942-08-17'
        };

        // Step 2: Parse HTML
        console.log('\n2️⃣ Parsing HTML document...');
        const parser = new LegalParser();
        const parsedDocument = parser.parseDocument(testHtml, testConfig);
        
        console.log(`✅ Parsed: ${parsedDocument.articleCount} articles, ${parsedDocument.textLength} chars`);

        // Step 3: Extract enhanced metadata
        console.log('\n3️⃣ Extracting enhanced metadata...');
        const metadataExtractor = new LegalMetadataExtractor();
        const enhancedMetadata = metadataExtractor.extractMetadata(parsedDocument, testConfig);
        
        console.log(`✅ Metadata confidence: ${enhancedMetadata.processing_info.confidence_score}%`);

        // Step 4: Chunk document
        console.log('\n4️⃣ Chunking document...');
        const chunker = new LegalChunker();
        const chunkingResult = chunker.chunkDocument({...parsedDocument, metadata: enhancedMetadata});
        
        console.log(`✅ Created ${chunkingResult.chunks.length} chunks`);

        // Step 5: Enhance chunk metadata
        console.log('\n5️⃣ Enhancing chunk metadata...');
        const enhancedChunks = chunkingResult.chunks.map(chunk => ({
            ...chunk,
            metadata: metadataExtractor.enhanceChunkMetadata(chunk, enhancedMetadata)
        }));

        // Step 6: Create final output
        const finalOutput = {
            document_id: chunkingResult.documentId,
            processing_timestamp: new Date().toISOString(),
            document_metadata: enhancedMetadata,
            chunking_strategy: chunkingResult.chunkingStrategy,
            chunking_stats: chunkingResult.stats,
            chunks: enhancedChunks,
            total_chunks: enhancedChunks.length,
            total_tokens: enhancedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
            processing_pipeline: {
                parser_version: '1.0.0',
                chunker_version: '1.0.0',
                metadata_extractor_version: '1.0.0'
            }
        };

        // Step 7: Save results
        console.log('\n6️⃣ Saving results...');
        const outputPath = await saveProcessingResults(finalOutput);
        
        // Step 8: Display summary
        console.log('\n📊 PROCESSING SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Document: ${finalOutput.document_metadata.title}`);
        console.log(`Type: ${finalOutput.document_metadata.document_classification.primary_type}`);
        console.log(`Status: ${finalOutput.document_metadata.status_analysis.current_status}`);
        console.log(`Articles parsed: ${finalOutput.document_metadata.structure_analysis.total_articles}`);
        console.log(`Chunks created: ${finalOutput.total_chunks}`);
        console.log(`Total tokens: ${finalOutput.total_tokens}`);
        console.log(`Avg tokens/chunk: ${Math.round(finalOutput.total_tokens / finalOutput.total_chunks)}`);
        console.log(`Quality score: ${finalOutput.document_metadata.quality_metrics.overall_quality}/100`);
        console.log(`Confidence: ${finalOutput.document_metadata.processing_info.confidence_score}%`);
        console.log(`Output saved: ${outputPath}`);
        console.log('='.repeat(50));

        // Step 9: Show sample chunks
        console.log('\n📋 SAMPLE CHUNKS:');
        finalOutput.chunks.slice(0, 3).forEach((chunk, index) => {
            console.log(`\n--- Chunk ${index + 1} ---`);
            console.log(`ID: ${chunk.chunk_id}`);
            console.log(`Tokens: ${chunk.tokens}`);
            console.log(`Hierarchy: ${chunk.metadata.hierarchy.join(' > ')}`);
            console.log(`Quality: ${chunk.quality_score}/100`);
            console.log(`Text preview: ${chunk.text.substring(0, 150)}...`);
            
            if (chunk.metadata.chunk_topics.length > 0) {
                console.log(`Topics: ${chunk.metadata.chunk_topics.map(t => t.topic).slice(0, 2).join(', ')}`);
            }
        });

        console.log('\n🎉 PIPELINE TEST COMPLETED SUCCESSFULLY!');
        
        return finalOutput;

    } catch (error) {
        console.error('\n❌ PIPELINE TEST FAILED:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    }
}

function createTestLegalHtml() {
    // Simulated HTML content of L.1150/1942 (Legge Urbanistica)
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Legge 17 agosto 1942, n. 1150 - Legge urbanistica</title>
</head>
<body>
    <div class="content-main">
        <h1>Legge 17 agosto 1942, n. 1150</h1>
        <h2>Legge urbanistica</h2>
        
        <div class="articolo">
            <h3>Art. 1 - Formazione dei piani regolatori generali</h3>
            <p>Ogni Comune deve adottare un piano regolatore generale quando la popolazione residente nel territorio comunale superi i diecimila abitanti.</p>
            <p>Il piano regolatore generale deve essere esteso a tutto il territorio comunale e deve indicare la rete delle principali vie di comunicazione.</p>
        </div>

        <div class="articolo">
            <h3>Art. 2 - Contenuto del piano regolatore generale</h3>
            <p>Il piano regolatore generale deve indicare:</p>
            <p>1. la divisione in zone del territorio comunale secondo l'uso cui le singole zone sono destinate;</p>
            <p>2. le aree destinate alla formazione di spazi di uso pubblico;</p>
            <p>3. le aree nelle quali è vietata l'edificazione;</p>
            <p>4. la rete delle principali vie di comunicazione;</p>
            <p>5. la divisione in zone del territorio comunale per l'applicazione di particolari norme edilizie.</p>
        </div>

        <div class="articolo">
            <h3>Art. 3 - Formazione dei programmi di fabbricazione</h3>
            <p>I Comuni che non sono obbligati alla formazione del piano regolatore generale devono formare un programma di fabbricazione.</p>
            <p>Il programma di fabbricazione deve stabilire quali aree del territorio comunale debbano essere riservate all'ampliamento dell'aggregato urbano e quali altre aree debbano essere destinate alla formazione di spazi di uso pubblico.</p>
        </div>

        <div class="articolo">
            <h3>Art. 4 - Approvazione dei piani</h3>
            <p>I piani regolatori generali e i programmi di fabbricazione sono approvati con decreto del Ministro per i lavori pubblici.</p>
            <p>Prima dell'approvazione il piano deve essere depositato nella segreteria del Comune per la durata di quindici giorni consecutivi perché chiunque possa prenderne visione.</p>
        </div>

        <div class="articolo">
            <h3>Art. 5 - Efficacia dei piani</h3>
            <p>L'approvazione del piano regolatore generale comporta la dichiarazione di pubblica utilità delle opere in esso previste.</p>
            <p>Le opere di urbanizzazione primaria comprendono le strade, gli spazi di sosta e di parcheggio, le fognature, la rete idrica, la rete del gas, la rete elettrica.</p>
        </div>

        <div class="articolo">
            <h3>Art. 6 - Varianti ai piani</h3>
            <p>Le varianti ai piani regolatori generali sono approvate con la stessa procedura stabilita per l'approvazione del piano.</p>
            <p>Le varianti di modesta entità possono essere approvate dalla Regione.</p>
        </div>

        <div class="articolo">
            <h3>Art. 7 - Licenza di costruzione</h3>
            <p>Chiunque intenda eseguire nuove costruzioni deve munirsi di licenza del sindaco.</p>
            <p>La licenza è rilasciata in conformità alle norme del presente decreto e del regolamento edilizio.</p>
            <p>La licenza deve essere richiesta per iscritto e deve contenere l'indicazione del terreno su cui si intende costruire e il progetto delle opere.</p>
        </div>

        <div class="articolo">
            <h3>Art. 8 - Costruzioni in zone vincolate</h3>
            <p>Nelle zone dichiarate soggette a vincolo paesaggistico la licenza non può essere rilasciata senza l'autorizzazione della competente soprintendenza.</p>
            <p>L'autorizzazione deve essere rilasciata entro sessanta giorni dalla richiesta.</p>
        </div>

        <div class="articolo">
            <h3>Art. 9 - Vigilanza sull'attività edilizia</h3>
            <p>Il sindaco esercita la vigilanza sull'attività edilizia nel territorio comunale.</p>
            <p>Quando sia accertata l'esecuzione di opere senza licenza o difformi dalla licenza, il sindaco dispone la sospensione dei lavori.</p>
        </div>

        <div class="articolo">
            <h3>Art. 10 - Sanzioni</h3>
            <p>Chiunque esegue opere edilizie senza licenza o in difformità da essa è punito con ammenda da lire centomila a un milione.</p>
            <p>Il sindaco può ordinare la demolizione delle opere abusivamente costruite.</p>
        </div>

        <div class="articolo">
            <h3>Art. 11 - Espropriazione per pubblica utilità</h3>
            <p>Le aree comprese nei piani di zona per l'edilizia economica e popolare possono essere espropriate per pubblica utilità.</p>
            <p>L'indennità di espropriazione è determinata secondo i criteri stabiliti dalla legislazione vigente.</p>
        </div>

        <div class="articolo">
            <h3>Art. 12 - Norma finale</h3>
            <p>La presente legge entra in vigore il giorno della sua pubblicazione nella Gazzetta Ufficiale del Regno.</p>
        </div>
    </div>
</body>
</html>`;
}

async function saveProcessingResults(output) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `L1150_1942_processed_${timestamp}.json`;
    
    const processedDir = path.join(process.cwd(), 'data', 'processed');
    await fs.mkdir(processedDir, { recursive: true });
    
    const outputPath = path.join(processedDir, filename);
    
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
    
    // Also save a summary file
    const summaryPath = path.join(processedDir, `summary_${timestamp}.txt`);
    const summary = generateSummary(output);
    await fs.writeFile(summaryPath, summary, 'utf8');
    
    return outputPath;
}

function generateSummary(output) {
    return `
DOCUMENT PROCESSING SUMMARY
===========================

Document: ${output.document_metadata.title}
Type: ${output.document_metadata.document_classification.primary_type}
Number: ${output.document_metadata.number}
Date: ${output.document_metadata.date}
Status: ${output.document_metadata.status_analysis.current_status}

STRUCTURE ANALYSIS:
- Total articles: ${output.document_metadata.structure_analysis.total_articles}
- Complexity: ${output.document_metadata.structure_analysis.structural_complexity}
- Has annexes: ${output.document_metadata.structure_analysis.has_annexes}

CHUNKING RESULTS:
- Strategy used: ${output.chunking_strategy}
- Total chunks: ${output.total_chunks}
- Total tokens: ${output.total_tokens}
- Average tokens per chunk: ${Math.round(output.total_tokens / output.total_chunks)}
- Chunks in target range: ${output.chunking_stats.chunksInTargetRange}/${output.total_chunks}

QUALITY METRICS:
- Overall quality: ${output.document_metadata.quality_metrics.overall_quality}/100
- Completeness: ${output.document_metadata.quality_metrics.completeness_score}/100
- Structure score: ${output.document_metadata.quality_metrics.structure_score}/100
- Confidence: ${output.document_metadata.processing_info.confidence_score}%

TOPIC ANALYSIS:
Primary topics: ${output.document_metadata.topic_analysis.primary_topics.map(t => t.topic).join(', ')}
Urbanistic relevance: ${output.document_metadata.topic_analysis.urbanistic_relevance}%

PROCESSING INFO:
- Processed at: ${output.processing_timestamp}
- Pipeline versions: Parser ${output.processing_pipeline.parser_version}, Chunker ${output.processing_pipeline.chunker_version}, Metadata ${output.processing_pipeline.metadata_extractor_version}

SAMPLE CHUNKS:
${output.chunks.slice(0, 3).map((chunk, i) => `
${i + 1}. ${chunk.chunk_id}
   Tokens: ${chunk.tokens}
   Quality: ${chunk.quality_score}/100
   Preview: ${chunk.text.substring(0, 100)}...
`).join('')}
`;
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