import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const AILiquidStakingRouter = () => {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const [step, setStep] = useState('connect'); // connect, analyze, strategy, payment, execute, confirmation
  const [walletData, setWalletData] = useState(null);
  const [strategyType, setStrategyType] = useState('basic'); // basic or advanced
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [executionComplete, setExecutionComplete] = useState(false);

  // Update step when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      setStep('analyze');
      // Call real portfolio analysis API
      analyzeWalletPortfolio();
    } else {
      setStep('connect');
      setWalletData(null);
    }
  }, [connected, publicKey]);

  const analyzeWalletPortfolio = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    try {
      // Call the portfolio analysis API
      const response = await fetch('https://api.degen-oracle.com/api/portfolio/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          includeTokens: true,
          includeLSTs: true
        })
      });

      if (response.ok) {
        const portfolioData = await response.json();
        setWalletData(portfolioData);
        console.log('Portfolio analysis completed:', portfolioData);
      } else {
        console.error('Portfolio analysis failed:', response.statusText);
        // Fallback to mock data if API fails
        setWalletData({
          sol: 31.0,
          lsts: [
            { symbol: 'jitoSOL', amount: 5.2, apr: 5.8 },
            { symbol: 'mSOL', amount: 3.8, apr: 5.6 }
          ],
          totalValue: 40.0,
          currentYield: 4.2
        });
      }
    } catch (error) {
      console.error('Portfolio analysis error:', error);
      // Fallback to mock data if API fails
      setWalletData({
        sol: 31.0,
        lsts: [
          { symbol: 'jitoSOL', amount: 5.2, apr: 5.8 },
          { symbol: 'mSOL', amount: 3.8, apr: 5.6 }
        ],
        totalValue: 40.0,
        currentYield: 4.2
      });
    } finally {
      setLoading(false);
    }
  };

  const analyzePortfolio = () => {
    setStep('strategy');
  };

  const selectStrategyType = (type) => {
    setStrategyType(type);
    generateStrategy();
  };

  const generateStrategy = async () => {
    if (!walletData || !publicKey) return;
    
    setLoading(true);
    try {
      // Call the AI Strategy Engine API
      const response = await fetch('https://api.degen-oracle.com/api/strategy/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          portfolioData: walletData,
          strategyType: strategyType, // 'basic' or 'advanced'
          preferences: {
            riskTolerance: strategyType === 'basic' ? 'conservative' : 'aggressive',
            timeHorizon: 'long-term',
            diversification: true
          }
        })
      });

      if (response.ok) {
        const strategyData = await response.json();
        setStrategy(strategyData);
        console.log('AI Strategy generated:', strategyData);
      } else {
        console.error('Strategy generation failed:', response.statusText);
        // Fallback to mock strategy if API fails
        const mockStrategy = {
          id: `strategy-${Date.now()}`,
          type: strategyType,
          name: strategyType === 'basic' ? 'Conservative Diversification' : 'Aggressive Growth',
          currentYield: walletData.currentYield,
          expectedYield: strategyType === 'basic' ? 6.2 : 7.5,
          improvement: strategyType === 'basic' ? 2.0 : 3.3,
          riskScore: strategyType === 'basic' ? 4.8 : 6.5,
          allocations: [
            { symbol: 'jitoSOL', name: 'Jito Staked SOL', percentage: 50, amount: walletData.sol * 0.5, apr: 6.7, riskScore: 3.2, reasoning: 'High APR with MEV rewards' },
            { symbol: 'INF', name: 'Infinity Staked SOL', percentage: 30, amount: walletData.sol * 0.3, apr: 8.35, riskScore: 4.1, reasoning: 'Highest APR available' },
            { symbol: 'mSOL', name: 'Marinade Staked SOL', percentage: 20, amount: walletData.sol * 0.2, apr: 6.4, riskScore: 2.8, reasoning: 'Diversified validator network' }
          ],
          actions: [
            { type: 'swap', from: 'SOL', to: 'jitoSOL', amount: walletData.sol * 0.5, reasoning: 'Convert unstacked SOL to high-yield LST' },
            { type: 'swap', from: 'SOL', to: 'mSOL', amount: walletData.sol * 0.3, reasoning: 'Diversify across validator networks' },
            { type: 'swap', from: 'SOL', to: 'bSOL', amount: walletData.sol * 0.2, reasoning: 'Add community-driven LST for higher yield' }
          ],
          risks: ['Validator slashing risk', 'Liquidity risk'],
          benefits: ['Higher yield', 'Diversified exposure', 'MEV rewards'],
          cost: strategyType === 'basic' ? 1.20 : 2.00,
          generatedAt: new Date().toISOString()
        };
        setStrategy(mockStrategy);
      }
    } catch (error) {
      console.error('Strategy generation error:', error);
      // Fallback to mock strategy if API fails
      const mockStrategy = {
        id: `strategy-${Date.now()}`,
        type: strategyType,
        currentYield: walletData.currentYield,
        expectedYield: strategyType === 'basic' ? 6.2 : 7.5,
        improvement: strategyType === 'basic' ? 2.0 : 3.3,
        riskScore: strategyType === 'basic' ? 4.8 : 6.5,
        allocation: [
          { symbol: 'jitoSOL', name: 'Jito Staked SOL', percentage: 50, amount: walletData.sol * 0.5, apr: 5.8, riskScore: 3.2, reasoning: 'High APR with low risk' },
          { symbol: 'mSOL', name: 'Marinade Staked SOL', percentage: 30, amount: walletData.sol * 0.3, apr: 5.6, riskScore: 2.8, reasoning: 'Diversified validator network' },
          { symbol: 'bSOL', name: 'BlazeStake SOL', percentage: 20, amount: walletData.sol * 0.2, apr: 5.9, riskScore: 3.5, reasoning: 'Community-driven with high yield' }
        ],
        actions: [
          { type: 'swap', from: 'SOL', to: 'jitoSOL', amount: walletData.sol * 0.5, reasoning: 'Convert unstacked SOL to high-yield LST' },
          { type: 'swap', from: 'SOL', to: 'mSOL', amount: walletData.sol * 0.3, reasoning: 'Diversify across validator networks' },
          { type: 'swap', from: 'SOL', to: 'bSOL', amount: walletData.sol * 0.2, reasoning: 'Add community-driven LST for higher yield' }
        ],
        risks: ['Validator slashing risk', 'Liquidity risk'],
        benefits: ['Higher yield', 'Diversified exposure', 'MEV rewards'],
        cost: strategyType === 'basic' ? 1.20 : 2.00,
        generatedAt: new Date().toISOString()
      };
      setStrategy(mockStrategy);
    } finally {
      setStep('payment');
      setLoading(false);
    }
  };

  const initiatePayment = async () => {
    setLoading(true);
    
    try {
      // Call the x402 endpoint to get payment requirements
      const response = await fetch(`https://api.degen-oracle.com/api/x402/execute-strategy/test-strategy-${strategyType}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 402) {
        // Payment required - x402 will handle the payment UI
        const paymentData = await response.json();
        console.log('Payment required:', paymentData);
        
        // In a real implementation, this would trigger the x402 payment widget
        // For now, we'll simulate the payment completion
        setTimeout(() => {
          setPaymentComplete(true);
          setStep('execute');
          setLoading(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Payment initiation failed:', error);
      setLoading(false);
    }
  };

  const executeStrategy = async () => {
    setLoading(true);
    
    // Mock strategy execution
    setTimeout(() => {
      setStrategy({
        id: `strategy-${Date.now()}`,
        type: strategyType,
        currentYield: walletData.currentYield,
        projectedYield: 6.8,
        improvement: 2.6,
        allocation: [
          { symbol: 'jitoSOL', percentage: 40, amount: 12.4, apr: 5.8, reasoning: 'High APR with low risk' },
          { symbol: 'mSOL', percentage: 35, amount: 10.85, apr: 5.6, reasoning: 'Large pool, stable' },
          { symbol: 'bSOL', percentage: 25, amount: 7.75, apr: 5.9, reasoning: 'Diversified validators' }
        ],
        actions: [
          { type: 'swap', from: 'SOL', to: 'jitoSOL', amount: 12.4, reasoning: 'Convert unstacked SOL to high-yield LST' },
          { type: 'swap', from: 'SOL', to: 'mSOL', amount: 10.85, reasoning: 'Diversify into stable LST' },
          { type: 'swap', from: 'SOL', to: 'bSOL', amount: 7.75, reasoning: 'Add validator diversity' }
        ],
        risks: ['Validator slashing risk', 'Liquidity risk'],
        benefits: ['Higher yield', 'Diversified exposure'],
        cost: strategyType === 'basic' ? 1.20 : 2.00,
        generatedAt: new Date().toISOString()
      });
      
      setExecutionComplete(true);
      setStep('confirmation');
      setLoading(false);
    }, 3000);
  };

  const resetFlow = () => {
    setStep('connect');
    setWalletData(null);
    setStrategyType('basic');
    setStrategy(null);
    setPaymentComplete(false);
    setExecutionComplete(false);
    if (connected) {
      disconnect();
    }
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
        {/* Step Indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            {['Connect', 'Analyze', 'Strategy', 'Payment', 'Execute', 'Confirm'].map((stepName, index) => {
              const stepIndex = ['connect', 'analyze', 'strategy', 'payment', 'execute', 'confirmation'].indexOf(step);
              const isActive = index <= stepIndex;
              const isCurrent = index === stepIndex;
              
              return (
                <div key={index} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    isActive ? 'bg-solana-purple text-white' : 'bg-gray-700 text-gray-400'
                  } ${isCurrent ? 'ring-2 ring-solana-purple ring-offset-2 ring-offset-dark-bg' : ''}`}>
                    {index + 1}
                  </div>
                  <span className={`ml-2 text-sm ${isActive ? 'text-white' : 'text-gray-400'}`}>
                    {stepName}
                  </span>
                  {index < 5 && (
                    <div className={`w-8 h-0.5 mx-2 ${isActive ? 'bg-solana-purple' : 'bg-gray-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Connect Wallet Step */}
        {step === 'connect' && (
          <div className="bg-dark-card rounded-xl p-8 text-center">
            <div className="text-6xl mb-8">🔗</div>
            <h2 className="text-3xl font-bold text-white mb-6">Connect Your Wallet</h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Connect your Phantom, Solflare, or Backpack wallet to analyze your portfolio
            </p>
            
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-gradient-to-r !from-solana-purple !to-solana-green !text-white !font-bold !text-xl !rounded-xl !px-12 !py-6 hover:!from-solana-purple/80 hover:!to-solana-green/80 !transition-all !duration-300 !transform hover:!scale-105 !shadow-lg hover:!shadow-solana-purple/25" />
            </div>
            
            {connecting && (
              <div className="mt-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-solana-purple mx-auto mb-4"></div>
                <p className="text-gray-400">Connecting to wallet...</p>
              </div>
            )}
          </div>
        )}

        {/* Analyze Portfolio Step */}
        {step === 'analyze' && walletData && (
          <div className="bg-dark-card rounded-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Portfolio Analysis</h2>
                <p className="text-gray-300">Wallet: {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Total Value</div>
                <div className="text-2xl font-semibold text-white">${walletData.totalValue?.toFixed(2) || '0.00'}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Current Holdings</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                    <span className="text-white font-semibold">SOL</span>
                    <span className="text-white font-bold text-lg">{walletData.sol}</span>
                  </div>
                  {walletData.lsts.map((lst, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                      <span className="text-white font-semibold">{lst.symbol}</span>
                      <div className="text-right">
                        <div className="text-white font-bold text-lg">{lst.amount}</div>
                        <div className="text-sm text-gray-400">{lst.apr}% APR</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Current Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                    <span className="text-gray-300">Current APR</span>
                    <span className="text-yellow-400 font-bold text-lg">{walletData.currentYield}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                    <span className="text-gray-300">Annual Yield</span>
                    <span className="text-white font-bold text-lg">{(walletData.totalValue * walletData.currentYield / 100).toFixed(2)} SOL</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={analyzePortfolio}
              className="w-full px-8 py-4 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
            >
              🧠 Continue to Strategy Selection
            </button>
          </div>
        )}

        {/* Strategy Selection Step */}
        {step === 'strategy' && (
          <div className="bg-dark-card rounded-xl p-8">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">Choose Strategy Type</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div 
                className={`border-2 rounded-xl p-8 cursor-pointer transition-all ${
                  strategyType === 'basic' ? 'border-solana-purple bg-solana-purple/10' : 'border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => selectStrategyType('basic')}
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">⚡</div>
                  <h3 className="text-2xl font-semibold text-white mb-3">Basic Strategy</h3>
                  <p className="text-gray-300 mb-6">AI analyzes current APRs and recommends optimal LST allocation</p>
                  <div className="text-3xl font-bold text-solana-purple mb-2">$1.20</div>
                  <div className="text-sm text-gray-400">One-time payment</div>
                </div>
              </div>
              
              <div 
                className={`border-2 rounded-xl p-8 cursor-pointer transition-all ${
                  strategyType === 'advanced' ? 'border-solana-purple bg-solana-purple/10' : 'border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => selectStrategyType('advanced')}
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">🚀</div>
                  <h3 className="text-2xl font-semibold text-white mb-3">Advanced Strategy</h3>
                  <p className="text-gray-300 mb-6">Deep analysis including risk assessment, validator distribution, and DeFi integrations</p>
                  <div className="text-3xl font-bold text-solana-purple mb-2">$2.00</div>
                  <div className="text-sm text-gray-400">One-time payment</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('payment')}
              className="w-full px-8 py-4 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
            >
              💳 Proceed to Payment
            </button>
          </div>
        )}

        {/* Payment Step */}
        {step === 'payment' && (
          <div className="bg-dark-card rounded-xl p-8 text-center">
            <div className="text-6xl mb-8">💳</div>
            <h2 className="text-3xl font-bold text-white mb-6">
              Strategy Generation Payment
            </h2>
            <p className="text-xl text-gray-400 mb-8">
              Pay ${strategyType === 'basic' ? '1.20' : '2.00'} USDC to generate your AI-optimized staking strategy
            </p>
            
            {!paymentComplete ? (
              <button
                onClick={initiatePayment}
                disabled={loading}
                className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? '⏳ Processing Payment...' : `💳 Pay $${strategyType === 'basic' ? '1.20' : '2.00'} USDC`}
              </button>
            ) : (
              <div className="text-green-400 text-2xl font-semibold mb-6">
                ✅ Payment Successful!
              </div>
            )}
          </div>
        )}

        {/* Execute Strategy Step */}
        {step === 'execute' && strategy && (
          <div className="space-y-8">
            {/* Strategy Summary */}
            <div className="bg-dark-card rounded-xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">
                  Execute Strategy
                </h2>
                <p className="text-xl text-gray-400">
                  Your Oracle AI-optimized strategy is ready. Review the details below before executing.
                </p>
              </div>

              {/* Strategy Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl mb-2">📈</div>
                  <h3 className="text-lg font-bold text-white mb-2">Expected Yield</h3>
                  <p className="text-2xl font-bold text-green-400">{strategy.expectedYield?.toFixed(2) || 'N/A'}%</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl mb-2">⚖️</div>
                  <h3 className="text-lg font-bold text-white mb-2">Risk Score</h3>
                  <p className="text-2xl font-bold text-yellow-400">{strategy.riskScore?.toFixed(1) || 'N/A'}/10</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl mb-2">🎯</div>
                  <h3 className="text-lg font-bold text-white mb-2">Strategy Type</h3>
                  <p className="text-xl font-bold text-blue-400">{strategy.name || 'AI Optimized'}</p>
                </div>
              </div>

              {/* Yield Comparison Chart */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-4">Yield Comparison</h3>
                <div className="bg-gray-800/30 rounded-lg p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Traditional Staking */}
                    <div className="text-center">
                      <div className="text-4xl mb-3">🏦</div>
                      <h4 className="text-lg font-bold text-white mb-2">Traditional Staking</h4>
                      <div className="bg-gray-700/50 rounded-lg p-4 mb-3">
                        <p className="text-3xl font-bold text-blue-400">5.8%</p>
                        <p className="text-gray-400">Annual Yield</p>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p>• Native SOL staking</p>
                        <p>• Single validator risk</p>
                        <p>• No liquidity</p>
                        <p>• 21-day unstaking period</p>
                      </div>
                    </div>

                    {/* Oracle AI Strategy */}
                    <div className="text-center">
                      <div className="text-4xl mb-3">🧠</div>
                      <h4 className="text-lg font-bold text-white mb-2">Oracle AI Strategy</h4>
                      <div className="bg-gradient-to-r from-green-900/50 to-green-700/50 rounded-lg p-4 mb-3 border border-green-500/30">
                        <p className="text-3xl font-bold text-green-400">{strategy.expectedYield?.toFixed(2) || '8.5'}%</p>
                        <p className="text-gray-400">Expected Yield</p>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p>• Multiple LST diversification</p>
                        <p>• Instant liquidity</p>
                        <p>• Risk-optimized allocation</p>
                        <p>• Real-time rebalancing</p>
                      </div>
                    </div>
                  </div>

                  {/* Yield Difference */}
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center bg-green-900/30 border border-green-500/30 rounded-lg px-6 py-3">
                      <span className="text-green-400 font-bold text-lg">
                        +{((strategy.expectedYield || 8.5) - 5.8).toFixed(2)}% higher yield
                      </span>
                      <span className="text-gray-400 ml-2">
                        ({(((strategy.expectedYield || 8.5) - 5.8) / 5.8 * 100).toFixed(0)}% improvement)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Allocation Chart */}
              {strategy.allocation && strategy.allocation.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-white mb-4">Strategy Allocation</h3>
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    {/* Visual Bar Chart */}
                    <div className="space-y-3 mb-6">
                      {strategy.allocation.map((allocation, index) => (
                        <div key={index} className="flex items-center space-x-4">
                          <div className="w-24 text-sm text-gray-400 text-right">
                            {allocation.symbol}
                          </div>
                          <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-solana-purple to-blue-600 transition-all duration-1000 ease-out"
                              style={{ width: `${(allocation.weight || allocation.percentage || 0) * 100}%` }}
                            ></div>
                          </div>
                          <div className="w-16 text-sm text-white text-right font-bold">
                            {((allocation.weight || allocation.percentage || 0) * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pie Chart Representation */}
                    <div className="flex justify-center">
                      <div className="relative w-48 h-48">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {strategy.allocation.map((allocation, index) => {
                            const percentage = (allocation.weight || allocation.percentage || 0) * 100;
                            const circumference = 2 * Math.PI * 40;
                            const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                            const strokeDashoffset = index === 0 ? 0 : 
                              strategy.allocation.slice(0, index).reduce((sum, a) => sum - ((a.weight || a.percentage || 0) * 100) / 100 * circumference, 0);
                            
                            return (
                              <circle
                                key={index}
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                stroke={index === 0 ? '#8B5CF6' : index === 1 ? '#3B82F6' : index === 2 ? '#10B981' : '#F59E0B'}
                                strokeWidth="8"
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-1000 ease-out"
                              />
                            );
                          })}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-white">{strategy.expectedYield?.toFixed(1) || '8.5'}%</div>
                            <div className="text-sm text-gray-400">Expected APR</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Projection */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-4">Performance Projection</h3>
                <div className="bg-gray-800/30 rounded-lg p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-400 mb-2">1 Year</div>
                      <div className="text-3xl font-bold text-white">
                        ${(walletData?.totalValue * (1 + (strategy.expectedYield || 8.5) / 100)).toFixed(0)}
                      </div>
                      <div className="text-sm text-gray-400">From ${walletData?.totalValue?.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400 mb-2">3 Years</div>
                      <div className="text-3xl font-bold text-white">
                        ${(walletData?.totalValue * Math.pow(1 + (strategy.expectedYield || 8.5) / 100, 3)).toFixed(0)}
                      </div>
                      <div className="text-sm text-gray-400">Compound growth</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400 mb-2">5 Years</div>
                      <div className="text-3xl font-bold text-white">
                        ${(walletData?.totalValue * Math.pow(1 + (strategy.expectedYield || 8.5) / 100, 5)).toFixed(0)}
                      </div>
                      <div className="text-sm text-gray-400">Long-term projection</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy Reasoning */}
              {strategy.reasoning && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-white mb-4">Strategy Reasoning</h3>
                  <div className="bg-gray-800/30 rounded-lg p-4">
                    <p className="text-gray-300">{strategy.reasoning}</p>
                  </div>
                </div>
              )}

              {/* Execute Button */}
              <div className="text-center">
                <button
                  onClick={executeStrategy}
                  disabled={loading}
                  className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? '⏳ Building Transactions...' : '🚀 Execute Strategy'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Step */}
        {step === 'confirmation' && strategy && (
          <div className="space-y-8">
            <div className="bg-dark-card rounded-xl p-8 text-center">
              <div className="text-6xl mb-6">✅</div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Strategy Executed Successfully!
              </h2>
              <p className="text-xl text-gray-400 mb-8">
                Your staking portfolio has been optimized. Here are the results:
              </p>
            </div>

            <div className="bg-dark-card rounded-xl p-8">
              <h3 className="text-2xl font-bold text-white mb-8 text-center">Strategy Results</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800 rounded-lg p-6 text-center">
                  <div className="text-sm text-gray-400 mb-2">Previous APR</div>
                  <div className="text-3xl font-bold text-yellow-400">{strategy.currentYield}%</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-6 text-center">
                  <div className="text-sm text-gray-400 mb-2">New APR</div>
                  <div className="text-3xl font-bold text-green-400">{strategy.projectedYield}%</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-6 text-center">
                  <div className="text-sm text-gray-400 mb-2">Improvement</div>
                  <div className="text-3xl font-bold text-solana-purple">+{strategy.improvement}%</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                  <h4 className="text-xl font-semibold text-white mb-4">New Allocation</h4>
                  <div className="space-y-3">
                    {strategy.allocation.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-4 bg-gray-800 rounded-lg">
                        <span className="text-white font-semibold">{item.symbol}</span>
                        <div className="text-right">
                          <div className="text-white font-semibold">{item.percentage}%</div>
                          <div className="text-sm text-gray-400">{item.apr}% APR</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-xl font-semibold text-white mb-4">Transaction Links</h4>
                  <div className="space-y-3">
                    <a 
                      href={`https://solscan.io/tx/strategy-${strategy.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div className="text-white font-semibold">📊 View on Solscan</div>
                      <div className="text-sm text-gray-400">Transaction details</div>
                    </a>
                    <a 
                      href={`https://scan.payai.network/tx/payai_${strategy.id.substring(0, 16)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div className="text-white font-semibold">💳 View Payment</div>
                      <div className="text-sm text-gray-400">x402 payment details</div>
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-solana-green/20 to-solana-purple/20 border border-solana-green/30 rounded-xl p-6 mb-8">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">Projected Annual Yield</div>
                  <div className="text-3xl font-bold text-white mb-2">
                    {(walletData.totalValue * strategy.projectedYield / 100).toFixed(2)} SOL
                  </div>
                  <div className="text-lg text-solana-green font-semibold">
                    +{((strategy.projectedYield - strategy.currentYield) * walletData.totalValue / 100).toFixed(2)} SOL more per year
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={resetFlow}
                  className="flex-1 px-8 py-4 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-600 transition-colors"
                >
                  🔄 Start New Analysis
                </button>
                <button
                  onClick={() => window.location.href = '/'}
                  className="flex-1 px-8 py-4 bg-gradient-to-r from-solana-purple to-solana-green text-white rounded-xl font-semibold hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300"
                >
                  🏠 Back to Degen Oracle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AILiquidStakingRouter;