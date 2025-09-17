import React, { useState } from 'react';
import TradingViewChart from './TradingViewChart';
import TradingViewStyleChart from './TradingViewStyleChart';
import TradingViewWidget from './TradingViewWidget';

const ChartComparison = ({ token }) => {
  const [activeChart, setActiveChart] = useState('custom'); // 'custom', 'tradingview-style', or 'tradingview-widget'

  return (
    <div className="w-full h-full bg-gray-900">
      {/* Chart selector */}
      <div className="flex items-center justify-center p-4 border-b border-gray-700">
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveChart('custom')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeChart === 'custom'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Custom Chart (Current)
          </button>
          <button
            onClick={() => setActiveChart('tradingview-style')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeChart === 'tradingview-style'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            TradingView Style
          </button>
          <button
            onClick={() => setActiveChart('tradingview-widget')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeChart === 'tradingview-widget'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            TradingView Widget
          </button>
        </div>
      </div>

      {/* Chart display */}
      <div className="h-full">
        {activeChart === 'custom' ? (
          <TradingViewChart 
            token={token} 
            timeframe="1D" 
            displayMode="price"
          />
        ) : activeChart === 'tradingview-style' ? (
          <TradingViewStyleChart 
            token={token}
          />
        ) : (
          <TradingViewWidget 
            token={token}
          />
        )}
      </div>
    </div>
  );
};

export default ChartComparison;
