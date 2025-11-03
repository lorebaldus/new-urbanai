// Response Generator - Enhanced Multi-Source Response Formatting
// Formats responses with legal citations, disclaimers, and source attribution

export class ResponseGenerator {
    constructor(config = {}) {
        this.config = {
            // Content formatting
            maxAnswerLength: 2000,
            maxExcerptLength: 200,
            maxSources: 8,
            
            // Citation formatting
            includeCitations: true,
            includeUrls: true,
            formatCitations: true,
            
            // Follow-up generation
            maxFollowUps: 4,
            enableFollowUps: true,
            
            // Legal disclaimer
            enableLegalDisclaimer: true,
            disclaimerVersion: '1.0',
            
            // Performance tracking
            trackResponseMetrics: true,
            
            ...config
        };

        // URL patterns for different document sources
        this.sourceUrlPatterns = {
            'laws-national': 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:{year}:{number}',
            'laws-regional': 'https://www.regione.{region}.it/normativa/{number}',
            'jurisprudence': 'https://www.giustizia-amministrativa.it/cdsintra/cdsintra/AmministrazionePortale/DocumentViewer/{id}',
            'urbanistica-base': null // Internal knowledge base
        };

        // Legal disclaimer templates
        this.disclaimerTemplates = {
            full: `⚖️ **Disclaimer Legale**\n\n` +
                  `Questa risposta ha valore puramente informativo e non costituisce consulenza legale professionale. ` +
                  `Per applicazioni specifiche, interpretazioni vincolanti e pareri legalmente rilevanti, ` +
                  `si consiglia di consultare un professionista abilitato (avvocato, urbanista, ingegnere).\n\n` +
                  `📚 **Fonti consultate**: normattiva.it, gazzettaufficiale.it, database giurisprudenziale\n` +
                  `📅 **Ultimo aggiornamento**: {lastUpdate}\n` +
                  `🔄 **Versione database**: {dbVersion}`,
            
            minimal: `⚖️ Informazioni a scopo orientativo. Per pareri legali consultare un professionista abilitato.`,
            
            regional: `⚖️ **Disclaimer Legale**\n\n` +
                      `Le informazioni regionali potrebbero non essere aggiornate. ` +
                      `Verificare sempre sul Bollettino Ufficiale Regionale (BUR) per la normativa più recente.`
        };

        console.log(`📝 ResponseGenerator initialized - Max sources: ${this.config.maxSources}, Citations: ${this.config.includeCitations}`);
    }

    generateResponse(queryText, searchResults, classification, metadata = {}) {
        const startTime = Date.now();
        
        console.log(`📝 Generating response for strategy: ${classification.strategy}`);
        console.log(`📊 Processing ${searchResults.length} search results`);

        try {
            // Step 1: Extract and rank sources
            const processedSources = this.processSearchResults(searchResults, classification);
            
            // Step 2: Generate main answer
            const answer = this.generateAnswer(queryText, processedSources, classification);
            
            // Step 3: Calculate confidence
            const confidence = this.calculateConfidence(processedSources, classification);
            
            // Step 4: Format sources for display
            const formattedSources = this.formatSources(processedSources, classification);
            
            // Step 5: Generate legal disclaimer if needed
            const legalDisclaimer = classification.needsLegalDisclaimer 
                ? this.generateLegalDisclaimer(classification, processedSources)
                : null;
            
            // Step 6: Generate follow-up suggestions
            const followUps = this.config.enableFollowUps 
                ? this.generateFollowUps(queryText, processedSources, classification)
                : [];

            // Step 7: Create response metadata
            const responseMetadata = this.generateResponseMetadata(
                classification, 
                processedSources, 
                startTime, 
                metadata
            );

            const response = {
                answer,
                confidence,
                sources: formattedSources,
                legal_disclaimer: legalDisclaimer,
                follow_up: followUps,
                metadata: responseMetadata
            };

            console.log(`✅ Response generated in ${Date.now() - startTime}ms`);
            console.log(`📋 Answer length: ${answer.length} chars, Sources: ${formattedSources.length}, Confidence: ${confidence.toFixed(2)}`);

            return response;

        } catch (error) {
            console.error(`❌ Response generation failed:`, error.message);
            
            // Return minimal error response
            return {
                answer: "Mi dispiace, si è verificato un errore nella generazione della risposta. Riprova più tardi.",
                confidence: 0.0,
                sources: [],
                legal_disclaimer: classification.needsLegalDisclaimer ? this.disclaimerTemplates.minimal : null,
                follow_up: [],
                metadata: {
                    error: error.message,
                    strategy: classification.strategy,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    processSearchResults(searchResults, classification) {
        // Sort by relevance score
        const sortedResults = [...searchResults].sort((a, b) => b.score - a.score);
        
        // Limit to max sources
        const limitedResults = sortedResults.slice(0, this.config.maxSources);
        
        // Enhance each result with additional metadata
        return limitedResults.map((result, index) => ({
            ...result,
            rank: index + 1,
            relevanceCategory: this.categorizeRelevance(result.score),
            sourceType: this.determineSourceType(result, classification),
            processedMetadata: this.processResultMetadata(result.metadata || {})
        }));
    }

    generateAnswer(queryText, sources, classification) {
        if (sources.length === 0) {
            return this.generateNoResultsAnswer(queryText, classification);
        }

        // Extract key information from top sources
        const topSources = sources.slice(0, 3);
        let answer = "";

        // Generate answer based on strategy
        switch (classification.strategy) {
            case 'comprehensive':
                answer = this.generateComprehensiveAnswer(queryText, topSources);
                break;
            case 'legal-urban':
                answer = this.generateLegalUrbanAnswer(queryText, topSources);
                break;
            case 'regional-focus':
                answer = this.generateRegionalAnswer(queryText, topSources, classification);
                break;
            case 'legal-only':
                answer = this.generateLegalAnswer(queryText, topSources);
                break;
            case 'urban-only':
                answer = this.generateUrbanAnswer(queryText, topSources);
                break;
            default:
                answer = this.generateDefaultAnswer(queryText, topSources);
        }

        // Ensure answer doesn't exceed max length
        if (answer.length > this.config.maxAnswerLength) {
            answer = answer.substring(0, this.config.maxAnswerLength - 3) + '...';
        }

        return answer;
    }

    generateComprehensiveAnswer(queryText, sources) {
        const legalSources = sources.filter(s => s.sourceType === 'legal');
        const regionalSources = sources.filter(s => s.sourceType === 'regional');
        const urbanSources = sources.filter(s => s.sourceType === 'urban');

        let answer = "Basandomi sulla normativa vigente e sui principi urbanistici:\n\n";
        
        if (legalSources.length > 0) {
            answer += "**📚 Aspetti normativi:**\n";
            answer += this.extractKeyContent(legalSources.slice(0, 2));
            answer += "\n\n";
        }
        
        if (regionalSources.length > 0) {
            answer += "**🌍 Normativa regionale:**\n";
            answer += this.extractKeyContent(regionalSources.slice(0, 1));
            answer += "\n\n";
        }
        
        if (urbanSources.length > 0) {
            answer += "**🏗️ Applicazione urbanistica:**\n";
            answer += this.extractKeyContent(urbanSources.slice(0, 2));
        }

        return answer.trim();
    }

    generateLegalUrbanAnswer(queryText, sources) {
        let answer = "Dal punto di vista normativo e urbanistico:\n\n";
        
        const topLegal = sources.find(s => s.sourceType === 'legal');
        const topUrban = sources.find(s => s.sourceType === 'urban');
        
        if (topLegal) {
            answer += "**⚖️ Quadro normativo:**\n";
            answer += this.extractKeyContent([topLegal]);
            answer += "\n\n";
        }
        
        if (topUrban) {
            answer += "**🏙️ Applicazione urbanistica:**\n";
            answer += this.extractKeyContent([topUrban]);
        }

        return answer.trim();
    }

    generateRegionalAnswer(queryText, sources, classification) {
        const region = classification.query_analysis?.extracted_region;
        let answer = region 
            ? `Per la normativa della regione ${this.getRegionName(region)}:\n\n`
            : "Secondo la normativa regionale applicabile:\n\n";
        
        answer += this.extractKeyContent(sources.slice(0, 2));
        
        if (region) {
            answer += `\n\n💡 *Verifica sempre sul Bollettino Ufficiale della Regione ${this.getRegionName(region)} per gli aggiornamenti più recenti.*`;
        }

        return answer;
    }

    generateLegalAnswer(queryText, sources) {
        let answer = "Secondo la normativa vigente:\n\n";
        answer += this.extractKeyContent(sources.slice(0, 2));
        
        // Add reference to specific articles if available
        const articleRefs = this.extractArticleReferences(sources);
        if (articleRefs.length > 0) {
            answer += "\n\n**📖 Riferimenti normativi specifici:**\n";
            answer += articleRefs.join('\n');
        }

        return answer;
    }

    generateUrbanAnswer(queryText, sources) {
        let answer = "Dal punto di vista urbanistico:\n\n";
        answer += this.extractKeyContent(sources);
        return answer;
    }

    generateDefaultAnswer(queryText, sources) {
        let answer = "Basandomi sulle informazioni disponibili:\n\n";
        answer += this.extractKeyContent(sources.slice(0, 2));
        return answer;
    }

    generateNoResultsAnswer(queryText, classification) {
        let answer = "Mi dispiace, non ho trovato informazioni specifiche per la tua richiesta";
        
        if (classification.strategy.includes('legal')) {
            answer += " nella normativa consultata";
        } else if (classification.strategy.includes('regional')) {
            answer += " per la specifica normativa regionale";
        }
        
        answer += ". Ti suggerisco di:\n\n";
        answer += "• Riformulare la domanda con termini più specifici\n";
        answer += "• Consultare direttamente le fonti normative ufficiali\n";
        answer += "• Richiedere consulenza a un professionista abilitato";

        return answer;
    }

    extractKeyContent(sources) {
        return sources.map(source => {
            const metadata = source.processedMetadata;
            const content = this.extractContentPreview(source, this.config.maxExcerptLength);
            
            let excerpt = content;
            if (metadata.article_number) {
                excerpt = `Art. ${metadata.article_number}: ${content}`;
            }
            
            return `• ${excerpt}`;
        }).join('\n');
    }

    extractContentPreview(source, maxLength = 200) {
        const content = source.metadata?.text || 
                       source.metadata?.content || 
                       source.metadata?.article_content ||
                       'Contenuto non disponibile';
        
        if (content.length <= maxLength) {
            return content;
        }
        
        // Try to cut at sentence boundary
        const truncated = content.substring(0, maxLength);
        const lastPeriod = truncated.lastIndexOf('.');
        
        if (lastPeriod > maxLength * 0.7) {
            return truncated.substring(0, lastPeriod + 1);
        }
        
        return truncated + '...';
    }

    extractArticleReferences(sources) {
        const refs = [];
        
        sources.forEach(source => {
            const meta = source.processedMetadata;
            if (meta.document_number && meta.article_number) {
                const ref = `${meta.document_type || 'Legge'} ${meta.document_number}, Art. ${meta.article_number}`;
                if (!refs.includes(ref)) {
                    refs.push(ref);
                }
            }
        });

        return refs;
    }

    calculateConfidence(sources, classification) {
        if (sources.length === 0) return 0.1;
        
        // Base confidence from classification
        let confidence = classification.confidence || 0.5;
        
        // Boost confidence based on source quality
        const avgScore = sources.reduce((sum, s) => sum + s.score, 0) / sources.length;
        confidence = Math.min(confidence + (avgScore * 0.3), 0.95);
        
        // Adjust for number of sources
        if (sources.length >= 3) confidence += 0.05;
        if (sources.length >= 5) confidence += 0.05;
        
        // Penalty for low relevance
        if (avgScore < 0.7) confidence *= 0.8;
        
        return Math.max(0.1, Math.min(0.95, confidence));
    }

    formatSources(sources, classification) {
        return sources.map(source => ({
            type: source.sourceType,
            title: this.formatSourceTitle(source),
            citation: this.formatCitation(source),
            url: this.generateSourceUrl(source),
            relevance: Number(source.score.toFixed(3)),
            excerpt: this.extractContentPreview(source, this.config.maxExcerptLength),
            metadata: {
                namespace: source.source_namespace,
                article: source.processedMetadata.article_number || null,
                document_number: source.processedMetadata.document_number || null,
                date: source.processedMetadata.document_date || null,
                quality_score: source.processedMetadata.quality_score || null
            }
        }));
    }

    formatSourceTitle(source) {
        const meta = source.processedMetadata;
        
        if (meta.document_title) {
            return meta.document_title;
        }
        
        if (meta.article_title && meta.document_number) {
            return `${meta.document_type || 'Documento'} ${meta.document_number} - ${meta.article_title}`;
        }
        
        if (meta.document_number) {
            return `${meta.document_type || 'Documento'} ${meta.document_number}`;
        }
        
        return meta.article_title || 'Documento senza titolo';
    }

    formatCitation(source) {
        if (!this.config.formatCitations) return null;
        
        const meta = source.processedMetadata;
        let citation = '';
        
        if (meta.document_number) {
            citation += `${meta.document_type || 'Doc.'} ${meta.document_number}`;
            
            if (meta.document_date) {
                const year = new Date(meta.document_date).getFullYear();
                citation += ` (${year})`;
            }
            
            if (meta.article_number) {
                citation += `, Art. ${meta.article_number}`;
            }
        }
        
        return citation || null;
    }

    generateSourceUrl(source) {
        if (!this.config.includeUrls) return null;
        
        const namespace = source.source_namespace;
        const meta = source.processedMetadata;
        
        // Return null for internal knowledge base
        if (namespace === 'urbanistica-base') return null;
        
        // Generate URLs based on namespace
        if (namespace === 'laws-national' && meta.document_number) {
            const year = meta.document_date ? new Date(meta.document_date).getFullYear() : '';
            return `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:${year}:${meta.document_number}`;
        }
        
        // For now, return generic normattiva.it URL
        return 'https://www.normattiva.it';
    }

    generateLegalDisclaimer(classification, sources) {
        if (!this.config.enableLegalDisclaimer) return null;
        
        const hasRegionalSources = sources.some(s => s.sourceType === 'regional');
        
        let template = this.disclaimerTemplates.full;
        if (hasRegionalSources) {
            template = this.disclaimerTemplates.regional;
        }
        
        return template
            .replace('{lastUpdate}', this.getLastUpdateDate())
            .replace('{dbVersion}', this.config.disclaimerVersion);
    }

    generateFollowUps(queryText, sources, classification) {
        const followUps = [];
        
        // Strategy-based follow-ups
        if (classification.strategy === 'legal-urban') {
            followUps.push(
                "Vuoi approfondire i requisiti procedurali specifici?",
                "Ti interessa la normativa regionale per la tua zona?"
            );
        } else if (classification.strategy === 'regional-focus') {
            followUps.push(
                "Vuoi confrontare con la normativa nazionale?",
                "Ti servono informazioni su altre regioni?"
            );
        } else if (classification.strategy === 'legal-only') {
            followUps.push(
                "Vuoi vedere come si applica in pratica urbanistica?",
                "Ti interessa la giurisprudenza correlata?"
            );
        }
        
        // Source-based follow-ups
        const documentTypes = [...new Set(sources.map(s => s.processedMetadata.document_type))];
        if (documentTypes.length > 1) {
            followUps.push("Vuoi approfondire un tipo specifico di normativa?");
        }
        
        // Generic helpful follow-ups
        followUps.push(
            "Hai bisogno di chiarimenti su punti specifici?",
            "Vuoi esempi pratici di applicazione?"
        );
        
        return followUps.slice(0, this.config.maxFollowUps);
    }

    generateResponseMetadata(classification, sources, startTime, inputMetadata) {
        const endTime = Date.now();
        
        return {
            strategy: classification.strategy,
            namespaces_searched: classification.namespaces,
            sources_found: sources.length,
            confidence_score: this.calculateConfidence(sources, classification),
            response_time_ms: endTime - startTime,
            has_legal_content: classification.needsLegalDisclaimer,
            timestamp: new Date().toISOString(),
            query_analysis: classification.query_analysis,
            ...inputMetadata
        };
    }

    // Utility methods
    categorizeRelevance(score) {
        if (score >= 0.8) return 'high';
        if (score >= 0.6) return 'medium';
        if (score >= 0.4) return 'low';
        return 'very_low';
    }

    determineSourceType(result, classification) {
        const namespace = result.source_namespace;
        
        if (namespace === 'laws-national' || namespace === 'laws-regional') {
            return 'legal';
        } else if (namespace === 'laws-regional') {
            return 'regional';
        } else if (namespace === 'jurisprudence') {
            return 'jurisprudence';
        } else {
            return 'urban';
        }
    }

    processResultMetadata(metadata) {
        return {
            document_type: metadata.document_type || metadata.doc_type || '',
            document_title: metadata.document_title || metadata.doc_title || '',
            document_number: metadata.document_number || metadata.doc_number || '',
            document_date: metadata.document_date || metadata.doc_date || '',
            article_number: metadata.article_number || '',
            article_title: metadata.article_title || '',
            quality_score: metadata.quality_score || 0,
            text: metadata.text || metadata.content || ''
        };
    }

    getRegionName(regionCode) {
        const regionNames = {
            'LOM': 'Lombardia',
            'LAZ': 'Lazio',
            'VEN': 'Veneto',
            'PIE': 'Piemonte',
            'CAM': 'Campania',
            'SIC': 'Sicilia',
            'EMR': 'Emilia-Romagna',
            'TOS': 'Toscana',
            'PUG': 'Puglia',
            'CAL': 'Calabria',
            'SAR': 'Sardegna',
            'LIG': 'Liguria',
            'MAR': 'Marche',
            'ABR': 'Abruzzo',
            'UMB': 'Umbria',
            'BAS': 'Basilicata',
            'MOL': 'Molise',
            'FRI': 'Friuli-Venezia Giulia',
            'TRE': 'Trentino-Alto Adige',
            'VDA': 'Valle d\'Aosta'
        };
        
        return regionNames[regionCode] || regionCode;
    }

    getLastUpdateDate() {
        // In production, this would come from database
        return new Date().toISOString().split('T')[0];
    }

    // Health check and diagnostics
    validateResponse(response) {
        const errors = [];
        
        if (!response.answer || response.answer.length < 10) {
            errors.push('Answer too short or missing');
        }
        
        if (response.confidence < 0 || response.confidence > 1) {
            errors.push('Invalid confidence score');
        }
        
        if (!Array.isArray(response.sources)) {
            errors.push('Sources must be an array');
        }
        
        if (!Array.isArray(response.follow_up)) {
            errors.push('Follow-up must be an array');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    getGeneratorStats() {
        return {
            config: this.config,
            disclaimer_templates: Object.keys(this.disclaimerTemplates),
            source_url_patterns: Object.keys(this.sourceUrlPatterns)
        };
    }
}