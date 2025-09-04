import React, { useState } from 'react';

const CategoryFilters = ({ onFiltersChange, currentFilters }) => {
  const [hoveredFilter, setHoveredFilter] = useState(null);

  // Use the filters passed from parent (controlled component)
  const categories = currentFilters || {
    trending: true,   // NEW: Score >7 with 60% score + 40% volume (DEFAULT) - FIRST
    cults: false,     // Established coins (score ≥3.0, market cap ≥$10M)
    highCap: false,   // ≥$100M market cap
    midCap: false,    // ≥$5M to ≤$10M market cap
    smallCap: false,  // >$500K to <$5M market cap
    microCap: false   // $30K to $500K market cap
  };

  const handleCategoryToggle = (category) => {
    // Always switch to the clicked filter (even if it's already active)
    // This ensures the UI and data stay in sync
    const newCategories = {
      trending: false,
      cults: false,
      highCap: false,
      midCap: false,
      smallCap: false,
      microCap: false,
      [category]: true // Enable only the clicked filter
    };
    
    console.log('Category switched to:', category, newCategories);
    onFiltersChange(newCategories);
  };

  const getTooltipContent = (key) => {
    switch (key) {
      case 'trending':
        return {
          title: '🔥 Trending',
          description: 'Score ≥6 + Volume • Top 50 emerging ≤$10M'
        };
      case 'cults':
        return {
          title: '🏛️ Cults',
          description: 'MCap ≥$10M + Score ≥3 • Top 50 proven tokens'
        };
      case 'highCap':
        return {
          title: '🏦 High Cap',
          description: 'MCap ≥$100M • Large tokens'
        };
      case 'midCap':
        return {
          title: '🏢 Mid Cap',
          description: 'MCap $5M-$10M • Medium tokens'
        };
      case 'smallCap':
        return {
          title: '💎 Small Cap',
          description: 'MCap $500K-$5M • Small tokens'
        };
      case 'microCap':
        return {
          title: '🔍 Micro Cap',
          description: 'MCap $30K-$500K • Micro tokens'
        };
      // Removed volatile/stable per product update
      default:
        return { title: key, description: '' };
    }
  };

  return (
    <div className="flex items-center space-x-2 relative">
      <span className="text-sm text-gray-400 mr-2">Categories:</span>
      {Object.entries(categories).map(([key, value]) => {
        const tooltipContent = getTooltipContent(key);
        return (
          <div key={key} className="relative">
            <button
              onClick={() => handleCategoryToggle(key)}
              onMouseEnter={() => setHoveredFilter(key)}
              onMouseLeave={() => setHoveredFilter(null)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                value
                  ? 'bg-solana-purple text-white'
                  : 'bg-dark-bg text-gray-400 hover:text-white border border-gray-600'
              }`}
            >
              {key === 'trending' && '🔥 Trending'}
              {key === 'cults' && '🏛️ Cults'}
              {key === 'highCap' && '🏦 High Cap'}
              {key === 'midCap' && '🏢 Mid Cap'}
              {key === 'smallCap' && '💎 Small Cap'}
              {key === 'microCap' && '🔍 Micro Cap'}
              {key === 'volatile' && '⚡ Volatile'}
              {key === 'stable' && '📈 Stable'}
            </button>

            {/* Tooltip Modal (matching BubbleMap design) */}
            {hoveredFilter === key && (
              <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50">
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-white">{tooltipContent.title}:</span>
                  <span className="text-gray-300 ml-1">{tooltipContent.description}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CategoryFilters;
