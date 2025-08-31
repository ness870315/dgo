import React from 'react';

const TemperatureLegend = () => {

  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm text-gray-400 font-medium">Risk Level:</span>
      
      {/* Temperature Bar */}
      <div className="flex items-center space-x-1">
        {/* Temperature gradient bar */}
        <div 
          className="w-20 h-4 rounded-full border border-gray-600"
          style={{
            background: 'linear-gradient(to right, #22c55e 0%, #84cc16 20%, #eab308 40%, #f97316 60%, #ef4444 80%, #9333ea 100%)'
          }}
        />
        
        {/* Labels */}
        <div className="flex items-center space-x-2 ml-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-400">Strong</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-purple-600"></div>
            <span className="text-xs text-gray-400">Risky</span>
          </div>
        </div>
      </div>
      
      {/* Score Range Indicator */}
      <div className="text-xs text-gray-500 ml-2">
        0-10 Score
      </div>
    </div>
  );
};

export default TemperatureLegend;
