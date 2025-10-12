/**
 * DGO Opinion Database
 * 
 * Stores Degen Oracle's opinions on market sentiment over time.
 * Allows the bot to:
 * - Track its takes and predictions
 * - Reference past opinions
 * - Revisit old calls and see if they aged well
 * - Build conviction patterns over time
 * 
 * Future features:
 * - Pattern recognition in opinion history
 * - "I called this X weeks ago" references
 * - Admitting when wrong: "OK that didn't age well"
 * - Flexing when right: "Told you so"
 */

import fs from 'fs/promises';
import path from 'path';

class DGOOpinionDatabase {
  constructor() {
    this.dataDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'dgo-opinions')
      : path.join(process.cwd(), 'data', 'dgo-opinions');
    
    this.opinionsFile = path.join(this.dataDir, 'opinions.json');
    this.opinions = [];
    
    console.log('🧠 [DGO OPINIONS] Database initialized');
    console.log('   Data dir:', this.dataDir);
  }

  /**
   * Initialize database (create directory and load existing opinions)
   */
  async initialize() {
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing opinions
      await this.loadOpinions();
      
      console.log(`✅ [DGO OPINIONS] Loaded ${this.opinions.length} opinions`);
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Initialization error:', error.message);
    }
  }

  /**
   * Load opinions from disk
   */
  async loadOpinions() {
    try {
      const data = await fs.readFile(this.opinionsFile, 'utf8');
      this.opinions = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - start fresh
        this.opinions = [];
        await this.saveOpinions();
      } else {
        throw error;
      }
    }
  }

  /**
   * Save opinions to disk
   */
  async saveOpinions() {
    try {
      await fs.writeFile(
        this.opinionsFile,
        JSON.stringify(this.opinions, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Save error:', error.message);
    }
  }

  /**
   * Store a new opinion
   * @param {Object} opinion - Opinion data
   * @param {string} opinion.text - The tweet text
   * @param {string} opinion.marketContext - Market context from Perplexity
   * @param {string} opinion.sentiment - bullish/bearish/neutral/cynical
   * @param {string} opinion.tweetId - Twitter tweet ID (if posted)
   * @param {string} opinion.type - normal/meme/news/etc
   */
  async storeOpinion(opinion) {
    try {
      const opinionRecord = {
        id: `opinion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: opinion.text,
        marketContext: opinion.marketContext || 'Unknown',
        sentiment: this.classifySentiment(opinion.text),
        manualSentiment: opinion.sentiment || null, // User/AI provided sentiment
        tweetId: opinion.tweetId || null,
        type: opinion.type || 'normal',
        timestamp: new Date().toISOString(),
        dateString: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        })
      };

      this.opinions.push(opinionRecord);
      await this.saveOpinions();

      console.log(`💾 [DGO OPINIONS] Stored opinion #${this.opinions.length}:`, {
        id: opinionRecord.id,
        sentiment: opinionRecord.sentiment,
        preview: opinionRecord.text.substring(0, 60) + '...'
      });

      return opinionRecord;
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Store error:', error.message);
      return null;
    }
  }

  /**
   * Classify sentiment of opinion text
   */
  classifySentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Bullish indicators
    const bullishWords = ['uptober', 'bullish', 'moon', 'wagmi', 'gm bulls', 'believe', 'ready', 'builders'];
    const bullishCount = bullishWords.filter(word => lowerText.includes(word)).length;
    
    // Bearish indicators
    const bearishWords = ['downtober', 'rekt', 'liquidat', 'crash', 'blood', 'dip', 'nuked', 'dump'];
    const bearishCount = bearishWords.filter(word => lowerText.includes(word)).length;
    
    // Cynical/sarcastic indicators
    const cynicalWords = ['damn', 'holy shit', 'wtf', 'yikes', 'fuck', 'not sorry', 'cope', 'ngmi'];
    const cynicalCount = cynicalWords.filter(word => lowerText.includes(word)).length;
    
    if (cynicalCount >= 2) return 'cynical';
    if (bullishCount > bearishCount) return 'bullish';
    if (bearishCount > bullishCount) return 'bearish';
    return 'neutral';
  }

  /**
   * Get all opinions
   */
  async getAllOpinions() {
    return this.opinions;
  }

  /**
   * Get opinions by sentiment
   */
  async getOpinionsBySentiment(sentiment) {
    return this.opinions.filter(op => op.sentiment === sentiment);
  }

  /**
   * Get recent opinions (last N)
   */
  async getRecentOpinions(limit = 10) {
    return this.opinions.slice(-limit).reverse();
  }

  /**
   * Search opinions by keyword
   */
  async searchOpinions(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.opinions.filter(op => 
      op.text.toLowerCase().includes(lowerKeyword) ||
      op.marketContext.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * Get opinion stats
   */
  async getStats() {
    const total = this.opinions.length;
    const sentimentCounts = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
      cynical: 0
    };

    this.opinions.forEach(op => {
      sentimentCounts[op.sentiment]++;
    });

    const last7Days = this.opinions.filter(op => {
      const opDate = new Date(op.timestamp);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return opDate >= weekAgo;
    });

    return {
      total,
      sentimentCounts,
      sentimentPercentages: {
        bullish: ((sentimentCounts.bullish / total) * 100).toFixed(1),
        bearish: ((sentimentCounts.bearish / total) * 100).toFixed(1),
        neutral: ((sentimentCounts.neutral / total) * 100).toFixed(1),
        cynical: ((sentimentCounts.cynical / total) * 100).toFixed(1)
      },
      last7DaysCount: last7Days.length,
      oldestOpinion: this.opinions[0]?.dateString || 'None',
      newestOpinion: this.opinions[this.opinions.length - 1]?.dateString || 'None'
    };
  }

  /**
   * Get a random past opinion (for future "throwback" features)
   */
  async getRandomOpinion() {
    if (this.opinions.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * this.opinions.length);
    return this.opinions[randomIndex];
  }
}

export default DGOOpinionDatabase;

