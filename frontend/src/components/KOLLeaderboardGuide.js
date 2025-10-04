import React, { useState } from 'react';
import { X, Trophy, Target, TrendingUp, AlertTriangle, Clock, Users, BarChart3, Zap, Crown, Award, Info, Shield } from 'lucide-react';

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
        <h2 className="text-2xl font-bold text-white mb-2">Enhanced KOL Trust System</h2>
        <p className="text-gray-300">Multi-dimensional scoring that identifies the most reliable and profitable KOLs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <Zap className="w-8 h-8 text-green-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Performance</h3>
          <p className="text-gray-300 text-sm">35% - Hit rate, profitability tiers, ATH tracking</p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <Shield className="w-8 h-8 text-blue-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Consistency</h3>
          <p className="text-gray-300 text-sm">25% - Reliability and consistent performance</p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <AlertTriangle className="w-8 h-8 text-orange-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Risk Management</h3>
          <p className="text-gray-300 text-sm">20% - Drawdown control, risk-adjusted returns</p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <Clock className="w-8 h-8 text-purple-500 mb-2" />
          <h3 className="text-lg font-semibold text-white mb-2">Market Timing</h3>
          <p className="text-gray-300 text-sm">20% - Entry timing, market cap optimization</p>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-blue-300 font-semibold mb-2">Trust Levels</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm text-gray-300">
              <div><span className="text-yellow-400">Elite KOL</span> (70+) - Top performers</div>
              <div><span className="text-purple-400">Expert KOL</span> (60-69) - Consistently excellent</div>
              <div><span className="text-blue-400">Trusted KOL</span> (50-59) - Reliable performers</div>
              <div><span className="text-green-400">Rising KOL</span> (40-49) - Promising newcomers</div>
              <div><span className="text-orange-400">Developing KOL</span> (20-39) - Learning phase</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderScoring = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Target className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Multi-Dimensional Scoring</h2>
        <p className="text-gray-300">Four pillars that determine your trust score and KOL level</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-500" />
            Performance (35% Weight)
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>PnL Hit Rate:</strong> % of calls that reach 1.5x+ (meaningful profits)</p>
            <p>• <strong>Profit Tiers:</strong> Excellent (3x+), Good (2x+), Profitable (1.5x+)</p>
            <p>• <strong>ATH Performance:</strong> Uses peak performance to reward best outcomes</p>
            <p>• <strong>Smart Drawdown:</strong> Only penalizes if losing money (<1x), light penalty if profitable but down from ATH</p>
            <p>• <strong>Crypto-Native:</strong> Understands tokens dump and resurge - rewards diamond hands</p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Consistency (25% Weight)
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Reliability Score:</strong> How consistent your performance is</p>
            <p>• <strong>Coefficient of Variation:</strong> Lower variation = higher consistency</p>
            <p>• <strong>Performance Stability:</strong> Rewards steady performers over volatile ones</p>
            <p>• <strong>Long-term Vision:</strong> Consistent strategy over time</p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Risk Management (20% Weight)
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Smart Drawdown Penalty:</strong> Heavy penalty if losing (<1x), light penalty if profitable but down from ATH (10% weight)</p>
            <p>• <strong>Risk-Adjusted Returns:</strong> Performance relative to risk taken</p>
            <p>• <strong>Volatility Management:</strong> Lower volatility = better risk score</p>
            <p>• <strong>Crypto Cycles:</strong> System understands natural dump/pump cycles - no penalty for historical volatility if call is still profitable</p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-500" />
            Market Timing (20% Weight)
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Entry Timing:</strong> Calling tokens at optimal market cap levels</p>
            <p>• <strong>Market Cap Optimization:</strong> Micro-cap bonus, large-cap penalty</p>
            <p>• <strong>Volume Timing:</strong> Bonus for good volume timing</p>
            <p>• <strong>Market Awareness:</strong> Understanding market cycles and trends</p>
          </div>
        </div>
      </div>

      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
        <h4 className="text-green-300 font-semibold mb-2">Trust Score Calculation</h4>
        <div className="text-sm text-gray-300 space-y-1">
          <p>• <strong>Final Score:</strong> (Performance × 0.35) + (Consistency × 0.25) + (Risk × 0.20) + (Timing × 0.20)</p>
          <p>• <strong>Bayesian Shrinkage:</strong> New users pulled toward global mean for fairness</p>
          <p>• <strong>No Time Decay:</strong> All calls maintain full weight forever</p>
          <p>• <strong>Minimum Calls:</strong> 1 call required for scoring (no minimum threshold)</p>
        </div>
      </div>
    </div>
  );

  const renderWinning = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Crown className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">How to Win</h2>
        <p className="text-gray-300">Strategies to climb the trust levels and become an Elite KOL</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-green-500" />
            Call Quality
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Meaningful Profits</h4>
              <p className="text-gray-300 text-sm">Only calls that reach 1.5x+ count as "hits" - focus on quality over quantity</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">ATH Performance</h4>
              <p className="text-gray-300 text-sm">System tracks peak performance but penalizes current drawdowns</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Profit Tiers</h4>
              <p className="text-gray-300 text-sm">Excellent (3x+), Good (2x+), Profitable (1.5x+) - aim for higher tiers</p>
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

      <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
        <h4 className="text-purple-300 font-semibold mb-2">Elite KOL Strategies</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
          <div>
            <p className="font-semibold text-purple-400 mb-1">Performance Focus (35% weight)</p>
            <p>Hit rate is king - focus on profitable calls (1x+)</p>
          </div>
          <div>
            <p className="font-semibold text-purple-400 mb-1">Consistency Matters (25% weight)</p>
            <p>Lower variation = higher consistency score</p>
          </div>
          <div>
            <p className="font-semibold text-purple-400 mb-1">Risk Management (20% weight)</p>
            <p>Control drawdowns, protect gains, manage volatility</p>
          </div>
          <div>
            <p className="font-semibold text-purple-400 mb-1">Market Timing (20% weight)</p>
            <p>Call micro-caps early, avoid large-cap entries</p>
          </div>
        </div>
      </div>

      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
        <h4 className="text-green-300 font-semibold mb-2">Trust Level Progression</h4>
        <div className="text-sm text-gray-300 space-y-2">
          <p>• <strong>Developing KOL (40+):</strong> Start with 1+ profitable call</p>
          <p>• <strong>Rising KOL (50+):</strong> Consistent profitable performance</p>
          <p>• <strong>Trusted KOL (60+):</strong> Reliable with good risk management</p>
          <p>• <strong>Expert KOL (70+):</strong> Consistently excellent performance</p>
          <p>• <strong>Elite KOL (80+):</strong> Top 1% - exceptional across all metrics</p>
        </div>
      </div>
    </div>
  );

  const renderPenalties = () => (
    <div className="space-y-6">
      <div className="text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Penalties & Risks</h2>
        <p className="text-gray-300">What can hurt your trust score and how to avoid it</p>
      </div>

      <div className="space-y-4">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-3">Smart Drawdown Penalties (Crypto-Native)</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <strong>Losing Calls (<1x):</strong> Heavy penalty - up to 50% based on how far underwater</p>
            <p>• <strong>Profitable but Down from ATH:</strong> Light penalty - only 10% of the ATH drawdown matters</p>
            <p>• <strong>At New ATH:</strong> Zero penalty - call is crushing it!</p>
            <p>• <strong>Example:</strong> 10x ATH → 5x now = only 5% penalty (not 50%)</p>
            <p>• <strong>Philosophy:</strong> Tokens dump and resurge naturally - rewards diamond hands through volatility</p>
            <p>• <strong>Volatility Penalty:</strong> High volatility reduces risk management score</p>
            <p>• <strong>Risk-Adjusted Returns:</strong> Performance relative to risk taken matters</p>
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
        <p className="text-gray-300">Advanced strategies to maximize your trust score</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-green-500" />
            Performance Strategy
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Hit Rate Focus</h4>
              <p className="text-gray-300 text-sm">35% of your score - prioritize profitable calls (1x+)</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">ATH Tracking</h4>
              <p className="text-gray-300 text-sm">System uses both current AND peak performance</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-green-400 font-semibold mb-1">Profitability Tiers</h4>
              <p className="text-gray-300 text-sm">Excellent (2x+), Good (1.5x+), Profitable (1x+)</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500" />
            Consistency & Risk
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Consistency Matters</h4>
              <p className="text-gray-300 text-sm">25% of score - lower variation = higher consistency</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Risk Management</h4>
              <p className="text-gray-300 text-sm">20% of score - control drawdowns, protect gains</p>
            </div>
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-1">Market Timing</h4>
              <p className="text-gray-300 text-sm">20% of score - call micro-caps early</p>
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
