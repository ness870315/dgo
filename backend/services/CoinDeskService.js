import fetch from 'node-fetch';

/**
 * CoinDesk Service - Fetch latest crypto news articles
 * Uses CoinDesk Data API to get recent crypto news for content generation
 */
class CoinDeskService {
  constructor() {
    this.baseUrl = 'https://data-api.coindesk.com/news/v1';
    this.apiKey = process.env.COINDESK_API_KEY || null; // Optional API key
    this.defaultLimit = 10;
  }

  /**
   * Fetch latest crypto news articles
   */
  async getLatestNews(limit = 10) {
    try {
      console.log(`📰 [COINDESK] Fetching latest ${limit} crypto news articles...`);

      const url = `${this.baseUrl}/article/list?lang=EN&limit=${limit}`;
      
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      // Add API key if available
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`CoinDesk API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.articles || !Array.isArray(data.articles)) {
        throw new Error('Invalid response format from CoinDesk API');
      }

      console.log(`✅ [COINDESK] Fetched ${data.articles.length} articles`);
      
      // Filter and clean articles
      const cleanArticles = data.articles
        .filter(article => article && article.title && article.description)
        .map(article => ({
          title: article.title?.trim(),
          description: article.description?.trim(),
          url: article.url,
          publishedAt: article.publishedAt,
          source: article.source || 'CoinDesk',
          category: article.category || 'General'
        }))
        .slice(0, limit);

      return cleanArticles;

    } catch (error) {
      console.error('❌ [COINDESK] Error fetching news:', error.message);
      return [];
    }
  }

  /**
   * Get a random article for content generation
   */
  async getRandomArticle() {
    try {
      const articles = await this.getLatestNews(5); // Get top 5 for variety
      
      if (articles.length === 0) {
        return null;
      }

      // Pick a random article
      const randomIndex = Math.floor(Math.random() * articles.length);
      const selectedArticle = articles[randomIndex];

      console.log(`📰 [COINDESK] Selected random article: "${selectedArticle.title}"`);
      return selectedArticle;

    } catch (error) {
      console.error('❌ [COINDESK] Error getting random article:', error.message);
      return null;
    }
  }

  /**
   * Get trending topics from recent articles
   */
  async getTrendingTopics() {
    try {
      const articles = await this.getLatestNews(20);
      
      // Extract common keywords/topics from titles
      const topicCounts = {};
      
      articles.forEach(article => {
        const words = article.title
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => 
            word.length > 3 && 
            !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'said', 'more', 'than', 'were', 'been', 'into', 'only', 'time', 'very', 'when', 'much', 'after', 'over', 'also', 'back', 'well', 'here', 'most', 'even', 'make', 'take', 'like', 'know', 'just', 'come', 'think', 'look', 'want', 'give', 'tell', 'work', 'call', 'find', 'move', 'live', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report', 'decide', 'pull'].includes(word)
          );

        words.forEach(word => {
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        });
      });

      // Get top 5 trending topics
      const trendingTopics = Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count }));

      return trendingTopics;

    } catch (error) {
      console.error('❌ [COINDESK] Error getting trending topics:', error.message);
      return [];
    }
  }
}

export default CoinDeskService;
