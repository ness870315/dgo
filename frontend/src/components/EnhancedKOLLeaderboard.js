import React, { useState, useEffect } from 'react';
import { Award, Crown, Star, TrendingUp, Shield, Clock, Target, BarChart3, Users, Trophy, Medal, Zap, ArrowUp, ArrowDown, ArrowLeft, Info } from 'lucide-react';
import leaderboardService from '../services/leaderboardService';
import './EnhancedKOLLeaderboard.css';

const EnhancedKOLLeaderboard = ({ onClose, onUserClick }) => {
  const [activeTab, setActiveTab] = useState('main');
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLeaderboardData();
  }, []);

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      const data = await leaderboardService.getLeaderboard();
      setLeaderboardData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTrustLevelIcon = (trustLevel) => {
    switch (trustLevel) {
      case 'Elite KOL': return <Crown className="w-5 h-5 text-yellow-400" />;
      case 'Expert KOL': return <Star className="w-5 h-5 text-purple-400" />;
      case 'Trusted KOL': return <Award className="w-5 h-5 text-blue-400" />;
      case 'Rising KOL': return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'Developing KOL': return <Target className="w-5 h-5 text-orange-400" />;
      default: return <Users className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTrustLevelColor = (trustLevel) => {
    switch (trustLevel) {
      case 'Elite KOL': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
      case 'Expert KOL': return 'text-purple-400 bg-purple-900/20 border-purple-500/30';
      case 'Trusted KOL': return 'text-blue-400 bg-blue-900/20 border-blue-500/30';
      case 'Rising KOL': return 'text-green-400 bg-green-900/20 border-green-500/30';
      case 'Developing KOL': return 'text-orange-400 bg-orange-900/20 border-orange-500/30';
      default: return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
    }
  };

  const getTabIcon = (tabName) => {
    switch (tabName) {
      case 'main': return <BarChart3 className="w-4 h-4" />;
      case 'elite': return <Crown className="w-4 h-4" />;
      case 'expert': return <Star className="w-4 h-4" />;
      case 'trusted': return <Award className="w-4 h-4" />;
      case 'rising': return <TrendingUp className="w-4 h-4" />;
      case 'developing': return <Target className="w-4 h-4" />;
      case 'performance': return <Zap className="w-4 h-4" />;
      case 'consistency': return <Shield className="w-4 h-4" />;
      case 'riskManagement': return <Shield className="w-4 h-4" />;
      case 'marketTiming': return <Clock className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  const getTabLabel = (tabName) => {
    switch (tabName) {
      case 'main': return 'Overall';
      case 'elite': return 'Elite KOLs';
      case 'expert': return 'Expert KOLs';
      case 'trusted': return 'Trusted KOLs';
      case 'rising': return 'Rising KOLs';
      case 'developing': return 'Developing KOLs';
      case 'performance': return 'Performance';
      case 'consistency': return 'Consistency';
      case 'riskManagement': return 'Risk Management';
      case 'marketTiming': return 'Market Timing';
      default: return tabName;
    }
  };

  const renderUserCard = (user, index) => {
    const trustLevel = user.summary?.trustLevel || 'Unknown';
    const trustScore = user.trustScore || 0;
    
    return (
      <button
        key={user.userId}
        onClick={() => onUserClick && onUserClick(user)}
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 sm:p-4 hover:bg-gray-800/70 transition-colors text-left"
        title="View profile"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Rank */}
            <div className="flex-shrink-0">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold text-white">
                {user[`${activeTab}Rank`] || user.rank || index + 1}
              </div>
            </div>

            {/* Profile */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-600 rounded-full flex items-center justify-center">
                {user.profileImage ? (
                  <img src={user.profileImage} alt={user.displayName} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full" />
                ) : (
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                )}
              </div>
              
              <div>
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <h3 className="text-white font-semibold text-sm sm:text-base">{user.displayName}</h3>
                  {getTrustLevelIcon(trustLevel)}
                  {user.verified && <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                  </div>}
                </div>
                <p className="text-gray-400 text-xs sm:text-sm">@{user.username}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="text-right">
            <div className="flex items-center justify-end space-x-2 sm:space-x-4 text-xs sm:text-sm">
              <div className="text-center">
                <div className="text-green-400 font-semibold text-sm sm:text-lg">{trustScore.toFixed(0)}</div>
                <div className="text-gray-400 text-xs">Score</div>
              </div>
              
              <div className="text-center">
                <div className="text-blue-400 font-semibold text-sm sm:text-base">{((user.performance?.hitRate || 0)).toFixed(1)}%</div>
                <div className="text-gray-400 text-xs">Hit</div>
              </div>
              
              <div className="text-center">
                <div className="text-purple-400 font-semibold text-sm sm:text-base">{(user.performance?.avgCurrentMultiple || 0).toFixed(1)}x</div>
                <div className="text-gray-400 text-xs">Avg</div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Level Badge */}
        <div className="mt-2 sm:mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium border ${getTrustLevelColor(trustLevel)}`}>
            {trustLevel}
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4 text-xs text-gray-400">
            <span>{user.performance?.totalCalls || 0} calls</span>
            <span className="hidden sm:inline">Consistency: {(user.consistency?.score || 0).toFixed(0)}</span>
            <span className="hidden sm:inline">Risk: {(user.riskManagement?.score || 0).toFixed(0)}</span>
            <span className="sm:hidden">C: {(user.consistency?.score || 0).toFixed(0)} R: {(user.riskManagement?.score || 0).toFixed(0)}</span>
          </div>
        </div>
      </button>
    );
  };

  const renderTabContent = () => {
    if (!leaderboardData) return null;

    const currentBoard = leaderboardData.boards?.[activeTab] || leaderboardData.leaderboard || [];
    
    if (currentBoard.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            {getTabIcon(activeTab)}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No {getTabLabel(activeTab)} Found</h3>
          <p className="text-gray-400">No users meet the criteria for this board yet.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-4">
        {currentBoard.map((user, index) => renderUserCard(user, index))}
      </div>
    );
  };

  const renderBoardStats = () => {
    if (!leaderboardData?.boardStats) return null;

    const stats = leaderboardData.boardStats;
    
    return (
      <div className="px-3 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-yellow-400 font-semibold text-sm sm:text-lg">{stats.eliteCount}</div>
            <div className="text-gray-400 text-xs">Elite KOLs</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-purple-400 font-semibold text-sm sm:text-lg">{stats.expertCount}</div>
            <div className="text-gray-400 text-xs">Expert KOLs</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-blue-400 font-semibold text-sm sm:text-lg">{stats.trustedCount}</div>
            <div className="text-gray-400 text-xs">Trusted KOLs</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-green-400 font-semibold text-sm sm:text-lg">{stats.risingCount}</div>
            <div className="text-gray-400 text-xs">Rising KOLs</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-orange-400 font-semibold text-sm sm:text-lg">{stats.developingCount}</div>
            <div className="text-gray-400 text-xs">Developing KOLs</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white">Loading KOL Leaderboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Error Loading Leaderboard</h3>
            <p className="text-gray-400 mb-4">{error}</p>
            <button
              onClick={fetchLeaderboardData}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-xs sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400" />
              <div>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">KOL Trust Leaderboard</h2>
                <p className="text-gray-400 text-xs sm:text-sm hidden sm:block">Multi-dimensional KOL performance rankings</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Board Stats */}
        {renderBoardStats()}

        {/* Tabs */}
        <div className="px-3 sm:px-6">
          <div className="flex flex-wrap gap-1 sm:gap-2 mb-4 sm:mb-6">
            {['main', 'elite', 'expert', 'trusted', 'rising', 'developing', 'performance', 'consistency', 'riskManagement', 'marketTiming'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {getTabIcon(tab)}
                <span className="hidden sm:inline">{getTabLabel(tab)}</span>
                <span className="sm:hidden">{getTabLabel(tab).split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-3 sm:px-6 pb-3 sm:pb-6 overflow-y-auto flex-1 enhanced-leaderboard-scroll enhanced-leaderboard-content">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default EnhancedKOLLeaderboard;
