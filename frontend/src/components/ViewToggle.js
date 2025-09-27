import React, { useState } from 'react';
import { Grid3X3, List, BarChart3 } from 'lucide-react';

const ViewToggle = ({ currentView, onViewChange, tokenCount }) => {
  const [hoveredView, setHoveredView] = useState(null);
  const views = [
    {
      id: 'bubbles',
      name: 'Bubble Map',
      icon: Grid3X3,
      description: 'Interactive bubble visualization',
      disabled: false
    },
    {
      id: 'list',
      name: 'Ranked List',
      icon: List,
      description: 'Sorted by overall score',
      disabled: false
    }
  ];

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mobile-view-toggle">
      <span className="text-xs sm:text-sm text-gray-400">View:</span>
      <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-600">
        {views.map((view) => {
          const Icon = view.icon;
          const isActive = currentView === view.id;
          const isDisabled = view.disabled;
          
          return (
            <div key={view.id} className="relative">
              <button
                onClick={() => !isDisabled && onViewChange(view.id)}
                disabled={isDisabled}
                onMouseEnter={() => setHoveredView(view.id)}
                onMouseLeave={() => setHoveredView(null)}
                className={`
                  flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
                  ${isActive 
                    ? 'bg-solana-purple text-white shadow-lg' 
                    : isDisabled
                      ? 'text-gray-500 cursor-not-allowed'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }
                `}
              >
                <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{view.name}</span>
              </button>
              
              {/* Tooltip Modal (matching CategoryFilters design) */}
              {hoveredView === view.id && (
                <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50">
                  <div className="text-xs leading-tight">
                    <span className="font-semibold text-white">{view.name}:</span>
                    <span className="text-gray-300 ml-1">{view.description}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Token count indicator */}
      <div className="text-xs text-gray-500">
        {tokenCount} tokens
      </div>
    </div>
  );
};

export default ViewToggle;
