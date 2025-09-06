import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

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
  generateCacheKey(prompt, model = 'gpt-3.5-turbo', temperature = 0.7) {
    return crypto.createHash('md5')
      .update(`${model}-${temperature}-${prompt}`)
      .digest('hex');
  }

  /**
   * Main AI completion method with caching and rate limiting
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
      cacheExpiry = 3600000 // 1 hour default
    } = options;

    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(prompt, model, temperature);
      
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

      // Make OpenAI request
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens
      });

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
   * Calculate cost based on model and tokens
   */
  calculateCost(model, tokens) {
    const pricing = {
      'gpt-3.5-turbo': 0.002 / 1000,      // $0.002 per 1K tokens
      'gpt-4': 0.03 / 1000,               // $0.03 per 1K tokens  
      'gpt-4-turbo': 0.01 / 1000          // $0.01 per 1K tokens
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
      await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
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
