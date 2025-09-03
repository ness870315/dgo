import React, { useState } from 'react';
import { Search, Filter, TrendingUp, RefreshCw, Settings, Star } from 'lucide-react';

const Header = ({ onSearch, onFilter, onRefresh, isLoading, onSettingsClick, authButton, onWatchlistClick, onApifyTestClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {/* Purple Trending Arrow Logo */}
              <svg width="32" height="32" viewBox="0 0 32 32" className="text-solana-purple">
                <defs>
                  <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#9333ea', stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:'#7c3aed', stopOpacity:1}} />
                  </linearGradient>
                </defs>
                {/* Trending upward arrow (diagonal) */}
                <path d="M6 26L26 6M20 6H26V12" fill="none" stroke="url(#headerGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  <span className="text-solana-purple">DeGen</span> Oracle
                </h1>
                <p className="text-sm text-gray-400 -mt-1">
                  Spot the Next Cult Before it Goes Viral
                </p>
              </div>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center space-x-4">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search tokens, names, or contract addresses..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="block w-80 pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
              />
            </div>

            {/* Basic Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-md border transition-colors ${
                showFilters
                  ? 'border-solana-purple bg-solana-purple bg-opacity-20 text-solana-purple'
                  : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
              title="Basic Filters"
            >
              <Filter size={20} />
            </button>



            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`p-2 rounded-md border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>

            {/* Watchlist Button */}
            <button
              onClick={onWatchlistClick}
              className="p-2 rounded-md border border-gray-600 text-gray-400 hover:text-yellow-400 hover:border-yellow-500 transition-colors"
              title="View Watchlist"
            >
              <Star size={20} />
            </button>

            {/* Apify Test Button */}
            <button
              onClick={onApifyTestClick}
              className="p-2 rounded-md border border-gray-600 text-gray-400 hover:text-blue-400 hover:border-blue-500 transition-colors"
              title="Test Apify Integration"
            >
              🚀
            </button>



            {/* Settings Button */}
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-md border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <Settings size={20} />
            </button>

            {/* Authentication Button */}
            {authButton}
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
