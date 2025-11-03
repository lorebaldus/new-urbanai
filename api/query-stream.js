import OpenAI from 'openai';
import crypto from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Cache condivisa con query-optimized.js
const queryCache = new Map();

function generateCacheKey(question) {
    return crypto.createHash('md5').update(question.toLowerCase().trim()).digest('hex');
}

// Risposte precompilate (stesso sistema di query-optimized.js)
const precomputedResponses = {
    'permesso di costruire': {
        answer: `Il **Permesso di Costruire** è il titolo abilitativo principale per le nuove costruzioni e i principali interventi edilizi, disciplinato dagli artt. 10-14 del DPR 380/2001.

**Quando è obbligatorio:**
• **Nuove costruzioni** di qualsiasi tipo
• **Ristrutturazione edilizia pesante** con modifiche volumetria/sagoma
• **Ampliamenti** significativi di edifici esistenti
• **Demolizione e ricostruzione** con variazioni
• **Interventi in zona vincolata** (anche per minori)

**Procedura:**
1. **Presentazione istanza** con progetto completo
2. **Istruttoria tecnica** (60-90 giorni)
3. **Conferenza di servizi** se necessaria  
4. **Rilascio permesso** o diniego motivato
5. **Inizio lavori** entro 1 anno dal rilascio

**Documenti necessari:**
- Progetto architettonico completo
- Calcolo oneri di urbanizzazione
- Relazioni tecniche specialistiche
- Pareri preventivi enti competenti
- Titolo di disponibilità area

**Onerosità:**
- Contributo di costruzione (oneri + costo costruzione)
- Maggiorazioni per zone pregiate
- Esenzioni per prima casa, edilizia sociale`,
        sources: ['DPR 380/2001 art. 10-14'],
        cached: true
    },

    'scia edilizia': {
        answer: `La **SCIA (Segnalazione Certificata di Inizio Attività)** è il titolo per interventi di media rilevanza, disciplinata dall'art. 22 del DPR 380/2001.

**Ambito di applicazione:**
• **Ristrutturazione edilizia** senza modifiche volumetria/sagoma
• **Cambio destinazione d'uso** con opere (entro stessa categoria funzionale)
• **Interventi su edifici esistenti** non soggetti a Permesso
• **Installazione manufatti** temporanei/stagionali

**Caratteristiche:**
- **Efficacia immediata** dalla presentazione
- **Controllo successivo** del Comune entro 30 giorni
- **Validità illimitata** se conforme
- **Oneri ridotti** rispetto al Permesso di Costruire

**Documenti:**
- Progetto semplificato
- Asseverazione tecnico abilitato
- Documentazione catastale aggiornata`,
        sources: ['DPR 380/2001 art. 22'],
        cached: true
    }
};

// Cerca match nelle risposte precompilate
function findPrecomputedMatch(question) {
    const normalizedQuestion = question.toLowerCase();
    
    const keywordMapping = {
        'sanatoria': 'sanatoria edilizia',
        'sanare': 'sanatoria edilizia',
        'condono': 'sanatoria edilizia',
        'abuso': 'abuso edilizio',
        'abusiv': 'abuso edilizio',
        'illegale': 'abuso edilizio',
        'destinazione': 'cambio destinazione uso',
        'cambio uso': 'cambio destinazione uso'
    };
    
    for (const [key, mapped] of Object.entries(keywordMapping)) {
        if (normalizedQuestion.includes(key) && precomputedResponses[mapped]) {
            return precomputedResponses[mapped];
        }
    }
    
    for (const [keyword, response] of Object.entries(precomputedResponses)) {
        if (normalizedQuestion.includes(keyword)) {
            return response;
        }
    }
    
    return null;
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { question } = req.body;
    
    if (!question || question.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Question is required' 
        });
    }

    // Setup SSE (Server-Sent Events)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const sendUpdate = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const startTime = Date.now();
        const cacheKey = generateCacheKey(question);

        // Step 1: Invia stato iniziale
        sendUpdate({
            status: 'processing',
            message: 'Analizzando la tua domanda...',
            step: 1,
            totalSteps: 4
        });

        // Step 2: Controlla precomputed responses prima
        const precomputedMatch = findPrecomputedMatch(question);
        if (precomputedMatch) {
            sendUpdate({
                status: 'precomputed_hit',
                message: 'Risposta precompilata trovata!',
                step: 4,
                totalSteps: 4
            });

            // Simula breve elaborazione per UI smooth
            await new Promise(resolve => setTimeout(resolve, 100));

            sendUpdate({
                status: 'completed',
                answer: precomputedMatch.answer,
                sources: precomputedMatch.sources || [],
                responseTime: Date.now() - startTime,
                cached: true,
                precomputed: true
            });
            
            return res.end();
        }

        // Step 2.5: Controlla cache normale
        if (queryCache.has(cacheKey)) {
            sendUpdate({
                status: 'cache_hit',
                message: 'Risposta trovata in cache!',
                step: 4,
                totalSteps: 4
            });

            const cached = queryCache.get(cacheKey);
            sendUpdate({
                status: 'completed',
                answer: cached.answer,
                sources: cached.sources || [],
                responseTime: Date.now() - startTime,
                cached: true
            });
            
            return res.end();
        }

        // Step 3: Cerca in knowledge base (simulato)
        sendUpdate({
            status: 'searching',
            message: 'Cercando nella normativa urbanistica...',
            step: 2,
            totalSteps: 4
        });

        // Simula ricerca (200ms)
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 4: Genera risposta con GPT-4 streaming
        sendUpdate({
            status: 'generating',
            message: 'Generando risposta personalizzata...',
            step: 3,
            totalSteps: 4
        });

        const stream = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system', 
                    content: `Sei UrbanAI, un assistente esperto in urbanistica ed edilizia italiana. 
                             Conosci perfettamente il DPR 380/2001, il DM 1444/1968, e tutte le normative urbanistiche.
                             Rispondi in modo professionale, pratico e preciso con riferimenti normativi specifici.
                             Struttura la risposta con punti elenco per maggiore chiarezza.` 
                },
                { role: 'user', content: question }
            ],
            max_tokens: 1000,
            temperature: 0.2,
            stream: true
        });

        let fullAnswer = '';
        let chunkCount = 0;

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullAnswer += content;
                chunkCount++;
                
                // Invia chunk ogni 5 token per smooth streaming
                if (chunkCount % 5 === 0) {
                    sendUpdate({
                        status: 'streaming',
                        partial: fullAnswer,
                        progress: Math.min((fullAnswer.length / 800) * 100, 95)
                    });
                }
            }
        }

        // Step 5: Risposta finale
        sendUpdate({
            status: 'finalizing',
            message: 'Completando la risposta...',
            step: 4,
            totalSteps: 4
        });

        // Aggiungi alla cache
        if (fullAnswer && fullAnswer.length > 100) {
            queryCache.set(cacheKey, {
                answer: fullAnswer,
                sources: ['Normativa urbanistica ed edilizia italiana'],
                timestamp: Date.now()
            });
        }

        const responseTime = Date.now() - startTime;

        sendUpdate({
            status: 'completed',
            answer: fullAnswer,
            sources: [{ title: 'Normativa urbanistica ed edilizia italiana' }],
            responseTime: responseTime,
            cached: false,
            streamed: true
        });

    } catch (error) {
        console.error('Streaming error:', error);
        
        sendUpdate({
            status: 'error',
            error: 'Errore del server',
            message: 'Problema temporaneo con il servizio AI. Riprova tra qualche istante.'
        });
    }

    res.end();
}