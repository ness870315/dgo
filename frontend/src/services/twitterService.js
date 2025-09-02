// NOTE: Do not import twitter-api-v2 in the browser bundle; use backend or mock
import Sentiment from 'sentiment';

class TwitterService {
  constructor() {
    this.client = null; // always null in browser; use backend when available
    this.sentiment = new Sentiment();
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
    
    this.initializeClient();
  }

  initializeClient() {
    // In the browser, we do not instantiate node-only clients.
    // If you add a backend, call it from here using fetch/axios.
    const bearerToken = process.env.REACT_APP_TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      console.warn('Twitter Bearer Token not found. Using mock data.');
    }
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async searchTweets(query, options = {}) {
    const count = options.count || 20;

    try {
      // Call the new Twitter microservice
      const twitterServiceUrl = process.env.REACT_APP_TWITTER_SERVICE_URL || 'https://your-twitter-service.onrender.com';
      const url = `${twitterServiceUrl}/api/twitter/search?q=${encodeURIComponent(query)}&count=${count}`;

      console.log('🔍 Searching Twitter for:', query);
      console.log('📡 API URL:', url);

      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        console.log('✅ Twitter API Response:', json);

        // Process the response from our new service
        const tweets = (json.tweets || []).map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.user?.screen_name || tweet.user?.name || 'unknown',
          public_metrics: {
            like_count: tweet.favorite_count || 0,
            retweet_count: tweet.retweet_count || 0,
            reply_count: tweet.reply_count || 0,
            quote_count: 0
          },
          sentiment: this.analyzeSentiment(tweet.text),
          engagement_rate: this.calculateEngagementRate({
            like_count: tweet.favorite_count || 0,
            retweet_count: tweet.retweet_count || 0,
            reply_count: tweet.reply_count || 0,
            quote_count: 0
          }),
          influence_score: 5
        }));

        return {
          tweets,
          meta: {
            count: tweets.length,
            total: tweets.length,
            source: json.source || 'selenium'
          }
        };
      }

      console.warn('❌ Twitter service returned error:', resp.status, resp.statusText);
      return this.getMockTwitterData(query);
    } catch (error) {
      console.error(`❌ Error searching Twitter for ${query}:`, error);
      return this.getMockTwitterData(query);
    }
  }

  async getTokenMentions(symbol, timeframe = '24h') {
    const cacheKey = `mentions_${symbol}_${timeframe}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      // Call the new Twitter microservice
      const twitterServiceUrl = process.env.REACT_APP_TWITTER_SERVICE_URL || 'https://your-twitter-service.onrender.com';
      const query = `${symbol} crypto token`;
      const url = `${twitterServiceUrl}/api/twitter/search?q=${encodeURIComponent(query)}&count=20`;

      console.log('🔍 Searching Twitter for:', query);
      console.log('📡 API URL:', url);

      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        console.log('✅ Twitter API Response:', json);

        // Process the response from our new service
        const tweets = (json.tweets || []).map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.user?.screen_name || tweet.user?.name || 'unknown',
          public_metrics: {
            like_count: tweet.favorite_count || 0,
            retweet_count: tweet.retweet_count || 0,
            reply_count: tweet.reply_count || 0,
            quote_count: 0
          },
          sentiment: this.analyzeSentiment(tweet.text),
          engagement_rate: this.calculateEngagementRate({
            like_count: tweet.favorite_count || 0,
            retweet_count: tweet.retweet_count || 0,
            reply_count: tweet.reply_count || 0,
            quote_count: 0
          }),
          influence_score: 5 // Default score since we don't have user data
        }));

        const processedData = {
          tweets: this.removeDuplicateTweets(tweets),
          totalMentions: tweets.length,
          timeframe,
          lastUpdated: new Date().toISOString(),
          source: json.source || 'selenium'
        };

        // Cache the results
        this.cache.set(cacheKey, {
          data: processedData,
          timestamp: Date.now()
        });

        return processedData;
      }

      console.warn('❌ Twitter service returned error:', resp.status, resp.statusText);
      // Fallback to mock if backend not available
      return this.getMockTokenMentions(symbol);
    } catch (error) {
      console.error(`❌ Error fetching mentions for ${symbol}:`, error);
      return this.getMockTokenMentions(symbol);
    }
  }

  async getCommunityAnalysis(symbol) {
    try {
      const mentions = await this.getTokenMentions(symbol);
      
      if (!mentions || !mentions.tweets) {
        return this.getMockCommunityAnalysis(symbol);
      }

      const analysis = {
        totalMentions: mentions.tweets.length,
        uniqueUsers: new Set(mentions.tweets.map(t => t.author_id)).size,
        averageEngagement: this.calculateAverageEngagement(mentions.tweets),
        sentimentScore: this.calculateOverallSentiment(mentions.tweets),
        influencerMentions: this.countInfluencerMentions(mentions.tweets),
        trendingScore: this.calculateTrendingScore(mentions.tweets),
        communityHealth: this.assessCommunityHealth(mentions.tweets),
        topHashtags: this.extractTopHashtags(mentions.tweets),
        engagementTrend: this.calculateEngagementTrend(mentions.tweets),
        riskIndicators: this.detectRiskIndicators(mentions.tweets)
      };

      return analysis;
    } catch (error) {
      console.error(`Error analyzing community for ${symbol}:`, error);
      return this.getMockCommunityAnalysis(symbol);
    }
  }

  processTweetData(response) {
    if (!response.data) return { tweets: [], users: [] };

    const tweets = response.data.data || [];
    const users = response.includes?.users || [];
    
    return {
      tweets: tweets.map(tweet => ({
        ...tweet,
        sentiment: this.analyzeSentiment(tweet.text),
        engagement_rate: this.calculateEngagementRate(tweet.public_metrics),
        influence_score: this.calculateInfluenceScore(tweet, users)
      })),
      users,
      meta: response.data.meta
    };
  }

  analyzeSentiment(text) {
    try {
      const result = this.sentiment.analyze(text);
      
      // Normalize score to 0-10 scale
      const normalizedScore = Math.max(0, Math.min(10, (result.score + 10) / 2));
      
      return {
        score: normalizedScore,
        comparative: result.comparative,
        tokens: result.tokens,
        positive: result.positive,
        negative: result.negative
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return { score: 5, comparative: 0, tokens: [], positive: [], negative: [] };
    }
  }

  calculateEngagementRate(metrics) {
    if (!metrics) return 0;
    
    const { retweet_count = 0, like_count = 0, reply_count = 0, quote_count = 0 } = metrics;
    const totalEngagement = retweet_count + like_count + reply_count + quote_count;
    
    // Simple engagement rate calculation
    return totalEngagement > 0 ? Math.min(100, totalEngagement / 10) : 0;
  }

  calculateInfluenceScore(tweet, users) {
    const author = users.find(user => user.id === tweet.author_id);
    if (!author) return 1;

    const { followers_count = 0, verified = false } = author.public_metrics || {};
    
    let score = 1;
    
    // Verified accounts get bonus
    if (verified) score += 2;
    
    // Follower count influence (logarithmic scale)
    if (followers_count > 0) {
      score += Math.log10(followers_count) / 2;
    }
    
    return Math.min(10, score);
  }

  calculateAverageEngagement(tweets) {
    if (!tweets.length) return 0;
    
    const totalEngagement = tweets.reduce((sum, tweet) => {
      return sum + (tweet.engagement_rate || 0);
    }, 0);
    
    return totalEngagement / tweets.length;
  }

  calculateOverallSentiment(tweets) {
    if (!tweets.length) return 5;

    const totalSentiment = tweets.reduce((sum, tweet) => {
      return sum + (tweet.sentiment || tweet.sentiment?.score || 5);
    }, 0);

    return totalSentiment / tweets.length;
  }

  countInfluencerMentions(tweets) {
    return tweets.filter(tweet => tweet.influence_score > 5).length;
  }

  calculateTrendingScore(tweets) {
    if (!tweets.length) return 0;
    
    // Calculate based on recency and engagement
    const now = Date.now();
    const scores = tweets.map(tweet => {
      const tweetTime = new Date(tweet.created_at).getTime();
      const hoursAgo = (now - tweetTime) / (1000 * 60 * 60);
      
      // Recent tweets get higher scores
      const recencyScore = Math.max(0, 24 - hoursAgo) / 24;
      const engagementScore = (tweet.engagement_rate || 0) / 100;
      
      return recencyScore * 0.6 + engagementScore * 0.4;
    });
    
    return scores.reduce((sum, score) => sum + score, 0) / scores.length * 10;
  }

  assessCommunityHealth(tweets) {
    const metrics = {
      diversity: this.calculateUserDiversity(tweets),
      engagement: this.calculateAverageEngagement(tweets),
      sentiment: this.calculateOverallSentiment(tweets),
      activity: Math.min(10, tweets.length / 10)
    };
    
    // Weighted average
    return (
      metrics.diversity * 0.25 +
      metrics.engagement * 0.25 +
      metrics.sentiment * 0.25 +
      metrics.activity * 0.25
    );
  }

  calculateUserDiversity(tweets) {
    const uniqueUsers = new Set(tweets.map(t => t.author_id)).size;
    const totalTweets = tweets.length;
    
    if (totalTweets === 0) return 0;
    
    // Higher diversity score when more unique users
    return Math.min(10, (uniqueUsers / totalTweets) * 20);
  }

  extractTopHashtags(tweets) {
    const hashtagCounts = {};
    
    tweets.forEach(tweet => {
      const hashtags = tweet.text.match(/#\w+/g) || [];
      hashtags.forEach(hashtag => {
        const tag = hashtag.toLowerCase();
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });
    
    return Object.entries(hashtagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([hashtag, count]) => ({ hashtag, count }));
  }

  calculateEngagementTrend(tweets) {
    // Sort tweets by time and calculate trend
    const sortedTweets = tweets.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );
    
    if (sortedTweets.length < 2) return 0;
    
    const firstHalf = sortedTweets.slice(0, Math.floor(sortedTweets.length / 2));
    const secondHalf = sortedTweets.slice(Math.floor(sortedTweets.length / 2));
    
    const firstAvg = this.calculateAverageEngagement(firstHalf);
    const secondAvg = this.calculateAverageEngagement(secondHalf);
    
    if (firstAvg === 0) return secondAvg > 0 ? 100 : 0;
    
    return ((secondAvg - firstAvg) / firstAvg) * 100;
  }

  detectRiskIndicators(tweets) {
    const riskKeywords = [
      'rug pull', 'scam', 'dump', 'exit scam', 'honeypot', 
      'fake', 'avoid', 'warning', 'careful', 'suspicious'
    ];
    
    let riskCount = 0;
    
    tweets.forEach(tweet => {
      const text = tweet.text.toLowerCase();
      riskKeywords.forEach(keyword => {
        if (text.includes(keyword)) riskCount++;
      });
    });
    
    return {
      riskScore: Math.min(10, (riskCount / tweets.length) * 100),
      riskCount,
      totalTweets: tweets.length
    };
  }

  removeDuplicateTweets(tweets) {
    const seen = new Set();
    return tweets.filter(tweet => {
      const key = tweet.text.substring(0, 50); // Use first 50 chars as key
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getTimeframeStart(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '6h':
        return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  }

  // Mock data methods for development/fallback
  getMockTwitterData(query) {
    return {
      tweets: Array.from({ length: Math.floor(Math.random() * 50) + 10 }, (_, i) => ({
        id: `mock_${i}`,
        text: `Mock tweet about ${query} #crypto #solana`,
        created_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        author_id: `user_${Math.floor(Math.random() * 1000)}`,
        public_metrics: {
          like_count: Math.floor(Math.random() * 100),
          retweet_count: Math.floor(Math.random() * 50),
          reply_count: Math.floor(Math.random() * 20),
          quote_count: Math.floor(Math.random() * 10)
        },
        sentiment: {
          score: Math.random() * 10,
          comparative: (Math.random() - 0.5) * 2
        },
        engagement_rate: Math.random() * 100,
        influence_score: Math.random() * 10
      })),
      users: []
    };
  }

  getMockTokenMentions(symbol) {
    const mockTweets = this.getMockTwitterData(`$${symbol}`);
    return {
      tweets: mockTweets.tweets,
      totalMentions: mockTweets.tweets.length,
      timeframe: '24h',
      lastUpdated: new Date().toISOString()
    };
  }

  getMockCommunityAnalysis(symbol) {
    return {
      totalMentions: Math.floor(Math.random() * 1000) + 100,
      uniqueUsers: Math.floor(Math.random() * 500) + 50,
      averageEngagement: Math.random() * 50,
      sentimentScore: Math.random() * 10,
      influencerMentions: Math.floor(Math.random() * 20),
      trendingScore: Math.random() * 10,
      communityHealth: Math.random() * 10,
      topHashtags: [
        { hashtag: `#${symbol}`, count: Math.floor(Math.random() * 100) + 20 },
        { hashtag: '#solana', count: Math.floor(Math.random() * 80) + 15 },
        { hashtag: '#crypto', count: Math.floor(Math.random() * 60) + 10 }
      ],
      engagementTrend: (Math.random() - 0.5) * 200,
      riskIndicators: {
        riskScore: Math.random() * 3,
        riskCount: Math.floor(Math.random() * 5),
        totalTweets: Math.floor(Math.random() * 100) + 50
      }
    };
  }
}

const twitterService = new TwitterService();
export default twitterService;
