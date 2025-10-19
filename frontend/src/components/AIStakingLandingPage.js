import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LSTCarousel from './LSTCarousel';

const AIStakingLandingPage = () => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
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
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-solana-purple/20 via-transparent to-solana-green/20"></div>
        
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-32 h-32 bg-solana-purple/10 rounded-full blur-xl animate-pulse-slow"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-solana-green/10 rounded-full blur-xl animate-pulse-slow" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-solana-purple/5 rounded-full blur-xl animate-pulse-slow" style={{animationDelay: '2s'}}></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-2 bg-solana-purple/20 border border-solana-purple/30 rounded-full text-solana-purple text-sm font-medium mb-8">
              🚀 Introducing
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 leading-tight">
              DGO AI-Liquid
              <br />
              <span className="bg-gradient-to-r from-solana-purple to-solana-green bg-clip-text text-transparent">
                Staking Router
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-4xl mx-auto leading-relaxed">
              The first <span className="text-solana-purple font-semibold">Pay-Per-Strategy</span> protocol-level UX — 
              no accounts, no off-chain billing, no subscriptions.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link
                to="/staking/ai-lst-router"
                className="px-8 py-4 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-lg rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
              >
                🚀 Launch AI Router
              </Link>
              <button className="px-8 py-4 border-2 border-solana-purple text-solana-purple font-bold text-lg rounded-xl hover:bg-solana-purple hover:text-white transition-all duration-300">
                📖 Learn More
              </button>
            </div>

            {/* Power Badge */}
            <div className="inline-flex items-center px-6 py-3 bg-dark-card border border-gray-700 rounded-lg">
              <span className="text-gray-400 text-sm">Powered by</span>
              <span className="ml-2 text-solana-purple font-semibold">x402 protocol</span>
              <span className="ml-1 text-gray-400 text-sm">on Solana</span>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-20 bg-dark-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              How it works?
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Experience the future of DeFi with our AI-powered staking optimization
            </p>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`relative p-6 rounded-xl border transition-all duration-500 ${
                  currentStep === index
                    ? 'bg-gradient-to-br from-solana-purple/20 to-solana-green/20 border-solana-purple/50 shadow-lg shadow-solana-purple/25'
                    : 'bg-dark-card border-gray-700 hover:border-solana-purple/30'
                }`}
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">{step.icon}</div>
                  <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{step.description}</p>
                </div>
                
                {/* Step Number */}
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-solana-purple text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Flow Visualization */}
          <div className="flex justify-center items-center space-x-4 mb-16">
            {steps.map((_, index) => (
              <React.Fragment key={index}>
                <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  currentStep === index ? 'bg-solana-purple' : 'bg-gray-600'
                }`}></div>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 transition-all duration-300 ${
                    currentStep > index ? 'bg-solana-purple' : 'bg-gray-600'
                  }`}></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* LST Carousel Section */}
      <div className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Supported LSTs
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Optimize across the most trusted Liquid Staking Tokens on Solana
            </p>
          </div>
          
          <LSTCarousel />
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-dark-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Why Choose AI Router?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-dark-card rounded-xl border border-gray-700 hover:border-solana-purple/30 transition-all duration-300">
              <div className="text-5xl mb-6">🧠</div>
              <h3 className="text-2xl font-bold text-white mb-4">AI-Powered</h3>
              <p className="text-gray-400">
                Advanced algorithms analyze APRs, risk scores, and market conditions to find optimal allocations.
              </p>
            </div>

            <div className="text-center p-8 bg-dark-card rounded-xl border border-gray-700 hover:border-solana-purple/30 transition-all duration-300">
              <div className="text-5xl mb-6">🔒</div>
              <h3 className="text-2xl font-bold text-white mb-4">Non-Custodial</h3>
              <p className="text-gray-400">
                Your assets stay in your wallet. We only build unsigned transactions for you to sign and execute.
              </p>
            </div>

            <div className="text-center p-8 bg-dark-card rounded-xl border border-gray-700 hover:border-solana-purple/30 transition-all duration-300">
              <div className="text-5xl mb-6">⚡</div>
              <h3 className="text-2xl font-bold text-white mb-4">Pay-Per-Use</h3>
              <p className="text-gray-400">
                No subscriptions or accounts. Pay only when you execute a strategy via x402 micropayments.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Optimize Your Staking?
          </h2>
          <p className="text-xl text-gray-400 mb-12">
            Join the future of DeFi with AI-powered staking optimization
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/staking/ai-lst-router"
              className="px-12 py-6 bg-gradient-to-r from-solana-purple to-solana-green text-white font-bold text-xl rounded-xl hover:from-solana-purple/80 hover:to-solana-green/80 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-solana-purple/25"
            >
              🚀 Start Optimizing Now
            </Link>
            <button className="px-12 py-6 border-2 border-solana-purple text-solana-purple font-bold text-xl rounded-xl hover:bg-solana-purple hover:text-white transition-all duration-300">
              📊 View Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-12 bg-dark-card border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="text-gray-400 mb-4 sm:mb-0">
              © 2024 Degen Oracle. All rights reserved.
            </div>
            <div className="flex space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-solana-purple transition-colors">Privacy</a>
              <a href="#" className="hover:text-solana-purple transition-colors">Terms</a>
              <a href="#" className="hover:text-solana-purple transition-colors">Support</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIStakingLandingPage;
