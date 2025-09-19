import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, BarChart3, DollarSign, TrendingUp, Zap } from 'lucide-react';
import technicalAnalysisService from '../services/technicalAnalysisService';

const Section = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        className="flex justify-between items-center w-full p-4 text-left text-white hover:bg-gray-800 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-lg">{title}</span>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {isOpen && <div className="px-4 pb-4 text-gray-300 text-sm">{children}</div>}
    </div>
  );
};

const TechnicalAnalysisPanel = ({ contractAddress, chartData, timeframe, isVisible }) => {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVisible && contractAddress) {
      const fetchAnalysis = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const result = await technicalAnalysisService.getTechnicalAnalysis(contractAddress, timeframe, chartData);
          setAnalysis(result);
        } catch (err) {
          setError(err.message || 'Failed to fetch technical analysis');
          console.error('Technical Analysis Panel Error:', err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAnalysis();
    } else {
      setAnalysis(null); // Clear analysis when not visible
    }
  }, [isVisible, contractAddress, timeframe, chartData]);

  if (!isVisible) return null;

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <BarChart3 className="animate-spin mx-auto mb-2" size={24} />
        Generating AI Technical Analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        <AlertTriangle className="mx-auto mb-2" size={24} />
        Error: {error}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-6 text-center text-gray-400">
        No AI Technical Analysis available yet.
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg mb-6">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-xl font-bold text-white flex items-center">
          <BarChart3 size={20} className="mr-2 text-purple-400" /> AI Technical Analysis
        </h3>
        <p className="text-gray-400 text-sm mt-1">Powered by GPT-5 for {timeframe} timeframe</p>
      </div>

            <Section title="Market Overview">
              <p className="mb-2">{analysis.marketOverview?.summary || analysis.summary || 'No summary available.'}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Trend: <span className="font-medium text-blue-400">{analysis.marketOverview?.trend || 'N/A'}</span></li>
                <li>Momentum: <span className="font-medium text-blue-400">{analysis.marketOverview?.momentum || 'N/A'}</span></li>
                <li>Volatility: <span className="font-medium text-blue-400">{analysis.marketOverview?.volatility || 'N/A'}</span></li>
                <li>Liquidity Health: <span className="font-medium text-blue-400">{analysis.marketOverview?.liquidityHealth || 'N/A'}</span></li>
                <li>Technical Score: <span className="font-medium text-purple-400">{analysis.marketOverview?.technicalScore || 'N/A'}/10</span></li>
              </ul>
            </Section>

      <Section title="Volume Analysis">
        <ul className="list-disc list-inside space-y-1">
          <li>Buy Pressure (24h): <span className="font-medium text-green-400">${analysis.volumeAnalysis?.buyPressure || 'N/A'}</span></li>
          <li>Sell Pressure (24h): <span className="font-medium text-red-400">${analysis.volumeAnalysis?.sellPressure || 'N/A'}</span></li>
          <li>Net Flow (24h): <span className="font-medium text-blue-400">{analysis.volumeAnalysis?.netFlow || 'N/A'}</span></li>
          <li>Active Buyers (24h): <span className="font-medium text-blue-400">{analysis.volumeAnalysis?.activeBuyers || 'N/A'}</span></li>
          <li>Active Sellers (24h): <span className="font-medium text-blue-400">{analysis.volumeAnalysis?.activeSellers || 'N/A'}</span></li>
        </ul>
      </Section>

            <Section title="Price Action & Patterns">
              <ul className="list-disc list-inside space-y-1">
                <li>Current Price: <span className="font-medium text-white">${analysis.priceAction?.currentPrice || 'N/A'}</span></li>
                <li>24h Price Change: <span className={`font-medium ${parseFloat(analysis.priceAction?.priceChange24h) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{analysis.priceAction?.priceChange24h || 'N/A'}%</span></li>
                <li>Chart Patterns: <span className="font-medium text-blue-400">{analysis.priceAction?.chartPatterns || 'N/A'}</span></li>
                <li>Candlestick Patterns: <span className="font-medium text-purple-400">{analysis.priceAction?.candlestickPatterns || 'N/A'}</span></li>
                <li>Support Levels: <span className="font-medium text-green-400">{analysis.priceAction?.supportLevels?.join(', ') || 'N/A'}</span></li>
                <li>Resistance Levels: <span className="font-medium text-red-400">{analysis.priceAction?.resistanceLevels?.join(', ') || 'N/A'}</span></li>
              </ul>
            </Section>

            <Section title="Technical Indicators">
              <ul className="list-disc list-inside space-y-1">
                <li>RSI Analysis: <span className="font-medium text-blue-400">{analysis.technicalIndicators?.rsi || 'N/A'}</span></li>
                <li>MACD Signals: <span className="font-medium text-blue-400">{analysis.technicalIndicators?.macd || 'N/A'}</span></li>
                <li>Moving Averages: <span className="font-medium text-blue-400">{analysis.technicalIndicators?.movingAverages || 'N/A'}</span></li>
                <li>Bollinger Bands: <span className="font-medium text-blue-400">{analysis.technicalIndicators?.bollingerBands || 'N/A'}</span></li>
                <li>Volume Indicators: <span className="font-medium text-blue-400">{analysis.technicalIndicators?.volumeIndicators || 'N/A'}</span></li>
              </ul>
            </Section>

      <Section title="Trading Strategy">
        <ul className="list-disc list-inside space-y-1">
          <li>Entry Strategy: <span className="font-medium text-blue-400">{analysis.tradingStrategy?.entryStrategy || 'N/A'}</span></li>
          <li>Exit Strategy: <span className="font-medium text-blue-400">{analysis.tradingStrategy?.exitStrategy || 'N/A'}</span></li>
          <li>Risk Management: <span className="font-medium text-blue-400">{analysis.tradingStrategy?.riskManagement || 'N/A'}</span></li>
          <li>Timeframe: <span className="font-medium text-blue-400">{analysis.tradingStrategy?.timeframe || 'N/A'}</span></li>
          <li>Confidence Level: <span className="font-medium text-purple-400">{analysis.tradingStrategy?.confidence || 'N/A'}/10</span></li>
        </ul>
      </Section>

      <Section title="Key Levels">
        <ul className="list-disc list-inside space-y-1">
          <li>Critical Support: <span className="font-medium text-green-400">${analysis.keyLevels?.criticalSupport || 'N/A'}</span></li>
          <li>Critical Resistance: <span className="font-medium text-red-400">${analysis.keyLevels?.criticalResistance || 'N/A'}</span></li>
          <li>Breakout Level: <span className="font-medium text-blue-400">${analysis.keyLevels?.breakoutLevel || 'N/A'}</span></li>
          <li>Breakdown Level: <span className="font-medium text-blue-400">${analysis.keyLevels?.breakdownLevel || 'N/A'}</span></li>
        </ul>
      </Section>

    </div>
  );
};

export default TechnicalAnalysisPanel;
