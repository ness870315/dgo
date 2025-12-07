import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Grok Service - xAI Grok API integration
 * Provides AI analysis using grok-4-1-fast-reasoning model
 * Compatible interface with OpenAIService
 */
class GrokService {
  constructor() {
    this.apiKey = null;
    this.isInitialized = false;
    this.apiBaseUrl = 'https://api.x.ai/v1';
    this.model = 'grok-4-1-fast-reasoning';
    this.rateLimiter = {
      requests: [],
      maxRequestsPerMinute: 50,
      maxTokensPerMinute: 40000
    };
    this.cache = new Map();
    this.cacheDir = path.join(process.cwd(), 'data', 'ai_cache');
    this.metricsFile = path.join(process.cwd(), 'data', 'grok_metrics.json');
    this.metrics = {
      totalRequests: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      cacheHits: 0,
      averageResponseTime: 0,
      errorCount: 0
    };
  }

  /**
   * Initialize Grok service
   */
  async initialize() {
    try {
      const apiKey = process.env.GROK_API;
      if (!apiKey) {
        throw new Error('GROK_API environment variable is required');
      }

      this.apiKey = apiKey;

      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load metrics if exists
      try {
        const metricsData = await fs.readFile(this.metricsFile, 'utf-8');
        this.metrics = { ...this.metrics, ...JSON.parse(metricsData) };
      } catch (error) {
        // Metrics file doesn't exist yet, start fresh
      }

      this.isInitialized = true;
      console.log('✅ [GROK] Service initialized');
      console.log(`   Model: ${this.model}`);
      console.log(`   API Base: ${this.apiBaseUrl}`);
      
      return true;
    } catch (error) {
      console.error('❌ [GROK] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Rate limiting check
   */
  async checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old requests
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      req => req.timestamp > oneMinuteAgo
    );
    
    const recentRequests = this.rateLimiter.requests.length;
    const recentTokens = this.rateLimiter.requests.reduce(
      (sum, req) => sum + (req.tokens || 0), 0
    );
    
    if (recentRequests >= this.rateLimiter.maxRequestsPerMinute) {
      const waitTime = this.rateLimiter.requests[0].timestamp + 60000 - now;
      console.log(`⏳ [GROK] Rate limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }
    
    if (recentTokens >= this.rateLimiter.maxTokensPerMinute) {
      const waitTime = 60000;
      console.log(`⏳ [GROK] Token limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }
    
    return true;
  }

  /**
   * Generate cache key for requests
   */
  generateCacheKey(prompt, model = this.model, temperature = 0.7, extras = {}) {
    const identity = `${extras.contract || extras.symbol || ''}`;
    return crypto.createHash('md5')
      .update(`${model}-${temperature}-${identity}-${prompt}`)
      .digest('hex');
  }

  /**
   * Calculate cost based on token usage
   * Grok pricing: $0.20 per 1M input tokens, $0.50 per 1M output tokens
   */
  calculateCost(tokensUsed, isInput = true) {
    const pricePerMillion = isInput ? 0.20 : 0.50;
    return (tokensUsed / 1000000) * pricePerMillion;
  }

  /**
   * Update metrics
   */
  async updateMetrics(tokensUsed, cost, responseTime) {
    this.metrics.totalRequests++;
    this.metrics.totalTokensUsed += tokensUsed;
    this.metrics.totalCost += cost;
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
    
    // Save metrics periodically
    if (this.metrics.totalRequests % 10 === 0) {
      try {
        await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
      } catch (error) {
        console.warn('⚠️ [GROK] Failed to save metrics:', error.message);
      }
    }
  }

  /**
   * Save cache entry to disk
   */
  async saveCacheEntry(key, response) {
    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(cacheFile, JSON.stringify({ response, timestamp: Date.now() }));
    } catch (error) {
      // Cache save failure is not critical
      console.warn('⚠️ [GROK] Failed to save cache entry:', error.message);
    }
  }

  /**
   * Main AI completion method with caching and rate limiting
   * Compatible with OpenAIService.generateCompletion interface
   */
  async generateCompletion(prompt, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      model = this.model,
      temperature = 0.7,
      maxTokens = 1000,
      useCache = true,
      cacheExpiry = 3600000 // 1 hour default
    } = options;

    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(prompt, model, temperature, options?.identity || {});
      
      if (useCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < cacheExpiry) {
          this.metrics.cacheHits++;
          console.log(`💾 [GROK] Cache hit for AI request (${cacheKey.slice(0, 8)}...)`);
          return cached.response;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      // Also check disk cache
      if (useCache) {
        try {
          const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
          const cachedData = await fs.readFile(cacheFile, 'utf-8');
          const cached = JSON.parse(cachedData);
          if (Date.now() - cached.timestamp < cacheExpiry) {
            this.metrics.cacheHits++;
            this.cache.set(cacheKey, cached);
            console.log(`💾 [GROK] Disk cache hit for AI request (${cacheKey.slice(0, 8)}...)`);
            return cached.response;
          }
        } catch (error) {
          // No cached file, continue
        }
      }

      // Rate limiting
      await this.checkRateLimit();

      // Make Grok API request (OpenAI-compatible chat completions format)
      const requestBody = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens
      };

      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      const completion = data.choices[0].message.content;
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const tokensUsed = inputTokens + outputTokens; // Total tokens for metrics
      
      // Calculate cost (input + output)
      // Grok pricing: $0.20 per 1M input tokens, $0.50 per 1M output tokens
      const inputCost = this.calculateCost(inputTokens, true);
      const outputCost = this.calculateCost(outputTokens, false);
      const totalCost = inputCost + outputCost;

      // Track rate limiting
      this.rateLimiter.requests.push({
        timestamp: Date.now(),
        tokens: tokensUsed
      });

      // Update metrics
      await this.updateMetrics(tokensUsed, totalCost, Date.now() - startTime);

      // Cache response
      if (useCache) {
        const cacheEntry = {
          response: completion,
          timestamp: Date.now(),
          tokensUsed,
          cost: totalCost
        };
        this.cache.set(cacheKey, cacheEntry);
        await this.saveCacheEntry(cacheKey, completion);
      }

      console.log(`🤖 [GROK] Completion generated (${tokensUsed} tokens, $${totalCost.toFixed(4)})`);
      return completion;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ [GROK] Completion error:', error.message);
      throw error;
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

export default GrokService;
