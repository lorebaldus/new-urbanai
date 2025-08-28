const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

class DocumentProcessor {
    constructor() {
        this.chunkSize = 1000;
        this.chunkOverlap = 200;
    }

    async processDocument(filePath) {
        try {
            const fileExtension = path.extname(filePath).toLowerCase();
            let text = '';

            switch (fileExtension) {
                case '.pdf':
                    text = await this.processPDF(filePath);
                    break;
                default:
                    throw new Error(`Unsupported file format: ${fileExtension}`);
            }

            const chunks = this.chunkText(text);
            const processedChunks = chunks.map((chunk, index) => ({
                id: `${path.basename(filePath)}_chunk_${index}`,
                text: chunk,
                source: filePath,
                chunkIndex: index
            }));

            return processedChunks;
        } catch (error) {
            console.error(`Error processing document ${filePath}:`, error);
            throw error;
        }
    }

    async processPDF(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            return data.text;
        } catch (error) {
            console.error(`Error parsing PDF ${filePath}:`, error);
            throw error;
        }
    }

    chunkText(text, chunkSize = this.chunkSize, overlap = this.chunkOverlap) {
        const chunks = [];
        let start = 0;

        while (start < text.length) {
            let end = start + chunkSize;
            
            // Try to break at sentence boundaries
            if (end < text.length) {
                const nextPeriod = text.indexOf('.', end - 100);
                const nextNewline = text.indexOf('\n', end - 100);
                
                if (nextPeriod > 0 && nextPeriod < end + 100) {
                    end = nextPeriod + 1;
                } else if (nextNewline > 0 && nextNewline < end + 100) {
                    end = nextNewline + 1;
                }
            }

            const chunk = text.slice(start, end).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }

            start = end - overlap;
            if (start >= text.length) break;
        }

        return chunks;
    }

    async processAllDocuments(docsPath) {
        const files = fs.readdirSync(docsPath)
            .filter(file => file.endsWith('.pdf'))
            .map(file => path.join(docsPath, file));

        const allChunks = [];
        
        for (const file of files) {
            try {
                console.log(`Processing ${file}...`);
                const chunks = await this.processDocument(file);
                allChunks.push(...chunks);
                console.log(` Processed ${file}: ${chunks.length} chunks`);
            } catch (error) {
                console.error(` Failed to process ${file}:`, error.message);
            }
        }

        return allChunks;
    }
}

module.exports = DocumentProcessor;