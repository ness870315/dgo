import React, { useState, useEffect } from 'react';

const LSTCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const lstTokens = [
    {
      symbol: 'jitoSOL',
      name: 'Jito Staked SOL',
      apr: '5.8%',
      tvl: '$2.1B',
      logo: '🟡',
      description: 'High-performance validator with MEV rewards'
    },
    {
      symbol: 'mSOL',
      name: 'Marinade Staked SOL',
      apr: '5.6%',
      tvl: '$1.8B',
      logo: '🔵',
      description: 'Decentralized validator network'
    },
    {
      symbol: 'bSOL',
      name: 'BlazeStake SOL',
      apr: '5.9%',
      tvl: '$890M',
      logo: '🟠',
      description: 'Community-driven staking protocol'
    },
    {
      symbol: 'laineSOL',
      name: 'Laine Staked SOL',
      apr: '5.7%',
      tvl: '$420M',
      logo: '🟢',
      description: 'Sustainable validator infrastructure'
    },
    {
      symbol: 'daoSOL',
      name: 'DAO Staked SOL',
      apr: '5.5%',
      tvl: '$320M',
      logo: '🟣',
      description: 'Community governance staking'
    },
    {
      symbol: 'infSOL',
      name: 'Infinity Staked SOL',
      apr: '5.4%',
      tvl: '$180M',
      logo: '⚡',
      description: 'Advanced staking strategies'
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % lstTokens.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % lstTokens.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + lstTokens.length) % lstTokens.length);
  };

  return (
    <div className="relative">
      {/* Main Carousel */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-solana-purple/10 to-solana-green/10 border border-solana-purple/20">
        <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {lstTokens.map((token, index) => (
            <div key={index} className="w-full flex-shrink-0">
              <div className="p-12 text-center">
                <div className="text-8xl mb-6">{token.logo}</div>
                <h3 className="text-4xl font-bold text-white mb-2">{token.symbol}</h3>
                <p className="text-xl text-gray-300 mb-6">{token.name}</p>
                <p className="text-lg text-gray-400 mb-8 max-w-md mx-auto">{token.description}</p>
                
                <div className="flex justify-center space-x-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-solana-green">{token.apr}</div>
                    <div className="text-sm text-gray-400">APR</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-solana-purple">{token.tvl}</div>
                    <div className="text-sm text-gray-400">TVL</div>
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
        {lstTokens.map((_, index) => (
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
      <div className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {lstTokens.map((token, index) => (
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
              <div className="text-2xl mb-2">{token.logo}</div>
              <div className="text-sm font-semibold text-white">{token.symbol}</div>
              <div className="text-xs text-gray-400">{token.apr}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LSTCarousel;
