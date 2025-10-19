import React from 'react';
import { Link } from 'react-router-dom';

const AIStakingLandingPage = () => {
  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-solana-purple/20 via-transparent to-solana-green/20"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-6xl md:text-8xl font-bold text-white mb-8">
              Introducing
              <br />
              <span className="bg-gradient-to-r from-solana-purple to-solana-green bg-clip-text text-transparent">
                DGO Liquid Staking Strategy Router
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-4xl mx-auto">
              The world's first AI-powered Pay-Per-Strategy protocol-level UX — no accounts, no off-chain billing, no subscriptions.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/staking/ai-lst-router"
                className="px-8 py-4 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-lg rounded-lg hover:opacity-90 transition-opacity"
              >
                🚀 Launch dApp
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* How it works section */}
      <div className="py-24 bg-dark-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white text-center mb-16">
            How it works?
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: '🔗',
                title: 'Connect Wallet',
                description: 'Connect your Phantom, Solflare, or Backpack wallet to analyze your current SOL and LST holdings.'
              },
              {
                icon: '🧠',
                title: 'AI Analysis',
                description: 'Our AI analyzes current APRs, risk scores, liquidity, and validator distribution across all Solana LSTs.'
              },
              {
                icon: '📊',
                title: 'Get Strategy',
                description: 'Receive personalized allocation recommendations with expected yield improvements and risk assessments.'
              },
              {
                icon: '💳',
                title: 'Pay & Execute',
                description: 'Pay $1.20-$2.00 via x402 protocol and execute optimized transactions with a single signature.'
              }
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="text-6xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-bold text-white mb-4">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Oracle AI Section */}
      <div className="py-24 bg-dark-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-8">
            Oracle AI builds your optimal Yield Portfolio from +1000 LSTs
          </h2>
          
          {/* LST Carousel */}
          <div className="mt-16">
            <div className="flex overflow-hidden space-x-8 animate-scroll">
              {[
                { symbol: 'mSOL', name: 'Marinade Staked SOL', apr: '5.6%', color: 'from-blue-500 to-blue-600' },
                { symbol: 'jupSOL', name: 'Jupiter Staked SOL', apr: '5.8%', color: 'from-purple-500 to-purple-600' },
                { symbol: 'JitoSOL', name: 'Jito Staked SOL', apr: '5.9%', color: 'from-green-500 to-green-600' },
                { symbol: 'bSOL', name: 'BlazeStake SOL', apr: '5.7%', color: 'from-orange-500 to-orange-600' },
                { symbol: 'mSOL', name: 'Marinade Staked SOL', apr: '5.6%', color: 'from-blue-500 to-blue-600' },
                { symbol: 'jupSOL', name: 'Jupiter Staked SOL', apr: '5.8%', color: 'from-purple-500 to-purple-600' },
                { symbol: 'JitoSOL', name: 'Jito Staked SOL', apr: '5.9%', color: 'from-green-500 to-green-600' },
                { symbol: 'bSOL', name: 'BlazeStake SOL', apr: '5.7%', color: 'from-orange-500 to-orange-600' }
              ].map((lst, index) => (
                <div key={index} className="flex-shrink-0 bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl p-6 min-w-[200px] border border-gray-600">
                  <div className="text-center">
                    <div className={`w-12 h-12 bg-gradient-to-r ${lst.color} rounded-full mx-auto mb-3 flex items-center justify-center text-white font-bold text-lg`}>
                      {lst.symbol.charAt(0)}
                    </div>
                    <h3 className="text-white font-bold text-lg mb-1">{lst.symbol}</h3>
                    <p className="text-gray-400 text-sm mb-2">{lst.name}</p>
                    <div className="text-solana-green font-semibold">{lst.apr} APR</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 bg-dark-bg border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400 text-sm">
            Powered by x402 protocol on Solana
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIStakingLandingPage;
