import React from 'react';
import { X, Brain, AlertTriangle, Lightbulb, Rocket, Flag, Target } from 'lucide-react';

const AIAnalysisModalNew = ({ token, aiAnalysis, onClose }) => {
  
  if (!aiAnalysis || !aiAnalysis.sentiment) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center">
              <Brain size={20} className="mr-2 text-purple-400" />
              DeGen Oracle AI Analysis
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="text-center text-gray-400">
            No analysis data available
          </div>
        </div>
      </div>
    );
  }

  const analysis = aiAnalysis;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              <Brain size={20} className="mr-2 text-purple-400" />
              DeGen Oracle AI Analysis
            </h2>
            <div className="flex items-center mt-2">
              <span className="text-white font-medium">{token.name} ({token.symbol})</span>
              {token.image && (
                <img src={token.image} alt={token.symbol} className="w-6 h-6 ml-2 rounded-full" />
              )}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Price: ${token.price || 'N/A'} | MCap: ${token.marketCap || 'N/A'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column */}
          <div className="space-y-6">
            
            {/* AI Assessment */}
            <div className="bg-gray-800/50 rounded-lg p-4 ai-analysis">
              <h3 className="text-white font-semibold mb-3 flex items-center">
                <Brain size={18} className="mr-2 text-purple-400" />
                AI Assessment
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Sentiment:</span>
                  <span className={`font-semibold px-2 py-1 rounded text-sm ${
                    analysis.sentiment === 'Bullish' ? 'bg-green-900 text-green-300' :
                    analysis.sentiment === 'Bearish' ? 'bg-red-900 text-red-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {analysis.sentiment || 'Neutral'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Confidence:</span>
                  <span className="text-white text-sm">
                    {Math.round((analysis.confidence || 0) * 100)}%
                  </span>
                </div>
                <div className="text-gray-300 text-sm text-content">
                  {analysis.aiAssessment || 'Analysis complete'}
                </div>
              </div>
            </div>

            {/* Key Insights */}
            <div className="bg-gray-800/50 rounded-lg p-4 ai-analysis">
              <h3 className="text-white font-semibold mb-3 flex items-center">
                <Lightbulb size={18} className="mr-2 text-yellow-400" />
                Key Insights
              </h3>
              <div className="space-y-2">
                {analysis.keyInsights?.map((insight, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <span className="text-gray-300 text-sm text-content">{insight}</span>
                  </div>
                )) || (
                  <div className="text-gray-400 text-sm">No insights available</div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-800/50 rounded-lg p-4 ai-analysis">
              <h3 className="text-white font-semibold mb-3 flex items-center">
                <Target size={18} className="mr-2 text-blue-400" />
                Summary
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Action:</span>
                  <span className="font-semibold px-2 py-1 rounded text-sm bg-yellow-900 text-yellow-300">
                    Hold
                  </span>
                </div>
                <div className="text-gray-300 text-sm text-content">
                  {analysis.recommendation || 'No reasoning provided'}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Strategy:</span>
                  <span className={`font-semibold px-2 py-1 rounded text-sm ${
                    analysis.sentiment === 'Bullish' ? 'bg-green-900 text-green-300' :
                    analysis.sentiment === 'Bearish' ? 'bg-red-900 text-red-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {(() => {
                      const confidence = analysis.confidence || 0;
                      const sentiment = analysis.sentiment || 'Neutral';
                      
                      if (sentiment === 'Bullish' && confidence > 0.8) return '🚀 Conviction Play';
                      if (sentiment === 'Bullish' && confidence > 0.6) return '📈 Long-term Hold';
                      if (sentiment === 'Bearish' && confidence > 0.7) return '⚡ Pump & Dump';
                      if (sentiment === 'Bearish') return '📉 Short-term Risk';
                      if (confidence > 0.7) return '⏳ Mid-term Hold';
                      return '👀 Watch & Wait';
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Confidence:</span>
                  <span className="text-yellow-400 text-sm">
                    {Math.round((analysis.confidence || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            
            {/* Risk Assessment */}
            <div className="bg-gray-800/50 rounded-lg p-4 ai-analysis">
              <h3 className="text-white font-semibold mb-3 flex items-center">
                <AlertTriangle size={18} className="mr-2 text-yellow-400" />
                Risk Assessment
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Risk Level:</span>
                  <span className="font-semibold px-2 py-1 rounded text-sm bg-yellow-900 text-yellow-300">
                    Medium
                  </span>
                </div>
                
                <div className="text-gray-300 text-sm text-content">
                  {analysis.riskAssessment || 'Risk assessment not available'}
                </div>
              </div>
            </div>

            {/* Catalysts & Red Flags */}
            <div className="bg-gray-800/50 rounded-lg p-4 ai-analysis">
              <h3 className="text-white font-semibold mb-3 flex items-center">
                <Rocket size={18} className="mr-2 text-green-400" />
                <Flag size={18} className="mr-2 text-red-400" />
                Catalysts & Red Flags
              </h3>
              <div className="space-y-3">
                {analysis.catalysts && analysis.catalysts.length > 0 && (
                  <div>
                    <span className="text-green-400 text-sm font-medium">Catalysts:</span>
                    <div className="mt-1 space-y-1">
                      {analysis.catalysts.map((catalyst, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <span className="text-green-400 mt-1">•</span>
                          <span className="text-gray-300 text-sm text-content">{catalyst}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {analysis.redFlags && analysis.redFlags.length > 0 && (
                  <div>
                    <span className="text-red-400 text-sm font-medium">Red Flags:</span>
                    <div className="mt-1 space-y-1">
                      {analysis.redFlags.map((flag, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <span className="text-red-400 mt-1">•</span>
                          <span className="text-gray-300 text-sm text-content">{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recommended Actions */}
        {(analysis.recommendedActions && analysis.recommendedActions.length > 0) || aiAnalysis.actionableRecommendations?.length > 0 ? (
          <div className="mt-6 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg p-4 border border-purple-500/30">
            <h3 className="text-white font-semibold mb-3 flex items-center">
              <Target size={18} className="mr-2 text-purple-400" />
              Recommended Actions
            </h3>
            <div className="space-y-2">
              {(analysis.recommendedActions || aiAnalysis.actionableRecommendations || []).map((action, index) => (
                <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${
                  action.priority === 'high' ? 'border-red-500/30 bg-red-900/10' :
                  action.priority === 'medium' ? 'border-yellow-500/30 bg-yellow-900/10' :
                  'border-gray-500/30 bg-gray-900/10'
                }`}>
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{action.icon}</span>
                    <div>
                      <div className="text-white font-medium capitalize">
                        {action.action.replace(/_/g, ' ')}
                      </div>
                      <div className="text-gray-400 text-sm">{action.reason}</div>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    action.priority === 'high' ? 'bg-red-900 text-red-300' :
                    action.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                    'bg-gray-900 text-gray-300'
                  }`}>
                    {action.priority}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg p-4 border border-purple-500/30">
            <h3 className="text-white font-semibold mb-3 flex items-center">
              <Target size={18} className="mr-2 text-purple-400" />
              Recommended Actions
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-500/30 bg-gray-900/10">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <div className="text-white font-medium">Oracle Chart</div>
                    <div className="text-gray-400 text-sm">Get deeper technical analysis</div>
                  </div>
                </div>
                <div className="px-2 py-1 rounded text-xs font-medium bg-gray-900 text-gray-300">
                  high
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Training Loop - User Feedback */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <h4 className="text-white font-semibold mb-3 text-sm">🧠 Help Train Our AI</h4>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Was this analysis helpful?</span>
            <div className="flex space-x-2">
              <button className="px-3 py-1 bg-green-900/50 hover:bg-green-900 text-green-300 rounded text-sm transition-colors">
                👍 Yes
              </button>
              <button className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-300 rounded text-sm transition-colors">
                👎 No
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AIAnalysisModalNew;
