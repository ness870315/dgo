import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, X } from 'lucide-react';

const CategoryFilters = ({ onFiltersChange, currentFilters }) => {
  const { isAuthenticated } = useAuth();
  const [hoveredFilter, setHoveredFilter] = useState(null);
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);

  // Use the filters passed from parent (controlled component)
  const categories = currentFilters || {
    trending: true,   // NEW: Score >7 with 60% score + 40% volume (DEFAULT) - FIRST
    cults: false,     // Established coins (score ≥7.0, market cap ≥$25M)
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
          description: 'MCap ≥$25M + Score ≥7 • Top 50 proven tokens'
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

  // Get current active filter for mobile button display
  const getActiveFilter = () => {
    const activeKey = Object.entries(categories).find(([key, value]) => value)?.[0];
    if (activeKey === 'trending') return '🔥 Trending';
    if (activeKey === 'cults') return '🏛️ Cults';
    if (activeKey === 'highCap') return '🏦 High Cap';
    if (activeKey === 'midCap') return '🏢 Mid Cap';
    if (activeKey === 'smallCap') return '💎 Small Cap';
    if (activeKey === 'microCap') return '🔍 Micro Cap';
    return 'Categories';
  };

  const handleMobileFilterSelect = (key) => {
    handleCategoryToggle(key);
    setShowMobileDropdown(false);
  };

  return (
    <div className="relative mobile-filters-container">
      {/* Desktop Layout - Original */}
      <div className="hidden md:flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
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

      {/* Mobile Layout - Dropdown Button */}
      <div className="md:hidden">
        <button
          onClick={() => setShowMobileDropdown(!showMobileDropdown)}
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <span>{getActiveFilter()}</span>
          <ChevronDown size={16} className={`transform transition-transform ${showMobileDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* Mobile Dropdown Modal */}
        {showMobileDropdown && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              onClick={() => setShowMobileDropdown(false)}
            />
            
            {/* Modal */}
            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-50 w-[95vw] max-w-md max-h-[80vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-600">
                <h3 className="text-lg font-semibold text-white">Select Category</h3>
                <button
                  onClick={() => setShowMobileDropdown(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Filter Options */}
              <div className="p-6 space-y-4">
                {Object.entries(categories)
                  .filter(([key]) => key !== 'volatile' && key !== 'stable')
                  .map(([key, value]) => {
                    const tooltipContent = getTooltipContent(key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleMobileFilterSelect(key)}
                        className={`w-full text-center px-6 py-3 rounded-lg transition-colors border font-medium text-base ${
                          value
                            ? 'bg-solana-purple text-white border-solana-purple'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white border-gray-600'
                        }`}
                      >
                        {tooltipContent.title}
                      </button>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CategoryFilters;
