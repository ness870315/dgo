import fs from 'fs/promises';
import path from 'path';

/**
 * Prediction Tracking Database
 * Stores and manages price predictions with accuracy tracking
 */

class PredictionTrackingDatabase {
  constructor() {
    // Storage configuration
    this.storageDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'prediction-tracking-db')
      : path.join(process.cwd(), 'data', 'prediction-tracking-db');
    
    // Database files
    this.predictionsFile = path.join(this.storageDir, 'predictions.json');
    this.accuracyFile = path.join(this.storageDir, 'accuracy-metrics.json');
    this.tokensFile = path.join(this.storageDir, 'tracked-tokens.json');
    
    // In-memory storage
    this.predictions = [];
    this.accuracyMetrics = {};
    this.trackedTokens = new Set();
    
    this.initializeDatabase();
    console.log('📊 [PREDICTION DB] Prediction Tracking Database initialized');
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to create storage directory:', error.message);
      throw error;
    }
  }

  /**
   * Initialize database
   */
  async initializeDatabase() {
    try {
      await this.ensureStorageDir();
      await this.loadData();
      console.log(`📁 [PREDICTION DB] Database initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to initialize database:', error.message);
    }
  }

  /**
   * Store a new prediction
   */
  async storePrediction(prediction) {
    try {
      // Add tracking metadata
      const trackedPrediction = {
        ...prediction,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastChecked: null,
        checks: [],
        finalAccuracy: null,
        completedAt: null
      };

      // Atomic save
      const tempPredictions = [...this.predictions, trackedPrediction];
      await this.savePredictionsAtomic(tempPredictions);
      
      // Update in-memory array after successful save
      this.predictions = tempPredictions;
      
      // Add token to tracking if not already tracked
      if (!this.trackedTokens.has(prediction.token)) {
        this.trackedTokens.add(prediction.token);
        await this.saveTrackedTokens();
      }

      console.log(`💾 [PREDICTION DB] Stored prediction: ${prediction.token} -> ${prediction.predictedValue.value} (${prediction.predictionType})`);
      
      return trackedPrediction;

    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to store prediction:', error.message);
      return null;
    }
  }

  /**
   * Update prediction with price check
   */
  async updatePredictionCheck(predictionId, priceCheck) {
    try {
      const predictionIndex = this.predictions.findIndex(p => p.id === predictionId);
      if (predictionIndex === -1) {
        console.warn(`⚠️ [PREDICTION DB] Prediction ${predictionId} not found`);
        return null;
      }

      const prediction = this.predictions[predictionIndex];
      
      // Add price check
      prediction.checks.push({
        timestamp: new Date().toISOString(),
        currentPrice: priceCheck.currentPrice,
        priceChange: priceCheck.priceChange,
        accuracy: priceCheck.accuracy,
        status: priceCheck.status
      });

      prediction.lastChecked = new Date().toISOString();

      // Check if prediction is complete
      if (this.isPredictionComplete(prediction)) {
        prediction.status = 'completed';
        prediction.completedAt = new Date().toISOString();
        prediction.finalAccuracy = this.calculateFinalAccuracy(prediction);
        
        // Update accuracy metrics
        await this.updateAccuracyMetrics(prediction);
      }

      // Atomic save
      const tempPredictions = [...this.predictions];
      tempPredictions[predictionIndex] = prediction;
      await this.savePredictionsAtomic(tempPredictions);
      
      this.predictions = tempPredictions;

      console.log(`📈 [PREDICTION DB] Updated prediction check: ${prediction.token} (${priceCheck.accuracy?.toFixed(2)}% accuracy)`);
      
      return prediction;

    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to update prediction check:', error.message);
      return null;
    }
  }

  /**
   * Check if prediction is complete based on timeframe
   */
  isPredictionComplete(prediction) {
    const createdAt = new Date(prediction.createdAt);
    const timeframeDays = prediction.timeframe.days;
    const deadline = new Date(createdAt.getTime() + (timeframeDays * 24 * 60 * 60 * 1000));
    
    return new Date() >= deadline;
  }

  /**
   * Calculate final accuracy for completed prediction
   */
  calculateFinalAccuracy(prediction) {
    if (!prediction.checks || prediction.checks.length === 0) {
      return null;
    }

    // Use the last check's accuracy as final accuracy
    const lastCheck = prediction.checks[prediction.checks.length - 1];
    return lastCheck.accuracy;
  }

  /**
   * Update accuracy metrics for author
   */
  async updateAccuracyMetrics(prediction) {
    try {
      const author = prediction.metadata.author.username;
      
      if (!this.accuracyMetrics[author]) {
        this.accuracyMetrics[author] = {
          totalPredictions: 0,
          completedPredictions: 0,
          averageAccuracy: 0,
          accuracyHistory: [],
          tokenAccuracy: {},
          predictionTypes: {}
        };
      }

      const metrics = this.accuracyMetrics[author];
      
      // Update counts
      metrics.totalPredictions++;
      if (prediction.status === 'completed') {
        metrics.completedPredictions++;
        
        // Update average accuracy
        const totalAccuracy = metrics.averageAccuracy * (metrics.completedPredictions - 1) + prediction.finalAccuracy;
        metrics.averageAccuracy = totalAccuracy / metrics.completedPredictions;
        
        // Add to history
        metrics.accuracyHistory.push({
          predictionId: prediction.id,
          accuracy: prediction.finalAccuracy,
          token: prediction.token,
          predictionType: prediction.predictionType,
          completedAt: prediction.completedAt
        });

        // Update token-specific accuracy
        if (!metrics.tokenAccuracy[prediction.token]) {
          metrics.tokenAccuracy[prediction.token] = { total: 0, sum: 0, average: 0 };
        }
        const tokenMetrics = metrics.tokenAccuracy[prediction.token];
        tokenMetrics.total++;
        tokenMetrics.sum += prediction.finalAccuracy;
        tokenMetrics.average = tokenMetrics.sum / tokenMetrics.total;

        // Update prediction type accuracy
        if (!metrics.predictionTypes[prediction.predictionType]) {
          metrics.predictionTypes[prediction.predictionType] = { total: 0, sum: 0, average: 0 };
        }
        const typeMetrics = metrics.predictionTypes[prediction.predictionType];
        typeMetrics.total++;
        typeMetrics.sum += prediction.finalAccuracy;
        typeMetrics.average = typeMetrics.sum / typeMetrics.total;
      }

      // Save metrics
      await this.saveAccuracyMetrics();

    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to update accuracy metrics:', error.message);
    }
  }

  /**
   * Get predictions by author
   */
  getPredictionsByAuthor(author, limit = 50) {
    return this.predictions
      .filter(p => p.metadata.author.username === author)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Get active predictions
   */
  getActivePredictions() {
    return this.predictions.filter(p => p.status === 'active');
  }

  /**
   * Get completed predictions
   */
  getCompletedPredictions(limit = 100) {
    return this.predictions
      .filter(p => p.status === 'completed')
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, limit);
  }

  /**
   * Get accuracy metrics for author
   */
  getAccuracyMetrics(author) {
    return this.accuracyMetrics[author] || null;
  }

  /**
   * Get top performers by accuracy
   */
  getTopPerformers(limit = 10) {
    return Object.entries(this.accuracyMetrics)
      .filter(([author, metrics]) => metrics.completedPredictions >= 3) // Minimum 3 predictions
      .map(([author, metrics]) => ({
        author,
        averageAccuracy: metrics.averageAccuracy,
        completedPredictions: metrics.completedPredictions,
        totalPredictions: metrics.totalPredictions,
        successRate: metrics.completedPredictions / metrics.totalPredictions
      }))
      .sort((a, b) => b.averageAccuracy - a.averageAccuracy)
      .slice(0, limit);
  }

  /**
   * Get prediction statistics
   */
  getStatistics() {
    const totalPredictions = this.predictions.length;
    const activePredictions = this.predictions.filter(p => p.status === 'active').length;
    const completedPredictions = this.predictions.filter(p => p.status === 'completed').length;
    
    const authors = new Set(this.predictions.map(p => p.metadata.author.username));
    const tokens = new Set(this.predictions.map(p => p.token));
    
    return {
      totalPredictions,
      activePredictions,
      completedPredictions,
      uniqueAuthors: authors.size,
      uniqueTokens: tokens.size,
      averageAccuracy: this.calculateOverallAverageAccuracy(),
      topPerformers: this.getTopPerformers(5)
    };
  }

  /**
   * Calculate overall average accuracy
   */
  calculateOverallAverageAccuracy() {
    const completedPredictions = this.predictions.filter(p => p.status === 'completed' && p.finalAccuracy !== null);
    if (completedPredictions.length === 0) return 0;
    
    const totalAccuracy = completedPredictions.reduce((sum, p) => sum + p.finalAccuracy, 0);
    return totalAccuracy / completedPredictions.length;
  }

  /**
   * Atomic save operations
   */
  async savePredictionsAtomic(predictions) {
    try {
      await this.ensureStorageDir();
      
      const data = {
        predictions,
        lastSaved: new Date().toISOString(),
        totalPredictions: predictions.length
      };
      
      const tempFile = this.predictionsFile + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
      await fs.rename(tempFile, this.predictionsFile);
      
      console.log(`💾 [PREDICTION DB] Predictions saved atomically (${predictions.length} predictions)`);
      
    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to save predictions atomically:', error.message);
      throw error;
    }
  }

  async saveAccuracyMetrics() {
    try {
      await this.ensureStorageDir();
      
      const data = {
        metrics: this.accuracyMetrics,
        lastSaved: new Date().toISOString()
      };
      
      await fs.writeFile(this.accuracyFile, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to save accuracy metrics:', error.message);
    }
  }

  async saveTrackedTokens() {
    try {
      await this.ensureStorageDir();
      
      const data = {
        tokens: Array.from(this.trackedTokens),
        lastSaved: new Date().toISOString()
      };
      
      await fs.writeFile(this.tokensFile, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error('❌ [PREDICTION DB] Failed to save tracked tokens:', error.message);
    }
  }

  /**
   * Load data from disk
   */
  async loadData() {
    try {
      await this.ensureStorageDir();
      
      // Load predictions
      try {
        const predictionsData = await fs.readFile(this.predictionsFile, 'utf8');
        const parsed = JSON.parse(predictionsData);
        this.predictions = parsed.predictions || [];
        console.log(`📂 [PREDICTION DB] Loaded ${this.predictions.length} predictions`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [PREDICTION DB] No existing predictions found, starting fresh');
          this.predictions = [];
        } else {
          throw error;
        }
      }

      // Load accuracy metrics
      try {
        const metricsData = await fs.readFile(this.accuracyFile, 'utf8');
        const parsed = JSON.parse(metricsData);
        this.accuracyMetrics = parsed.metrics || {};
        console.log(`📂 [PREDICTION DB] Loaded accuracy metrics for ${Object.keys(this.accuracyMetrics).length} authors`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [PREDICTION DB] No existing accuracy metrics found, starting fresh');
          this.accuracyMetrics = {};
        } else {
          throw error;
        }
      }

      // Load tracked tokens
      try {
        const tokensData = await fs.readFile(this.tokensFile, 'utf8');
        const parsed = JSON.parse(tokensData);
        this.trackedTokens = new Set(parsed.tokens || []);
        console.log(`📂 [PREDICTION DB] Loaded ${this.trackedTokens.size} tracked tokens`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [PREDICTION DB] No existing tracked tokens found, starting fresh');
          this.trackedTokens = new Set();
        } else {
          throw error;
        }
      }

    } catch (error) {
      console.error('❌ [PREDICTION DB] Error loading data:', error.message);
    }
  }
}

export default PredictionTrackingDatabase;
