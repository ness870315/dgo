import React, { useState, useRef } from 'react';

const TemperatureLegend = () => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef();

  return (
    <div className="flex items-center space-x-3 mobile-temperature-legend">
      <span className="text-sm text-gray-400 font-medium">Hype Level:</span>

      {/* Temperature Bar */}
      <div className="flex items-center space-x-1 relative">
        {/* Temperature gradient bar */}
        <div
          className="w-20 h-4 rounded-full border border-gray-600 cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          style={{
            background: 'linear-gradient(to right, #22c55e 0%, #84cc16 20%, #eab308 40%, #f97316 60%, #ef4444 80%, #9333ea 100%)'
          }}
        />

        {/* Tooltip Modal (matching BubbleMap design) */}
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1"
          >
            <div className="text-xs">
              <div className="font-semibold text-white mb-1">🚀 HYPE LEVELS</div>
              <div className="space-y-0.5">
                <div><span className="text-purple-400">9.0-10:</span> <span className="text-white">VIRAL</span> 🚀</div>
                <div><span className="text-red-400">8.0-8.9:</span> <span className="text-white">TRENDING</span> 🔥</div>
                <div><span className="text-orange-400">7.0-7.9:</span> <span className="text-white">WAKING UP</span> ⚡</div>
                <div><span className="text-blue-400">5.0-6.9:</span> <span className="text-white">BUILDING</span> 📈</div>
                <div><span className="text-gray-400">&lt;5.0:</span> <span className="text-white">SLEEPING</span> 😴</div>
              </div>
            </div>
          </div>
        )}
        
      </div>
      
      {/* Score Range Indicator */}
      <div className="text-xs text-gray-500 ml-2">
        0-10 Score
      </div>
    </div>
  );
};

export default TemperatureLegend;
