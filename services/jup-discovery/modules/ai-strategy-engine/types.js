/**
 * LST Strategy Engine Types - Deterministic Safety-First Architecture
 * 
 * This module defines the types and interfaces for the improved LST strategy engine
 * that uses deterministic computation with LLM explanation only.
 */

// LST registry + metrics (computed by services)
export const LstInfo = {
  mint: 'string',           // Token mint address
  symbol: 'string',         // Token symbol (e.g., 'jitoSOL')
  name: 'string',           // Full name (e.g., 'Jito Staked SOL')
  decimals: 'number',       // Token decimals
  verified: 'boolean',      // Verification status
  stakePoolProgram: 'string' // Stake pool program ID
};

// Real-time metrics with freshness tracking
export const LstMetrics = {
  symbol: 'string',         // Token symbol
  mint: 'string',           // Token mint address
  apr: 'number',           // Rolling APR computed from exchange rates
  tvlUSD: 'number',        // Total Value Locked in USD
  discountPct: 'number',   // Premium/discount vs SOL (+prem / -disc)
  slippageBpsAtSize: 'number', // Slippage in basis points for user's trade size
  decentralization: 'number', // 0..1 (higher = better validator distribution)
  paused: 'boolean',       // Pool paused status
  recentSlash: 'boolean',  // Recent slashing events
  asOfMs: 'number'         // Timestamp when metrics were computed
};

// Deterministic scoring weights
export const ScoringWeights = {
  apr: 0.45,              // APR weight (45%)
  liquidity: 0.20,        // Liquidity depth weight (20%)
  slippage: 0.20,         // Low slippage weight (20%)
  discount: 0.05,         // Discount capture weight (5%)
  decentralization: 0.10  // Decentralization weight (10%)
};

// Safety constraints
export const SafetyConstraints = {
  minLiquidityUSD: 250_000,    // Minimum liquidity requirement
  maxSlippageBps: 50,          // Maximum acceptable slippage
  maxPerAssetWeight: 0.45,     // Cap per asset (45%)
  minAssets: 2,                // Minimum diversification
  maxStalenessMinutes: 5,      // Maximum metric age
  maxAssetsBasic: 3,           // Basic strategy max assets
  maxAssetsAdvanced: 5         // Advanced strategy max assets
};

// Candidate portfolio (deterministic)
export const CandidatePortfolio = {
  weights: 'object',       // { symbol: percentage } mapping
  expectedYield: 'number', // Weighted average APR
  riskScore: 'number',    // Aggregate risk score
  diversification: 'number', // Diversification score
  liquidityScore: 'number' // Liquidity depth score
};

// Strategy candidates (A/B/C)
export const StrategyCandidates = {
  A: 'CandidatePortfolio', // APR-biased (base scoring)
  B: 'CandidatePortfolio', // Balanced (liquidity + decentralization)
  C: 'CandidatePortfolio'  // Discount-capture (premium/discount tilt)
};

// LLM selection result
export const StrategyPick = {
  pick: 'string',          // "A", "B", or "C"
  title: 'string',         // Strategy title
  summary: 'string',       // Strategy summary
  risks: 'array'           // Risk factors array
};

// Final strategy plan (returned to UI)
export const StrategyPlan = {
  name: 'string',         // Strategy name
  expectedYield: 'number', // Computed weighted APR (not from LLM)
  riskScore: 'number',    // Computed aggregate risk (not from LLM)
  allocation: 'array',    // [{ symbol, percentage, apr, tvlUSD }]
  narrative: 'object',    // { title, summary, risks } from LLM
  guards: 'object',       // Safety constraints applied
  asOfMs: 'number',       // Timestamp
  strategyType: 'string', // 'basic' or 'advanced'
  cost: 'number'          // Payment amount in USDC
};

// Transaction building result
export const ExecutionPlan = {
  strategyId: 'string',   // Strategy identifier
  txsBase64: 'array',     // Base64 encoded unsigned transactions
  routes: 'array',        // Route information for each transaction
  estimatedGasCost: 'object', // { sol: number, usd: number }
  slippageProtection: 'number', // Applied slippage protection
  executionTime: 'number' // Estimated execution time
};

// User profile for strategy generation
export const UserProfile = {
  walletAddress: 'string',
  totalValueSOL: 'number',
  currentYield: 'number',
  riskTolerance: 'string', // 'conservative', 'moderate', 'aggressive'
  strategyType: 'string',  // 'basic' or 'advanced'
  preferences: 'object'    // Additional user preferences
};

export default {
  LstInfo,
  LstMetrics,
  ScoringWeights,
  SafetyConstraints,
  CandidatePortfolio,
  StrategyCandidates,
  StrategyPick,
  StrategyPlan,
  ExecutionPlan,
  UserProfile
};
