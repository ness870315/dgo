import fetch from 'node-fetch';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { 
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount
} from '@solana/spl-token';

/**
 * Transaction Builder Service
 * 
 * Builds and bundles Solana transactions for executing AI-generated strategies.
 * Integrates with Jupiter for swaps and Sanctum for staking operations.
 * 
 * Integrates with:
 * - Jupiter API for SOL ↔ LST swaps
 * - Sanctum Router for staking operations
 * - Solana Web3.js for transaction building
 */
class TransactionBuilderService {
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    
    // Jupiter API configuration
    this.jupiterApiUrl = 'https://quote-api.jup.ag/v6';
    this.jupiterSwapUrl = 'https://quote-api.jup.ag/v6/swap';
    
    // Sanctum configuration
    this.sanctumRouterUrl = 'https://api.sanctum.so/v1';
    
    // Known token mints
    this.knownMints = {
      SOL: 'So11111111111111111111111111111111111111112',
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    };
    
    // Transaction cache
    this.transactionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Default slippage
    this.defaultSlippageBps = 50; // 0.5%
    
    console.log('🔨 [Transaction Builder] Service initialized');
    console.log('  - RPC URL:', this.connection.rpcEndpoint);
    console.log('  - Jupiter API:', this.jupiterApiUrl);
    console.log('  - Sanctum Router:', this.sanctumRouterUrl);
    console.log('  - Default Slippage:', this.defaultSlippageBps / 100, '%');
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log('🔨 [Transaction Builder] Initializing...');
      
      // Test connections
      await this.testConnections();
      
      console.log('✅ [Transaction Builder] Initialization complete');
    } catch (error) {
      console.error('❌ [Transaction Builder] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Test API connections
   */
  async testConnections() {
    try {
      // Test Jupiter API
      const jupiterResponse = await fetch(`${this.jupiterApiUrl}/tokens`);
      if (!jupiterResponse.ok) {
        throw new Error(`Jupiter API test failed: ${jupiterResponse.status}`);
      }
      console.log('✅ Jupiter API connection verified');
      
      // Test Solana RPC
      const slot = await this.connection.getSlot();
      console.log('✅ Solana RPC connection verified');
      
    } catch (error) {
      console.warn('⚠️ [Transaction Builder] Connection test failed:', error.message);
    }
  }

  /**
   * Build bundled transaction for strategy execution (single transaction approach)
   */
  async buildBundledStrategyTransaction(strategy, userWallet) {
    try {
      console.log(`🔨 [Transaction Builder] Building bundled transaction for strategy: ${strategy.name}`);
      
      const userPubkey = new PublicKey(userWallet);
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      
      // Collect all instructions from strategy actions
      const allInstructions = [];
      
      for (const action of strategy.actions) {
        try {
          if (action.type === 'swap') {
            // Get Jupiter quote
            const quote = await this.getJupiterQuote(action.from, action.to, action.amount);
            
            if (quote) {
              // Get swap transaction
              const swapResponse = await fetch(this.jupiterSwapUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  quoteResponse: quote,
                  userPublicKey: userPubkey.toString(),
                  wrapAndUnwrapSol: true,
                  useSharedAccounts: true,
                  computeUnitPriceMicroLamports: 'auto',
                  prioritizationFeeLamports: 'auto'
                })
              });
              
              if (swapResponse.ok) {
                const swapData = await swapResponse.json();
                const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
                const transaction = VersionedTransaction.deserialize(transactionBuf);
                
                // Extract instructions from the transaction
                const instructions = transaction.message.compiledInstructions;
                allInstructions.push(...instructions);
                
                console.log(`✅ [Transaction Builder] Added ${instructions.length} instructions for ${action.from} → ${action.to}`);
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ [Transaction Builder] Failed to build instruction for ${action.type}:`, error.message);
        }
      }
      
      if (allInstructions.length === 0) {
        throw new Error('No valid instructions generated');
      }
      
      // Create single bundled transaction
      const message = new TransactionMessage({
        payerKey: userPubkey,
        recentBlockhash: blockhash,
        instructions: allInstructions
      }).compileToV0Message();
      
      const bundledTransaction = new VersionedTransaction(message);
      
      const result = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        userWallet: userWallet,
        transactionCount: 1, // Single bundled transaction
        bundledTransaction: bundledTransaction,
        totalInstructions: allInstructions.length,
        estimatedGasCost: await this.estimateGasCost([{ instructions: allInstructions.length }]),
        slippageProtection: this.defaultSlippageBps,
        createdAt: new Date().toISOString(),
        execution: {
          readyToExecute: true,
          singleTransaction: true,
          requiresSignature: true
        }
      };
      
      console.log(`✅ [Transaction Builder] Bundled transaction created with ${allInstructions.length} instructions`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] Bundled transaction building failed:`, error.message);
      throw error;
    }
  }

  /**
   * Build strategy execution transactions
   */
  async buildStrategyTransactions(strategy, userWallet) {
    try {
      console.log(`🔨 [Transaction Builder] Building transactions for strategy: ${strategy.name}`);
      
      // Check cache first
      const cacheKey = `transactions_${strategy.id}_${userWallet}`;
      const cached = this.transactionCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('🔨 [Transaction Builder] Using cached transactions');
        return cached.data;
      }
      
      const userPubkey = new PublicKey(userWallet);
      
      // Build transactions based on strategy actions
      const transactions = [];
      
      for (const action of strategy.actions) {
        try {
          if (action.type === 'swap') {
            const swapTx = await this.buildSwapTransaction(action, userPubkey);
            if (swapTx) {
              transactions.push(swapTx);
            }
          } else if (action.type === 'stake') {
            const stakeTx = await this.buildStakeTransaction(action, userPubkey);
            if (stakeTx) {
              transactions.push(stakeTx);
            }
          }
        } catch (error) {
          console.warn(`⚠️ [Transaction Builder] Failed to build ${action.type} transaction:`, error.message);
        }
      }
      
      // Bundle transactions
      const bundledTransaction = await this.bundleTransactions(transactions, userPubkey);
      
      const result = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        userWallet: userWallet,
        transactionCount: transactions.length,
        bundledTransaction: bundledTransaction,
        individualTransactions: transactions,
        estimatedGasCost: await this.estimateGasCost(transactions),
        slippageProtection: this.defaultSlippageBps,
        createdAt: new Date().toISOString()
      };
      
      // Cache the result
      this.transactionCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      console.log(`✅ [Transaction Builder] Built ${transactions.length} transactions for ${strategy.name}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] Transaction building failed for ${strategy.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Build swap transaction using Jupiter
   */
  async buildSwapTransaction(action, userPubkey) {
    try {
      console.log(`🔄 [Transaction Builder] Building swap: ${action.from} → ${action.to}`);
      
      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(action.from, action.to, action.amount);
      
      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      // Get swap transaction
      const swapResponse = await fetch(this.jupiterSwapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: userPubkey.toString(),
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          feeAccount: undefined,
          trackingAccount: undefined,
          computeUnitPriceMicroLamports: 'auto',
          prioritizationFeeLamports: 'auto'
        })
      });
      
      if (!swapResponse.ok) {
        throw new Error(`Jupiter swap API error: ${swapResponse.status}`);
      }
      
      const swapData = await swapResponse.json();
      
      // Deserialize transaction
      const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      
      return {
        type: 'swap',
        from: action.from,
        to: action.to,
        amount: action.amount,
        expectedOutput: quote.outAmount,
        slippage: quote.priceImpactPct,
        transaction: transaction,
        instructions: transaction.message.compiledInstructions.length,
        reasoning: action.reasoning
      };
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] Swap transaction failed:`, error.message);
      throw error;
    }
  }

  /**
   * Build stake transaction using Sanctum Router
   */
  async buildStakeTransaction(action, userPubkey) {
    try {
      console.log(`🏦 [Transaction Builder] Building stake: ${action.amount} SOL → ${action.to}`);
      
      // For now, we'll use Jupiter to swap SOL to LST
      // In production, you'd integrate with Sanctum Router directly
      const swapAction = {
        type: 'swap',
        from: 'SOL',
        to: action.to,
        amount: action.amount,
        reasoning: action.reasoning
      };
      
      return await this.buildSwapTransaction(swapAction, userPubkey);
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] Stake transaction failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get Jupiter quote
   */
  async getJupiterQuote(inputMint, outputMint, amount) {
    try {
      // Convert SOL to wrapped SOL mint for Jupiter
      const actualInputMint = inputMint === 'SOL' ? this.knownMints.SOL : inputMint;
      const actualOutputMint = outputMint === 'SOL' ? this.knownMints.SOL : outputMint;
      
      // Convert amount to smallest unit
      const amountInSmallestUnit = Math.floor(amount * 1e9); // Assuming 9 decimals for SOL
      
      const quoteUrl = `${this.jupiterApiUrl}/quote?` + new URLSearchParams({
        inputMint: actualInputMint,
        outputMint: actualOutputMint,
        amount: amountInSmallestUnit.toString(),
        slippageBps: this.defaultSlippageBps.toString(),
        swapMode: 'ExactIn',
        dexes: 'all'
      });
      
      const response = await fetch(quoteUrl);
      
      if (!response.ok) {
        throw new Error(`Jupiter quote API error: ${response.status}`);
      }
      
      const quote = await response.json();
      
      console.log(`📊 [Transaction Builder] Jupiter quote: ${quote.inAmount} → ${quote.outAmount} (${quote.priceImpactPct}% impact)`);
      
      return quote;
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] Jupiter quote failed:`, error.message);
      throw error;
    }
  }

  /**
   * Bundle multiple transactions into one
   */
  async bundleTransactions(transactions, userPubkey) {
    try {
      if (transactions.length === 0) {
        throw new Error('No transactions to bundle');
      }
      
      if (transactions.length === 1) {
        // Single transaction, no need to bundle
        return transactions[0].transaction;
      }
      
      // For multiple transactions, we need to combine instructions
      // This is a simplified approach - in production you'd want more sophisticated bundling
      const allInstructions = [];
      
      for (const tx of transactions) {
        if (tx.transaction && tx.transaction.message) {
          const instructions = tx.transaction.message.compiledInstructions;
          allInstructions.push(...instructions);
        }
      }
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      
      // Create bundled transaction
      const message = new TransactionMessage({
        payerKey: userPubkey,
        recentBlockhash: blockhash,
        instructions: allInstructions
      }).compileToV0Message();
      
      const bundledTransaction = new VersionedTransaction(message);
      
      console.log(`🔗 [Transaction Builder] Bundled ${transactions.length} transactions into one`);
      
      return bundledTransaction;
      
    } catch (error) {
      console.error('❌ [Transaction Builder] Transaction bundling failed:', error.message);
      throw error;
    }
  }

  /**
   * Create ATA if needed
   */
  async createATAIfNeeded(mint, owner) {
    try {
      const mintPubkey = new PublicKey(mint);
      const ownerPubkey = new PublicKey(owner);
      
      const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
      
      // Check if ATA exists
      try {
        await getAccount(this.connection, ata);
        console.log(`✅ [Transaction Builder] ATA already exists: ${ata.toString()}`);
        return null; // ATA exists, no instruction needed
      } catch (error) {
        // ATA doesn't exist, create instruction
        console.log(`🔨 [Transaction Builder] Creating ATA: ${ata.toString()}`);
        
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          ownerPubkey, // payer
          ata, // ata
          ownerPubkey, // owner
          mintPubkey // mint
        );
        
        return createATAInstruction;
      }
      
    } catch (error) {
      console.error(`❌ [Transaction Builder] ATA creation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Estimate gas cost
   */
  async estimateGasCost(transactions) {
    try {
      // Simplified gas estimation
      // In production, you'd want more accurate estimation
      const baseCost = 0.000005; // Base SOL per transaction
      const instructionCost = 0.000001; // Per instruction
      
      let totalInstructions = 0;
      for (const tx of transactions) {
        totalInstructions += tx.instructions || 0;
      }
      
      const estimatedCost = baseCost * transactions.length + instructionCost * totalInstructions;
      
      return {
        sol: estimatedCost,
        usd: estimatedCost * 100 // Assuming $100 SOL price
      };
      
    } catch (error) {
      console.warn('⚠️ [Transaction Builder] Gas estimation failed:', error.message);
      return {
        sol: 0.001,
        usd: 0.10
      };
    }
  }

  /**
   * Validate transaction before execution
   */
  async validateTransaction(transaction, userWallet) {
    try {
      const userPubkey = new PublicKey(userWallet);
      
      // Check if user has enough SOL for fees
      const balance = await this.connection.getBalance(userPubkey);
      const minBalance = 0.01 * 1e9; // 0.01 SOL minimum
      
      if (balance < minBalance) {
        throw new Error(`Insufficient SOL balance: ${balance / 1e9} SOL (minimum: 0.01 SOL)`);
      }
      
      // Check transaction size
      const serialized = transaction.serialize();
      if (serialized.length > 1232) {
        throw new Error(`Transaction too large: ${serialized.length} bytes (maximum: 1232)`);
      }
      
      console.log('✅ [Transaction Builder] Transaction validation passed');
      
      return {
        valid: true,
        balance: balance / 1e9,
        size: serialized.length,
        estimatedFees: 0.001 // Simplified fee estimation
      };
      
    } catch (error) {
      console.error('❌ [Transaction Builder] Transaction validation failed:', error.message);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get transaction by strategy ID
   */
  getTransaction(strategyId, userWallet) {
    const cacheKey = `transactions_${strategyId}_${userWallet}`;
    const cached = this.transactionCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    return null;
  }

  /**
   * Clear transaction cache
   */
  clearCache() {
    this.transactionCache.clear();
    console.log('🔨 [Transaction Builder] Transaction cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.transactionCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.transactionCache.keys())
    };
  }
}

export default TransactionBuilderService;
