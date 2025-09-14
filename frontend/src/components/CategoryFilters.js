import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const CategoryFilters = ({ onFiltersChange, currentFilters }) => {
  const { isAuthenticated } = useAuth();
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
          description: 'Viral + Emerging • Top 100 (fresh, ranked by score/flow)'
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
    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 relative mobile-filters-container">
      <span className="text-gray-400 mr-0 sm:mr-2 flex-shrink-0 mobile-filters-label">Categories:</span>
      <div className="flex flex-wrap gap-1 sm:gap-2 mobile-filters-buttons">
        {Object.entries(categories)
          .filter(([key]) => key !== 'volatile' && key !== 'stable')
          .map(([key, value]) => {
          const tooltipContent = getTooltipContent(key);
          return (
            <div key={key} className="relative">
              <button
                onClick={() => handleCategoryToggle(key)}
                onMouseEnter={() => setHoveredFilter(key)}
                onMouseLeave={() => setHoveredFilter(null)}
                className={`rounded font-medium transition-colors whitespace-nowrap mobile-filter-button ${
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
                {/* volatile/stable removed */}
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
    </div>
  );
};

export default CategoryFilters;
