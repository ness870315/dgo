/**
 * Early Warning Detector - Machine Learning Service
 * 
 * Detects pump/dump signals and early warning indicators:
 * - High-alpha KOL mentions new coins
 * - Sentiment shift detection
 * - Volume anomaly detection
 * - Price momentum divergence
 * - Correlation breakdown patterns
 */

class EarlyWarningDetector {
  constructor() {
    this.warningThresholds = {
      highAlphaMention: 0.8,      // Alpha score threshold for high-alpha KOLs
      sentimentShift: 0.6,         // Sentiment change threshold
      volumeAnomaly: 3.0,          // Volume spike multiplier
      priceDivergence: 0.15,       // Price momentum divergence
      correlationBreakdown: -0.3    // Correlation breakdown threshold
    };
    
    this.warningTypes = {
      PUMP_SIGNAL: 'pump_signal',
      DUMP_SIGNAL: 'dump_signal',
      HIGH_ALPHA_MENTION: 'high_alpha_mention',
      SENTIMENT_SHIFT: 'sentiment_shift',
      VOLUME_ANOMALY: 'volume_anomaly',
      PRICE_DIVERGENCE: 'price_divergence',
      CORRELATION_BREAKDOWN: 'correlation_breakdown'
    };
    
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };
  }

  /**
   * Detect early warning signals
   * @param {Object} data - Combined KOL and price data
   * @returns {Object} Warning detection results
   */
  async detect(data) {
    try {
      console.log(`🚨 [EARLY WARNING] Detecting signals for ${data.symbol || 'unknown'}`);
      
      // Validate input data
      if (!this.validateInputData(data)) {
        return this.createNoWarningResult('Insufficient data for warning detection');
      }
      
      // Extract features for detection
      const features = this.extractFeatures(data);
      
      // Run detection algorithms
      const warnings = [];
      
      // High-alpha KOL mention detection
      const highAlphaWarnings = this.detectHighAlphaMentions(features);
      warnings.push(...highAlphaWarnings);
      
      // Sentiment shift detection
      const sentimentWarnings = this.detectSentimentShifts(features);
      warnings.push(...sentimentWarnings);
      
      // Volume anomaly detection
      const volumeWarnings = this.detectVolumeAnomalies(features);
      warnings.push(...volumeWarnings);
      
      // Price divergence detection
      const divergenceWarnings = this.detectPriceDivergence(features);
      warnings.push(...divergenceWarnings);
      
      // Correlation breakdown detection
      const correlationWarnings = this.detectCorrelationBreakdown(features);
      warnings.push(...correlationWarnings);
      
      // Pump/dump signal detection
      const pumpDumpWarnings = this.detectPumpDumpSignals(features, warnings);
      warnings.push(...pumpDumpWarnings);
      
      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(warnings);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(warnings, riskScore);
      
      const result = {
        symbol: data.symbol || 'UNKNOWN',
        warnings: warnings,
        riskScore: riskScore,
        overallSeverity: this.determineOverallSeverity(warnings),
        recommendations: recommendations,
        keyIndicators: this.identifyKeyIndicators(features, warnings),
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ [EARLY WARNING] Detection complete for ${data.symbol}: ${warnings.length} warnings, Risk=${riskScore.toFixed(2)}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [EARLY WARNING] Error detecting warnings for ${data.symbol}:`, error.message);
      return this.createNoWarningResult(`Detection error: ${error.message}`);
    }
  }

  /**
   * Validate input data
   */
  validateInputData(data) {
    if (!data) return false;
    if (!data.kolMentions || data.kolMentions.length === 0) return false;
    if (!data.priceData || data.priceData.length === 0) return false;
    return true;
  }

  /**
   * Extract features for warning detection
   */
  extractFeatures(data) {
    const features = {
      // KOL data
      kolMentions: data.kolMentions || [],
      kolAlphaScores: this.extractKOLAlphaScores(data.kolMentions),
      
      // Price data
      priceData: data.priceData || [],
      priceChanges: this.calculatePriceChanges(data.priceData),
      
      // Volume data
      volumeData: this.extractVolumeData(data.priceData),
      
      // Sentiment data
      sentimentData: this.extractSentimentData(data.kolMentions),
      
      // Timing data
      mentionTiming: this.analyzeMentionTiming(data.kolMentions),
      
      // Market context
      marketCap: this.extractMarketCap(data.priceData),
      liquidity: this.estimateLiquidity(data.priceData)
    };
    
    return features;
  }

  /**
   * Extract KOL alpha scores
   */
  extractKOLAlphaScores(kolMentions) {
    const alphaScores = new Map();
    
    kolMentions.forEach(mention => {
      const handle = mention.kol_handle || mention.handle;
      if (handle && mention.alpha_score !== undefined) {
        alphaScores.set(handle, mention.alpha_score);
      }
    });
    
    return alphaScores;
  }

  /**
   * Calculate price changes
   */
  calculatePriceChanges(priceData) {
    const changes = [];
    for (let i = 1; i < priceData.length; i++) {
      const change = (priceData[i].price - priceData[i-1].price) / priceData[i-1].price;
      changes.push({
        change,
        timestamp: priceData[i].timestamp || priceData[i].time,
        price: priceData[i].price
      });
    }
    return changes;
  }

  /**
   * Extract volume data
   */
  extractVolumeData(priceData) {
    return priceData.map(p => ({
      volume: p.volume || 0,
      timestamp: p.timestamp || p.time,
      price: p.price
    }));
  }

  /**
   * Extract sentiment data
   */
  extractSentimentData(kolMentions) {
    return kolMentions.map(m => ({
      sentiment: m.sentiment || 0,
      timestamp: m.created_at || m.timestamp,
      handle: m.kol_handle || m.handle
    }));
  }

  /**
   * Analyze mention timing
   */
  analyzeMentionTiming(kolMentions) {
    const timings = kolMentions.map(m => new Date(m.created_at || m.timestamp));
    const intervals = [];
    
    for (let i = 1; i < timings.length; i++) {
      const interval = timings[i] - timings[i-1];
      intervals.push(interval / (1000 * 60)); // Convert to minutes
    }
    
    return {
      intervals,
      avgInterval: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      recentAcceleration: this.calculateRecentAcceleration(intervals)
    };
  }

  /**
   * Calculate recent acceleration
   */
  calculateRecentAcceleration(intervals) {
    if (intervals.length < 3) return 0;
    
    const recent = intervals.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = intervals.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    
    return (older - recent) / older; // Positive = accelerating
  }

  /**
   * Extract market cap
   */
  extractMarketCap(priceData) {
    const marketCaps = priceData.map(p => p.marketCap || p.mcap || 0).filter(mc => mc > 0);
    return marketCaps.length > 0 ? marketCaps.reduce((a, b) => a + b, 0) / marketCaps.length : 0;
  }

  /**
   * Estimate liquidity
   */
  estimateLiquidity(priceData) {
    const volumes = priceData.map(p => p.volume || 0);
    return volumes.reduce((a, b) => a + b, 0) / volumes.length;
  }

  /**
   * Detect high-alpha KOL mentions
   */
  detectHighAlphaMentions(features) {
    const warnings = [];
    const highAlphaThreshold = this.warningThresholds.highAlphaMention;
    
    features.kolMentions.forEach(mention => {
      const handle = mention.kol_handle || mention.handle;
      const alphaScore = features.kolAlphaScores.get(handle) || 0;
      
      if (alphaScore >= highAlphaThreshold) {
        warnings.push({
          type: this.warningTypes.HIGH_ALPHA_MENTION,
          severity: this.determineSeverity(alphaScore),
          message: `High-alpha KOL @${handle} mentioned (Alpha: ${alphaScore.toFixed(2)})`,
          details: {
            kolHandle: handle,
            alphaScore: alphaScore,
            sentiment: mention.sentiment || 0,
            timestamp: mention.created_at || mention.timestamp
          },
          confidence: this.calculateAlphaConfidence(alphaScore),
          timestamp: new Date().toISOString()
        });
      }
    });
    
    return warnings;
  }

  /**
   * Detect sentiment shifts
   */
  detectSentimentShifts(features) {
    const warnings = [];
    const sentimentData = features.sentimentData;
    
    if (sentimentData.length < 5) return warnings;
    
    // Calculate sentiment trend
    const sentiments = sentimentData.map(s => s.sentiment);
    const recentSentiment = sentiments.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const olderSentiment = sentiments.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const sentimentChange = recentSentiment - olderSentiment;
    
    if (Math.abs(sentimentChange) >= this.warningThresholds.sentimentShift) {
      const direction = sentimentChange > 0 ? 'bullish' : 'bearish';
      const severity = Math.abs(sentimentChange) > 0.8 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM;
      
      warnings.push({
        type: this.warningTypes.SENTIMENT_SHIFT,
        severity: severity,
        message: `Significant ${direction} sentiment shift detected (${sentimentChange.toFixed(2)})`,
        details: {
          sentimentChange: sentimentChange,
          recentSentiment: recentSentiment,
          olderSentiment: olderSentiment,
          direction: direction
        },
        confidence: this.calculateSentimentConfidence(sentimentData),
        timestamp: new Date().toISOString()
      });
    }
    
    return warnings;
  }

  /**
   * Detect volume anomalies
   */
  detectVolumeAnomalies(features) {
    const warnings = [];
    const volumeData = features.volumeData;
    
    if (volumeData.length < 10) return warnings;
    
    // Calculate volume statistics
    const volumes = volumeData.map(v => v.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const stdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length);
    
    // Detect recent volume spikes
    const recentVolumes = volumes.slice(-5); // Last 5 data points
    recentVolumes.forEach((volume, index) => {
      const spikeIntensity = (volume - avgVolume) / stdDev;
      
      if (spikeIntensity >= this.warningThresholds.volumeAnomaly) {
        const severity = spikeIntensity > 5 ? this.severityLevels.CRITICAL : 
                        spikeIntensity > 4 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM;
        
        warnings.push({
          type: this.warningTypes.VOLUME_ANOMALY,
          severity: severity,
          message: `Volume spike detected (${spikeIntensity.toFixed(1)}x average)`,
          details: {
            spikeIntensity: spikeIntensity,
            volume: volume,
            avgVolume: avgVolume,
            timestamp: volumeData[volumeData.length - 5 + index].timestamp
          },
          confidence: this.calculateVolumeConfidence(spikeIntensity),
          timestamp: new Date().toISOString()
        });
      }
    });
    
    return warnings;
  }

  /**
   * Detect price divergence
   */
  detectPriceDivergence(features) {
    const warnings = [];
    const priceChanges = features.priceChanges;
    
    if (priceChanges.length < 10) return warnings;
    
    // Calculate price momentum
    const recentChanges = priceChanges.slice(-5).map(p => p.change);
    const olderChanges = priceChanges.slice(0, 5).map(p => p.change);
    
    const recentMomentum = recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length;
    const olderMomentum = olderChanges.reduce((a, b) => a + b, 0) / olderChanges.length;
    
    const momentumDivergence = Math.abs(recentMomentum - olderMomentum);
    
    if (momentumDivergence >= this.warningThresholds.priceDivergence) {
      const direction = recentMomentum > olderMomentum ? 'accelerating' : 'decelerating';
      const severity = momentumDivergence > 0.25 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM;
      
      warnings.push({
        type: this.warningTypes.PRICE_DIVERGENCE,
        severity: severity,
        message: `Price momentum ${direction} detected (${momentumDivergence.toFixed(3)})`,
        details: {
          momentumDivergence: momentumDivergence,
          recentMomentum: recentMomentum,
          olderMomentum: olderMomentum,
          direction: direction
        },
        confidence: this.calculateDivergenceConfidence(momentumDivergence),
        timestamp: new Date().toISOString()
      });
    }
    
    return warnings;
  }

  /**
   * Detect correlation breakdown
   */
  detectCorrelationBreakdown(features) {
    const warnings = [];
    const sentimentData = features.sentimentData;
    const priceChanges = features.priceChanges;
    
    if (sentimentData.length < 5 || priceChanges.length < 5) return warnings;
    
    // Calculate correlation between sentiment and price changes
    const correlation = this.calculateSentimentPriceCorrelation(sentimentData, priceChanges);
    
    if (correlation <= this.warningThresholds.correlationBreakdown) {
      const severity = correlation < -0.5 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM;
      
      warnings.push({
        type: this.warningTypes.CORRELATION_BREAKDOWN,
        severity: severity,
        message: `KOL-price correlation breakdown detected (${correlation.toFixed(2)})`,
        details: {
          correlation: correlation,
          sentimentCount: sentimentData.length,
          priceChangeCount: priceChanges.length
        },
        confidence: this.calculateCorrelationConfidence(correlation),
        timestamp: new Date().toISOString()
      });
    }
    
    return warnings;
  }

  /**
   * Calculate sentiment-price correlation
   */
  calculateSentimentPriceCorrelation(sentimentData, priceChanges) {
    if (sentimentData.length < 3 || priceChanges.length < 3) return 0;
    
    // Align sentiment and price data by timestamp
    const alignedData = [];
    
    sentimentData.forEach(sentiment => {
      const sentimentTime = new Date(sentiment.timestamp);
      
      // Find closest price change
      let closestPriceChange = null;
      let minTimeDiff = Infinity;
      
      priceChanges.forEach(priceChange => {
        const priceTime = new Date(priceChange.timestamp);
        const timeDiff = Math.abs(priceTime - sentimentTime);
        
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestPriceChange = priceChange;
        }
      });
      
      if (closestPriceChange && minTimeDiff < 60 * 60 * 1000) { // Within 1 hour
        alignedData.push({
          sentiment: sentiment.sentiment,
          priceChange: closestPriceChange.change
        });
      }
    });
    
    if (alignedData.length < 3) return 0;
    
    // Calculate correlation
    const sentiments = alignedData.map(d => d.sentiment);
    const priceChanges = alignedData.map(d => d.priceChange);
    
    return this.calculatePearsonCorrelation(sentiments, priceChanges);
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculatePearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
    const sumX2 = x.reduce((sum, val) => sum + (val * val), 0);
    const sumY2 = y.reduce((sum, val) => sum + (val * val), 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect pump/dump signals
   */
  detectPumpDumpSignals(features, existingWarnings) {
    const warnings = [];
    
    // Analyze warning patterns to detect pump/dump signals
    const highAlphaWarnings = existingWarnings.filter(w => w.type === this.warningTypes.HIGH_ALPHA_MENTION);
    const volumeWarnings = existingWarnings.filter(w => w.type === this.warningTypes.VOLUME_ANOMALY);
    const sentimentWarnings = existingWarnings.filter(w => w.type === this.warningTypes.SENTIMENT_SHIFT);
    
    // Pump signal: High-alpha mentions + volume spike + bullish sentiment
    if (highAlphaWarnings.length > 0 && volumeWarnings.length > 0) {
      const bullishSentimentWarnings = sentimentWarnings.filter(w => 
        w.details.direction === 'bullish'
      );
      
      if (bullishSentimentWarnings.length > 0) {
        warnings.push({
          type: this.warningTypes.PUMP_SIGNAL,
          severity: this.severityLevels.HIGH,
          message: `Potential pump signal detected: High-alpha KOL + Volume spike + Bullish sentiment`,
          details: {
            highAlphaCount: highAlphaWarnings.length,
            volumeSpikeCount: volumeWarnings.length,
            bullishSentimentCount: bullishSentimentWarnings.length,
            combinedStrength: this.calculateCombinedStrength(highAlphaWarnings, volumeWarnings, bullishSentimentWarnings)
          },
          confidence: this.calculatePumpSignalConfidence(highAlphaWarnings, volumeWarnings, bullishSentimentWarnings),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Dump signal: High-alpha mentions + volume spike + bearish sentiment
    if (highAlphaWarnings.length > 0 && volumeWarnings.length > 0) {
      const bearishSentimentWarnings = sentimentWarnings.filter(w => 
        w.details.direction === 'bearish'
      );
      
      if (bearishSentimentWarnings.length > 0) {
        warnings.push({
          type: this.warningTypes.DUMP_SIGNAL,
          severity: this.severityLevels.HIGH,
          message: `Potential dump signal detected: High-alpha KOL + Volume spike + Bearish sentiment`,
          details: {
            highAlphaCount: highAlphaWarnings.length,
            volumeSpikeCount: volumeWarnings.length,
            bearishSentimentCount: bearishSentimentWarnings.length,
            combinedStrength: this.calculateCombinedStrength(highAlphaWarnings, volumeWarnings, bearishSentimentWarnings)
          },
          confidence: this.calculateDumpSignalConfidence(highAlphaWarnings, volumeWarnings, bearishSentimentWarnings),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return warnings;
  }

  /**
   * Calculate combined strength of signals
   */
  calculateCombinedStrength(highAlphaWarnings, volumeWarnings, sentimentWarnings) {
    const alphaStrength = highAlphaWarnings.reduce((sum, w) => sum + w.details.alphaScore, 0) / highAlphaWarnings.length;
    const volumeStrength = volumeWarnings.reduce((sum, w) => sum + w.details.spikeIntensity, 0) / volumeWarnings.length;
    const sentimentStrength = Math.abs(sentimentWarnings.reduce((sum, w) => sum + w.details.sentimentChange, 0) / sentimentWarnings.length);
    
    return (alphaStrength + volumeStrength + sentimentStrength) / 3;
  }

  /**
   * Calculate risk score
   */
  calculateRiskScore(warnings) {
    if (warnings.length === 0) return 0;
    
    const severityWeights = {
      [this.severityLevels.LOW]: 0.2,
      [this.severityLevels.MEDIUM]: 0.5,
      [this.severityLevels.HIGH]: 0.8,
      [this.severityLevels.CRITICAL]: 1.0
    };
    
    const weightedScore = warnings.reduce((sum, warning) => {
      const severityWeight = severityWeights[warning.severity] || 0.5;
      const confidenceWeight = warning.confidence || 0.5;
      return sum + (severityWeight * confidenceWeight);
    }, 0);
    
    return Math.min(1, weightedScore / warnings.length);
  }

  /**
   * Determine overall severity
   */
  determineOverallSeverity(warnings) {
    if (warnings.length === 0) return this.severityLevels.LOW;
    
    const severities = warnings.map(w => w.severity);
    
    if (severities.includes(this.severityLevels.CRITICAL)) return this.severityLevels.CRITICAL;
    if (severities.includes(this.severityLevels.HIGH)) return this.severityLevels.HIGH;
    if (severities.includes(this.severityLevels.MEDIUM)) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(warnings, riskScore) {
    const recommendations = [];
    
    if (riskScore > 0.8) {
      recommendations.push('High risk detected - consider reducing position size');
    }
    
    const pumpSignals = warnings.filter(w => w.type === this.warningTypes.PUMP_SIGNAL);
    if (pumpSignals.length > 0) {
      recommendations.push('Pump signal detected - monitor for potential price increase');
    }
    
    const dumpSignals = warnings.filter(w => w.type === this.warningTypes.DUMP_SIGNAL);
    if (dumpSignals.length > 0) {
      recommendations.push('Dump signal detected - consider exit strategy');
    }
    
    const highAlphaWarnings = warnings.filter(w => w.type === this.warningTypes.HIGH_ALPHA_MENTION);
    if (highAlphaWarnings.length > 0) {
      recommendations.push('High-alpha KOL activity - monitor closely for trading opportunities');
    }
    
    const volumeWarnings = warnings.filter(w => w.type === this.warningTypes.VOLUME_ANOMALY);
    if (volumeWarnings.length > 0) {
      recommendations.push('Volume anomaly detected - verify with additional indicators');
    }
    
    return recommendations;
  }

  /**
   * Identify key indicators
   */
  identifyKeyIndicators(features, warnings) {
    const indicators = [];
    
    if (features.kolAlphaScores.size > 0) {
      const maxAlpha = Math.max(...features.kolAlphaScores.values());
      if (maxAlpha > 0.8) {
        indicators.push(`High-alpha KOL activity (Max: ${maxAlpha.toFixed(2)})`);
      }
    }
    
    if (features.mentionTiming.recentAcceleration > 0.2) {
      indicators.push('Accelerating mention frequency');
    }
    
    const volumeData = features.volumeData;
    if (volumeData.length > 0) {
      const recentVolume = volumeData.slice(-3).reduce((sum, v) => sum + v.volume, 0) / 3;
      const avgVolume = volumeData.reduce((sum, v) => sum + v.volume, 0) / volumeData.length;
      if (recentVolume > avgVolume * 2) {
        indicators.push('Recent volume increase');
      }
    }
    
    return indicators;
  }

  /**
   * Determine severity level
   */
  determineSeverity(score) {
    if (score >= 0.9) return this.severityLevels.CRITICAL;
    if (score >= 0.7) return this.severityLevels.HIGH;
    if (score >= 0.5) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  /**
   * Calculate confidence scores for different warning types
   */
  calculateAlphaConfidence(alphaScore) {
    return Math.min(0.95, alphaScore);
  }

  calculateSentimentConfidence(sentimentData) {
    return Math.min(0.95, sentimentData.length / 10);
  }

  calculateVolumeConfidence(spikeIntensity) {
    return Math.min(0.95, spikeIntensity / 5);
  }

  calculateDivergenceConfidence(divergence) {
    return Math.min(0.95, divergence * 2);
  }

  calculateCorrelationConfidence(correlation) {
    return Math.min(0.95, Math.abs(correlation));
  }

  calculatePumpSignalConfidence(highAlphaWarnings, volumeWarnings, sentimentWarnings) {
    const alphaConfidence = highAlphaWarnings.reduce((sum, w) => sum + w.confidence, 0) / highAlphaWarnings.length;
    const volumeConfidence = volumeWarnings.reduce((sum, w) => sum + w.confidence, 0) / volumeWarnings.length;
    const sentimentConfidence = sentimentWarnings.reduce((sum, w) => sum + w.confidence, 0) / sentimentWarnings.length;
    
    return (alphaConfidence + volumeConfidence + sentimentConfidence) / 3;
  }

  calculateDumpSignalConfidence(highAlphaWarnings, volumeWarnings, sentimentWarnings) {
    return this.calculatePumpSignalConfidence(highAlphaWarnings, volumeWarnings, sentimentWarnings);
  }

  /**
   * Create no warning result
   */
  createNoWarningResult(reason) {
    return {
      symbol: 'UNKNOWN',
      warnings: [],
      riskScore: 0,
      overallSeverity: this.severityLevels.LOW,
      recommendations: [reason],
      keyIndicators: [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Batch detect for multiple tokens
   */
  async detectBatch(tokenData) {
    console.log(`🚨 [EARLY WARNING] Batch detecting for ${tokenData.length} tokens`);
    
    const results = [];
    for (const data of tokenData) {
      const result = await this.detect(data);
      results.push(result);
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    console.log(`✅ [EARLY WARNING] Batch detection complete: ${results.length} results`);
    return results;
  }
}

export default EarlyWarningDetector;
