import OpenAI from 'openai';
import crypto from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// In-memory cache per le query frequenti
const queryCache = new Map();
const cacheStats = { hits: 0, misses: 0 };

// Cache timeout (30 minuti)
const CACHE_TTL = 30 * 60 * 1000;

// Risposte precompilate per query urbanistiche comuni
const precomputedResponses = {
    // DPR 380/2001 - Testo Unico Edilizia
    'permesso di costruire': {
        answer: `Il **Permesso di Costruire** è il titolo abilitativo principale previsto dal DPR 380/2001 (Testo Unico Edilizia). È obbligatorio per:

• **Nuove costruzioni**
• **Ampliamenti superiori al 20% del volume esistente** 
• **Ristrutturazioni edilizie pesanti** con modifiche strutturali
• **Cambio di destinazione d'uso** con opere edilizie

**Procedura:**
1. Presentazione domanda al Comune con progetto
2. Istruttoria tecnica (30-60 giorni)
3. Rilascio permesso con oneri di urbanizzazione
4. Validità 3 anni (prorogabile 1 volta)

**Documenti richiesti:**
- Progetto architettonico e strutturale
- Relazione tecnica
- Titolo di proprietà o disponibilità
- Calcolo oneri urbanizzazione`,
        sources: ['DPR 380/2001 art. 10-14'],
        cached: true
    },
    
    'scia edilizia': {
        answer: `La **SCIA (Segnalazione Certificata di Inizio Attività)** è il titolo per interventi di media complessità, disciplinata dall'art. 22 del DPR 380/2001.

**Ambito di applicazione:**
• **Ristrutturazione edilizia leggera** senza modifiche strutturali
• **Manutenzione straordinaria** con modifiche prospetti  
• **Frazionamenti e accorpamenti** di unità immobiliari
• **Cambio d'uso** senza opere edilizie
• **Ampliamenti fino al 20%** del volume esistente

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
    },

    'cila edilizia': {
        answer: `La **CILA (Comunicazione di Inizio Lavori Asseverata)** è il titolo più semplice per interventi edilizi minori, introdotta dall'art. 6-bis del DPR 380/2001.

**Ambito di applicazione:**
• **Manutenzione straordinaria** senza modifiche prospetti
• **Eliminazione barriere architettoniche**
• **Installazione impianti tecnologici**
• **Opere interne** senza modifiche strutturali
• **Frazionamenti senza opere edilizie**

**Vantaggi:**
- **Procedura semplificata** con sola comunicazione
- **Costi ridotti** (solo diritti di segreteria)
- **Tempi rapidi** - operatività immediata
- **Controlli limitati** da parte del Comune

**Documenti richiesti:**
- Relazione asseverata tecnico abilitato
- Elaborati grafici stato di fatto/progetto
- Comunicazione inizio lavori`,
        sources: ['DPR 380/2001 art. 6-bis'],
        cached: true
    },

    'super bonus 110': {
        answer: `Il **Superbonus 110%** è l'incentivo fiscale per efficientamento energetico e antisismico degli edifici, disciplinato dall'art. 119 del DL 34/2020.

**Requisiti principali:**
• **Interventi trainanti** obbligatori (cappotto, caldaia, sisma bonus)
• **Miglioramento di 2 classi energetiche** APE
• **Conformità edilizia** dell'immobile
• **Asseverazioni tecniche** e visto conformità

**Beneficiari:**
- Condomini e persone fisiche
- IACP e cooperative
- ONLUS e associazioni sportive

**Scadenze attuali:**
- **Condomini**: 110% fino a 31/12/2023, poi riduzione graduale
- **Villette**: 110% fino a 30/09/2022 (con SAL 30%)
- **IACP**: proroga fino al 2025

**Interventi ammessi:**
- Isolamento termico (cappotto)
- Sostituzione impianti climatizzazione  
- Interventi antisismici
- Fotovoltaico + storage (se con trainanti)`,
        sources: ['DL 34/2020 art. 119', 'Guida Agenzia Entrate'],
        cached: true
    },

    'distanze tra edifici': {
        answer: `Le **distanze tra edifici** sono disciplinate dal **Codice Civile art. 873** e dal **DM 1444/1968**, con possibili deroghe nei regolamenti edilizi comunali.

**Normativa generale:**
• **Distanza minima 10 metri** tra pareti finestrate
• **Distanza 3 metri** per pareti non finestrate  
• **Nelle zone A** (centri storici): distanze preesistenti
• **Nuove costruzioni**: rispetto distanze maggiori esistenti

**Casi particolari:**
- **Aderenza o distacco**: costruzione in aderenza o rispetto distanze
- **Altezze diverse**: calcolo su parete più alta
- **Balconi e sporti**: computati nelle distanze se > 1,5m

**Deroghe comunali:**
- Regolamenti edilizi possono prevedere distanze superiori
- Zone di completamento: possibili riduzioni con consenso
- Piani attuativi: distanze stabilite in sede di approvazione

**Sanzioni:**
- Demolizione opere abusive
- Risarcimento danni al vicino
- Riduzione in pristino a spese del trasgressore`,
        sources: ['Codice Civile art. 873', 'DM 1444/1968'],
        cached: true
    },

    'cambio destinazione uso': {
        answer: `Il **cambio di destinazione d'uso** è disciplinato dall'art. 23-ter del DPR 380/2001 e può essere:

**Tipologie:**
• **Senza opere**: semplice comunicazione al Comune (se funzionalmente compatibile)
• **Con opere**: richiede titolo abilitativo (SCIA, Permesso di Costruire)
• **Con aumento carico urbanistico**: sempre soggetto a Permesso

**Categorie funzionali (DPR 380/2001):**
1. Residenziale
2. Produttiva e direzionale  
3. Commerciale
4. Turistica e ricettiva
5. Culturale e di culto

**Requisiti:**
- **Conformità igienico-sanitaria** ai nuovi standard
- **Dotazioni minime** parcheggi e spazi pubblici
- **Compatibilità urbanistica** con zona di appartenenza
- **Oneri di urbanizzazione** aggiuntivi se dovuti

**Procedure:**
- **Comunicazione**: per cambio senza opere tra categorie compatibili
- **SCIA**: per cambio con opere non strutturali
- **Permesso di Costruire**: per opere strutturali o aumento carico

**Sanzioni:**
- Multa fino a 516€ per cambio abusivo senza opere
- Demolizione per cambio con opere abusive`,
        sources: ['DPR 380/2001 art. 23-ter', 'Circolare MIT 2017'],
        cached: true
    },

    'sanatoria edilizia': {
        answer: `La **sanatoria edilizia** permette di regolarizzare opere abusive mediante **Permesso di Costruire in Sanatoria** ex art. 36 DPR 380/2001.

**Requisiti per la sanatoria:**
• **Conformità** alle norme vigenti al momento della realizzazione E al momento della richiesta
• **Assenza di vincoli** paesaggistici, ambientali, archeologici
• **Compatibilità urbanistica** con zona di appartenenza
• **Doppio conforme**: conforme sia alle norme del momento costruzione che attuali

**Procedure:**
1. **Presentazione istanza** con progetto stato di fatto/diritto
2. **Pagamento oblazione** (pari al contributo di costruzione + sanzioni)
3. **Istruttoria comunale** verifica conformità
4. **Rilascio permesso** o diniego motivato

**Termini:**
- **Decadenza**: 60 giorni dalla richiesta integrazione documenti
- **Silenzio diniego**: 60 giorni dal completamento istruttoria

**Sanzioni pecuniarie:**
- Opere **< 300 mc**: da 1.000 a 10.000€
- Opere **> 300 mc**: da 10.000 a 30.000€  
- **Opere in zona vincolata**: raddoppio importi

**Casi di inammissibilità:**
- Opere in aree protette, vincoli archeologici
- Violazioni norme antisismiche, sicurezza
- Opere su suolo demaniale`,
        sources: ['DPR 380/2001 art. 36', 'Legge 47/1985'],
        cached: true
    },

    'abuso edilizio': {
        answer: `L'**abuso edilizio** è la realizzazione di opere in violazione della normativa urbanistica-edilizia, sanzionato dagli artt. 27-44 del DPR 380/2001.

**Tipologie di abuso:**
• **Totale**: opere senza titolo abilitativo
• **Parziale**: opere difformi dal titolo rilasciato
• **Sostanziale**: variazioni essenziali non autorizzate

**Sanzioni principali:**
1. **Demolizione** e ripristino stato dei luoghi
2. **Acquisizione al patrimonio comunale** se su aree pubbliche
3. **Sanzioni pecuniarie** alternative alla demolizione

**Procedimento sanzionatorio:**
- **Ordinanza demolizione** entro 90 giorni dall'accertamento
- **Acquisizione gratuita** se demolizione non eseguita
- **Esecuzione d'ufficio** a spese del responsabile

**Variazioni essenziali (art. 32):**
- Mutamento destinazione d'uso in zona impropria
- Aumento oltre 20% di cubatura/superficie
- Modifiche sagoma in zone vincolate  
- Violazione altezze, distanze, rapporti copertura

**Reati edilizi:**
- **Lottizzazione abusiva** (art. 44): arresto fino a 2 anni
- **Opere in zone vincolate** (art. 44): arresto fino a 1 anno
- **Inosservanza ordinanze** (art. 44): arresto fino a 6 mesi

**Termini prescrizione:**
- **Accertamento violazioni**: non soggetto a prescrizione
- **Azione penale**: 4 anni dalla commissione reato`,
        sources: ['DPR 380/2001 artt. 27-44', 'Cassazione Penale'],
        cached: true
    }
};

// Genera cache key per la query
function generateCacheKey(question) {
    return crypto.createHash('md5').update(question.toLowerCase().trim()).digest('hex');
}

// Pulisce la cache periodicamente
function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of queryCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            queryCache.delete(key);
        }
    }
}

// Cerca match nelle risposte precompilate
function findPrecomputedMatch(question) {
    const normalizedQuestion = question.toLowerCase();
    
    // Mappatura specifica per query complesse
    const keywordMapping = {
        'sanatoria': 'sanatoria edilizia',
        'sanare': 'sanatoria edilizia',
        'condono': 'sanatoria edilizia',
        'abuso': 'abuso edilizio',
        'abusiv': 'abuso edilizio',
        'illegale': 'abuso edilizio',
        'variazione essenziale': 'abuso edilizio',
        'destinazione': 'cambio destinazione uso',
        'cambio uso': 'cambio destinazione uso'
    };
    
    // Prima controlla le mappature specifiche
    for (const [key, mapped] of Object.entries(keywordMapping)) {
        if (normalizedQuestion.includes(key) && precomputedResponses[mapped]) {
            return precomputedResponses[mapped];
        }
    }
    
    // Poi controlla le keywords dirette
    for (const [keyword, response] of Object.entries(precomputedResponses)) {
        if (normalizedQuestion.includes(keyword)) {
            return response;
        }
    }
    
    return null;
}

// Ottimizza la query per GPT-4 con fallback strategies
function optimizeQuery(question) {
    const normalizedQuestion = question.toLowerCase();
    
    // Categorie di context detection
    const contextCategories = {
        urbanisticAdvanced: [
            'permesso di costruire', 'scia', 'cila', 'dpr 380', 'testo unico',
            'ristrutturazione', 'demolizione', 'ricostruzione', 'sanatoria',
            'abuso edilizio', 'variazione essenziale'
        ],
        distancesZoning: [
            'distanze', 'altezze', 'indici', 'rapporti copertura',
            'dm 1444', 'zone territoriali', 'vincoli'
        ],
        procedures: [
            'procedura', 'documentazione', 'tempistica', 'oneri',
            'contributo costruzione', 'pareri', 'conferenza servizi'
        ],
        general: ['edilizia', 'urbanistica', 'costruzione', 'immobile', 'fabbricato']
    };
    
    // Detecta complessità della query
    const questionLength = question.length;
    const hasMultipleQuestions = question.includes('?') && question.split('?').length > 2;
    const hasSpecificReferences = /art\.|articolo|comma|dpr|decreto/i.test(question);
    
    // Context detection
    let detectedContext = 'general';
    let contextScore = 0;
    
    for (const [category, keywords] of Object.entries(contextCategories)) {
        const matches = keywords.filter(keyword => normalizedQuestion.includes(keyword)).length;
        if (matches > contextScore) {
            contextScore = matches;
            detectedContext = category;
        }
    }
    
    // Optimization strategy basata su context e complexity
    const optimizationStrategies = {
        urbanisticAdvanced: {
            system: `Sei UrbanAI, il principale esperto di urbanistica ed edilizia italiana. 
                    Conosci perfettamente il DPR 380/2001, DM 1444/1968, Codice Civile, e tutte le normative.
                    IMPORTANTE: Fornisci sempre riferimenti normativi specifici (articoli, commi).
                    Struttura la risposta con:
                    1. **Normativa applicabile**
                    2. **Requisiti e procedure**  
                    3. **Documentazione necessaria**
                    4. **Tempistiche e costi**
                    5. **Sanzioni eventuale non conformità**`,
            maxTokens: 1200,
            temperature: 0.1,
            fallbackTemp: 0.2
        },
        distancesZoning: {
            system: `Sei UrbanAI, esperto in normativa urbanistica su distanze, altezze e zonizzazione.
                    Riferimenti: Codice Civile art. 873, DM 1444/1968, regolamenti edilizi comunali.
                    Fornisci calcoli precisi, casistiche specifiche e deroghe possibili.
                    Includi sempre esempi pratici di applicazione.`,
            maxTokens: 900,
            temperature: 0.15,
            fallbackTemp: 0.25
        },
        procedures: {
            system: `Sei UrbanAI, esperto in procedure urbanistiche ed edilizie italiane.
                    Fornisci guide step-by-step, elenchi documentali completi, tempistiche precise.
                    Includi costi, oneri, e possibili criticità del procedimento.`,
            maxTokens: 1000,
            temperature: 0.2,
            fallbackTemp: 0.3
        },
        general: {
            system: `Sei UrbanAI, assistente esperto in urbanistica, edilizia e normative italiane. 
                    Rispondi in modo professionale, pratico e preciso con riferimenti normativi.`,
            maxTokens: 800,
            temperature: 0.3,
            fallbackTemp: 0.4
        }
    };
    
    const strategy = optimizationStrategies[detectedContext];
    
    // Adjust parameters based on complexity
    if (questionLength > 200 || hasMultipleQuestions) {
        strategy.maxTokens = Math.min(strategy.maxTokens + 300, 1500);
    }
    
    if (hasSpecificReferences) {
        strategy.temperature = Math.max(strategy.temperature - 0.05, 0.1);
    }
    
    return {
        ...strategy,
        context: detectedContext,
        complexity: questionLength > 200 ? 'high' : questionLength > 100 ? 'medium' : 'low',
        fallbackStrategies: getFallbackStrategies(detectedContext)
    };
}

// Strategie di fallback per diversi scenari di errore
function getFallbackStrategies(context) {
    return {
        tokenLimit: {
            reducedTokens: context === 'urbanisticAdvanced' ? 800 : 600,
            simplifiedPrompt: true
        },
        apiError: {
            retryCount: 2,
            delayMs: 1000,
            fallbackToCache: true
        },
        timeout: {
            maxRetries: 1,
            quickResponse: true,
            usePrecomputed: true
        }
    };
}

// Ajusta strategia basata sul numero di tentativo
function getAttemptStrategy(optimization, attemptNumber) {
    const strategy = { ...optimization };
    
    switch (attemptNumber) {
        case 1:
            // Prima tentativo: strategia ottimale
            return strategy;
        
        case 2:
            // Secondo tentativo: ridotta complessità
            strategy.maxTokens = Math.max(strategy.maxTokens - 200, 500);
            strategy.temperature = Math.min(strategy.temperature + 0.1, 0.6);
            strategy.system = strategy.system.split('\n')[0] + ' Rispondi in modo conciso e diretto.';
            return strategy;
        
        case 3:
            // Terzo tentativo: strategia minima
            strategy.maxTokens = 400;
            strategy.temperature = 0.5;
            strategy.system = 'Sei UrbanAI. Rispondi brevemente sulla normativa urbanistica italiana.';
            return strategy;
        
        default:
            return strategy;
    }
}

// Genera risposta di emergenza quando tutti i tentativi GPT-4 falliscono
function getFallbackResponse(question, error) {
    const normalizedQuestion = question.toLowerCase();
    
    // Risposte di emergenza basate su pattern riconosciuti
    if (normalizedQuestion.includes('permesso') && normalizedQuestion.includes('costruire')) {
        return `**Permesso di Costruire - Informazioni di base**

Il Permesso di Costruire è disciplinato dal DPR 380/2001 artt. 10-14 ed è richiesto per:
• Nuove costruzioni
• Ristrutturazioni con modifiche di volumetria
• Interventi in zone vincolate

**Procedura:**
1. Presentazione istanza al Comune
2. Istruttoria tecnica (60-90 giorni)
3. Rilascio o diniego

Al momento non riesco a fornire maggiori dettagli tecnici. Per informazioni specifiche consulta il Comune competente.

*Nota: Servizio temporaneamente limitato. Riprova tra qualche minuto.*`;
    }
    
    if (normalizedQuestion.includes('scia')) {
        return `**SCIA Edilizia - Informazioni di base**

La SCIA (art. 22 DPR 380/2001) si applica per:
• Ristrutturazioni senza modifiche volumetriche
• Interventi di media rilevanza
• Efficacia immediata

Al momento non riesco a fornire maggiori dettagli. Per informazioni specifiche consulta un tecnico abilitato.

*Nota: Servizio temporaneamente limitato. Riprova tra qualche minuto.*`;
    }
    
    // Risposta generica per altri casi
    return `**UrbanAI - Servizio temporaneamente limitato**

Al momento non riesco a elaborare completamente la tua richiesta urbanistica a causa di problemi tecnici.

**Suggerimenti:**
• Riprova tra qualche minuto
• Per urgenze, consulta direttamente il Comune competente
• Considera di consultare un tecnico abilitato

**Errore tecnico:** ${error?.message || 'Errore di sistema'}

*Il servizio sarà ripristinato il prima possibile.*`;
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

    // Pulisci cache scaduta periodicamente
    cleanExpiredCache();
    
    const startTime = Date.now();
    const cacheKey = generateCacheKey(question);

    try {
        console.log(`🔍 Processing query: ${question}`);

        // Step 1: Controlla cache in-memory
        if (queryCache.has(cacheKey)) {
            cacheStats.hits++;
            const cached = queryCache.get(cacheKey);
            console.log(`⚡ Cache hit - Response time: ${Date.now() - startTime}ms`);
            
            return res.status(200).json({
                success: true,
                answer: cached.answer,
                knowledgeBaseUsed: true,
                sourcesFound: cached.sources?.length || 0,
                sources: cached.sources || [],
                responseTime: Date.now() - startTime,
                cached: true,
                cacheStats: cacheStats
            });
        }

        // Step 2: Controlla risposte precompilate
        const precomputed = findPrecomputedMatch(question);
        if (precomputed) {
            console.log(`📋 Precomputed match found - Response time: ${Date.now() - startTime}ms`);
            
            // Aggiungi alla cache
            queryCache.set(cacheKey, {
                answer: precomputed.answer,
                sources: precomputed.sources,
                timestamp: Date.now()
            });
            
            return res.status(200).json({
                success: true,
                answer: precomputed.answer,
                knowledgeBaseUsed: true,
                sourcesFound: precomputed.sources.length,
                sources: precomputed.sources.map(source => ({ title: source })),
                responseTime: Date.now() - startTime,
                precomputed: true
            });
        }

        // Step 3: Query GPT-4 ottimizzata con fallback strategies
        cacheStats.misses++;
        const optimization = optimizeQuery(question);
        
        console.log(`🤖 Generating response with GPT-4 (context: ${optimization.context}, complexity: ${optimization.complexity})...`);
        
        let answer = null;
        let attemptCount = 0;
        const maxAttempts = 3;
        let lastError = null;
        
        while (attemptCount < maxAttempts && !answer) {
            attemptCount++;
            
            try {
                // Adjust strategy based on attempt number
                const currentStrategy = getAttemptStrategy(optimization, attemptCount);
                
                console.log(`📡 Attempt ${attemptCount}/${maxAttempts} - tokens: ${currentStrategy.maxTokens}, temp: ${currentStrategy.temperature}`);
                
                const completionResponse = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [
                        { role: 'system', content: currentStrategy.system },
                        { role: 'user', content: question }
                    ],
                    max_tokens: currentStrategy.maxTokens,
                    temperature: currentStrategy.temperature,
                    timeout: attemptCount === 1 ? 30000 : 20000 // First attempt longer timeout
                });

                answer = completionResponse.choices[0].message.content;
                
                if (answer && answer.length > 50) {
                    console.log(`✅ Success on attempt ${attemptCount}`);
                    break;
                } else {
                    throw new Error('Response too short or empty');
                }
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Attempt ${attemptCount} failed:`, error.message);
                
                // Fallback strategies per tipo di errore
                if (error.message?.includes('context_length') || error.message?.includes('token')) {
                    optimization.maxTokens = Math.max(optimization.maxTokens - 200, 400);
                    console.log(`🔧 Reducing tokens to ${optimization.maxTokens}`);
                } else if (error.message?.includes('timeout') || error.message?.includes('ECONNRESET')) {
                    console.log(`⏱️ Timeout detected, using faster strategy`);
                    optimization.temperature = Math.min(optimization.temperature + 0.1, 0.8);
                } else if (error.message?.includes('rate_limit')) {
                    console.log(`⏳ Rate limit, waiting before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * attemptCount));
                }
                
                // Last attempt: try minimal fallback
                if (attemptCount === maxAttempts - 1) {
                    console.log(`🚨 Using emergency fallback strategy`);
                    optimization.system = `Sei UrbanAI. Rispondi brevemente sulla normativa urbanistica italiana.`;
                    optimization.maxTokens = 400;
                    optimization.temperature = 0.5;
                }
            }
        }
        
        // Se tutti i tentativi falliscono, usa risposta di fallback
        if (!answer) {
            console.error(`💥 All attempts failed. Using emergency response.`);
            answer = getFallbackResponse(question, lastError);
        }

        const responseTime = Date.now() - startTime;

        // Aggiungi alla cache solo se la risposta è buona e non di fallback
        if (answer && answer.length > 100 && !answer.includes('Al momento non riesco')) {
            queryCache.set(cacheKey, {
                answer: answer,
                sources: [`GPT-4 optimized response (${optimization.context})`],
                timestamp: Date.now()
            });
        }

        console.log(`✅ Response completed - Total time: ${responseTime}ms, attempts: ${attemptCount}`);

        return res.status(200).json({
            success: true,
            answer: answer,
            knowledgeBaseUsed: true,
            sourcesFound: 1,
            sources: [{ title: 'Normativa urbanistica ed edilizia italiana' }],
            responseTime: responseTime,
            cached: false,
            optimized: true,
            attempts: attemptCount,
            context: optimization.context
        });

    } catch (error) {
        console.error('Query processing error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Errore del server',
            message: 'Problema temporaneo con il servizio AI. Riprova tra qualche istante.',
            fallback: true,
            responseTime: Date.now() - startTime
        });
    }
}

// Endpoint per statistiche cache
export async function cacheStats(req, res) {
    return res.json({
        cacheSize: queryCache.size,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100,
        precomputedQueries: Object.keys(precomputedResponses).length
    });
}