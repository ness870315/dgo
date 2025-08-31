class ApiAnalytics {
  constructor() {
    this.analytics = {
      timestamp: new Date().toISOString(),
      services: {
        coingecko: {
          calls: 0,
          lastCall: null,
          successCount: 0,
          errorCount: 0,
          rateLimitHits: 0,
          totalResponseTime: 0,
          averageResponseTime: 0
        },
        bitquery: {
          calls: 0,
          lastCall: null,
          successCount: 0,
          errorCount: 0,
          rateLimitHits: 0,
          totalResponseTime: 0,
          averageResponseTime: 0
        },
        dexscreener: {
          calls: 0,
          lastCall: null,
          successCount: 0,
          errorCount: 0,
          rateLimitHits: 0,
          totalResponseTime: 0,
          averageResponseTime: 0
        },
        apify: {
          calls: 0,
          lastCall: null,
          successCount: 0,
          errorCount: 0,
          rateLimitHits: 0,
          totalResponseTime: 0,
          averageResponseTime: 0,
          batches: 0,
          lastBatchRun: null,
          tokensCollected: 0
        }
      },
      batches: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: null,
        lastSuccess: null,
        lastFailure: null,
        averageDuration: 0,
        totalDuration: 0,
        tokensProcessed: 0,
        tokensAdded: 0,
        tokensUpdated: 0
      },
      system: {
        uptime: 0,
        memoryUsage: 0,
        cacheSize: 0,
        lastCacheUpdate: null
      }
    };
    
    this.startTime = Date.now();
    this.startMonitoring();
  }

  // Track API call
  trackApiCall(service, success = true, responseTime = 0, error = null) {
    const serviceData = this.analytics.services[service];
    if (!serviceData) return;

    serviceData.calls++;
    serviceData.lastCall = new Date().toISOString();
    
    if (success) {
      serviceData.successCount++;
    } else {
      serviceData.errorCount++;
      if (error && (error.message.includes('rate limit') || error.message.includes('429'))) {
        serviceData.rateLimitHits++;
      }
    }

    serviceData.totalResponseTime += responseTime;
    serviceData.averageResponseTime = serviceData.totalResponseTime / serviceData.calls;
  }

  // Track batch run
  trackBatchRun(success = true, duration = 0, tokensProcessed = 0, tokensAdded = 0, tokensUpdated = 0) {
    this.analytics.batches.totalRuns++;
    this.analytics.batches.lastRun = new Date().toISOString();
    
    if (success) {
      this.analytics.batches.successfulRuns++;
      this.analytics.batches.lastSuccess = new Date().toISOString();
    } else {
      this.analytics.batches.failedRuns++;
      this.analytics.batches.lastFailure = new Date().toISOString();
    }

    this.analytics.batches.totalDuration += duration;
    this.analytics.batches.averageDuration = this.analytics.batches.totalDuration / this.analytics.batches.totalRuns;
    this.analytics.batches.tokensProcessed += tokensProcessed;
    this.analytics.batches.tokensAdded += tokensAdded;
    this.analytics.batches.tokensUpdated += tokensUpdated;
  }

  // Track Apify specific metrics
  trackApifyBatch(tokensCollected = 0) {
    this.analytics.services.apify.batches++;
    this.analytics.services.apify.lastBatchRun = new Date().toISOString();
    this.analytics.services.apify.tokensCollected += tokensCollected;
  }

  // Update system metrics
  updateSystemMetrics(cacheSize = 0, lastCacheUpdate = null) {
    this.analytics.system.uptime = Date.now() - this.startTime;
    this.analytics.system.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    this.analytics.system.cacheSize = cacheSize;
    this.analytics.system.lastCacheUpdate = lastCacheUpdate;
  }

  // Get analytics data
  getAnalytics() {
    this.analytics.timestamp = new Date().toISOString();
    return this.analytics;
  }

  // Get summary
  getSummary() {
    const totalApiCalls = Object.values(this.analytics.services).reduce((sum, service) => sum + service.calls, 0);
    const totalSuccess = Object.values(this.analytics.services).reduce((sum, service) => sum + service.successCount, 0);
    const totalErrors = Object.values(this.analytics.services).reduce((sum, service) => sum + service.errorCount, 0);
    const successRate = totalApiCalls > 0 ? (totalSuccess / totalApiCalls * 100).toFixed(2) : 0;

    return {
      summary: {
        totalApiCalls,
        totalSuccess,
        totalErrors,
        successRate: `${successRate}%`,
        totalBatches: this.analytics.batches.totalRuns,
        successfulBatches: this.analytics.batches.successfulRuns,
        failedBatches: this.analytics.batches.failedRuns,
        uptime: Math.floor(this.analytics.system.uptime / 1000 / 60) // minutes
      },
      services: Object.entries(this.analytics.services).map(([name, data]) => ({
        name,
        calls: data.calls,
        successRate: data.calls > 0 ? (data.successCount / data.calls * 100).toFixed(2) : 0,
        averageResponseTime: data.averageResponseTime.toFixed(2),
        lastCall: data.lastCall
      })),
      batches: {
        successRate: this.analytics.batches.totalRuns > 0 ? 
          (this.analytics.batches.successfulRuns / this.analytics.batches.totalRuns * 100).toFixed(2) : 0,
        averageDuration: this.analytics.batches.averageDuration.toFixed(2),
        tokensProcessed: this.analytics.batches.tokensProcessed,
        tokensAdded: this.analytics.batches.tokensAdded,
        tokensUpdated: this.analytics.batches.tokensUpdated
      }
    };
  }

  // Start monitoring
  startMonitoring() {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);
  }

  // Reset analytics (for testing)
  reset() {
    this.analytics = {
      timestamp: new Date().toISOString(),
      services: {
        coingecko: { calls: 0, lastCall: null, successCount: 0, errorCount: 0, rateLimitHits: 0, totalResponseTime: 0, averageResponseTime: 0 },
        bitquery: { calls: 0, lastCall: null, successCount: 0, errorCount: 0, rateLimitHits: 0, totalResponseTime: 0, averageResponseTime: 0 },
        dexscreener: { calls: 0, lastCall: null, successCount: 0, errorCount: 0, rateLimitHits: 0, totalResponseTime: 0, averageResponseTime: 0 },
        apify: { calls: 0, lastCall: null, successCount: 0, errorCount: 0, rateLimitHits: 0, totalResponseTime: 0, averageResponseTime: 0, batches: 0, lastBatchRun: null, tokensCollected: 0 }
      },
      batches: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, lastRun: null, lastSuccess: null, lastFailure: null, averageDuration: 0, totalDuration: 0, tokensProcessed: 0, tokensAdded: 0, tokensUpdated: 0 },
      system: { uptime: 0, memoryUsage: 0, cacheSize: 0, lastCacheUpdate: null }
    };
    this.startTime = Date.now();
  }
}

// Create and export a single instance
const apiAnalyticsInstance = new ApiAnalytics();
export default apiAnalyticsInstance;
