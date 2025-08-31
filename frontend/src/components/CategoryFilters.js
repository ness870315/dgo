import React, { useState } from 'react';

const CategoryFilters = ({ onFiltersChange }) => {
  const [categories, setCategories] = useState({
    trending: true,   // Top 50 hype tokens (score ≥6.5, market cap ≥$50K) + fueled priority (DEFAULT) - FIRST
    highCap: false,   // ≥$100M market cap
    midCap: false,    // ≥$5M to ≤$10M market cap
    smallCap: false,  // >$500K to <$5M market cap
    microCap: false,  // $30K to $500K market cap
    volatile: false,  // High price changes
    stable: false     // Low price changes
  });

  const handleCategoryToggle = (category) => {
    // Always switch to the clicked filter (even if it's already active)
    // This ensures the UI and data stay in sync
    const newCategories = {
      trending: false,
      highCap: false,
      midCap: false,
      smallCap: false,
      microCap: false,
      volatile: false,
      stable: false,
      [category]: true // Enable only the clicked filter
    };
    
    setCategories(newCategories);
    console.log('Category switched to:', category, newCategories);
    onFiltersChange(newCategories);
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-400 mr-2">Categories:</span>
      {Object.entries(categories).map(([key, value]) => (
        <button
          key={key}
          onClick={() => handleCategoryToggle(key)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            value
              ? 'bg-solana-purple text-white'
              : 'bg-dark-bg text-gray-400 hover:text-white border border-gray-600'
          }`}
          title={`Show ${key === 'trending' ? 'Trending (Score ≥6.0) - Top 50' :
                        key === 'highCap' ? 'High Cap (≥$100M)' : 
                        key === 'midCap' ? 'Mid Cap (≥$5M to ≤$10M)' : 
                        key === 'smallCap' ? 'Small Cap (>$500K to <$5M)' : 
                        key === 'microCap' ? 'Micro Cap ($30K to $500K)' : 
                        key === 'volatile' ? 'Volatile (>5% change)' : 
                        'Stable (≤5% change)'} tokens`}
        >
          {key === 'trending' && '🔥 Trending'}
          {key === 'highCap' && '🏦 High Cap'}
          {key === 'midCap' && '🏢 Mid Cap'}
          {key === 'smallCap' && '💎 Small Cap'}
          {key === 'microCap' && '🔍 Micro Cap'}
          {key === 'volatile' && '⚡ Volatile'}
          {key === 'stable' && '📈 Stable'}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilters;
