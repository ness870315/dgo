import { ApifyClient } from 'apify-client';

class ApifyService {
  constructor() {
    this.client = new ApifyClient({ 
      token: 'apify_api_6Q8Oi0XJfrJLa9FgTf18fDl1zPErHb37FGWx' 
    });
    this.actorId = 'eoF4jxJZItdkP33r9';
    this.isRunning = false;
    this.lastRun = null;
    this.interval = null;
  }

  // Start the automatic trending token collection
  startTrendingCollection() {
    if (this.isRunning) {
      console.log('⚠️ Apify trending collection already running');
      return;
    }

    console.log('🚀 Starting Apify trending token collection every 45 minutes...');
    this.isRunning = true;

    // Run immediately
    this.collectTrendingTokens();

    // Set up interval for every 45 minutes
    this.interval = setInterval(() => {
      this.collectTrendingTokens();
    }, 45 * 60 * 1000); // 45 minutes in milliseconds
  }

  // Stop the automatic collection
  stopTrendingCollection() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Stopped Apify trending token collection');
  }

  // Collect trending tokens from Apify
  async collectTrendingTokens() {
    try {
      console.log('🔍 Collecting trending tokens from Apify...');
      
      // Start the actor
      const run = await this.client.actor(this.actorId).start({ 
        your: 'input' 
      });
      
      console.log(`✅ Apify actor started: ${run.id}`);
      this.lastRun = run;
      
      // Wait for completion (with timeout)
      const maxWaitTime = 10 * 60 * 1000; // 10 minutes
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const runStatus = await this.client.run(run.id).get();
        
        if (runStatus.status === 'SUCCEEDED') {
          console.log('🎉 Apify run completed successfully!');
          const results = await this.processTrendingResults(run.defaultDatasetId);
          
          // Track successful Apify batch
          if (global.apiAnalytics) {
            global.apiAnalytics.trackApifyBatch(results.length);
          }
          
          break;
        } else if (runStatus.status === 'FAILED') {
          console.error('❌ Apify run failed:', runStatus.meta);
          break;
        }
        
        // Wait 30 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      
    } catch (error) {
      console.error('❌ Error collecting trending tokens:', error.message);
    }
  }

  // Process the trending token results
  async processTrendingResults(datasetId) {
    try {
      console.log(`📊 Processing trending results from dataset: ${datasetId}`);
      
      const dataset = await this.client.dataset(datasetId).listItems();
      console.log(`✅ Retrieved ${dataset.items.length} trending tokens`);
      
      // Filter and process tokens
      const validTokens = dataset.items
        .filter(item => this.isValidToken(item))
        .map(item => this.transformApifyData(item));
      
      console.log(`✅ Processed ${validTokens.length} valid trending tokens`);
      
      // Return the processed tokens for integration
      return validTokens;
      
    } catch (error) {
      console.error('❌ Error processing trending results:', error.message);
      return [];
    }
  }

  // Check if token meets our criteria
  isValidToken(token) {
    // Must have minimum market cap of $20K
    if (!token.marketCap || token.marketCap < 20000) {
      return false;
    }
    
    // Must have basic required fields
    if (!token.baseToken?.symbol || !token.baseToken?.address) {
      return false;
    }
    
    // Must have some trading activity
    if (!token.volume?.h24 || token.volume.h24 < 1000) {
      return false;
    }
    
    return true;
  }

  // Transform Apify data to our token format
  transformApifyData(apifyToken) {
    return {
      symbol: apifyToken.baseToken.symbol,
      name: apifyToken.baseToken.name,
      contractAddress: apifyToken.baseToken.address,
      chainId: apifyToken.chainId,
      dexId: apifyToken.dexId,
      
      // Price data
      currentPrice: parseFloat(apifyToken.priceUsd) || 0,
      priceInSol: parseFloat(apifyToken.priceNative) || 0,
      
      // Market data
      marketCap: apifyToken.marketCap || 0,
      fdv: apifyToken.fdv || 0,
      
      // Volume data
      volume24h: apifyToken.volume?.h24 || 0,
      volume6h: apifyToken.volume?.h6 || 0,
      volume1h: apifyToken.volume?.h1 || 0,
      volume5m: apifyToken.volume?.m5 || 0,
      
      // Price changes
      priceChange24h: apifyToken.priceChange?.h24 || 0,
      priceChange6h: apifyToken.priceChange?.h6 || 0,
      priceChange1h: apifyToken.priceChange?.h1 || 0,
      priceChange5m: apifyToken.priceChange?.m5 || 0,
      
      // Transaction data
      transactions24h: {
        buys: apifyToken.txns?.h24?.buys || 0,
        sells: apifyToken.txns?.h24?.sells || 0
      },
      transactions6h: {
        buys: apifyToken.txns?.h6?.buys || 0,
        sells: apifyToken.txns?.h6?.sells || 0
      },
      transactions1h: {
        buys: apifyToken.txns?.h1?.buys || 0,
        sells: apifyToken.txns?.h1?.sells || 0
      },
      transactions5m: {
        buys: apifyToken.txns?.m5?.buys || 0,
        sells: apifyToken.txns?.m5?.sells || 0
      },
      
      // Liquidity
      liquidity: {
        usd: apifyToken.liquidity?.usd || 0,
        base: apifyToken.liquidity?.base || 0,
        quote: apifyToken.liquidity?.quote || 0
      },
      
      // Media and social
      image: apifyToken.info?.imageUrl || null,
      headerImage: apifyToken.info?.header || null,
      openGraphImage: apifyToken.info?.openGraph || null,
      
      // Social links
      socialLinks: {
        twitter: apifyToken.info?.socials?.find(s => s.type === 'twitter')?.url || null,
        telegram: apifyToken.info?.socials?.find(s => s.type === 'telegram')?.url || null,
        website: apifyToken.info?.websites?.[0]?.url || null
      },
      
      // Metadata
      pairAddress: apifyToken.pairAddress,
      pairUrl: apifyToken.url,
      pairCreatedAt: apifyToken.pairCreatedAt ? new Date(apifyToken.pairCreatedAt) : null,
      
      // Boosts (if available)
      boosts: apifyToken.boosts?.active || 0,
      
      // Source tracking
      dataSource: 'apify_trending',
      lastUpdated: new Date().toISOString(),
      
      // Calculate engagement metrics
      buyPressure: this.calculateBuyPressure(apifyToken.txns),
      volumeToMarketCapRatio: apifyToken.volume?.h24 && apifyToken.marketCap ? 
        (apifyToken.volume.h24 / apifyToken.marketCap) : 0
    };
  }

  // Calculate buy pressure based on transaction ratios
  calculateBuyPressure(txns) {
    if (!txns?.h24) return 0;
    
    const totalBuys = txns.h24.buys || 0;
    const totalSells = txns.h24.sells || 0;
    const total = totalBuys + totalSells;
    
    if (total === 0) return 0;
    
    // Buy pressure: 0 = all sells, 1 = all buys
    return totalBuys / total;
  }

  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.interval ? new Date(Date.now() + 45 * 60 * 1000) : null
    };
  }

  // Get trending tokens (for API endpoints)
  async getTrendingTokens() {
    try {
      if (!this.lastRun) {
        console.log('⚠️ No Apify run available yet');
        return [];
      }

      // Check if we have recent results
      const runStatus = await this.client.run(this.lastRun.id).get();
      
      if (runStatus.status === 'SUCCEEDED') {
        // Return cached results if available, otherwise process fresh
        if (this.cachedTrendingTokens && this.cachedTrendingTokens.length > 0) {
          console.log(`✅ Returning ${this.cachedTrendingTokens.length} cached trending tokens from Apify`);
          return this.cachedTrendingTokens;
        } else {
          console.log('🔄 No cached results, processing fresh data...');
          return await this.processTrendingResults(this.lastRun.defaultDatasetId);
        }
      } else if (runStatus.status === 'FAILED') {
        console.log('❌ Last Apify run failed, starting new one...');
        await this.collectTrendingTokens();
        return [];
      } else {
        console.log('⏳ Last Apify run still in progress...');
        // Return existing cached tokens while new run is in progress
        if (this.cachedTrendingTokens && this.cachedTrendingTokens.length > 0) {
          console.log(`⏳ Returning ${this.cachedTrendingTokens.length} existing cached tokens while new run is in progress`);
          return this.cachedTrendingTokens;
        }
        return [];
      }
    } catch (error) {
      console.error('❌ Error getting trending tokens:', error.message);
      return [];
    }
  }
}

export default new ApifyService();
