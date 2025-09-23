import React, { useState } from 'react';
import { X, Trophy, Target, TrendingUp, AlertTriangle, Clock, Users, BarChart3, Zap, Crown, Award, Info } from 'lucide-react';

const KOLLeaderboardGuide = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: Trophy },
    { id: 'scoring', title: 'How Scoring Works', icon: Target },
    { id: 'winning', title: 'How to Win', icon: Crown },
    { id: 'penalties', title: 'Penalties & Risks', icon: AlertTriangle },
    { id: 'tips', title: 'Pro Tips', icon: Zap }
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">KOL Leaderboard System</h2>
        <p className="text-gray-300">Compete with other crypto influencers and prove your alpha-calling skills!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <Users className="w-8 h-8 text-blue-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Premium Only</h3>
          <p className="text-gray-300 text-sm">Leaderboard access requires Premium subscription</p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <BarChart3 className="w-8 h-8 text-green-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Real-Time Rankings</h3>
          <p className="text-gray-300 text-sm">Scores update automatically as market data changes</p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <Award className="w-8 h-8 text-purple-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Monthly Winners</h3>
          <p className="text-gray-300 text-sm">Top performers get recognition and rewards</p>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-blue-300 font-semibold mb-2">What Makes a Good KOL?</h4>
            <p className="text-gray-300 text-sm">
              Key Opinion Leaders (KOLs) are crypto influencers who consistently make profitable calls. 
              The leaderboard ranks users based on their call performance, risk management, and consistency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderScoring = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Target className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">How Scoring Works</h2>
        <p className="text-gray-300">Advanced algorithm that rewards consistent, profitable calls</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Efficiency Score (Primary Metric)
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Weighted Average Return:</strong> Recent calls weighted more heavily</p>
            <p>• <strong>Recency Weighting:</strong> 30-day half-life (calls lose weight over time)</p>
            <p>• <strong>Log Returns:</strong> Uses logarithmic scaling for better distribution</p>
            <p>• <strong>Formula:</strong> Σ(call_score × time_weight) / Σ(time_weight)</p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Call Score Calculation
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>X Multiple:</strong> Current MC ÷ Called MC (e.g., 2.5x = 150% gain)</p>
            <p>• <strong>Log Score:</strong> ln(X Multiple) for better distribution</p>
            <p>• <strong>Liquidity Bonus:</strong> Higher liquidity = better score</p>
            <p>• <strong>Drawdown Penalty:</strong> Max drawdown > 30% = penalty applied</p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            Hit Rate Metrics
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Hit Rate:</strong> % of calls that reach 1x or better (profitable calls)</p>
            <p>• <strong>Wilson Score:</strong> Confidence interval for hit rate reliability</p>
            <p>• <strong>Median X Multiple:</strong> Middle value of all your X multiples</p>
            <p>• <strong>Total Calls:</strong> Total number of KOL calls made</p>
          </div>
        </div>
      </div>

      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
        <h4 className="text-green-300 font-semibold mb-2">Example Calculation</h4>
        <div className="text-sm text-gray-300 space-y-1">
          <p>• Call 1: 3.0x return → Profitable (1x+) → Hit ✓</p>
          <p>• Call 2: 1.5x return → Profitable (1x+) → Hit ✓</p>
          <p>• Call 3: 0.8x return → Not profitable (&lt;1x) → Miss ✗</p>
          <p>• Call 4: 2.2x return → Profitable (1x+) → Hit ✓</p>
          <p>• Call 5: 0.5x return → Not profitable (&lt;1x) → Miss ✗</p>
          <p className="font-semibold text-green-400">• Hit Rate: 3 hits ÷ 5 total calls = 60%</p>
          <p className="font-semibold text-blue-400">• Median X: [0.5x, 0.8x, 1.5x, 2.2x, 3.0x] = 1.5x</p>
        </div>
      </div>
    </div>
  );

  const renderWinning = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Crown className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">How to Win</h2>
        <p className="text-gray-300">Strategies to climb the leaderboard and stay on top</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-green-500" />
            Call Quality
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">High Conviction Calls</h4>
              <p className="text-gray-300 text-sm">Focus on tokens with strong fundamentals, not just hype</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Timing Matters</h4>
              <p className="text-gray-300 text-sm">Call tokens before major moves, not after they've already pumped</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Volume Focus</h4>
              <p className="text-gray-300 text-sm">High volume tokens (1h & 24h) get major scoring bonuses</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-500" />
            Consistency
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Long-Term Vision</h4>
              <p className="text-gray-300 text-sm">Focus on discovering cult tokens and 1000x gems that take time to develop</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Hit Rate Focus</h4>
              <p className="text-gray-300 text-sm">Aim for 50%+ hit rate (calls reaching 1x or better)</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Risk Management</h4>
              <p className="text-gray-300 text-sm">Avoid calls that might cause major drawdowns</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
        <h4 className="text-yellow-300 font-semibold mb-2">Pro Strategies</h4>
        <div className="space-y-2 text-sm text-gray-300">
          <p>• <strong>Volume is King:</strong> Focus on tokens with high 1h and 24h volume (55% of score)</p>
          <p>• <strong>Community Health:</strong> Target tokens with strong social engagement (15% of score)</p>
          <p>• <strong>Market Tier:</strong> Higher market cap tokens get scoring bonuses (10% of score)</p>
          <p>• <strong>No Time Decay:</strong> All calls maintain full weight forever - perfect for cult discovery</p>
          <p>• <strong>Diamond Hands:</strong> Long-term calls are rewarded equally to short-term ones</p>
        </div>
      </div>
    </div>
  );

  const renderPenalties = () => (
    <div className="space-y-6">
      <div className="text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Penalties & Risks</h2>
        <p className="text-gray-300">What can hurt your score and how to avoid it</p>
      </div>

      <div className="space-y-4">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-3">Drawdown Penalties</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>30%+ Drawdown:</strong> Penalty applied to call score</p>
            <p>• <strong>Rolling Peak:</strong> Drawdown calculated from highest point since call</p>
            <p>• <strong>Max Drawdown:</strong> Worst drawdown ever recorded for that call</p>
            <p>• <strong>Impact:</strong> Can turn profitable calls into negative scores</p>
          </div>
        </div>

        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-green-400 mb-3">No Time Decay</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Equal Weight:</strong> All calls maintain full scoring weight forever</p>
            <p>• <strong>Cult Discovery:</strong> Perfect for finding tokens that take months/years to develop</p>
            <p>• <strong>1000x Gems:</strong> Long-term diamond hands calls are fully rewarded</p>
            <p>• <strong>Fair Competition:</strong> No advantage for making frequent vs thoughtful calls</p>
            <p>• <strong>True Alpha:</strong> Rewards the ability to spot future winners early</p>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">Low Volume Penalty</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Volume Impact:</strong> Low volume tokens get significantly lower scores</p>
            <p>• <strong>Below Threshold:</strong> Lower liquidity = lower call score</p>
            <p>• <strong>Impact:</strong> Illiquid tokens get penalized in scoring</p>
            <p>• <strong>Solution:</strong> Focus on tokens with decent liquidity</p>
          </div>
        </div>

        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-purple-400 mb-3">Anti-Gaming Measures</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>One Call Per Token:</strong> Each token can only be called once per user</p>
            <p>• <strong>Minimum Call Age:</strong> 1 hour minimum before scoring begins</p>
            <p>• <strong>Bayesian Shrinkage:</strong> Low sample sizes get pulled toward global mean</p>
            <p>• <strong>Wilson Score:</strong> Confidence intervals prevent low-sample gaming</p>
            <p>• <strong>Impact:</strong> Prevents manipulation and ensures fair competition</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTips = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Zap className="w-16 h-16 text-purple-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Pro Tips</h2>
        <p className="text-gray-300">Advanced strategies from top performers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-green-500" />
            Call Strategy
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Use AI Analysis</h4>
              <p className="text-gray-300 text-sm">Our AI provides detailed analysis with risk factors and catalysts</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Community Health</h4>
              <p className="text-gray-300 text-sm">Focus on tokens with high community health scores (6+ out of 10)</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Volume Patterns</h4>
              <p className="text-gray-300 text-sm">Look for increasing volume and organic trading activity</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-500" />
            Risk Management
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Diversify Calls</h4>
              <p className="text-gray-300 text-sm">Don't put all calls in one sector or timeframe</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Monitor Drawdowns</h4>
              <p className="text-gray-300 text-sm">Watch for tokens approaching 30% drawdown threshold</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Liquidity Check</h4>
              <p className="text-gray-300 text-sm">Ensure tokens have sufficient liquidity for your call size</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-4">
        <h4 className="text-purple-300 font-semibold mb-3">Advanced Techniques</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
          <div>
            <h5 className="text-purple-400 font-semibold mb-2">Timing Strategies</h5>
            <ul className="space-y-1">
              <li>• Call before major catalysts</li>
              <li>• Use market sentiment indicators</li>
              <li>• Watch for volume breakouts</li>
              <li>• Monitor social media buzz</li>
            </ul>
          </div>
          <div>
            <h5 className="text-blue-400 font-semibold mb-2">Score Optimization</h5>
            <ul className="space-y-1">
              <li>• Maintain 50%+ hit rate</li>
              <li>• Keep calls recent (within 30 days)</li>
              <li>• Focus on 2x+ multiples</li>
              <li>• Avoid major drawdowns</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
        <h4 className="text-green-300 font-semibold mb-2">Remember</h4>
        <p className="text-gray-300 text-sm">
          The leaderboard rewards <strong>consistent, profitable calls</strong> over time. 
          It's not about getting lucky once, but about building a track record of alpha generation. 
          Focus on quality, manage risk, and stay active!
        </p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'overview': return renderOverview();
      case 'scoring': return renderScoring();
      case 'winning': return renderWinning();
      case 'penalties': return renderPenalties();
      case 'tips': return renderTips();
      default: return renderOverview();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white">KOL Leaderboard Guide</h1>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap gap-2 p-4 border-b border-gray-700 bg-gray-800/50">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.title}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default KOLLeaderboardGuide;
