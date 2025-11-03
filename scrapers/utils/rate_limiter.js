// Rate Limiter Utility for Legal Document Scrapers
// Ensures compliance with scraping ethics and prevents server overload

export class RateLimiter {
    constructor(delayMs = 2000) {
        this.delayMs = delayMs;
        this.lastRequestTime = 0;
    }

    async waitIfNeeded() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.delayMs) {
            const waitTime = this.delayMs - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms...`);
            await this.sleep(waitTime);
        }
        
        this.lastRequestTime = Date.now();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setDelay(delayMs) {
        this.delayMs = delayMs;
        console.log(`🔧 Rate limiter delay set to ${delayMs}ms`);
    }
}