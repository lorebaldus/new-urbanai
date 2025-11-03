// Retry Handler Utility with Exponential Backoff
// Provides robust error handling for network operations

export class RetryHandler {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async executeWithRetry(fn, context = 'operation') {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🔄 ${context} - Attempt ${attempt}/${this.maxRetries}`);
                
                const result = await fn();
                
                if (attempt > 1) {
                    console.log(`✅ ${context} succeeded on attempt ${attempt}`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                console.error(`❌ ${context} failed on attempt ${attempt}:`, error.message);
                
                if (attempt === this.maxRetries) {
                    console.error(`💥 ${context} failed after ${this.maxRetries} attempts`);
                    break;
                }
                
                // Exponential backoff with jitter
                const delay = this.calculateDelay(attempt);
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await this.sleep(delay);
            }
        }
        
        throw new Error(`${context} failed after ${this.maxRetries} attempts. Last error: ${lastError.message}`);
    }

    calculateDelay(attempt) {
        // Exponential backoff: baseDelay * 2^(attempt-1) + random jitter
        const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 1000; // Up to 1 second jitter
        return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Static helper for quick retries
    static async retry(fn, maxRetries = 3, baseDelay = 1000, context = 'operation') {
        const handler = new RetryHandler(maxRetries, baseDelay);
        return handler.executeWithRetry(fn, context);
    }
}