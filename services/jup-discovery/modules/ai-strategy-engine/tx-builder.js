/**
 * Transaction Builder - Deterministic Execution
 * 
 * This module handles building unsigned transactions for LST strategy execution.
 * All transactions are re-quoted and validated before execution.
 */

import { SafetyConstraints } from './types.js';

/**
 * Build unsigned execution transactions
 * @param {Object} strategyPlan - Complete strategy plan
 * @param {string} ownerPubkey - User's wallet public key
 * @param {Object} quoteConfig - Quote configuration
 * @returns {Promise<Object>} Execution plan with transactions
 */
export async function buildUnsignedExecutionTxs(strategyPlan, ownerPubkey, quoteConfig = {}) {
  try {
    console.log(`🔨 [Transaction Builder] Building transactions for strategy: ${strategyPlan.name}`);
    console.log(`  - User wallet: ${ownerPubkey}`);
    console.log(`  - Allocation: ${strategyPlan.allocation.length} assets`);
    
    const executionPlan = {
      strategyId: strategyPlan.strategyId || `strategy_${Date.now()}`,
      txsBase64: [],
      routes: [],
      estimatedGasCost: { sol: 0, usd: 0 },
      slippageProtection: SafetyConstraints.maxSlippageBps,
      executionTime: Date.now()
    };
    
    // Process each allocation leg
    for (const allocation of strategyPlan.allocation) {
      if (allocation.percentage <= 0) continue;
      
      console.log(`🔨 [Transaction Builder] Processing ${allocation.symbol} (${allocation.percentage}%)`);
      
      try {
        // Determine optimal route
        const route = await determineOptimalRoute(allocation, ownerPubkey, quoteConfig);
        
        // Validate route against safety constraints
        const validation = validateRoute(route, allocation);
        if (!validation.valid) {
          throw new Error(`Route validation failed: ${validation.reason}`);
        }
        
        // Build transaction for this route
        const tx = await buildTransactionForRoute(route, ownerPubkey);
        
        executionPlan.routes.push(route);
        executionPlan.txsBase64.push(tx);
        
        // Accumulate gas costs
        executionPlan.estimatedGasCost.sol += route.estimatedGasCost?.sol || 0.001;
        executionPlan.estimatedGasCost.usd += route.estimatedGasCost?.usd || 0.10;
        
      } catch (error) {
        console.error(`❌ [Transaction Builder] Failed to build transaction for ${allocation.symbol}:`, error.message);
        throw new Error(`Transaction building failed for ${allocation.symbol}: ${error.message}`);
      }
    }
    
    if (executionPlan.txsBase64.length === 0) {
      throw new Error('No valid transactions could be built');
    }
    
    console.log(`✅ [Transaction Builder] Built ${executionPlan.txsBase64.length} transactions`);
    console.log(`  - Estimated gas cost: ${executionPlan.estimatedGasCost.sol} SOL ($${executionPlan.estimatedGasCost.usd})`);
    
    return executionPlan;
    
  } catch (error) {
    console.error('❌ [Transaction Builder] Transaction building failed:', error.message);
    throw error;
  }
}

/**
 * Determine optimal route for allocation
 * @param {Object} allocation - Allocation details
 * @param {string} ownerPubkey - User's wallet
 * @param {Object} quoteConfig - Quote configuration
 * @returns {Promise<Object>} Optimal route
 */
async function determineOptimalRoute(allocation, ownerPubkey, quoteConfig) {
  const { symbol, percentage, amount } = allocation;
  
  // Try Sanctum Infinity first (if both sides supported)
  try {
    const infinityRoute = await quoteSanctumInfinity(symbol, amount, ownerPubkey);
    if (infinityRoute && infinityRoute.slippageBps <= SafetyConstraints.maxSlippageBps) {
      console.log(`✅ [Transaction Builder] Using Sanctum Infinity for ${symbol}`);
      return infinityRoute;
    }
  } catch (error) {
    console.log(`⚠️ [Transaction Builder] Sanctum Infinity failed for ${symbol}:`, error.message);
  }
  
  // Try Sanctum Router (stake/unstake)
  try {
    const routerRoute = await quoteSanctumRouter(symbol, amount, ownerPubkey);
    if (routerRoute && routerRoute.slippageBps <= SafetyConstraints.maxSlippageBps) {
      console.log(`✅ [Transaction Builder] Using Sanctum Router for ${symbol}`);
      return routerRoute;
    }
  } catch (error) {
    console.log(`⚠️ [Transaction Builder] Sanctum Router failed for ${symbol}:`, error.message);
  }
  
  // Fallback to Jupiter
  try {
    const jupiterRoute = await quoteJupiter(symbol, amount, ownerPubkey);
    if (jupiterRoute && jupiterRoute.slippageBps <= SafetyConstraints.maxSlippageBps) {
      console.log(`✅ [Transaction Builder] Using Jupiter for ${symbol}`);
      return jupiterRoute;
    }
  } catch (error) {
    console.log(`⚠️ [Transaction Builder] Jupiter failed for ${symbol}:`, error.message);
  }
  
  throw new Error(`No suitable route found for ${symbol}`);
}

/**
 * Quote Sanctum Infinity (single-pool intrinsic swap)
 * @param {string} symbol - LST symbol
 * @param {number} amount - Amount in SOL
 * @param {string} ownerPubkey - User's wallet
 * @returns {Promise<Object>} Route details
 */
async function quoteSanctumInfinity(symbol, amount, ownerPubkey) {
  // Placeholder implementation
  // In production, this would call Sanctum Infinity API
  console.log(`🔍 [Transaction Builder] Quoting Sanctum Infinity for ${symbol}`);
  
  return {
    type: 'sanctum_infinity',
    from: 'SOL',
    to: symbol,
    amount,
    expectedOutput: Math.floor(amount * 1e9).toString(),
    slippageBps: 15,
    estimatedGasCost: { sol: 0.001, usd: 0.10 },
    instructions: 2,
    route: `SOL → ${symbol} (Sanctum Infinity)`,
    supported: true
  };
}

/**
 * Quote Sanctum Router (stake/unstake)
 * @param {string} symbol - LST symbol
 * @param {number} amount - Amount in SOL
 * @param {string} ownerPubkey - User's wallet
 * @returns {Promise<Object>} Route details
 */
async function quoteSanctumRouter(symbol, amount, ownerPubkey) {
  // Placeholder implementation
  // In production, this would call Sanctum Router API
  console.log(`🔍 [Transaction Builder] Quoting Sanctum Router for ${symbol}`);
  
  return {
    type: 'sanctum_router',
    from: 'SOL',
    to: symbol,
    amount,
    expectedOutput: Math.floor(amount * 1e9).toString(),
    slippageBps: 25,
    estimatedGasCost: { sol: 0.002, usd: 0.20 },
    instructions: 3,
    route: `SOL → ${symbol} (Sanctum Router)`,
    supported: true
  };
}

/**
 * Quote Jupiter (DEX aggregation)
 * @param {string} symbol - LST symbol
 * @param {number} amount - Amount in SOL
 * @param {string} ownerPubkey - User's wallet
 * @returns {Promise<Object>} Route details
 */
async function quoteJupiter(symbol, amount, ownerPubkey) {
  // Placeholder implementation
  // In production, this would call Jupiter API
  console.log(`🔍 [Transaction Builder] Quoting Jupiter for ${symbol}`);
  
  return {
    type: 'jupiter',
    from: 'SOL',
    to: symbol,
    amount,
    expectedOutput: Math.floor(amount * 1e9).toString(),
    slippageBps: 30,
    estimatedGasCost: { sol: 0.003, usd: 0.30 },
    instructions: 4,
    route: `SOL → ${symbol} (Jupiter)`,
    supported: true
  };
}

/**
 * Validate route against safety constraints
 * @param {Object} route - Route details
 * @param {Object} allocation - Allocation details
 * @returns {Object} Validation result
 */
function validateRoute(route, allocation) {
  const validation = {
    valid: true,
    reason: null
  };
  
  // Check slippage
  if (route.slippageBps > SafetyConstraints.maxSlippageBps) {
    validation.valid = false;
    validation.reason = `Slippage too high: ${route.slippageBps}bps > ${SafetyConstraints.maxSlippageBps}bps`;
    return validation;
  }
  
  // Check if route is supported
  if (!route.supported) {
    validation.valid = false;
    validation.reason = 'Route not supported';
    return validation;
  }
  
  // Check gas cost reasonableness
  if (route.estimatedGasCost?.sol > 0.01) {
    validation.valid = false;
    validation.reason = `Gas cost too high: ${route.estimatedGasCost.sol} SOL`;
    return validation;
  }
  
  // Check output amount
  if (!route.expectedOutput || route.expectedOutput === '0') {
    validation.valid = false;
    validation.reason = 'Invalid output amount';
    return validation;
  }
  
  return validation;
}

/**
 * Build transaction for route
 * @param {Object} route - Route details
 * @param {string} ownerPubkey - User's wallet
 * @returns {Promise<string>} Base64 encoded transaction
 */
async function buildTransactionForRoute(route, ownerPubkey) {
  // Placeholder implementation
  // In production, this would build actual Solana transactions
  console.log(`🔨 [Transaction Builder] Building transaction for route: ${route.route}`);
  
  // Simulate transaction building
  const mockTransaction = {
    type: route.type,
    from: route.from,
    to: route.to,
    amount: route.amount,
    expectedOutput: route.expectedOutput,
    slippageBps: route.slippageBps,
    instructions: route.instructions,
    payer: ownerPubkey,
    timestamp: Date.now()
  };
  
  // Convert to base64 (placeholder)
  const txBase64 = Buffer.from(JSON.stringify(mockTransaction)).toString('base64');
  
  return txBase64;
}

/**
 * Re-quote and validate all routes before execution
 * @param {Object} executionPlan - Execution plan
 * @param {string} ownerPubkey - User's wallet
 * @returns {Promise<Object>} Validated execution plan
 */
export async function requoteAndValidate(executionPlan, ownerPubkey) {
  try {
    console.log('🔄 [Transaction Builder] Re-quoting and validating routes...');
    
    const validatedPlan = {
      ...executionPlan,
      routes: [],
      txsBase64: []
    };
    
    for (const route of executionPlan.routes) {
      // Re-quote the route
      const requotedRoute = await determineOptimalRoute(
        { symbol: route.to, amount: route.amount },
        ownerPubkey
      );
      
      // Validate the re-quoted route
      const validation = validateRoute(requotedRoute, { symbol: route.to, amount: route.amount });
      if (!validation.valid) {
        throw new Error(`Re-quote validation failed: ${validation.reason}`);
      }
      
      // Rebuild transaction
      const tx = await buildTransactionForRoute(requotedRoute, ownerPubkey);
      
      validatedPlan.routes.push(requotedRoute);
      validatedPlan.txsBase64.push(tx);
    }
    
    console.log('✅ [Transaction Builder] All routes re-quoted and validated');
    return validatedPlan;
    
  } catch (error) {
    console.error('❌ [Transaction Builder] Re-quote validation failed:', error.message);
    throw new Error(`Execution validation failed: ${error.message}`);
  }
}

export default {
  buildUnsignedExecutionTxs,
  requoteAndValidate
};
