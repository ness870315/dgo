import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const AILiquidStakingRouter = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [strategy, setStrategy] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Mock wallet connection
  const connectWallet = async () => {
    try {
      // Simulate wallet connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsConnected(true);
      setWalletAddress('82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8');
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  };

  // Mock portfolio analysis
  const analyzePortfolio = async () => {
    setIsAnalyzing(true);
    try {
      // Simulate AI analysis
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockStrategy = {
        id: 'strategy-123',
        type: 'basic',
        currentYield: 5.1,
        expectedYield: 6.2,
        improvement: 1.1,
        riskScore: 4.8,
        allocation: [
          {
            symbol: 'jitoSOL',
            name: 'Jito Staked SOL',
            percentage: 50,
            amount: 28.25,
            apr: 5.8,
            riskScore: 3.2,
            reasoning: 'High APR with low risk'
          },
          {
            symbol: 'mSOL',
            name: 'Marinade Staked SOL',
            percentage: 30,
            amount: 16.95,
            apr: 5.6,
            riskScore: 2.8,
            reasoning: 'Diversified validator network'
          },
          {
            symbol: 'bSOL',
            name: 'BlazeStake SOL',
            percentage: 20,
            amount: 11.3,
            apr: 5.9,
            riskScore: 3.5,
            reasoning: 'Community-driven with high yield'
          }
        ],
        actions: [
          {
            type: 'swap',
            from: 'SOL',
            to: 'jitoSOL',
            amount: 28.25,
            reasoning: 'Convert unstacked SOL to high-yield LST'
          },
          {
            type: 'swap',
            from: 'SOL',
            to: 'mSOL',
            amount: 16.95,
            reasoning: 'Diversify across validator networks'
          },
          {
            type: 'swap',
            from: 'SOL',
            to: 'bSOL',
            amount: 11.3,
            reasoning: 'Add community-driven LST for higher yield'
          }
        ],
        risks: ['Validator slashing risk', 'Liquidity risk'],
        benefits: ['Higher yield', 'Diversified exposure', 'MEV rewards'],
        cost: 1.20,
        generatedAt: new Date().toISOString()
      };
      
      setStrategy(mockStrategy);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Mock strategy execution
  const executeStrategy = async () => {
    setIsExecuting(true);
    try {
      // Simulate x402 payment and execution
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setExecutionResult({
        success: true,
        transactionHash: '5KJp7Kqj8...',
        newYield: 6.2,
        executedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Execution failed:', error);
      setExecutionResult({
        success: false,
        error: 'Execution failed'
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const resetFlow = () => {
    setStrategy(null);
    setExecutionResult(null);
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/staking" className="text-solana-purple hover:text-solana-purple/80 transition-colors">
              ← Back to Landing
            </Link>
            <h1 className="text-2xl font-bold text-white">🧠 AI Liquid Staking Router</h1>
          </div>
          <div className="text-sm text-gray-400">
            Powered by x402 protocol
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Step 1: Wallet Connection */}
        {!isConnected && (
          <div className="text-center py-20">
            <div className="text-6xl mb-8">🔗</div>
            <h2 className="text-3xl font-bold text-white mb-6">Connect Your Wallet</h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Connect your Phantom, Solflare, or Backpack wallet to analyze your SOL and LST holdings
            </p>
            
            <button
              onClick={connectWallet}
              className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
            >
              🔗 Connect Wallet
            </button>
          </div>
        )}

        {/* Step 2: Portfolio Analysis */}
        {isConnected && !strategy && !isAnalyzing && (
          <div className="text-center py-20">
            <div className="text-6xl mb-8">🧠</div>
            <h2 className="text-3xl font-bold text-white mb-6">AI Portfolio Analysis</h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Our AI will analyze your current holdings and recommend optimal LST allocations
            </p>
            
            <div className="bg-dark-card border border-gray-700 rounded-xl p-8 mb-12 max-w-2xl mx-auto">
              <h3 className="text-xl font-semibold text-white mb-4">Connected Wallet</h3>
              <div className="text-solana-purple font-mono text-sm break-all">
                {walletAddress}
              </div>
            </div>
            
            <button
              onClick={analyzePortfolio}
              className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
            >
              🧠 Analyze Portfolio
            </button>
          </div>
        )}

        {/* Loading Analysis */}
        {isAnalyzing && (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-solana-purple mx-auto mb-8"></div>
            <h2 className="text-3xl font-bold text-white mb-6">AI Analyzing...</h2>
            <p className="text-xl text-gray-400 mb-8">
              Analyzing APRs, risk scores, and market conditions
            </p>
            <div className="flex justify-center space-x-2">
              <div className="w-2 h-2 bg-solana-purple rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-solana-purple rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 bg-solana-purple rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
        )}

        {/* Step 3: Strategy Display */}
        {strategy && !executionResult && (
          <div className="space-y-8">
            <div className="text-center">
              <div className="text-6xl mb-6">📊</div>
              <h2 className="text-3xl font-bold text-white mb-4">AI Strategy Generated</h2>
              <p className="text-xl text-gray-400">
                Optimize your staking for better yields
              </p>
            </div>

            {/* Strategy Overview */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-400">{strategy.currentYield}%</div>
                  <div className="text-sm text-gray-400">Current Yield</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-solana-green">{strategy.expectedYield}%</div>
                  <div className="text-sm text-gray-400">Expected Yield</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-solana-purple">+{strategy.improvement}%</div>
                  <div className="text-sm text-gray-400">Improvement</div>
                </div>
              </div>

              <div className="text-center mb-8">
                <div className="text-2xl font-bold text-white mb-2">Risk Score: {strategy.riskScore}/10</div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-solana-purple to-solana-green h-2 rounded-full" 
                    style={{width: `${strategy.riskScore * 10}%`}}
                  ></div>
                </div>
              </div>
            </div>

            {/* Allocation Breakdown */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-8">
              <h3 className="text-2xl font-bold text-white mb-6">Recommended Allocation</h3>
              <div className="space-y-4">
                {strategy.allocation.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">🪙</div>
                      <div>
                        <div className="font-semibold text-white">{item.symbol}</div>
                        <div className="text-sm text-gray-400">{item.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-white">{item.percentage}%</div>
                      <div className="text-sm text-gray-400">{item.apr} APR</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-8">
              <h3 className="text-2xl font-bold text-white mb-6">Execution Plan</h3>
              <div className="space-y-4">
                {strategy.actions.map((action, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">🔄</div>
                      <div>
                        <div className="font-semibold text-white">
                          Swap {action.amount} {action.from} → {action.to}
                        </div>
                        <div className="text-sm text-gray-400">{action.reasoning}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Benefits & Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
                <h3 className="text-xl font-bold text-solana-green mb-4">✅ Benefits</h3>
                <ul className="space-y-2">
                  {strategy.benefits.map((benefit, index) => (
                    <li key={index} className="text-gray-300">• {benefit}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
                <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Risks</h3>
                <ul className="space-y-2">
                  {strategy.risks.map((risk, index) => (
                    <li key={index} className="text-gray-300">• {risk}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Payment & Execution */}
            <div className="bg-gradient-to-r from-solana-purple/20 to-solana-green/20 border border-solana-purple/30 rounded-xl p-8">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">Ready to Execute?</h3>
                <p className="text-gray-400">
                  Pay ${strategy.cost} USDC via x402 protocol and execute the strategy
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={executeStrategy}
                  disabled={isExecuting}
                  className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isExecuting ? '⏳ Executing...' : '🚀 Execute Strategy'}
                </button>
                <button
                  onClick={resetFlow}
                  className="px-12 py-6 border-2 border-solana-purple text-solana-purple font-bold text-xl rounded-xl hover:bg-solana-purple hover:text-white transition-all duration-300"
                >
                  🔄 New Analysis
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Execution Result */}
        {executionResult && (
          <div className="text-center py-20">
            {executionResult.success ? (
              <>
                <div className="text-6xl mb-8">✅</div>
                <h2 className="text-3xl font-bold text-white mb-6">Strategy Executed Successfully!</h2>
                <p className="text-xl text-gray-400 mb-12">
                  Your staking portfolio has been optimized
                </p>
                
                <div className="bg-dark-card border border-gray-700 rounded-xl p-8 mb-12 max-w-2xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-solana-green">{executionResult.newYield}%</div>
                      <div className="text-sm text-gray-400">New Expected Yield</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-solana-purple">{strategy.improvement}%</div>
                      <div className="text-sm text-gray-400">Yield Improvement</div>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-gray-700">
                    <div className="text-sm text-gray-400 mb-2">Transaction Hash</div>
                    <div className="text-solana-purple font-mono text-sm break-all">
                      {executionResult.transactionHash}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={resetFlow}
                    className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
                  >
                    🔄 Optimize Again
                  </button>
                  <Link
                    to="/staking"
                    className="px-12 py-6 border-2 border-solana-purple text-solana-purple font-bold text-xl rounded-xl hover:bg-solana-purple hover:text-white transition-all duration-300"
                  >
                    🏠 Back to Landing
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-6xl mb-8">❌</div>
                <h2 className="text-3xl font-bold text-white mb-6">Execution Failed</h2>
                <p className="text-xl text-gray-400 mb-12">
                  {executionResult.error || 'Something went wrong during execution'}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => setExecutionResult(null)}
                    className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
                  >
                    🔄 Try Again
                  </button>
                  <button
                    onClick={resetFlow}
                    className="px-12 py-6 border-2 border-solana-purple text-solana-purple font-bold text-xl rounded-xl hover:bg-solana-purple hover:text-white transition-all duration-300"
                  >
                    🧠 New Analysis
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AILiquidStakingRouter;
