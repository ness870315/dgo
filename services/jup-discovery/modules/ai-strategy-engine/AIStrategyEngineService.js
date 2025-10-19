import fetch from 'node-fetch';
import LSTRegistryService from '../lst-registry/LSTRegistryService.js';
import PortfolioAnalyzerService from '../portfolio-analyzer/PortfolioAnalyzerService.js';

/**
 * AI Strategy Engine Service
 * 
 * Uses GPT-4 to generate intelligent staking strategies based on portfolio analysis.
 * Provides both basic and advanced optimization strategies with risk-adjusted allocations.
 * 
 * Integrates with:
 * - OpenAI GPT-4 for strategy generation
 * - LST Registry for token data and APRs
 * - Portfolio Analyzer for current holdings analysis
 */
class AIStrategyEngineService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
    
    // Initialize services
    this.lstRegistry = new LSTRegistryService();
    this.portfolioAnalyzer = new PortfolioAnalyzerService();
    
    // Strategy cache
    this.strategyCache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    
    // Strategy types and pricing (bundled with execution)
    this.strategyTypes = {
      basic: {
        name: 'Basic Strategy + Execution',
        description: 'Top 3 LSTs by APR with simple allocation + execution',
        price: 1.20,
        maxLSTs: 3,
        complexity: 'low'
      },
      advanced: {
        name: 'Advanced Strategy + Execution',
        description: 'Risk-adjusted optimization with diversification + execution',
        price: 2.00,
        maxLSTs: 5,
        complexity: 'high'
      }
    };
    
    console.log('🧠 [AI Strategy Engine] Service initialized');
    console.log('  - OpenAI API:', this.openaiApiKey ? 'Configured' : 'Not configured');
    console.log('  - Model:', this.model);
    console.log('  - Strategy types:', Object.keys(this.strategyTypes).length);
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log('🧠 [AI Strategy Engine] Initializing...');
      
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      // Initialize dependencies
      await this.lstRegistry.initialize();
      await this.portfolioAnalyzer.initialize();
      
      console.log('✅ [AI Strategy Engine] Initialization complete');
    } catch (error) {
      console.error('❌ [AI Strategy Engine] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI strategy and build transactions in one call (bundled approach)
   */
  async generateAndBuildStrategy(walletAddress, strategyType = 'basic', userPreferences = {}) {
    try {
      console.log(`🧠 [AI Strategy Engine] Generating and building ${strategyType} strategy for ${walletAddress}`);
      
      // Check cache first
      const cacheKey = `bundled_${walletAddress}_${strategyType}`;
      const cached = this.strategyCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('🧠 [AI Strategy Engine] Using cached bundled strategy');
        return cached.data;
      }
      
      // Generate strategy
      const strategy = await this.generateStrategy(walletAddress, strategyType, userPreferences);
      
      // Build transactions (we'll import TransactionBuilderService)
      const transactions = await this.buildStrategyTransactions(strategy, walletAddress);
      
      const bundledResult = {
        strategy,
        transactions,
        payment: {
          required: true,
          amount: this.strategyTypes[strategyType].price,
          currency: 'USDC',
          endpoint: `https://api.degen-oracle.com/api/x402/execute-strategy/${strategy.id}`,
          description: `${this.strategyTypes[strategyType].name} - Complete optimization`
        },
        execution: {
          transactionCount: transactions.transactionCount,
          estimatedGasCost: transactions.estimatedGasCost,
          slippageProtection: transactions.slippageProtection,
          readyToExecute: true
        },
        createdAt: new Date().toISOString()
      };
      
      // Cache the result
      this.strategyCache.set(cacheKey, {
        data: bundledResult,
        timestamp: Date.now()
      });
      
      console.log(`✅ [AI Strategy Engine] Bundled strategy generated for ${walletAddress}`);
      console.log(`  - Type: ${strategyType}`);
      console.log(`  - Price: $${this.strategyTypes[strategyType].price}`);
      console.log(`  - Expected Yield: ${strategy.expectedYield.toFixed(2)}%`);
      console.log(`  - Transactions: ${transactions.transactionCount}`);
      
      return bundledResult;
      
    } catch (error) {
      console.error(`❌ [AI Strategy Engine] Bundled strategy generation failed for ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Build strategy transactions (placeholder - will integrate with TransactionBuilder)
   */
  async buildStrategyTransactions(strategy, walletAddress) {
    try {
      // This is a placeholder - in production, you'd call the TransactionBuilder service
      console.log(`🔨 [AI Strategy Engine] Building transactions for strategy: ${strategy.name}`);
      
      // Simulate transaction building
      const mockTransactions = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        userWallet: walletAddress,
        transactionCount: strategy.actions.length,
        bundledTransaction: 'mock_bundled_transaction_base64',
        individualTransactions: strategy.actions.map((action, index) => ({
          type: action.type,
          from: action.from,
          to: action.to,
          amount: action.amount,
          expectedOutput: Math.floor(action.amount * 1e9).toString(),
          slippage: 0.1,
          instructions: 3,
          reasoning: action.reasoning
        })),
        estimatedGasCost: {
          sol: 0.001 * strategy.actions.length,
          usd: 0.10 * strategy.actions.length
        },
        slippageProtection: 50,
        createdAt: new Date().toISOString()
      };
      
      return mockTransactions;
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] Transaction building failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI strategy for a wallet
   */
  async generateStrategy(walletAddress, strategyType = 'basic', userPreferences = {}) {
    try {
      console.log(`🧠 [AI Strategy Engine] Generating ${strategyType} strategy for ${walletAddress}`);
      
      // Check cache first
      const cacheKey = `strategy_${walletAddress}_${strategyType}`;
      const cached = this.strategyCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('🧠 [AI Strategy Engine] Using cached strategy');
        return cached.data;
      }
      
      // Get portfolio analysis
      const portfolio = await this.portfolioAnalyzer.analyzePortfolio(walletAddress);
      
      // Get available LSTs
      const availableLSTs = this.lstRegistry.getAllLSTs();
      
      // Generate AI strategy
      const strategy = await this.generateAIStrategy(portfolio, availableLSTs, strategyType, userPreferences);
      
      // Cache the result
      this.strategyCache.set(cacheKey, {
        data: strategy,
        timestamp: Date.now()
      });
      
      console.log(`✅ [AI Strategy Engine] Strategy generated for ${walletAddress}`);
      console.log(`  - Type: ${strategyType}`);
      console.log(`  - Expected Yield: ${strategy.expectedYield.toFixed(2)}%`);
      console.log(`  - Improvement: ${strategy.improvement.toFixed(2)}%`);
      console.log(`  - LSTs: ${strategy.allocation.length}`);
      
      return strategy;
      
    } catch (error) {
      console.error(`❌ [AI Strategy Engine] Strategy generation failed for ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate AI strategy using GPT-4
   */
  async generateAIStrategy(portfolio, availableLSTs, strategyType, userPreferences) {
    try {
      const strategyConfig = this.strategyTypes[strategyType];
      
      // Prepare context for GPT-4
      const context = this.prepareStrategyContext(portfolio, availableLSTs, strategyType, userPreferences);
      
      // Generate prompt
      const prompt = this.buildStrategyPrompt(context, strategyConfig);
      
      // Call GPT-4
      const aiResponse = await this.callGPT4(prompt);
      
      // Parse AI response
      const strategy = this.parseAIResponse(aiResponse, portfolio, strategyConfig);
      
      // Validate strategy
      this.validateStrategy(strategy, portfolio);
      
      return strategy;
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] AI strategy generation failed:', error.message);
      // Fallback to rule-based strategy
      return this.generateFallbackStrategy(portfolio, availableLSTs, strategyType);
    }
  }

  /**
   * Prepare context for GPT-4
   */
  prepareStrategyContext(portfolio, availableLSTs, strategyType, userPreferences) {
    // Filter and sort LSTs based on strategy type
    let filteredLSTs = availableLSTs.filter(lst => lst.verified && lst.apr > 4.0);
    
    if (strategyType === 'basic') {
      // Basic: Top LSTs by APR
      filteredLSTs = filteredLSTs
        .sort((a, b) => b.apr - a.apr)
        .slice(0, 5);
    } else {
      // Advanced: Risk-adjusted selection
      filteredLSTs = filteredLSTs
        .map(lst => ({
          ...lst,
          riskAdjustedReturn: lst.apr / lst.riskScore
        }))
        .sort((a, b) => b.riskAdjustedReturn - a.riskAdjustedReturn)
        .slice(0, 8);
    }
    
    return {
      portfolio: {
        totalValue: portfolio.totalValue,
        currentYield: portfolio.currentYield,
        solBalance: portfolio.solBalance.sol,
        lstHoldings: portfolio.lstHoldings,
        insights: portfolio.insights
      },
      availableLSTs: filteredLSTs.map(lst => ({
        symbol: lst.symbol,
        name: lst.name,
        apr: lst.apr,
        riskScore: lst.riskScore,
        tvl: lst.tvl,
        verified: lst.verified,
        source: lst.source
      })),
      strategyType,
      userPreferences: {
        maxRisk: userPreferences.maxRisk || 7.0,
        minAPR: userPreferences.minAPR || 4.0,
        diversification: userPreferences.diversification || 'medium'
      }
    };
  }

  /**
   * Build strategy prompt for GPT-4
   */
  buildStrategyPrompt(context, strategyConfig) {
    const { portfolio, availableLSTs, strategyType, userPreferences } = context;
    
    return `You are an expert DeFi strategist specializing in Solana Liquid Staking Token (LST) optimization. 

PORTFOLIO ANALYSIS:
- Total Value: $${portfolio.totalValue.toFixed(2)}
- Current Yield: ${portfolio.currentYield.toFixed(2)}%
- SOL Balance: ${portfolio.solBalance.toFixed(4)} SOL
- Current LST Holdings: ${portfolio.lstHoldings.length} tokens
- Key Insights: ${portfolio.insights.map(i => i.title).join(', ')}

AVAILABLE LSTs:
${availableLSTs.map(lst => 
  `- ${lst.symbol}: ${lst.apr.toFixed(2)}% APR, Risk: ${lst.riskScore.toFixed(2)}, TVL: $${lst.tvl.toLocaleString()}, Verified: ${lst.verified}`
).join('\n')}

STRATEGY REQUIREMENTS:
- Type: ${strategyConfig.name} (${strategyConfig.description})
- Max LSTs: ${strategyConfig.maxLSTs}
- Complexity: ${strategyConfig.complexity}
- User Risk Tolerance: ${userPreferences.maxRisk}/10
- Min APR: ${userPreferences.minAPR}%
- Diversification: ${userPreferences.diversification}

TASK:
Generate an optimal LST allocation strategy that maximizes yield while respecting risk constraints.

RESPONSE FORMAT (JSON):
{
  "strategy": {
    "name": "Strategy name",
    "description": "Brief description",
    "expectedYield": 5.8,
    "riskScore": 4.2,
    "allocation": [
      {
        "symbol": "jitoSOL",
        "name": "Jito Staked SOL",
        "percentage": 40,
        "amount": 22.6,
        "apr": 5.8,
        "riskScore": 3.2,
        "reasoning": "High APR with low risk"
      }
    ],
    "actions": [
      {
        "type": "swap",
        "from": "SOL",
        "to": "jitoSOL",
        "amount": 22.6,
        "reasoning": "Convert unstacked SOL to high-yield LST"
      }
    ],
    "risks": [
      "Validator slashing risk",
      "Liquidity risk"
    ],
    "benefits": [
      "Higher yield than current portfolio",
      "Diversified exposure"
    ]
  }
}

Focus on:
1. Maximizing yield within risk constraints
2. Diversification across multiple LSTs
3. Clear reasoning for each allocation
4. Practical execution steps
5. Risk-benefit analysis`;
  }

  /**
   * Call GPT-4 API
   */
  async callGPT4(prompt) {
    try {
      const response = await fetch(`${this.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert DeFi strategist. Always respond with valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
        timeout: 30000
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] GPT-4 API call failed:', error.message);
      throw error;
    }
  }

  /**
   * Parse AI response
   */
  parseAIResponse(aiResponse, portfolio, strategyConfig) {
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const aiStrategy = JSON.parse(jsonMatch[0]);
      
      // Calculate improvement
      const improvement = aiStrategy.strategy.expectedYield - portfolio.currentYield;
      
      // Build strategy object
      const strategy = {
        id: `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: strategyConfig.name.toLowerCase().replace(' ', '_'),
        name: aiStrategy.strategy.name,
        description: aiStrategy.strategy.description,
        expectedYield: aiStrategy.strategy.expectedYield,
        currentYield: portfolio.currentYield,
        improvement: improvement,
        riskScore: aiStrategy.strategy.riskScore,
        allocation: aiStrategy.strategy.allocation,
        actions: aiStrategy.strategy.actions,
        risks: aiStrategy.strategy.risks,
        benefits: aiStrategy.strategy.benefits,
        cost: strategyConfig.price,
        generatedAt: new Date().toISOString(),
        portfolio: {
          totalValue: portfolio.totalValue,
          solBalance: portfolio.solBalance.sol,
          currentLSTs: portfolio.lstHoldings.length
        }
      };
      
      return strategy;
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] AI response parsing failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate generated strategy
   */
  validateStrategy(strategy, portfolio) {
    try {
      // Check allocation percentages
      const totalPercentage = strategy.allocation.reduce((sum, item) => sum + item.percentage, 0);
      if (Math.abs(totalPercentage - 100) > 1) {
        throw new Error(`Invalid allocation: ${totalPercentage}% (should be ~100%)`);
      }
      
      // Check if amounts are reasonable
      for (const item of strategy.allocation) {
        if (item.amount > portfolio.totalValue * 1.1) {
          throw new Error(`Amount too high: ${item.amount} > ${portfolio.totalValue}`);
        }
      }
      
      // Check risk score
      if (strategy.riskScore > 10 || strategy.riskScore < 1) {
        throw new Error(`Invalid risk score: ${strategy.riskScore}`);
      }
      
      console.log('✅ [AI Strategy Engine] Strategy validation passed');
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] Strategy validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate fallback strategy if AI fails
   */
  generateFallbackStrategy(portfolio, availableLSTs, strategyType) {
    try {
      console.log('🔄 [AI Strategy Engine] Generating fallback strategy');
      
      const strategyConfig = this.strategyTypes[strategyType];
      let selectedLSTs = availableLSTs.filter(lst => lst.verified && lst.apr > 4.0);
      
      if (strategyType === 'basic') {
        // Simple top 3 by APR
        selectedLSTs = selectedLSTs
          .sort((a, b) => b.apr - a.apr)
          .slice(0, 3);
      } else {
        // Risk-adjusted top 5
        selectedLSTs = selectedLSTs
          .map(lst => ({
            ...lst,
            riskAdjustedReturn: lst.apr / lst.riskScore
          }))
          .sort((a, b) => b.riskAdjustedReturn - a.riskAdjustedReturn)
          .slice(0, 5);
      }
      
      // Generate allocation
      const allocation = selectedLSTs.map((lst, index) => {
        const percentage = strategyType === 'basic' 
          ? [50, 30, 20][index] || 10
          : [40, 25, 20, 10, 5][index] || 5;
        
        return {
          symbol: lst.symbol,
          name: lst.name,
          percentage: percentage,
          amount: (portfolio.totalValue * percentage) / 100,
          apr: lst.apr,
          riskScore: lst.riskScore,
          reasoning: `${lst.symbol} offers ${lst.apr.toFixed(2)}% APR with risk score ${lst.riskScore.toFixed(2)}`
        };
      });
      
      // Calculate expected yield
      const expectedYield = allocation.reduce((sum, item) => 
        sum + (item.apr * item.percentage / 100), 0
      );
      
      const strategy = {
        id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: strategyType,
        name: `${strategyConfig.name} (Fallback)`,
        description: strategyConfig.description,
        expectedYield: expectedYield,
        currentYield: portfolio.currentYield,
        improvement: expectedYield - portfolio.currentYield,
        riskScore: allocation.reduce((sum, item) => sum + (item.riskScore * item.percentage / 100), 0),
        allocation: allocation,
        actions: this.generateActions(portfolio, allocation),
        risks: ['Market volatility', 'Validator slashing', 'Liquidity risk'],
        benefits: ['Higher yield', 'Diversified exposure', 'Automated optimization'],
        cost: strategyConfig.price,
        generatedAt: new Date().toISOString(),
        portfolio: {
          totalValue: portfolio.totalValue,
          solBalance: portfolio.solBalance.sol,
          currentLSTs: portfolio.lstHoldings.length
        }
      };
      
      return strategy;
      
    } catch (error) {
      console.error('❌ [AI Strategy Engine] Fallback strategy generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate execution actions
   */
  generateActions(portfolio, allocation) {
    const actions = [];
    
    // Convert SOL to LSTs
    if (portfolio.solBalance.sol > 0.01) {
      for (const item of allocation) {
        if (item.amount > 0) {
          actions.push({
            type: 'swap',
            from: 'SOL',
            to: item.symbol,
            amount: item.amount,
            reasoning: `Convert ${item.amount.toFixed(2)} SOL to ${item.symbol} for ${item.apr.toFixed(2)}% APR`
          });
        }
      }
    }
    
    return actions;
  }

  /**
   * Get strategy by ID
   */
  getStrategy(strategyId) {
    for (const [key, cached] of this.strategyCache.entries()) {
      if (cached.data.id === strategyId) {
        return cached.data;
      }
    }
    return null;
  }

  /**
   * Get available strategy types
   */
  getStrategyTypes() {
    return Object.entries(this.strategyTypes).map(([key, config]) => ({
      type: key,
      name: config.name,
      description: config.description,
      price: config.price,
      maxLSTs: config.maxLSTs,
      complexity: config.complexity
    }));
  }

  /**
   * Clear strategy cache
   */
  clearCache() {
    this.strategyCache.clear();
    console.log('🧠 [AI Strategy Engine] Strategy cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.strategyCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.strategyCache.keys())
    };
  }
}

export default AIStrategyEngineService;
