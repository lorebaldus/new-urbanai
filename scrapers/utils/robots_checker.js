// Robots.txt Checker Utility
// Ensures ethical scraping by respecting robots.txt directives

import https from 'https';
import http from 'http';
import { URL } from 'url';

export class RobotsChecker {
    constructor() {
        this.robotsCache = new Map();
        this.userAgent = 'UrbanAI-Research/1.0 (contact@urbanator.it)';
    }

    async canFetch(url, userAgent = this.userAgent) {
        try {
            const parsedUrl = new URL(url);
            const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
            
            console.log(`🤖 Checking robots.txt for ${parsedUrl.host}...`);
            
            // Check cache first
            if (this.robotsCache.has(robotsUrl)) {
                const rules = this.robotsCache.get(robotsUrl);
                return this.isAllowed(url, userAgent, rules);
            }

            // Fetch robots.txt
            const robotsContent = await this.fetchRobotsTxt(robotsUrl);
            const rules = this.parseRobotsTxt(robotsContent);
            
            // Cache for 1 hour
            this.robotsCache.set(robotsUrl, rules);
            setTimeout(() => this.robotsCache.delete(robotsUrl), 3600000);

            const allowed = this.isAllowed(url, userAgent, rules);
            console.log(`🤖 Robots.txt check: ${allowed ? '✅ ALLOWED' : '❌ DISALLOWED'} for ${url}`);
            
            return allowed;

        } catch (error) {
            console.error(`⚠️ Robots.txt check failed for ${url}:`, error.message);
            // Conservative approach: if we can't check, assume disallowed
            return false;
        }
    }

    async fetchRobotsTxt(robotsUrl) {
        return new Promise((resolve, reject) => {
            const client = robotsUrl.startsWith('https:') ? https : http;
            
            const request = client.get(robotsUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': this.userAgent
                }
            }, (response) => {
                if (response.statusCode === 404) {
                    // No robots.txt = allowed
                    resolve('');
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => resolve(data));
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    parseRobotsTxt(content) {
        const rules = {
            userAgents: new Map(),
            crawlDelay: 0
        };

        const lines = content.split('\n');
        let currentUserAgent = null;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const [directive, ...valueParts] = line.split(':');
            const value = valueParts.join(':').trim();

            switch (directive.toLowerCase()) {
                case 'user-agent':
                    currentUserAgent = value.toLowerCase();
                    if (!rules.userAgents.has(currentUserAgent)) {
                        rules.userAgents.set(currentUserAgent, {
                            disallow: [],
                            allow: []
                        });
                    }
                    break;

                case 'disallow':
                    if (currentUserAgent && value) {
                        rules.userAgents.get(currentUserAgent).disallow.push(value);
                    }
                    break;

                case 'allow':
                    if (currentUserAgent && value) {
                        rules.userAgents.get(currentUserAgent).allow.push(value);
                    }
                    break;

                case 'crawl-delay':
                    rules.crawlDelay = Math.max(rules.crawlDelay, parseInt(value) || 0);
                    break;
            }
        }

        return rules;
    }

    isAllowed(url, userAgent, rules) {
        const parsedUrl = new URL(url);
        const path = parsedUrl.pathname;
        
        // Check specific user agent rules
        const specificRules = rules.userAgents.get(userAgent.toLowerCase()) ||
                            rules.userAgents.get('urbanai-research/1.0') ||
                            rules.userAgents.get('*');

        if (!specificRules) {
            return true; // No rules = allowed
        }

        // Check allow rules first (more specific)
        for (const allowPattern of specificRules.allow) {
            if (this.matchesPattern(path, allowPattern)) {
                return true;
            }
        }

        // Check disallow rules
        for (const disallowPattern of specificRules.disallow) {
            if (this.matchesPattern(path, disallowPattern)) {
                return false;
            }
        }

        return true; // Default allow
    }

    matchesPattern(path, pattern) {
        if (pattern === '/') {
            return true; // Disallow all
        }

        // Simple wildcard matching
        const regex = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        return new RegExp(`^${regex}`).test(path);
    }

    getCrawlDelay(robotsUrl) {
        const rules = this.robotsCache.get(robotsUrl);
        return rules ? rules.crawlDelay * 1000 : 0; // Convert to ms
    }
}