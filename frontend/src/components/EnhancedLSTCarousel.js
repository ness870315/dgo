import React, { useState, useEffect } from 'react';

const EnhancedLSTCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lstData, setLstData] = useState([]);

  // Best performing LSTs from our enhanced data sources
  const topLSTs = [
    {
      symbol: 'jitoSOL',
      name: 'Jito Staked SOL',
      apr: 6.70,
      tvl: 1200, // $1.2B
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
      description: 'High-performance validator with MEV rewards',
      color: 'from-green-500 to-green-600',
      features: ['MEV Rewards', 'High Decentralization', 'Low Risk']
    },
    {
      symbol: 'jupSOL',
      name: 'Jupiter Staked SOL',
      apr: 6.60,
      tvl: 350, // $350M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9DcVnK/logo.png',
      description: 'DEX-integrated staking with optimal routing',
      color: 'from-purple-500 to-purple-600',
      features: ['DEX Integration', 'Optimal Routing', 'High Yield']
    },
    {
      symbol: 'mSOL',
      name: 'Marinade Staked SOL',
      apr: 6.40,
      tvl: 800, // $800M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
      description: 'Decentralized validator network',
      color: 'from-blue-500 to-blue-600',
      features: ['Decentralized', 'High TVL', 'Stable']
    },
    {
      symbol: 'bSOL',
      name: 'BlazeStake SOL',
      apr: 6.30,
      tvl: 450, // $450M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png',
      description: 'Community-driven staking protocol',
      color: 'from-orange-500 to-orange-600',
      features: ['Community Driven', 'Medium Risk', 'Good Yield']
    },
    {
      symbol: 'lidoSOL',
      name: 'Lido Staked SOL',
      apr: 6.40,
      tvl: 1800, // $1.8B
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png',
      description: 'Ethereum-proven staking infrastructure',
      color: 'from-cyan-500 to-cyan-600',
      features: ['Ethereum Proven', 'Highest TVL', 'Institutional']
    },
    {
      symbol: 'stSOL',
      name: 'Stake SOL',
      apr: 6.30,
      tvl: 950, // $950M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png',
      description: 'Professional staking service',
      color: 'from-indigo-500 to-indigo-600',
      features: ['Professional', 'High TVL', 'Reliable']
    },
    {
      symbol: 'scnSOL',
      name: 'Socean Staked SOL',
      apr: 6.50,
      tvl: 750, // $750M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/5oVNBeEEQvYi1cX3ir8Dxkm2hpGIMVGS1iidM5P2Hnu/logo.png',
      description: 'Ocean-focused staking protocol',
      color: 'from-teal-500 to-teal-600',
      features: ['Ocean Focused', 'High Yield', 'Medium Risk']
    },
    {
      symbol: 'infSOL',
      name: 'Infinity Staked SOL',
      apr: 6.20,
      tvl: 250, // $250M
      logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/5oVNBeEEQvYi1cX3ir8Dxkm2hpGIMVGS1iidM5P2Hnu/logo.png',
      description: 'Advanced staking strategies',
      color: 'from-pink-500 to-pink-600',
      features: ['Advanced Strategies', 'Innovative', 'Medium Risk']
    }
  ];

  useEffect(() => {
    setLstData(topLSTs);
    
    // Auto-rotate carousel
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % topLSTs.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % lstData.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + lstData.length) % lstData.length);
  };

  const formatTVL = (tvl) => {
    if (tvl >= 1000) {
      return `$${(tvl / 1000).toFixed(1)}B`;
    }
    return `$${tvl}M`;
  };

  return (
    <div className="relative">
      {/* Main Carousel */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900/50 to-gray-800/50 p-8 border border-gray-700">
        <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {lstData.map((lst, index) => (
            <div key={index} className="w-full flex-shrink-0 px-4">
              <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-8 border border-gray-600 hover:border-solana-purple/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <img 
                        src={lst.logo} 
                        alt={lst.symbol}
                        className="w-16 h-16 rounded-full border-2 border-gray-600"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div 
                        className={`w-16 h-16 bg-gradient-to-r ${lst.color} rounded-full flex items-center justify-center text-white font-bold text-xl hidden`}
                      >
                        {lst.symbol.charAt(0)}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white">{lst.symbol}</h3>
                      <p className="text-gray-400">{lst.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-solana-green">{lst.apr.toFixed(2)}%</div>
                    <div className="text-sm text-gray-400">APR</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Total Value Locked</div>
                    <div className="text-xl font-bold text-white">{formatTVL(lst.tvl)}</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Risk Level</div>
                    <div className="text-xl font-bold text-yellow-400">Low-Medium</div>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-gray-300 mb-3">{lst.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {lst.features.map((feature, idx) => (
                      <span 
                        key={idx}
                        className="px-3 py-1 bg-solana-purple/20 text-solana-purple text-xs rounded-full border border-solana-purple/30"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-400">
                    {index + 1} of {lstData.length} LSTs
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={prevSlide}
                      className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                    >
                      ←
                    </button>
                    <button
                      onClick={nextSlide}
                      className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-dark-card border border-solana-purple/30 rounded-full flex items-center justify-center text-solana-purple hover:bg-solana-purple hover:text-white transition-all duration-300"
        >
          ←
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-dark-card border border-solana-purple/30 rounded-full flex items-center justify-center text-solana-purple hover:bg-solana-purple hover:text-white transition-all duration-300"
        >
          →
        </button>
      </div>

      {/* Dots Indicator */}
      <div className="flex justify-center mt-8 space-x-3">
        {lstData.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              currentIndex === index ? 'bg-solana-purple' : 'bg-gray-600 hover:bg-gray-500'
            }`}
          />
        ))}
      </div>

      {/* Token Grid Preview */}
      <div className="mt-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {lstData.map((token, index) => (
          <div
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`p-4 rounded-lg border cursor-pointer transition-all duration-300 ${
              currentIndex === index
                ? 'bg-solana-purple/20 border-solana-purple/50'
                : 'bg-dark-card border-gray-700 hover:border-solana-purple/30'
            }`}
          >
            <div className="text-center">
              <div className="relative mx-auto mb-2 w-8 h-8">
                <img 
                  src={token.logo} 
                  alt={token.symbol}
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div 
                  className={`w-8 h-8 bg-gradient-to-r ${token.color} rounded-full flex items-center justify-center text-white font-bold text-xs hidden`}
                >
                  {token.symbol.charAt(0)}
                </div>
              </div>
              <div className="text-sm font-semibold text-white">{token.symbol}</div>
              <div className="text-xs text-solana-green font-semibold">{token.apr.toFixed(2)}%</div>
              <div className="text-xs text-gray-400">{formatTVL(token.tvl)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Stats */}
      <div className="mt-12 bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4 text-center">Portfolio Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl font-bold text-solana-green mb-1">
              {(lstData.reduce((sum, lst) => sum + lst.apr, 0) / lstData.length).toFixed(2)}%
            </div>
            <div className="text-sm text-gray-400">Average APR</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white mb-1">
              ${lstData.reduce((sum, lst) => sum + lst.tvl, 0).toFixed(0)}M
            </div>
            <div className="text-sm text-gray-400">Total TVL</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400 mb-1">
              {lstData.length}
            </div>
            <div className="text-sm text-gray-400">Supported LSTs</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedLSTCarousel;
