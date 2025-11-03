// Base Scraper Class for Legal Documents
// Provides ethical scraping foundation with robots.txt compliance and rate limiting

import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import { RateLimiter } from './utils/rate_limiter.js';
import { RobotsChecker } from './utils/robots_checker.js';
import { RetryHandler } from './utils/retry_handler.js';

export class BaseScraper {
    constructor(config = {}) {
        this.config = {
            rateLimitMs: parseInt(process.env.SCRAPER_RATE_LIMIT_MS) || 2000,
            userAgent: process.env.SCRAPER_USER_AGENT || 'UrbanAI-Research/1.0 (contact@urbanator.it)',
            maxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
            timeout: 30000,
            respectRobots: true,
            ...config
        };

        this.rateLimiter = new RateLimiter(this.config.rateLimitMs);
        this.robotsChecker = new RobotsChecker();
        this.retryHandler = new RetryHandler(this.config.maxRetries);
        
        console.log(`🤖 ${this.constructor.name} initialized with config:`, {
            rateLimitMs: this.config.rateLimitMs,
            userAgent: this.config.userAgent,
            maxRetries: this.config.maxRetries,
            respectRobots: this.config.respectRobots
        });
    }

    async canScrape(url) {
        if (!this.config.respectRobots) {
            console.log(`⚠️ Robots.txt checking disabled - proceeding with ${url}`);
            return true;
        }

        return await this.robotsChecker.canFetch(url, this.config.userAgent);
    }

    async fetchUrl(url, context = 'fetch') {
        console.log(`📡 Starting fetch: ${url}`);
        
        // Check robots.txt first
        const canScrape = await this.canScrape(url);
        if (!canScrape) {
            throw new Error(`Robots.txt disallows scraping ${url}`);
        }

        // Apply rate limiting
        await this.rateLimiter.waitIfNeeded();

        // Fetch with retry logic
        return await this.retryHandler.executeWithRetry(
            () => this.performFetch(url),
            `${context} ${url}`
        );
    }

    async performFetch(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': this.config.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: this.config.timeout
            };

            const request = client.request(options, (response) => {
                console.log(`📡 HTTP ${response.statusCode} for ${url}`);
                
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    console.log(`🔄 Redirect to: ${redirectUrl}`);
                    return this.performFetch(redirectUrl).then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                let data = '';
                response.setEncoding('utf8');
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    console.log(`✅ Fetched ${data.length} characters from ${url}`);
                    resolve({
                        url,
                        status: response.statusCode,
                        headers: response.headers,
                        content: data,
                        timestamp: new Date().toISOString()
                    });
                });
            });

            request.on('error', error => {
                console.error(`🚨 Request error for ${url}:`, error.message);
                reject(error);
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error(`Request timeout for ${url}`));
            });

            request.end();
        });
    }

    async saveRawDocument(content, filename, source = 'unknown') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fullFilename = `${timestamp}_${safeFilename}.html`;
        
        const rawDir = path.join(process.cwd(), 'data', 'raw', source);
        await fs.mkdir(rawDir, { recursive: true });
        
        const filePath = path.join(rawDir, fullFilename);
        
        const metadata = {
            filename: fullFilename,
            source,
            originalUrl: content.url,
            fetchTimestamp: content.timestamp,
            contentLength: content.content.length,
            httpStatus: content.status
        };

        // Save content
        await fs.writeFile(filePath, content.content, 'utf8');
        
        // Save metadata
        const metadataPath = filePath.replace('.html', '_metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        
        console.log(`💾 Saved raw document: ${filePath}`);
        console.log(`📊 Document metadata: ${content.content.length} chars, HTTP ${content.status}`);
        
        return {
            filePath,
            metadataPath,
            metadata
        };
    }

    async logOperation(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            scraper: this.constructor.name,
            message,
            ...data
        };

        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);

        // Also save to log file
        try {
            const logDir = path.join(process.cwd(), 'logs');
            await fs.mkdir(logDir, { recursive: true });
            
            const logFile = path.join(logDir, 'scraper.log');
            const logLine = JSON.stringify(logEntry) + '\n';
            
            await fs.appendFile(logFile, logLine, 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    // Abstract method - must be implemented by subclasses
    async scrapeDocument(documentConfig) {
        throw new Error('scrapeDocument method must be implemented by subclass');
    }

    // Abstract method - must be implemented by subclasses
    async scrapeSource(sourceConfig) {
        throw new Error('scrapeSource method must be implemented by subclass');
    }
}