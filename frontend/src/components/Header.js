import React, { useState } from 'react';
import { Search, Filter, TrendingUp, RefreshCw, Settings, Star, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import dgoLogo from '../assets/dgo.png';

const Header = ({ onSearch, onFilter, onRefresh, isLoading, onSettingsClick, authButton, onWatchlistClick, onApifyTestClick, onAIChatClick, user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [filters, setFilters] = useState({
    minScore: 0,
    maxScore: 10,
    hasOfficialProfile: null,
    minMentions: 0,
    sortBy: 'score'
  });

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearch(value);
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilter(newFilters);
  };

  const resetFilters = () => {
    const defaultFilters = {
      minScore: 0,
      maxScore: 10,
      hasOfficialProfile: null,
      minMentions: 0,
      sortBy: 'score'
    };
    setFilters(defaultFilters);
    onFilter(defaultFilters);
  };

  return (
    <header className="bg-dark-card border-b border-solana-purple">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-2 lg:py-0 lg:h-16 space-y-2 lg:space-y-0 mobile-header-container">
          {/* Logo and Title */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-2">
              {/* DeGen Oracle Logo */}
              <img
                src={dgoLogo}
                alt="DeGen Oracle Logo"
                className="w-6 h-6 sm:w-8 sm:h-8"
                onError={(e) => {
                  console.error('Logo failed to load:', e);
                  e.target.style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mobile-compact-title">
                  <span className="text-solana-purple">DeGen</span> Oracle
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 -mt-1 hidden sm:block mobile-compact-subtitle">
                  Spot the Next Cult Before it Goes Viral
                </p>
              </div>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 lg:space-x-4">
            {/* Search Bar */}
            <div className="relative flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="block w-full sm:w-64 lg:w-80 pl-8 sm:pl-10 pr-3 py-2 text-sm border border-gray-600 rounded-md leading-5 bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
              />
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-center space-x-2">
              {/* Refresh Button */}
              <div className="relative">
                <button
                  onClick={onRefresh}
                  disabled={isLoading}
                  className={`px-2 py-1 rounded-md border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-xs ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  onMouseEnter={() => setHoveredTooltip('refresh')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  style={{ fontSize: '11px', minHeight: '24px' }}
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
                
                {/* Tooltip */}
                {hoveredTooltip === 'refresh' && (
                  <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50">
                    <div className="text-xs leading-tight">
                      <span className="font-semibold text-white">🔄 Refresh:</span>
                      <span className="text-gray-300 ml-1">Update token data and rankings</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Watchlist Button */}
              <div className="relative">
                <button
                  onClick={onWatchlistClick}
                  className="px-2 py-1 rounded-md border border-gray-600 text-gray-400 hover:text-yellow-400 hover:border-yellow-500 transition-colors text-xs"
                  onMouseEnter={() => setHoveredTooltip('watchlist')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  style={{ fontSize: '11px', minHeight: '24px' }}
                >
                  <Star size={12} />
                </button>
                
                {/* Tooltip */}
                {hoveredTooltip === 'watchlist' && (
                  <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50">
                    <div className="text-xs leading-tight">
                      <span className="font-semibold text-white">⭐ Watchlist:</span>
                      <span className="text-gray-300 ml-1">View your saved tokens</span>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Chat Button */}
              <div className="relative">
                <button
                  onClick={user?.isPremium ? onAIChatClick : undefined}
                  disabled={!user?.isPremium}
                  className={`px-2 py-1 rounded-md border text-xs transition-colors ${
                    user?.isPremium 
                      ? 'border-gray-600 text-gray-400 hover:text-purple-400 hover:border-purple-500 cursor-pointer' 
                      : 'border-gray-700 text-gray-600 cursor-not-allowed opacity-60'
                  }`}
                  onMouseEnter={() => setHoveredTooltip('aichat')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  style={{ fontSize: '11px', minHeight: '24px' }}
                >
                  <Bot size={12} />
                </button>
                
                {/* Tooltip */}
                {hoveredTooltip === 'aichat' && (
                  <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50">
                    <div className="text-xs leading-tight">
                      <span className="font-semibold text-white">🤖 AI Assistant:</span>
                      <span className="text-gray-300 ml-1">{user?.isPremium ? "Chat with AI assistant" : "Premium feature - upgrade to access"}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Links */}
              <div className="flex items-center space-x-4">
                {/* Temporarily hidden until Moralis API integration is fully tested */}
                {/* <Link
                  to="/staking"
                  className="px-3 py-2 text-sm font-medium text-solana-purple hover:text-solana-purple/80 transition-colors border border-solana-purple/30 rounded-lg hover:border-solana-purple/50"
                >
                  🧠 AI Staking
                </Link> */}
              </div>

              {/* Authentication Button */}
              <div className="flex-shrink-0">
                {authButton}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="border-t border-gray-700 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Score Range */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Min Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={filters.minScore}
                  onChange={(e) => handleFilterChange('minScore', parseFloat(e.target.value) || 0)}
                  className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Max Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={filters.maxScore}
                  onChange={(e) => handleFilterChange('maxScore', parseFloat(e.target.value) || 10)}
                  className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                />
              </div>

              {/* Min Mentions */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Min Mentions
                </label>
                <input
                  type="number"
                  min="0"
                  value={filters.minMentions}
                  onChange={(e) => handleFilterChange('minMentions', parseInt(e.target.value) || 0)}
                  className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                />
              </div>

              {/* Official Profile Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Official Profile
                </label>
                <select
                  value={filters.hasOfficialProfile === null ? '' : filters.hasOfficialProfile}
                  onChange={(e) => handleFilterChange('hasOfficialProfile', 
                    e.target.value === '' ? null : e.target.value === 'true')}
                  className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                >
                  <option value="">All</option>
                  <option value="true">Verified Only</option>
                  <option value="false">Unverified Only</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Sort By
                </label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                >
                  <option value="score">Overall Score</option>
                  <option value="mentions">Mentions</option>
                  <option value="communityScore">Community Score</option>
                  <option value="symbol">Symbol (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex justify-end mt-4 space-x-2">
              <button
                onClick={resetFilters}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
