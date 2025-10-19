import mongoose from 'mongoose';

/**
 * LST Data Schema - Stores Liquid Staking Token information
 */
const lstDataSchema = new mongoose.Schema({
  // Basic token information
  mint: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  decimals: {
    type: Number,
    default: 9
  },
  description: String,
  website: String,
  logo: String,
  
  // Staking information
  stakePool: {
    type: String,
    index: true
  },
  validator: String,
  
  // Source and verification
  source: {
    type: String,
    enum: ['sanctum', 'compass', 'github'],
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  
  // Financial metrics
  tvl: {
    type: Number,
    default: 0
  },
  apr: {
    type: Number,
    default: 5.0
  },
  apy: {
    type: Number,
    default: 5.0
  },
  
  // Risk and liquidity
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    default: 5.0
  },
  liquidity: {
    totalSupply: {
      type: Number,
      default: 0
    },
    estimatedLiquidity: {
      type: Number,
      default: 0
    },
    liquidityScore: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    }
  },
  
  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
lstDataSchema.index({ apr: -1 }); // For sorting by APR
lstDataSchema.index({ riskScore: 1 }); // For filtering by risk
lstDataSchema.index({ tvl: -1 }); // For sorting by TVL
lstDataSchema.index({ verified: 1 }); // For filtering verified LSTs
lstDataSchema.index({ source: 1 }); // For filtering by source

// Virtual for risk-adjusted return
lstDataSchema.virtual('riskAdjustedReturn').get(function() {
  return this.apr / this.riskScore;
});

// Static methods
lstDataSchema.statics.findByMint = function(mint) {
  return this.findOne({ mint });
};

lstDataSchema.statics.findTopByAPR = function(limit = 10) {
  return this.find({ verified: true })
    .sort({ apr: -1 })
    .limit(limit);
};

lstDataSchema.statics.findLowRisk = function(maxRisk = 5.0) {
  return this.find({ 
    verified: true, 
    riskScore: { $lte: maxRisk } 
  }).sort({ riskScore: 1 });
};

lstDataSchema.statics.findHighLiquidity = function() {
  return this.find({ 
    verified: true,
    'liquidity.liquidityScore': { $in: ['high', 'medium'] }
  }).sort({ tvl: -1 });
};

// Instance methods
lstDataSchema.methods.updateMetrics = async function() {
  // This would be called to update APR, risk score, etc.
  // Implementation would depend on the LSTRegistryService
  this.lastUpdated = new Date();
  return this.save();
};

lstDataSchema.methods.toPublicJSON = function() {
  return {
    mint: this.mint,
    symbol: this.symbol,
    name: this.name,
    decimals: this.decimals,
    description: this.description,
    website: this.website,
    logo: this.logo,
    stakePool: this.stakePool,
    apr: this.apr,
    apy: this.apy,
    riskScore: this.riskScore,
    riskAdjustedReturn: this.riskAdjustedReturn,
    liquidity: this.liquidity,
    verified: this.verified,
    source: this.source,
    lastUpdated: this.lastUpdated
  };
};

export const LSTData = mongoose.model('LSTData', lstDataSchema);

/**
 * LST Registry Stats Schema - Stores registry statistics
 */
const lstRegistryStatsSchema = new mongoose.Schema({
  totalLSTs: {
    type: Number,
    default: 0
  },
  verifiedLSTs: {
    type: Number,
    default: 0
  },
  averageAPR: {
    type: Number,
    default: 0
  },
  averageRiskScore: {
    type: Number,
    default: 0
  },
  totalTVL: {
    type: Number,
    default: 0
  },
  sources: {
    sanctum: {
      type: Number,
      default: 0
    },
    compass: {
      type: Number,
      default: 0
    },
    github: {
      type: Number,
      default: 0
    }
  },
  lastSyncTime: {
    type: Date,
    default: Date.now
  },
  syncStatus: {
    type: String,
    enum: ['success', 'failed', 'in_progress'],
    default: 'success'
  },
  syncError: String
}, {
  timestamps: true
});

// Index for finding latest stats
lstRegistryStatsSchema.index({ createdAt: -1 });

export const LSTRegistryStats = mongoose.model('LSTRegistryStats', lstRegistryStatsSchema);

/**
 * LST Sync Log Schema - Tracks sync operations
 */
const lstSyncLogSchema = new mongoose.Schema({
  syncType: {
    type: String,
    enum: ['full', 'incremental', 'manual'],
    required: true
  },
  status: {
    type: String,
    enum: ['started', 'completed', 'failed'],
    required: true
  },
  source: {
    type: String,
    enum: ['sanctum', 'compass', 'github', 'all'],
    required: true
  },
  recordsProcessed: {
    type: Number,
    default: 0
  },
  recordsAdded: {
    type: Number,
    default: 0
  },
  recordsUpdated: {
    type: Number,
    default: 0
  },
  recordsSkipped: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number, // in milliseconds
    default: 0
  },
  error: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for finding recent sync logs
lstSyncLogSchema.index({ createdAt: -1 });
lstSyncLogSchema.index({ syncType: 1, status: 1 });

export const LSTSyncLog = mongoose.model('LSTSyncLog', lstSyncLogSchema);
