import React from 'react';
import { Grid3X3, List, BarChart3 } from 'lucide-react';

const ViewToggle = ({ currentView, onViewChange, tokenCount }) => {
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
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-400 mr-2">View:</span>
      <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-600">
        {views.map((view) => {
          const Icon = view.icon;
          const isActive = currentView === view.id;
          const isDisabled = view.disabled;
          
          return (
            <button
              key={view.id}
              onClick={() => !isDisabled && onViewChange(view.id)}
              disabled={isDisabled}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-solana-purple text-white shadow-lg' 
                  : isDisabled
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }
              `}
              title={view.description}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{view.name}</span>
            </button>
          );
        })}
      </div>
      
      {/* Token count indicator */}
      <div className="text-xs text-gray-500 ml-2">
        {tokenCount} tokens
      </div>
    </div>
  );
};

export default ViewToggle;
