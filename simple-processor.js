// Simple UrbanAI Processor for Render - Minimal reliable version
import http from 'http';

console.log('🚀 Simple UrbanAI Processor starting...');

// Basic HTTP server for health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/process' && req.method === 'POST') {
        // Trigger processing via Vercel API
        triggerVercelProcessing().then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }).catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        });
    } else if (req.url === '/status') {
        // Get status from Vercel API
        getStatusFromVercel().then((status) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
        }).catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Enhanced UrbanAI Processor is running');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Simple processor server running on port ${PORT}`);
    console.log('🎯 Auto-starting processing in 10 seconds...');
    
    // Auto-start processing
    setTimeout(() => {
        startContinuousProcessing();
    }, 10000);
});

async function triggerVercelProcessing() {
    const API_BASE = 'https://new-urbanai-777.vercel.app';
    
    try {
        console.log('🔄 Triggering processing via Vercel...');
        
        // Trigger both processing and embedding
        const processPromise = fetch(`${API_BASE}/api/bulk-scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'process', batchSize: 2 })
        });
        
        const embedPromise = fetch(`${API_BASE}/api/bulk-scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'embed', batchSize: 1 })
        });
        
        await Promise.all([processPromise, embedPromise]);
        
        return { success: true, message: 'Processing triggered via Vercel' };
        
    } catch (error) {
        console.error('❌ Failed to trigger Vercel processing:', error);
        return { success: false, error: error.message };
    }
}

async function getStatusFromVercel() {
    const API_BASE = 'https://new-urbanai-777.vercel.app';
    
    try {
        const response = await fetch(`${API_BASE}/api/admin`);
        const data = await response.json();
        
        if (data.success) {
            return {
                success: true,
                ...data.statistics.overview,
                source: 'vercel-api'
            };
        } else {
            return { success: false, error: 'Failed to get status from Vercel' };
        }
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function startContinuousProcessing() {
    console.log('🚀 Starting continuous processing loop...');
    
    let round = 1;
    const maxRounds = 100; // Run for up to 100 rounds
    
    while (round <= maxRounds) {
        try {
            console.log(`\n--- Processing Round ${round}/${maxRounds} ---`);
            
            // Get current status
            const status = await getStatusFromVercel();
            
            if (status.success) {
                console.log(`📊 Status: ${status.totalDocuments} total | ${status.processedDocuments} processed (${status.completionRate}%) | ${status.embeddedDocuments} embedded (${status.embeddingRate}%)`);
                
                // Check if we're done
                if (status.completionRate >= 90 && status.embeddingRate >= 80) {
                    console.log('🎉 Processing target achieved! 90%+ processed, 80%+ embedded.');
                    break;
                }
                
                // If no progress for many rounds, try more aggressive processing
                if (round > 10 && status.processedDocuments <= 3) {
                    console.log('⚡ Switching to aggressive mode...');
                    await aggressiveProcessing();
                }
            } else {
                console.log('📊 Status check failed:', status.error);
            }
            
            // Trigger processing
            await triggerVercelProcessing();
            
            // Progressive delay - start fast, then slow down
            const delay = round <= 5 ? 30000 : round <= 15 ? 60000 : 120000; // 30s, 60s, then 120s
            console.log(`⏳ Waiting ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            round++;
            
        } catch (error) {
            console.error(`❌ Processing round ${round} failed:`, error);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute on error
            round++;
        }
    }
    
    console.log('\n🏁 Continuous processing completed.');
    
    // Final status
    const finalStatus = await getStatusFromVercel();
    if (finalStatus.success) {
        console.log(`\n🎯 Final Status: ${finalStatus.totalDocuments} total | ${finalStatus.processedDocuments} processed (${finalStatus.completionRate}%) | ${finalStatus.embeddedDocuments} embedded (${finalStatus.embeddingRate}%)`);
        
        const readiness = (finalStatus.completionRate + finalStatus.embeddingRate) / 2;
        if (readiness >= 80) {
            console.log('✅ UrbanAI knowledge base is production ready!');
        } else {
            console.log(`⚠️ Knowledge base at ${Math.round(readiness)}% readiness. Consider additional processing.`);
        }
    }
}

async function aggressiveProcessing() {
    console.log('⚡ Starting aggressive processing mode...');
    const API_BASE = 'https://new-urbanai-777.vercel.app';
    
    // Rapid fire multiple processing requests
    for (let i = 0; i < 10; i++) {
        console.log(`⚡ Aggressive round ${i + 1}/10`);
        
        // Multiple parallel requests
        const requests = [];
        for (let j = 0; j < 3; j++) {
            requests.push(
                fetch(`${API_BASE}/api/bulk-scrape`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'process', batchSize: 1 })
                }).catch(() => {}) // Ignore timeouts
            );
        }
        
        await Promise.all(requests);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Short delay
    }
    
    console.log('⚡ Aggressive processing complete');
}