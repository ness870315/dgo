import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';

/**
 * OpenAI Service - Core AI engine for DeGen Oracle
 * Handles all AI interactions with rate limiting, caching, and cost tracking
 */
class OpenAIService {
  constructor() {
    this.openai = null;
    this.isInitialized = false;
    this.rateLimiter = {
      requests: [],
      maxRequestsPerMinute: 50, // Adjust based on your OpenAI plan
      maxTokensPerMinute: 40000
    };
    this.cache = new Map();
    this.cacheDir = path.join(process.cwd(), 'data', 'ai_cache');
    this.metricsFile = path.join(process.cwd(), 'data', 'ai_metrics.json');
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
   * Initialize OpenAI service
   */
  async initialize() {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }

      this.openai = new OpenAI({
        apiKey: apiKey
      });

      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load existing metrics
      await this.loadMetrics();
      
      // Load cache from disk
      await this.loadCache();

      this.isInitialized = true;
      console.log('🤖 OpenAI Service initialized successfully');
      
      // Test connection
      await this.testConnection();
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Service:', error.message);
      throw error;
    }
  }

  /**
   * Test OpenAI connection
   */
  async testConnection() {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10
      });
      
      console.log('✅ OpenAI connection test successful');
      return true;
    } catch (error) {
      console.error('❌ OpenAI connection test failed:', error.message);
      return false;
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
      console.log(`⏳ Rate limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }
    
    if (recentTokens >= this.rateLimiter.maxTokensPerMinute) {
      const waitTime = 60000;
      console.log(`⏳ Token limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }
    
    return true;
  }

  /**
   * Generate cache key for requests
   */
  generateCacheKey(prompt, model = 'gpt-3.5-turbo', temperature = 0.7, extras = {}) {
    const tier = (model && String(model).toLowerCase().includes('gpt-4')) ? 'premium' : 'free';
    const identity = `${extras.contract || extras.symbol || ''}`;
    return crypto.createHash('md5')
      .update(`${tier}-${model}-${temperature}-${identity}-${prompt}`)
      .digest('hex');
  }

  /**
   * Main AI completion method with caching and rate limiting
   * Supports both Chat Completions API and Responses API (for GPT-5 web search)
   */
  async generateCompletion(prompt, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      model = 'gpt-3.5-turbo',
      temperature = 0.7,
      maxTokens = 1000,
      useCache = true,
      cacheExpiry = 3600000, // 1 hour default
      enableWebSearch = false // Enable real-time web search
    } = options;

    // All GPT-5 variants (gpt-5, gpt-5-mini, gpt-5-nano) with web search use Responses API
    if (model.includes('gpt-5') && enableWebSearch) {
      return await this.generateResponseWithWebSearch(prompt, options);
    }
    
    // GPT-5 variants without web search can also use Responses API (for consistency)
    // But we'll use Chat Completions for non-web-search calls (faster)
    if (model.includes('gpt-5') && !enableWebSearch) {
      // Use Chat Completions API for GPT-5 without web search
      // Falls through to regular chat completions logic below
    }

    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(prompt, model, temperature, options?.identity || {});
      
      if (useCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < cacheExpiry) {
          this.metrics.cacheHits++;
          console.log(`💾 Cache hit for AI request (${cacheKey.slice(0, 8)}...)`);
          return cached.response;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      // Rate limiting
      await this.checkRateLimit();

      // Make OpenAI request (Chat Completions API)
      const requestParams = {
        model: model,
        messages: [{ role: 'user', content: prompt }]
      };

      // GPT-5 only supports temperature: 1 (default), older models support 0-2
      if (!model.includes('gpt-5')) {
        requestParams.temperature = temperature;
      }

      // GPT-5 uses max_completion_tokens, older models use max_tokens
      if (model.includes('gpt-5')) {
        requestParams.max_completion_tokens = maxTokens;
      } else {
        requestParams.max_tokens = maxTokens;
      }

      const response = await this.openai.chat.completions.create(requestParams);

      const completion = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;
      const cost = this.calculateCost(model, tokensUsed);

      // Track rate limiting
      this.rateLimiter.requests.push({
        timestamp: Date.now(),
        tokens: tokensUsed
      });

      // Update metrics
      this.updateMetrics(tokensUsed, cost, Date.now() - startTime);

      // Cache response
      if (useCache) {
        this.cache.set(cacheKey, {
          response: completion,
          timestamp: Date.now(),
          tokensUsed,
          cost
        });
        await this.saveCacheEntry(cacheKey, completion);
      }

      console.log(`🤖 AI completion generated (${tokensUsed} tokens, $${cost.toFixed(4)})`);
      return completion;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ OpenAI completion error:', error.message);
      throw error;
    }
  }

  /**
   * Generate response using GPT-5 Responses API with web search
   * This is the correct API for GPT-5 with built-in web search
   */
  async generateResponseWithWebSearch(prompt, options = {}) {
    const {
      model = 'gpt-5',
      maxTokens = 1000,
      useCache = true,
      cacheExpiry = 3600000
    } = options;

    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(prompt, model, 1, options?.identity || {});
      
      if (useCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < cacheExpiry) {
          this.metrics.cacheHits++;
          console.log(`💾 Cache hit for AI request (${cacheKey.slice(0, 8)}...)`);
          return cached.response;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      // Rate limiting
      await this.checkRateLimit();

      console.log(`🌐 [GPT-5 RESPONSES API] Making request with web search...`);

      // Use Responses API (not Chat Completions) for GPT-5 web search
      const response = await this.openai.responses.create({
        model: model,
        tools: [{ type: 'web_search' }],
        input: prompt,
        max_output_tokens: maxTokens
      });

      const completion = response.output_text;
      const tokensUsed = response.usage?.total_tokens || maxTokens; // Estimate if not provided
      const cost = this.calculateCost(model, tokensUsed);

      // Track rate limiting
      this.rateLimiter.requests.push({
        timestamp: Date.now(),
        tokens: tokensUsed
      });

      // Update metrics
      this.updateMetrics(tokensUsed, cost, Date.now() - startTime);

      // Cache response
      if (useCache) {
        this.cache.set(cacheKey, {
          response: completion,
          timestamp: Date.now(),
          tokensUsed,
          cost
        });
        await this.saveCacheEntry(cacheKey, completion);
      }

      console.log(`🤖 GPT-5 Responses API completion (${tokensUsed} tokens, $${cost.toFixed(4)})`);
      return completion;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ GPT-5 Responses API error:', error.message);
      console.error('❌ Full error:', error);
      throw error;
    }
  }


  /**
   * Calculate cost based on model and tokens
   */
  calculateCost(model, tokens) {
    const pricing = {
      'gpt-3.5-turbo': 0.002 / 1000,      // $0.002 per 1K tokens
      'gpt-4': 0.03 / 1000,               // $0.03 per 1K tokens  
      'gpt-4-turbo': 0.01 / 1000,         // $0.01 per 1K tokens
      'gpt-5-nano': 0.0015 / 1000,        // $0.0015 per 1K tokens (estimate)
      'gpt-5-mini': 0.003 / 1000,         // $0.003 per 1K tokens (estimate)
      'gpt-5': 0.02 / 1000                // $0.02 per 1K tokens (estimate)
    };
    
    return (pricing[model] || pricing['gpt-3.5-turbo']) * tokens;
  }

  /**
   * Update performance metrics
   */
  updateMetrics(tokensUsed, cost, responseTime) {
    this.metrics.totalRequests++;
    this.metrics.totalTokensUsed += tokensUsed;
    this.metrics.totalCost += cost;
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
    
    // Save metrics every 10 requests
    if (this.metrics.totalRequests % 10 === 0) {
      this.saveMetrics();
    }
  }

  /**
   * Load metrics from disk
   */
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf8');
      this.metrics = { ...this.metrics, ...JSON.parse(data) };
      console.log('📊 AI metrics loaded from disk');
    } catch (error) {
      console.log('📊 No existing AI metrics found, starting fresh');
    }
  }

  /**
   * Save metrics to disk
   */
  async saveMetrics() {
    try {
      await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('❌ Failed to save AI metrics:', error.message);
    }
  }

  /**
   * Load cache from disk
   */
  async loadCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let loadedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.cacheDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const cached = JSON.parse(data);
            const cacheKey = file.replace('.json', '');
            
            // Only load if not expired (24 hours)
            if (Date.now() - cached.timestamp < 86400000) {
              this.cache.set(cacheKey, cached);
              loadedCount++;
            } else {
              await fs.unlink(filePath); // Delete expired cache
            }
          } catch (error) {
            console.warn(`⚠️ Failed to load cache file ${file}:`, error.message);
          }
        }
      }
      
      if (loadedCount > 0) {
        console.log(`💾 Loaded ${loadedCount} AI cache entries from disk`);
      }
    } catch (error) {
      console.log('💾 No existing AI cache found, starting fresh');
    }
  }

  /**
   * Save individual cache entry to disk
   */
  async saveCacheEntry(cacheKey, response) {
    try {
      const filePath = path.join(this.cacheDir, `${cacheKey}.json`);
      const cacheData = this.cache.get(cacheKey);
      
      // 🛡️ ATOMIC WRITE: Save cache entry
      const tempPath = filePath + '.tmp';
      const jsonData = JSON.stringify(cacheData, null, 2);
      
      await fs.writeFile(tempPath, jsonData, 'utf8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp file if it exists
      try {
        await fs.unlink(path.join(this.cacheDir, `${cacheKey}.json.tmp`));
      } catch (_) {}
      console.warn('⚠️ Failed to save cache entry:', error.message);
    }
  }

  /**
   * Get current metrics and status
   */
  getMetrics() {
    const cacheHitRate = this.metrics.totalRequests > 0 
      ? this.metrics.cacheHits / this.metrics.totalRequests 
      : 0;
      
    return {
      ...this.metrics,
      cacheHitRate: cacheHitRate,
      cacheSize: this.cache.size,
      isInitialized: this.isInitialized,
      rateLimitStatus: {
        recentRequests: this.rateLimiter.requests.length,
        maxRequests: this.rateLimiter.maxRequestsPerMinute
      }
    };
  }

  /**
   * Clear cache (useful for testing)
   */
  async clearCache() {
    this.cache.clear();
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      console.log('🗑️ AI cache cleared');
    } catch (error) {
      console.warn('⚠️ Failed to clear cache files:', error.message);
    }
  }
}

export default OpenAIService;
