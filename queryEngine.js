const OpenAI = require('openai');

class QueryEngine {
    constructor(openaiApiKey, vectorStore) {
        this.openai = new OpenAI({
            apiKey: openaiApiKey
        });
        this.vectorStore = vectorStore;
        this.model = 'gpt-4o-mini';
    }

    async query(question, options = {}) {
        try {
            const {
                topK = 5,
                includeContext = true,
                systemPrompt = this.getDefaultSystemPrompt()
            } = options;

            console.log(`Processing query: "${question}"`);

            // Retrieve relevant documents
            const relevantDocs = await this.vectorStore.query(question, topK);
            
            if (relevantDocs.length === 0) {
                return {
                    answer: "Mi dispiace, non ho trovato informazioni rilevanti nei documenti per rispondere alla tua domanda.",
                    sources: [],
                    confidence: 0
                };
            }

            // Prepare context from retrieved documents
            const context = relevantDocs.map((doc, index) => 
                `[Documento ${index + 1}] ${doc.text}`
            ).join('\n\n');

            // Create the prompt
            const userPrompt = this.createUserPrompt(question, context, includeContext);

            // Generate response
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 1000
            });

            const answer = response.choices[0].message.content;

            // Calculate average confidence score
            const avgConfidence = relevantDocs.reduce((sum, doc) => sum + doc.score, 0) / relevantDocs.length;

            return {
                answer,
                sources: relevantDocs.map(doc => ({
                    source: doc.source,
                    snippet: doc.text.substring(0, 200) + '...',
                    score: doc.score
                })),
                confidence: avgConfidence,
                context: includeContext ? context : null
            };

        } catch (error) {
            console.error('Error processing query:', error);
            throw error;
        }
    }

    getDefaultSystemPrompt() {
        return `Sei un assistente AI specializzato nell'analisi di documenti normativi urbani e pianificazione territoriale.

Il tuo compito è rispondere alle domande degli utenti basandoti esclusivamente sulle informazioni contenute nei documenti forniti come contesto.

Linee guida per le risposte:
1. Rispondi sempre in italiano
2. Basa le tue risposte SOLO sui documenti forniti nel contesto
3. Se le informazioni non sono sufficienti, dichiara chiaramente che non hai informazioni sufficienti
4. Sii preciso e cita specificamente i documenti quando possibile
5. Struttura le risposte in modo chiaro e professionale
6. Se richiesto, fornisci riferimenti normativi specifici
7. Mantieni un tono formale ma accessibile

Se una domanda non può essere risposta con le informazioni disponibili, rispondi onestamente che non hai informazioni sufficienti nei documenti forniti.`;
    }

    createUserPrompt(question, context, includeContext) {
        let prompt = `Basandoti sui seguenti documenti, rispondi alla domanda dell'utente:

CONTESTO DAI DOCUMENTI:
${context}

DOMANDA: ${question}

RISPOSTA:`;

        return prompt;
    }

    async summarizeDocument(documentPath) {
        try {
            const chunks = await this.vectorStore.query(
                "riassumi il contenuto principale di questo documento", 
                10
            );

            if (chunks.length === 0) {
                return "Nessun contenuto trovato per questo documento.";
            }

            const context = chunks.map(chunk => chunk.text).join('\n\n');

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Sei un esperto in documenti normativi urbani. Crea un riassunto strutturato e dettagliato del documento fornito.'
                    },
                    {
                        role: 'user',
                        content: `Riassumi questo documento in modo strutturato, evidenziando i punti principali, le normative chiave e le informazioni più rilevanti:\n\n${context}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            });

            return response.choices[0].message.content;

        } catch (error) {
            console.error('Error summarizing document:', error);
            throw error;
        }
    }

    async extractKeyPoints(topic) {
        try {
            const relevantDocs = await this.vectorStore.query(topic, 8);

            if (relevantDocs.length === 0) {
                return `Nessuna informazione trovata per l'argomento: ${topic}`;
            }

            const context = relevantDocs.map(doc => doc.text).join('\n\n');

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Sei un esperto in normative urbane. Estrai e organizza i punti chiave relativi all\'argomento richiesto.'
                    },
                    {
                        role: 'user',
                        content: `Estrai e organizza i punti chiave relativi a "${topic}" dai seguenti documenti:\n\n${context}\n\nOrganizza la risposta con bullet points chiari e strutturati.`
                    }
                ],
                temperature: 0.2,
                max_tokens: 1200
            });

            return {
                topic,
                keyPoints: response.choices[0].message.content,
                sources: relevantDocs.map(doc => ({
                    source: doc.source,
                    score: doc.score
                }))
            };

        } catch (error) {
            console.error('Error extracting key points:', error);
            throw error;
        }
    }
}

module.exports = QueryEngine;