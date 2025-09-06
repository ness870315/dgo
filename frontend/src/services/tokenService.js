// Alternative data sources implementation - no Twitter API needed

// Mock data for development - replace with real API calls
const generateMockTokens = () => {
  const symbols = [
    'BONK', 'WIF', 'PEPE', 'SHIB', 'DOGE', 'FLOKI', 'MEME', 'WOJAK',
    'CHAD', 'COPE', 'HOPIUM', 'WAGMI', 'NGMI', 'FOMO', 'HODL', 'REKT',
    'MOON', 'LAMBO', 'DIAMOND', 'PAPER', 'APES', 'BULLS', 'BEARS', 'PUMP',
    'SOL', 'ETH', 'BTC', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE', 'COMP', 'MKR',
    'SUSHI', 'YFI', 'BAL', 'CRV', 'REN', 'BAT', 'OMG', 'LRC', 'STORJ', 'ANT',
    'GRT', 'LPT', 'NMR', 'FIL', 'ICP', 'HBAR', 'NEAR', 'FLOW', 'MANA', 'SAND'
  ];

  const names = [
    'Bonk Inu', 'Dogwifhat', 'Pepe Coin', 'Shiba Inu', 'Dogecoin', 'Floki Inu',
    'Meme Coin', 'Wojak Finance', 'Chad Token', 'Cope Coin', 'Hopium Protocol',
    'We Are Gonna Make It', 'Not Gonna Make It', 'Fear Of Missing Out', 'Hold On for Dear Life',
    'Rekt Protocol', 'Moon Mission', 'Lambo Dreams', 'Diamond Hands', 'Paper Hands',
    'Ape Together Strong', 'Bull Market', 'Bear Market', 'Pump It Up',
    'Solana', 'Ethereum', 'Bitcoin', 'Cardano', 'Polkadot', 'Chainlink', 'Uniswap',
    'Aave', 'Compound', 'MakerDAO', 'SushiSwap', 'Yearn Finance', 'Balancer',
    'Curve Finance', 'Ren Protocol', 'Basic Attention Token', 'OMG Network',
    'Loopring', 'Storj', 'Aragon', 'The Graph', 'Livepeer', 'Numeraire',
    'Filecoin', 'Internet Computer', 'Hedera', 'Near Protocol', 'Flow',
    'Decentraland', 'The Sandbox'
  ];

  const communityTypes = ['Official', 'CTO', 'Community', 'Unofficial'];
  const riskLevels = ['Low', 'Medium', 'High'];

  return symbols.map((symbol, index) => {
    const baseScore = Math.random() * 10;
    const mentions = Math.floor(Math.random() * 10000) + 100;
    const communityScore = Math.random() * 10;
    const hasOfficialProfile = Math.random() > 0.4;
    
    // Calculate overall score based on multiple factors
    const score = (
      baseScore * 0.3 +
      Math.min(mentions / 1000, 10) * 0.25 +
      communityScore * 0.25 +
      (hasOfficialProfile ? 2 : 0) * 0.2
    );

    return {
      id: index + 1,
      symbol,
      name: names[index] || `${symbol} Token`,
      score: Math.min(score, 10),
      mentions,
      mentionsTrend: (Math.random() - 0.5) * 200, // -100% to +100%
      communityScore,
      hasOfficialProfile,
      twitterHandle: hasOfficialProfile ? symbol.toLowerCase() + '_official' : null,
      communityType: communityTypes[Math.floor(Math.random() * communityTypes.length)],
      sentimentScore: Math.random() * 10,
      engagementRate: Math.random() * 0.1,
      uniqueMentions: Math.floor(mentions * (0.5 + Math.random() * 0.3)),
      riskLevel: riskLevels[Math.floor(Math.random() * riskLevels.length)],
      recentPosts: generateMockPosts(symbol, 3),
      lastUpdated: new Date().toISOString()
    };
  }).sort((a, b) => b.score - a.score);
};

const generateMockPosts = (symbol, count) => {
  const templates = [
    `$${symbol} is looking bullish! 🚀`,
    `Just bought more $${symbol}, diamond hands! 💎🙌`,
    `$${symbol} community is so strong! Love this project`,
    `Technical analysis shows $${symbol} ready for breakout`,
    `$${symbol} partnership announcement coming soon? 👀`,
    `Holding $${symbol} for the long term, great fundamentals`,
    `$${symbol} volume is picking up, something big coming?`,
    `Community vote for $${symbol} new features is live!`
  ];

  const authors = ['cryptowhale', 'degentrader', 'moonboy123', 'diamondhands', 'solanamaxi'];
  
  return Array.from({ length: count }, (_, i) => ({
    content: templates[Math.floor(Math.random() * templates.length)],
    author: authors[Math.floor(Math.random() * authors.length)],
    timestamp: new Date(Date.now() - Math.random() * 86400000).toLocaleTimeString(),
    likes: Math.floor(Math.random() * 1000),
    retweets: Math.floor(Math.random() * 500)
  }));
};

class TokenService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 1000; // 5 seconds - reduced for faster Jupiter data updates
  }

  async fetchTokens(useRealData = false) {
    console.log('🔍 fetchTokens called with useRealData:', useRealData);
    try {
      // Check cache first
      const cached = this.cache.get('tokens');
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log('🔍 Returning cached data');
        return cached.data;
      }

      let tokens;
      
      if (useRealData) {
        console.log('🔍 Fetching real data from backend...');
        // Fetch real data from alternative sources (CoinGecko, Reddit, GitHub, News)
        tokens = await this.fetchTokensWithRealData();
      } else {
        console.log('🔍 Using mock data for development');
        // Use mock data for development
        tokens = generateMockTokens();
      }
      
      // Cache the results
      this.cache.set('tokens', {
        data: tokens,
        timestamp: Date.now()
      });

      return tokens;
    } catch (error) {
      console.error('🔍 Error fetching tokens:', error);
      console.error('🔍 Error details:', error.message, error.stack);
      // Fallback to mock data if real API fails
      console.log('🔍 Falling back to mock data due to error');
      return generateMockTokens();
    }
  }

  async fetchTokensWithRealData() {
    console.log('🚀 fetchTokensWithRealData called!');
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      console.log('🚀 API Base URL:', apiBase);
      console.log('🚀 Fetching from:', `${apiBase}/api/tokens`);
      const response = await fetch(`${apiBase}/api/tokens`, {
        credentials: 'include'
      });
      console.log('🚀 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('🚀 API Error:', response.status, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      // Backend now returns tokens array directly (not wrapped in object)
      const tokens = Array.isArray(data) ? data : (data.tokens || []);
      
      // Debug: Log first few tokens to see contract addresses
      console.log('TokenService Debug - First 3 tokens:', tokens.slice(0, 3).map(t => ({
        symbol: t.symbol,
        contractAddress: t.contractAddress,
        hasRealContract: t.hasRealContract,
        score: t.score,
        overallScore: t.overallScore,
        enhancedScore: t.enhancedScore,
        jupiterData: t.jupiterData
      })));
      
      console.log('TokenService Debug - Total tokens received:', tokens.length);
      console.log('TokenService Debug - Sample token structure:', tokens[0]);
      
      const tokenPromises = tokens.map(async (token, index) => {
        // Skip fetching recent posts to improve performance - use mock data instead
        const recentPosts = generateMockPosts(token.symbol, 3);
        
        return {
          id: index + 1,
          symbol: token.symbol,
          name: token.name || this.getTokenName(token.symbol), // Preserve backend name
          // Use new enhanced scoring structure
          score: Math.min(token.overallScore || token.enhancedScore?.overallScore || token.score || 0, 10),
          overallScore: token.overallScore || token.enhancedScore?.overallScore || token.score || 0, // Preserve raw overall score
          mentions: token.twitterData?.mentions || token.mentions || 0, // Use Twitter API mentions first, then fallback
          mentionsTrend: (token.mediasentiment - 5) * 20, // Convert to -100% to +100%
          communityScore: token.communityScore || token.communityHealthScore || token.communityHealth || 0, // Preserve backend community score
          hasOfficialProfile: (token.socialScore || 0) > 5,
          twitterHandle: (token.socialScore || 0) > 5 ? `${token.symbol.toLowerCase()}_official` : null,
          communityType: this.determineCommunityTypeFromScore(token.socialScore || 0),
          sentimentScore: token.twitterData?.sentimentScore || token.mediasentiment || 5,
          engagementRate: token.twitterData?.engagement?.total ? (token.twitterData.engagement.total / Math.max(token.twitterData.mentions, 1)) : Math.min((token.developmentActivity || 0) / 100, 0.1),
          uniqueMentions: Math.floor((token.socialScore || 0) * 50),
          riskLevel: this.assessRiskLevelFromScore(token.overallScore || token.enhancedScore?.overallScore || token.score || 0),
          recentPosts: recentPosts,
          lastUpdated: new Date().toISOString(),
          
          // Additional data from alternative sources
          socialScore: token.socialScore || 0,
          developmentActivity: token.developmentActivity || 0,
          sourcesCount: token.sourcesCount || 0,
          influencerMentions: Math.floor((token.socialScore || 0) * 2),
          topHashtags: [
            { hashtag: `#${token.symbol}`, count: Math.floor((token.socialScore || 0) * 10) },
            { hashtag: '#solana', count: Math.floor((token.socialScore || 0) * 5) }
          ],
          
          // Market data from Jupiter API structure
          currentPrice: token.jupiterData?.usdPrice || token.currentPrice || 0,
          marketCap: token.jupiterData?.mcap || token.marketCap || 0,
          volume24h: token.jupiterData?.stats24h?.buyVolume || token.volume24h || 0,
          priceChange1h: token.jupiterData?.stats1h?.priceChange || token.priceChange1h || 0,
          priceChange24h: token.jupiterData?.stats24h?.priceChange || token.priceChange24h || 0,
          priceChange7d: token.jupiterData?.stats24h?.priceChange || token.priceChange7d || 0,
          marketCapRank: token.jupiterData?.marketCapRank || token.marketCapRank || 999,
          image: token.image || null,
          
          // Contract address data from backend enhancement
          contractAddress: token.contractAddress || null,
          hasRealContract: token.hasRealContract || false,
          
          // Jupiter API data from backend
          jupiterData: token.jupiterData || null,
          hasJupiterData: !!token.jupiterData,
          
          // Enhanced scoring data
          enhancedScore: token.enhancedScore || null,
          overallScore: token.overallScore || token.enhancedScore?.overallScore || token.score || 0,
          
          // Twitter data from backend (CRITICAL: Preserve this!)
          twitterData: token.twitterData || null,
          communityHealthScore: token.communityHealthScore || null
        };
      });
      
      const processedTokens = await Promise.all(tokenPromises);
      console.log('TokenService Debug - Processed tokens sample:', processedTokens[0]);
      console.log('TokenService Debug - Processed tokens count:', processedTokens.length);
      return processedTokens;
      
    } catch (error) {
      console.error('🚀 Error fetching tokens from alternative data sources:', error);
      console.error('🚀 Error details:', error.message, error.stack);
      // Fallback to mock data
      console.log('🚀 Falling back to mock data due to error');
      return generateMockTokens();
    }
  }

  calculateRealTokenScore(twitterData, communityAnalysis) {
    let score = 0;
    
    // Twitter mentions (25% weight)
    const mentionScore = Math.min(10, (twitterData.totalMentions || 0) / 100);
    score += mentionScore * 0.25;
    
    // Community quality (25% weight)
    score += (communityAnalysis.communityHealth || 0) * 0.25;
    
    // Sentiment analysis (20% weight)
    score += (communityAnalysis.sentimentScore || 5) * 0.2;
    
    // Engagement and trending (15% weight)
    const engagementScore = Math.min(10, (communityAnalysis.averageEngagement || 0) / 10);
    score += engagementScore * 0.15;
    
    // Influencer mentions (10% weight)
    const influencerScore = Math.min(10, (communityAnalysis.influencerMentions || 0) / 5);
    score += influencerScore * 0.1;
    
    // Risk penalty (5% weight)
    const riskPenalty = (communityAnalysis.riskIndicators?.riskScore || 0) / 10;
    score -= riskPenalty * 0.05;
    
    return Math.max(0, Math.min(10, score));
  }

  getTokenName(symbol) {
    const names = {
      'BONK': 'Bonk Inu',
      'WIF': 'Dogwifhat',
      'PEPE': 'Pepe Coin',
      'SHIB': 'Shiba Inu',
      'DOGE': 'Dogecoin',
      'FLOKI': 'Floki Inu',
      'MEME': 'Meme Coin',
      'WOJAK': 'Wojak Finance',
      'CHAD': 'Chad Token',
      'COPE': 'Cope Coin',
      'HOPIUM': 'Hopium Protocol',
      'WAGMI': 'We Are Gonna Make It',
      'NGMI': 'Not Gonna Make It',
      'FOMO': 'Fear Of Missing Out',
      'HODL': 'Hold On for Dear Life',
      'REKT': 'Rekt Protocol',
      'MOON': 'Moon Mission',
      'LAMBO': 'Lambo Dreams',
      'DIAMOND': 'Diamond Hands',
      'PAPER': 'Paper Hands',
      'APES': 'Ape Together Strong',
      'BULLS': 'Bull Market',
      'BEARS': 'Bear Market',
      'PUMP': 'Pump It Up'
    };
    return names[symbol] || `${symbol} Token`;
  }

  checkOfficialProfile(communityAnalysis) {
    // Check if there are verified accounts mentioning the token
    return (communityAnalysis.influencerMentions || 0) > 2;
  }

  extractTwitterHandle(communityAnalysis) {
    // This would extract actual Twitter handles from the data
    // For now, return null as we'd need to implement handle extraction
    return null;
  }

  determineCommunityType(communityAnalysis) {
    const health = communityAnalysis.communityHealth || 0;
    const influencers = communityAnalysis.influencerMentions || 0;
    
    if (influencers > 5 && health > 7) return 'Official';
    if (health > 6) return 'CTO';
    if (health > 4) return 'Community';
    return 'Unofficial';
  }

  assessRiskLevel(riskIndicators) {
    if (!riskIndicators) return 'Medium';
    
    const riskScore = riskIndicators.riskScore || 0;
    
    if (riskScore < 2) return 'Low';
    if (riskScore < 5) return 'Medium';
    return 'High';
  }

  formatRecentPosts(tweets) {
    return tweets.map(tweet => ({
      content: tweet.text?.substring(0, 100) + (tweet.text?.length > 100 ? '...' : ''),
      author: `user_${tweet.author_id?.substring(0, 8)}`,
      timestamp: new Date(tweet.created_at).toLocaleTimeString(),
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0,
      sentiment: tweet.sentiment?.score || 5
    }));
  }

  generateMockToken(symbol, index) {
    const baseScore = Math.random() * 10;
    const mentions = Math.floor(Math.random() * 10000) + 100;
    const communityScore = Math.random() * 10;
    const hasOfficialProfile = Math.random() > 0.4;
    
    const score = (
      baseScore * 0.3 +
      Math.min(mentions / 1000, 10) * 0.25 +
      communityScore * 0.25 +
      (hasOfficialProfile ? 2 : 0) * 0.2
    );

    return {
      id: index + 1,
      symbol,
      name: this.getTokenName(symbol),
      score: Math.min(score, 10),
      mentions,
      mentionsTrend: (Math.random() - 0.5) * 200,
      communityScore,
      hasOfficialProfile,
      twitterHandle: hasOfficialProfile ? symbol.toLowerCase() + '_official' : null,
      communityType: hasOfficialProfile ? 'Official' : 'Community',
      sentimentScore: Math.random() * 10,
      engagementRate: Math.random() * 0.1,
      uniqueMentions: Math.floor(mentions * (0.5 + Math.random() * 0.3)),
      riskLevel: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
      recentPosts: generateMockPosts(symbol, 3),
      lastUpdated: new Date().toISOString()
    };
  }

  async fetchTwitterData(symbol) {
    try {
      // Mock Twitter API call
      // In production, implement real Twitter API integration
      const mockData = {
        mentions: Math.floor(Math.random() * 5000) + 100,
        sentiment: Math.random() * 10,
        engagement: Math.random() * 0.1,
        topPosts: generateMockPosts(symbol, 5),
        influencerMentions: Math.floor(Math.random() * 50),
        hashtagTrends: [`#${symbol}`, `#${symbol}ToTheMoon`, `#Solana${symbol}`]
      };

      return mockData;
    } catch (error) {
      console.error('Error fetching Twitter data:', error);
      return null;
    }
  }

  async fetchSolanaTokenInfo(symbol) {
    try {
      // Mock Solana blockchain data
      // In production, implement real Solana Web3.js integration
      const mockData = {
        mintAddress: `${symbol}mint${'1'.repeat(40)}`,
        supply: Math.floor(Math.random() * 1000000000),
        holders: Math.floor(Math.random() * 100000),
        marketCap: Math.floor(Math.random() * 100000000),
        price: Math.random() * 10,
        volume24h: Math.floor(Math.random() * 10000000),
        isVerified: Math.random() > 0.3
      };

      return mockData;
    } catch (error) {
      console.error('Error fetching Solana token info:', error);
      return null;
    }
  }

  calculateTokenScore(tokenData, twitterData, solanaData) {
    let score = 0;
    
    // Twitter metrics (40% weight)
    if (twitterData) {
      score += (twitterData.mentions / 1000) * 2; // Max 2 points for mentions
      score += (twitterData.sentimentScore || 5) * 0.8; // Max 8 points for sentiment
      score += (twitterData.engagement * 100) * 0.5; // Max 5 points for engagement
    }

    // Community factors (30% weight)
    if (tokenData.hasOfficialProfile) score += 1.5;
    if (tokenData.communityScore) score += tokenData.communityScore * 0.15;

    // Solana blockchain data (20% weight)
    if (solanaData) {
      if (solanaData.isVerified) score += 1;
      score += Math.min(solanaData.holders / 10000, 1); // Max 1 point for holders
    }

    // Risk assessment (10% weight)
    const riskPenalty = tokenData.riskLevel === 'High' ? -1 : 
                       tokenData.riskLevel === 'Medium' ? -0.5 : 0;
    score += riskPenalty;

    return Math.min(Math.max(score, 0), 10); // Clamp between 0-10
  }

  filterTokens(tokens, filters) {
    return tokens.filter(token => {
              const tokenScore = token.score || token.overallScore || 0;
        if (tokenScore < filters.minScore || tokenScore > filters.maxScore) return false;
      if (token.mentions < filters.minMentions) return false;
      if (filters.hasOfficialProfile !== null && token.hasOfficialProfile !== filters.hasOfficialProfile) return false;
      return true;
    });
  }

  sortTokens(tokens, sortBy) {
    const sortFunctions = {
      score: (a, b) => b.score - a.score,
      mentions: (a, b) => b.mentions - a.mentions,
      communityScore: (a, b) => b.communityScore - a.communityScore,
      symbol: (a, b) => a.symbol.localeCompare(b.symbol)
    };

    return [...tokens].sort(sortFunctions[sortBy] || sortFunctions.score);
  }

  searchTokens(tokens, searchTerm) {
    if (!searchTerm) return tokens;
    
    const term = searchTerm.toLowerCase().trim();
    
    return tokens.filter(token => {
      // Search by symbol (case insensitive)
      if (token.symbol.toLowerCase().includes(term)) {
        return true;
      }
      
      // Search by name (case insensitive)
      if (token.name.toLowerCase().includes(term)) {
        return true;
      }
      
      // Search by contract address (case insensitive, partial match)
      if (token.contractAddress && token.contractAddress.toLowerCase().includes(term)) {
        return true;
      }
      
      // Full contract address match (for exact searches)
      if (token.contractAddress && term.length > 10 && token.contractAddress.toLowerCase() === term) {
        return true;
      }
      
      return false;
    });
  }

  // Helper functions for alternative data scoring
  determineCommunityTypeFromScore(socialScore) {
    if (socialScore > 7) return 'Official';
    if (socialScore > 5) return 'CTO';
    if (socialScore > 3) return 'Community';
    return 'Unofficial';
  }

  assessRiskLevelFromScore(score) {
    if (score > 7) return 'Low';
    if (score > 4) return 'Medium';
    return 'High';
  }

  async fetchRealRecentPosts(symbol) {
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${apiBase}/api/twitter/mentions/${symbol}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const alternativeData = data.communityAnalysis?.alternativeData;
      
      if (alternativeData?.rawData?.reddit?.recent_posts) {
        // Transform Reddit posts to our format
        return alternativeData.rawData.reddit.recent_posts.slice(0, 3).map(post => ({
          content: post.title || `Discussion about $${symbol}`,
          author: post.subreddit ? `r/${post.subreddit}` : 'reddit_user',
          timestamp: post.created ? new Date(post.created * 1000).toLocaleTimeString() : new Date().toLocaleTimeString(),
          likes: post.score || 0,
          retweets: post.comments || 0,
          platform: 'reddit',
          url: post.url || `https://reddit.com/r/${post.subreddit || 'cryptocurrency'}`
        }));
      } else {
        // Generate realistic posts based on alternative data
        const socialScore = data.communityAnalysis?.alternativeData?.socialScore || 0;
        const sentiment = data.communityAnalysis?.sentimentScore || 5;
        
        return this.generateRealisticPosts(symbol, socialScore, sentiment);
      }
    } catch (error) {
      console.error(`Error fetching real posts for ${symbol}:`, error);
      // Fallback to generate realistic posts
      return this.generateRealisticPosts(symbol, Math.random() * 10, Math.random() * 10);
    }
  }

  generateRealisticPosts(symbol, socialScore, sentiment) {
    const baseTemplates = [
      `$${symbol} showing strong momentum in the Solana ecosystem`,
      `Community support for $${symbol} continues to grow`,
      `Recent development updates for $${symbol} looking promising`,
      `$${symbol} gaining traction among DeFi users`,
      `Technical analysis suggests $${symbol} has solid fundamentals`
    ];

    const positiveTemplates = [
      `$${symbol} breaking out! 🚀 Great community behind this project`,
      `Love seeing $${symbol} grow organically. Real utility here`,
      `$${symbol} partnerships are starting to pay off`,
      `Bullish on $${symbol} long term. Strong development team`,
      `$${symbol} community is one of the most active I've seen`
    ];

    const neutralTemplates = [
      `Watching $${symbol} for potential entry points`,
      `$${symbol} holding steady despite market conditions`,
      `Interesting developments in the $${symbol} ecosystem`,
      `$${symbol} technical indicators worth monitoring`,
      `Community discussion around $${symbol} features heating up`
    ];

    let templates = baseTemplates;
    if (sentiment > 6) templates = positiveTemplates;
    else if (sentiment < 4) templates = neutralTemplates;

    const platforms = ['twitter', 'telegram', 'discord', 'reddit'];
    const authors = [
      'defi_analyst', 'solana_dev', 'crypto_researcher', 'community_mod',
      'blockchain_expert', 'trading_guru', 'tech_enthusiast', 'early_adopter'
    ];

    return Array.from({ length: 3 }, (_, i) => {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      let url = '';
      
      // Generate realistic URLs based on platform
      switch (platform) {
        case 'reddit':
          url = `https://reddit.com/r/CryptoCurrency/comments/${Math.random().toString(36).substr(2, 9)}/${symbol.toLowerCase()}_discussion/`;
          break;
        case 'twitter':
          url = `https://twitter.com/user/status/${Math.floor(Math.random() * 1000000000000000000)}`;
          break;
        case 'telegram':
          url = `https://t.me/crypto_discussion_${Math.floor(Math.random() * 1000)}`;
          break;
        case 'discord':
          url = `https://discord.gg/crypto-${symbol.toLowerCase()}`;
          break;
        default:
          url = `https://reddit.com/r/CryptoCurrency`;
      }
      
      return {
        content: templates[Math.floor(Math.random() * templates.length)],
        author: authors[Math.floor(Math.random() * authors.length)],
        timestamp: new Date(Date.now() - Math.random() * 86400000).toLocaleTimeString(),
        likes: Math.floor(socialScore * Math.random() * 100) + 10,
        retweets: Math.floor(socialScore * Math.random() * 50) + 5,
        platform: platform,
        url: url
      };
    });
  }
}

const tokenService = new TokenService();
export default tokenService;
