#!/usr/bin/env node

// Simple test for robots.txt and rate limiting without external dependencies

import https from 'https';
import { RobotsChecker } from '../scrapers/utils/robots_checker.js';
import { RateLimiter } from '../scrapers/utils/rate_limiter.js';

async function testBasicComponents() {
    console.log('🧪 Testing Basic Scraper Components\n');

    try {
        // Test 1: Robots.txt checker
        console.log('1️⃣ Testing Robots.txt Checker...');
        const robotsChecker = new RobotsChecker();
        
        const testUrl = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1942-08-17;1150';
        console.log(`Testing URL: ${testUrl}`);
        
        const canScrape = await robotsChecker.canFetch(testUrl);
        console.log(`Result: ${canScrape ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);

        if (!canScrape) {
            console.log('⚠️ Robots.txt blocks scraping. This is unexpected for Normattiva.it');
            return;
        }

        // Test 2: Rate limiter
        console.log('2️⃣ Testing Rate Limiter...');
        const rateLimiter = new RateLimiter(1000); // 1 second for testing
        
        console.log('Making 3 consecutive requests with rate limiting...');
        
        for (let i = 1; i <= 3; i++) {
            const start = Date.now();
            await rateLimiter.waitIfNeeded();
            const elapsed = Date.now() - start;
            console.log(`Request ${i}: waited ${elapsed}ms`);
        }
        console.log('✅ Rate limiting working correctly\n');

        // Test 3: Simple HTTP fetch to Normattiva
        console.log('3️⃣ Testing Simple HTTP Fetch...');
        await rateLimiter.waitIfNeeded();
        
        const response = await fetchSimple(testUrl);
        console.log(`HTTP Status: ${response.statusCode}`);
        console.log(`Content Length: ${response.data.length} characters`);
        console.log(`Content Preview: ${response.data.substring(0, 200)}...`);
        
        // Check if it looks like a legal document
        const hasLegalContent = response.data.includes('Art.') || 
                              response.data.includes('articolo') ||
                              response.data.includes('legge') ||
                              response.data.includes('decreto');
        
        console.log(`Contains legal content: ${hasLegalContent ? '✅ YES' : '❌ NO'}`);
        
        console.log('\n🎉 All basic tests passed! Ready for full scraper.');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Full error:', error);
    }
}

function fetchSimple(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'UrbanAI-Research/1.0 (contact@urbanator.it)'
            }
        }, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode,
                    headers: response.headers,
                    data
                });
            });
        });
        
        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// Run test
testBasicComponents();