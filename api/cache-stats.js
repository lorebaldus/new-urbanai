// Endpoint per monitorare le performance del sistema di cache

const cacheStats = {
    hits: 0,
    misses: 0,
    totalQueries: 0,
    averageResponseTime: 0,
    lastReset: Date.now()
};

const responseTimes = [];
const MAX_RESPONSE_HISTORY = 100;

// Aggiorna statistiche
export function updateCacheStats(hit, responseTime) {
    cacheStats.totalQueries++;
    
    if (hit) {
        cacheStats.hits++;
    } else {
        cacheStats.misses++;
    }
    
    // Mantieni storia dei tempi di risposta
    responseTimes.push(responseTime);
    if (responseTimes.length > MAX_RESPONSE_HISTORY) {
        responseTimes.shift();
    }
    
    // Calcola tempo medio
    cacheStats.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
}

// Endpoint per statistiche cache
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const hitRate = cacheStats.totalQueries > 0 
        ? (cacheStats.hits / cacheStats.totalQueries * 100).toFixed(2)
        : 0;

    const performance = {
        cache: {
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            total: cacheStats.totalQueries,
            hitRate: `${hitRate}%`,
            lastReset: new Date(cacheStats.lastReset).toISOString()
        },
        performance: {
            averageResponseTime: `${Math.round(cacheStats.averageResponseTime)}ms`,
            recentQueries: responseTimes.length,
            fastestResponse: responseTimes.length > 0 ? `${Math.min(...responseTimes)}ms` : 'N/A',
            slowestResponse: responseTimes.length > 0 ? `${Math.max(...responseTimes)}ms` : 'N/A'
        },
        optimization: {
            recommendedActions: getOptimizationRecommendations(hitRate, cacheStats.averageResponseTime),
            cacheEfficiency: getCacheEfficiencyRating(hitRate),
            systemHealth: getSystemHealthStatus(cacheStats.averageResponseTime)
        }
    };

    return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        stats: performance
    });
}

function getOptimizationRecommendations(hitRate, avgResponseTime) {
    const recommendations = [];
    
    if (hitRate < 30) {
        recommendations.push('Aumentare il numero di risposte precompilate per query comuni');
    }
    
    if (avgResponseTime > 3000) {
        recommendations.push('Considerare ottimizzazioni al modello GPT-4 o riduzione max_tokens');
    }
    
    if (hitRate > 70) {
        recommendations.push('Ottima efficienza cache - considerare espansione categorie precompilate');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('Sistema ottimizzato - monitorare performance nel tempo');
    }
    
    return recommendations;
}

function getCacheEfficiencyRating(hitRate) {
    if (hitRate >= 70) return 'Excellent';
    if (hitRate >= 50) return 'Good';
    if (hitRate >= 30) return 'Fair';
    return 'Needs Improvement';
}

function getSystemHealthStatus(avgResponseTime) {
    if (avgResponseTime <= 1000) return 'Optimal';
    if (avgResponseTime <= 3000) return 'Good';
    if (avgResponseTime <= 5000) return 'Acceptable';
    return 'Needs Attention';
}

// Reset statistiche
export async function resetStats(req, res) {
    cacheStats.hits = 0;
    cacheStats.misses = 0;
    cacheStats.totalQueries = 0;
    cacheStats.averageResponseTime = 0;
    cacheStats.lastReset = Date.now();
    responseTimes.length = 0;
    
    return res.status(200).json({
        success: true,
        message: 'Cache statistics reset successfully'
    });
}