import React, { useState, useEffect, useRef } from 'react';
import { Twitter, LogOut, User, UserPlus, ChevronDown, BarChart3, List, Flame, Edit, Star, Settings, Activity, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SimpleLogin from './SimpleLogin';

const AuthButton = ({ 
  onNavigateToListToken, 
  onNavigateToFuelToken, 
  onNavigateToUpdateToken,
  onNavigateToDashboard,
  onNavigateToWatchlist,
  onNavigateToSettings
}) => {
  const { user, login, logout, loading, isAuthenticated } = useAuth();
  const [showQuickLogin, setShowQuickLogin] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-dark-card border border-gray-700 rounded-lg">
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative flex items-center space-x-3">
        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center space-x-2 px-3 py-2 bg-dark-card border border-gray-700 rounded-lg hover:border-solana-purple transition-colors"
          >
            {user.profileImage ? (
              <img 
                src={user.profileImage} 
                alt={user.displayName}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <User className="w-5 h-5 text-gray-400" />
            )}
            <div className="flex flex-col">
              <span className="text-white text-sm font-medium">{user.displayName}</span>
              <span className="text-gray-400 text-xs">@{user.username}</span>
            </div>
            <ChevronDown 
              className={`w-4 h-4 text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} 
            />
          </button>

          {/* Dropdown Menu */}
          {showUserDropdown && (
            <div className="absolute top-full mt-2 right-0 bg-dark-card border border-gray-700 rounded-lg shadow-xl z-50 min-w-56">
              <div className="py-2">
                {/* User Info Header */}
                <div className="px-4 py-3 border-b border-gray-700">
                  <div className="flex items-center space-x-3">
                    {user.profileImage ? (
                      <img 
                        src={user.profileImage} 
                        alt={user.displayName}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <User size={16} className="text-white" />
                      </div>
                    )}
                    <div>
                      <div className="text-white text-sm font-medium">{user.displayName}</div>
                      <div className="text-gray-400 text-xs">@{user.username}</div>
                    </div>
                  </div>
                </div>

                {/* Dashboard */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToDashboard) {
                      onNavigateToDashboard();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <BarChart3 size={16} className="text-blue-400" />
                  <span className="text-white text-sm">Dashboard</span>
                </button>

                {/* Watchlist */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToWatchlist) {
                      onNavigateToWatchlist();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <Star size={16} className="text-yellow-400" />
                  <span className="text-white text-sm">Watchlist</span>
                </button>

                {/* Divider */}
                <div className="border-t border-gray-700 my-2"></div>

                {/* List Token */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToListToken) {
                      onNavigateToListToken();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <List size={16} className="text-green-400" />
                  <span className="text-white text-sm">List Token</span>
                </button>

                {/* Fuel Token */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToFuelToken) {
                      onNavigateToFuelToken();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <Flame size={16} className="text-orange-400" />
                  <span className="text-white text-sm">Fuel Token</span>
                </button>

                {/* Update Token */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToUpdateToken) {
                      onNavigateToUpdateToken();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <Edit size={16} className="text-purple-400" />
                  <span className="text-white text-sm">Update Token</span>
                </button>

                {/* Divider */}
                <div className="border-t border-gray-700 my-2"></div>

                {/* Settings */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onNavigateToSettings) {
                      onNavigateToSettings();
                    }
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-800 transition-colors"
                >
                  <Settings size={16} className="text-gray-400" />
                  <span className="text-white text-sm">Settings</span>
                </button>

                {/* Logout */}
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-red-900 transition-colors"
                >
                  <LogOut size={16} className="text-red-400" />
                  <span className="text-red-400 text-sm">Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center space-x-3">
      {/* Twitter OAuth Login */}
      <button
        onClick={login}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 border border-blue-500 rounded-lg transition-colors"
        title="Login with Twitter/X"
      >
        <Twitter size={16} />
        <span className="text-white font-medium">Login with X</span>
      </button>

      {/* Quick Login Toggle */}
      <button
        onClick={() => setShowQuickLogin(!showQuickLogin)}
        className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 border border-green-500 rounded-lg transition-colors"
        title="Quick Demo Login"
      >
        <UserPlus size={16} />
        <span className="text-white font-medium">Quick Login</span>
      </button>

      {/* Quick Login Form */}
      {showQuickLogin && (
        <div className="absolute top-full mt-2 right-0 bg-dark-card border border-gray-700 rounded-lg p-4 shadow-xl z-50 min-w-80">
          <div className="mb-3">
            <h3 className="text-white font-medium">Demo Login</h3>
            <p className="text-gray-400 text-xs">For testing watchlist & auth features</p>
          </div>
          <SimpleLogin onClose={() => setShowQuickLogin(false)} />
        </div>
      )}
    </div>
  );
};

export default AuthButton;
