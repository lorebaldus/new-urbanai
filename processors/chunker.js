// Intelligent Legal Document Chunker
// Creates semantically meaningful chunks preserving legal structure

export class LegalChunker {
    constructor(config = {}) {
        this.config = {
            minChunkSize: 800,      // tokens
            maxChunkSize: 1200,     // tokens
            overlapSize: 200,       // tokens
            targetChunkSize: 1000,  // optimal tokens
            
            // Chunking priorities (higher = stronger boundary)
            separators: [
                { pattern: /(?=Art\.|Articolo\s*\d+)/g, priority: 10, name: 'article' },
                { pattern: /(?=Comma\s*\d+|^\d+\.)/gm, priority: 8, name: 'comma' },
                { pattern: /(?=lett\.\s*[a-z]\)|lettera\s*[a-z]\))/g, priority: 6, name: 'letter' },
                { pattern: /\n\s*\n/g, priority: 4, name: 'paragraph' },
                { pattern: /\.\s+(?=[A-Z])/g, priority: 3, name: 'sentence' },
                { pattern: /;\s+/g, priority: 2, name: 'semicolon' },
                { pattern: /,\s+/g, priority: 1, name: 'comma_punct' }
            ],
            
            // Preserve these patterns within chunks
            preservePatterns: [
                /(?:vedasi|vedi|si rinvia|cfr\.)\s*(?:art\.|articolo)\s*\d+/gi,
                /(?:di cui all['']art\.|dell['']art\.)\s*\d+/gi,
                /(?:comma\s*\d+|lett\.\s*[a-z]\))/gi
            ],
            
            ...config
        };

        // Token estimation (rough approximation: 1 token ≈ 4 characters in Italian)
        this.tokenRatio = 4;
        
        console.log(`🔪 LegalChunker initialized: ${this.config.minChunkSize}-${this.config.maxChunkSize} tokens`);
    }

    chunkDocument(parsedDocument) {
        console.log(`🔄 Chunking document: ${parsedDocument.metadata.title}`);
        
        const chunks = [];
        
        // Strategy 1: Article-based chunking (preferred)
        if (parsedDocument.articles && parsedDocument.articles.length > 0) {
            console.log(`📋 Using article-based chunking (${parsedDocument.articles.length} articles)`);
            const articleChunks = this.chunkByArticles(parsedDocument);
            chunks.push(...articleChunks);
        } else {
            // Strategy 2: Fallback to structure-based chunking
            console.log(`📄 Using structure-based chunking (fallback)`);
            const structureChunks = this.chunkByStructure(parsedDocument);
            chunks.push(...structureChunks);
        }

        // Post-process chunks
        const processedChunks = this.postProcessChunks(chunks, parsedDocument);
        
        console.log(`✅ Created ${processedChunks.length} chunks from ${parsedDocument.textLength} chars`);
        
        return {
            documentId: this.generateDocumentId(parsedDocument.metadata),
            metadata: parsedDocument.metadata,
            chunks: processedChunks,
            chunkingStrategy: parsedDocument.articles.length > 0 ? 'article-based' : 'structure-based',
            stats: this.calculateChunkingStats(processedChunks)
        };
    }

    chunkByArticles(parsedDocument) {
        const chunks = [];
        let globalPosition = 0;

        parsedDocument.articles.forEach((article, articleIndex) => {
            console.log(`🔄 Processing Article ${article.number}...`);
            
            // Check if article is small enough to be a single chunk
            const articleTokens = this.estimateTokens(article.content);
            
            if (articleTokens <= this.config.maxChunkSize) {
                // Single chunk for the entire article
                const chunk = this.createChunk({
                    text: article.content,
                    metadata: parsedDocument.metadata,
                    position: globalPosition++,
                    hierarchy: {
                        article: article.number,
                        articleTitle: article.title
                    },
                    context: {
                        type: 'complete_article',
                        articleIndex
                    }
                });
                
                chunks.push(chunk);
            } else {
                // Split large article into multiple chunks
                const articleChunks = this.chunkLargeArticle(article, parsedDocument.metadata, globalPosition);
                chunks.push(...articleChunks);
                globalPosition += articleChunks.length;
            }
        });

        return chunks;
    }

    chunkLargeArticle(article, documentMetadata, startPosition) {
        console.log(`📏 Splitting large article ${article.number} (${this.estimateTokens(article.content)} tokens)`);
        
        const chunks = [];
        let position = startPosition;

        // First, try to chunk by commas if available
        if (article.commas && article.commas.length > 1) {
            article.commas.forEach((comma, commaIndex) => {
                const commaTokens = this.estimateTokens(comma.content);
                
                if (commaTokens <= this.config.maxChunkSize) {
                    const chunk = this.createChunk({
                        text: comma.content,
                        metadata: documentMetadata,
                        position: position++,
                        hierarchy: {
                            article: article.number,
                            articleTitle: article.title,
                            comma: comma.number
                        },
                        context: {
                            type: 'article_comma',
                            commaIndex,
                            totalCommas: article.commas.length
                        }
                    });
                    
                    chunks.push(chunk);
                } else {
                    // Further split the comma
                    const commaChunks = this.chunkText(comma.content, {
                        metadata: documentMetadata,
                        hierarchy: {
                            article: article.number,
                            articleTitle: article.title,
                            comma: comma.number
                        },
                        startPosition: position
                    });
                    
                    chunks.push(...commaChunks);
                    position += commaChunks.length;
                }
            });
        } else {
            // Fallback: split by semantic boundaries
            const textChunks = this.chunkText(article.content, {
                metadata: documentMetadata,
                hierarchy: {
                    article: article.number,
                    articleTitle: article.title
                },
                startPosition: position
            });
            
            chunks.push(...textChunks);
        }

        return chunks;
    }

    chunkByStructure(parsedDocument) {
        console.log(`📄 Fallback: chunking by document structure`);
        
        // Use the full text and apply intelligent splitting
        return this.chunkText(parsedDocument.fullText, {
            metadata: parsedDocument.metadata,
            hierarchy: {},
            startPosition: 0
        });
    }

    chunkText(text, options = {}) {
        const chunks = [];
        const { metadata, hierarchy, startPosition = 0 } = options;
        
        const textSegments = this.splitTextBySeparators(text);
        let currentChunk = '';
        let position = startPosition;

        for (let i = 0; i < textSegments.length; i++) {
            const segment = textSegments[i];
            const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + segment.text;
            const potentialTokens = this.estimateTokens(potentialChunk);

            if (potentialTokens <= this.config.maxChunkSize) {
                // Add segment to current chunk
                currentChunk = potentialChunk;
            } else {
                // Current chunk is full, finalize it
                if (currentChunk) {
                    const chunk = this.createChunk({
                        text: currentChunk,
                        metadata,
                        position: position++,
                        hierarchy,
                        context: {
                            type: 'text_segment',
                            segmentIndex: i
                        }
                    });
                    
                    chunks.push(chunk);
                }

                // Start new chunk with current segment
                currentChunk = segment.text;
                
                // If single segment is too large, force split it
                if (this.estimateTokens(currentChunk) > this.config.maxChunkSize) {
                    const forceChunks = this.forceSplitText(currentChunk, metadata, hierarchy, position);
                    chunks.push(...forceChunks);
                    position += forceChunks.length;
                    currentChunk = '';
                }
            }
        }

        // Add final chunk
        if (currentChunk) {
            const chunk = this.createChunk({
                text: currentChunk,
                metadata,
                position: position++,
                hierarchy,
                context: {
                    type: 'final_segment'
                }
            });
            
            chunks.push(chunk);
        }

        return chunks;
    }

    splitTextBySeparators(text) {
        const segments = [];
        let remainingText = text;
        let currentPosition = 0;

        // Sort separators by priority (highest first)
        const sortedSeparators = [...this.config.separators].sort((a, b) => b.priority - a.priority);

        while (remainingText.length > 0) {
            let bestSplit = null;
            let bestSeparator = null;

            // Find the best separator to split on
            for (const separator of sortedSeparators) {
                const matches = [...remainingText.matchAll(separator.pattern)];
                
                for (const match of matches) {
                    const splitPosition = match.index;
                    
                    if (splitPosition > 0) { // Don't split at the very beginning
                        const beforeSplit = remainingText.substring(0, splitPosition);
                        const beforeTokens = this.estimateTokens(beforeSplit);
                        
                        // Good split if it's within our target range
                        if (beforeTokens >= this.config.minChunkSize && beforeTokens <= this.config.maxChunkSize) {
                            if (!bestSplit || separator.priority > bestSeparator.priority) {
                                bestSplit = {
                                    position: splitPosition,
                                    text: beforeSplit,
                                    tokens: beforeTokens
                                };
                                bestSeparator = separator;
                            }
                        }
                    }
                }
            }

            if (bestSplit) {
                // Use the best split found
                segments.push({
                    text: bestSplit.text.trim(),
                    tokens: bestSplit.tokens,
                    separatorUsed: bestSeparator.name
                });
                
                remainingText = remainingText.substring(bestSplit.position).trim();
                currentPosition += bestSplit.position;
            } else {
                // No good split found, take maximum allowed length
                const maxChars = this.config.maxChunkSize * this.tokenRatio;
                const chunkText = remainingText.substring(0, maxChars);
                const lastSpace = chunkText.lastIndexOf(' ');
                
                const actualChunk = lastSpace > 0 ? chunkText.substring(0, lastSpace) : chunkText;
                
                segments.push({
                    text: actualChunk.trim(),
                    tokens: this.estimateTokens(actualChunk),
                    separatorUsed: 'force_split'
                });
                
                remainingText = remainingText.substring(actualChunk.length).trim();
            }
        }

        return segments;
    }

    forceSplitText(text, metadata, hierarchy, startPosition) {
        console.log(`⚠️ Force splitting oversized text (${this.estimateTokens(text)} tokens)`);
        
        const chunks = [];
        const maxChars = this.config.maxChunkSize * this.tokenRatio;
        let position = startPosition;

        for (let i = 0; i < text.length; i += maxChars) {
            let chunkText = text.substring(i, i + maxChars);
            
            // Try to end at a space
            if (i + maxChars < text.length) {
                const lastSpace = chunkText.lastIndexOf(' ');
                if (lastSpace > maxChars * 0.8) { // If space is reasonably close to end
                    chunkText = chunkText.substring(0, lastSpace);
                }
            }

            const chunk = this.createChunk({
                text: chunkText.trim(),
                metadata,
                position: position++,
                hierarchy,
                context: {
                    type: 'force_split',
                    partIndex: Math.floor(i / maxChars)
                }
            });
            
            chunks.push(chunk);
        }

        return chunks;
    }

    createChunk(options) {
        const { text, metadata, position, hierarchy, context } = options;
        
        const chunkId = this.generateChunkId(metadata, hierarchy, position);
        const tokens = this.estimateTokens(text);
        
        return {
            chunk_id: chunkId,
            text: text.trim(),
            tokens,
            position_in_doc: position,
            metadata: {
                // Document metadata
                doc_id: this.generateDocumentId(metadata),
                doc_title: metadata.title || '',
                doc_number: metadata.number || '',
                doc_date: metadata.date || '',
                doc_type: metadata.type || '',
                doc_status: metadata.status || 'vigente',
                source: metadata.source || '',
                
                // Hierarchy metadata
                ...hierarchy,
                
                // Context metadata
                chunk_type: context.type || 'text',
                hierarchy: this.buildHierarchyArray(hierarchy),
                topics: metadata.topics || [],
                references: this.extractChunkReferences(text)
            },
            overlap_with_previous: this.calculateOverlap(text, position),
            quality_score: this.calculateQualityScore(text, hierarchy, context)
        };
    }

    generateChunkId(metadata, hierarchy, position) {
        const docId = this.generateDocumentId(metadata);
        
        let hierarchyPart = '';
        if (hierarchy.article) {
            hierarchyPart += `_art${hierarchy.article}`;
        }
        if (hierarchy.comma) {
            hierarchyPart += `_comma${hierarchy.comma}`;
        }
        
        return `${docId}${hierarchyPart}_chunk${position}`;
    }

    generateDocumentId(metadata) {
        const type = (metadata.type || 'doc').toLowerCase();
        const number = (metadata.number || '').replace(/[\/\s]/g, '_');
        return `${metadata.source || 'unknown'}_${type}_${number}`;
    }

    buildHierarchyArray(hierarchy) {
        const hierarchyArray = ['documento'];
        
        if (hierarchy.article) {
            hierarchyArray.push('articolo');
        }
        if (hierarchy.comma) {
            hierarchyArray.push('comma');
        }
        if (hierarchy.letter) {
            hierarchyArray.push('lettera');
        }
        
        return hierarchyArray;
    }

    extractChunkReferences(text) {
        const references = [];
        
        // Find internal references
        const patterns = [
            /(?:vedasi|vedi|si rinvia|cfr\.)\s*(?:art\.|articolo)\s*(\d+)/gi,
            /(?:di cui all['']art\.|dell['']art\.)\s*(\d+)/gi,
            /comma\s*(\d+)/gi
        ];

        patterns.forEach((pattern, index) => {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                references.push({
                    type: index === 0 || index === 1 ? 'article_reference' : 'comma_reference',
                    target: match[1],
                    text: match[0]
                });
            });
        });

        return references;
    }

    calculateOverlap(text, position) {
        // For now, return 0 - could be enhanced to calculate actual overlap
        return position > 0 ? this.config.overlapSize : 0;
    }

    calculateQualityScore(text, hierarchy, context) {
        let score = 50; // Base score
        
        // Bonus for proper hierarchy
        if (hierarchy.article) score += 20;
        if (hierarchy.comma) score += 10;
        
        // Bonus for good size
        const tokens = this.estimateTokens(text);
        if (tokens >= this.config.minChunkSize && tokens <= this.config.maxChunkSize) {
            score += 15;
        }
        
        // Bonus for complete article
        if (context.type === 'complete_article') score += 10;
        
        // Penalty for force splits
        if (context.type === 'force_split') score -= 20;
        
        return Math.max(0, Math.min(100, score));
    }

    postProcessChunks(chunks, parsedDocument) {
        console.log(`🔧 Post-processing ${chunks.length} chunks...`);
        
        // Add overlap text where appropriate
        const processedChunks = chunks.map((chunk, index) => {
            if (index > 0 && chunk.overlap_with_previous > 0) {
                const prevChunk = chunks[index - 1];
                const overlapText = this.extractOverlapText(prevChunk.text, chunk.overlap_with_previous);
                
                if (overlapText) {
                    chunk.text = overlapText + ' ' + chunk.text;
                    chunk.tokens = this.estimateTokens(chunk.text);
                }
            }
            
            return chunk;
        });

        // Validate chunks
        const validChunks = processedChunks.filter(chunk => {
            const isValid = chunk.text.length > 20 && chunk.tokens > 10;
            if (!isValid) {
                console.log(`⚠️ Removing invalid chunk: ${chunk.chunk_id}`);
            }
            return isValid;
        });

        console.log(`✅ Post-processing complete: ${validChunks.length} valid chunks`);
        return validChunks;
    }

    extractOverlapText(previousText, overlapTokens) {
        const overlapChars = overlapTokens * this.tokenRatio;
        if (previousText.length <= overlapChars) {
            return previousText;
        }
        
        const startPos = previousText.length - overlapChars;
        const overlapText = previousText.substring(startPos);
        
        // Try to start at a sentence boundary
        const sentenceStart = overlapText.indexOf('. ');
        if (sentenceStart > 0 && sentenceStart < overlapChars * 0.3) {
            return overlapText.substring(sentenceStart + 2);
        }
        
        return overlapText;
    }

    estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / this.tokenRatio);
    }

    calculateChunkingStats(chunks) {
        const tokenCounts = chunks.map(chunk => chunk.tokens);
        
        return {
            totalChunks: chunks.length,
            totalTokens: tokenCounts.reduce((sum, tokens) => sum + tokens, 0),
            avgTokensPerChunk: Math.round(tokenCounts.reduce((sum, tokens) => sum + tokens, 0) / chunks.length),
            minTokens: Math.min(...tokenCounts),
            maxTokens: Math.max(...tokenCounts),
            chunksInTargetRange: chunks.filter(chunk => 
                chunk.tokens >= this.config.minChunkSize && chunk.tokens <= this.config.maxChunkSize
            ).length,
            qualityScores: {
                avg: Math.round(chunks.reduce((sum, chunk) => sum + chunk.quality_score, 0) / chunks.length),
                min: Math.min(...chunks.map(chunk => chunk.quality_score)),
                max: Math.max(...chunks.map(chunk => chunk.quality_score))
            }
        };
    }

    // Test method
    testChunking(parsedDocument) {
        console.log('🧪 Testing legal chunker...');
        
        const result = this.chunkDocument(parsedDocument);
        
        console.log('📊 Chunking Results:');
        console.log(`   - Total chunks: ${result.chunks.length}`);
        console.log(`   - Strategy: ${result.chunkingStrategy}`);
        console.log(`   - Avg tokens/chunk: ${result.stats.avgTokensPerChunk}`);
        console.log(`   - Token range: ${result.stats.minTokens}-${result.stats.maxTokens}`);
        console.log(`   - Quality score: ${result.stats.qualityScores.avg}/100`);
        console.log(`   - Chunks in target range: ${result.stats.chunksInTargetRange}/${result.stats.totalChunks}`);
        
        return result;
    }
}