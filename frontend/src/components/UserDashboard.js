import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Star, TrendingUp, Activity, Wallet, Users, Calendar, Award, Target, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const UserDashboard = () => {
  const { user, sessionId } = useAuth();
  const [dashboardData, setDashboardData] = useState({
    watchlistCount: 0,
    tokensListed: 0,
    tokensFueled: 0,
    tokensUpdated: 0,
    totalSpent: 0,
    recentActivity: [],
    portfolioValue: 0,
    topPerformers: []
  });
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching dashboard data for session:', sessionId);
      
      // Fetch user profile and watchlist
      const [profileResponse, watchlistResponse] = await Promise.all([
        fetch(`${API_BASE}/api/user/profile?sessionId=${sessionId}`),
        fetch(`${API_BASE}/api/user/watchlist?sessionId=${sessionId}`)
      ]);

      console.log('📊 Profile response status:', profileResponse.status);
      console.log('📊 Watchlist response status:', watchlistResponse.status);

      if (profileResponse.ok && watchlistResponse.ok) {
        const profileData = await profileResponse.json();
        const watchlistData = await watchlistResponse.json();
        
        console.log('✅ Dashboard data received:', { profileData, watchlistData });
        
        setDashboardData({
          watchlistCount: watchlistData.watchlist?.length || 0,
          tokensListed: profileData.user?.stats?.tokensListed || 0,
          tokensFueled: profileData.user?.stats?.tokensFueled || 0,
          tokensUpdated: profileData.user?.stats?.tokensUpdated || 0,
          totalSpent: profileData.user?.stats?.totalSpent || 0,
          recentActivity: [], // TODO: Implement recent activity
          portfolioValue: 0, // TODO: Calculate portfolio value
          topPerformers: [] // TODO: Get top performing tokens
        });
      } else {
        console.error('❌ API calls failed:', {
          profileStatus: profileResponse.status,
          watchlistStatus: watchlistResponse.status,
          profileText: await profileResponse.text(),
          watchlistText: await watchlistResponse.text()
        });
        
        // Set default data even if API fails
        setDashboardData({
          watchlistCount: 0,
          tokensListed: 0,
          tokensFueled: 0,
          tokensUpdated: 0,
          totalSpent: 0,
          recentActivity: [],
          portfolioValue: 0,
          topPerformers: []
        });
      }
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId, API_BASE]);

  useEffect(() => {
    console.log('🔄 UserDashboard useEffect triggered:', { user: !!user, sessionId: !!sessionId });
    if (user && sessionId) {
      fetchDashboardData();
    } else {
      console.log('⚠️ UserDashboard: Missing user or sessionId:', { user: !!user, sessionId: !!sessionId });
      setLoading(false);
    }
  }, [user, sessionId, fetchDashboardData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
          <p className="text-gray-500 text-sm mt-2">User: {user?.username || 'None'}</p>
          <p className="text-gray-500 text-sm">Session: {sessionId ? 'Present' : 'Missing'}</p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Watchlist',
      value: dashboardData.watchlistCount,
      icon: Star,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10'
    },
    {
      title: 'Tokens Listed',
      value: dashboardData.tokensListed,
      icon: TrendingUp,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10'
    },
    {
      title: 'Tokens Fueled',
      value: dashboardData.tokensFueled,
      icon: Activity,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10'
    },
    {
      title: 'Total Spent',
      value: `$${dashboardData.totalSpent.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10'
    }
  ];

  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            {user.profileImage ? (
              <img 
                src={user.profileImage} 
                alt={user.displayName}
                className="w-16 h-16 rounded-full border-2 border-blue-500"
              />
            ) : (
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center border-2 border-blue-500">
                <Users size={24} className="text-white" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">{user.displayName}</h1>
              <p className="text-gray-400">@{user.username}</p>
              {user.verified && (
                <div className="flex items-center space-x-1 mt-1">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-blue-400 text-sm">Verified</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-400">
            <div className="flex items-center space-x-2">
              <Users size={16} />
              <span>{user.followersCount?.toLocaleString() || 0} followers</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users size={16} />
              <span>{user.followingCount?.toLocaleString() || 0} following</span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar size={16} />
              <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Activity size={16} />
              <span>Last active {new Date(user.lastLogin).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-dark-card border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{stat.title}</p>
                  <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon size={24} className={stat.color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Activity */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Activity size={20} className="text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
            </div>
            <div className="space-y-4">
              {dashboardData.recentActivity.length > 0 ? (
                dashboardData.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <div>
                      <p className="text-white text-sm">{activity.description}</p>
                      <p className="text-gray-400 text-xs">{activity.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Activity size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No recent activity</p>
                  <p className="text-gray-500 text-sm">Start listing and fueling tokens to see activity here</p>
                </div>
              )}
            </div>
          </div>

          {/* Portfolio Overview */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 size={20} className="text-green-400" />
              <h2 className="text-xl font-semibold text-white">Portfolio Overview</h2>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Value</span>
                <span className="text-2xl font-bold text-white">${dashboardData.portfolioValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tokens in Watchlist</span>
                <span className="text-lg font-semibold text-white">{dashboardData.watchlistCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Active Listings</span>
                <span className="text-lg font-semibold text-white">{dashboardData.tokensListed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Spent</span>
                <span className="text-lg font-semibold text-white">${dashboardData.totalSpent.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Award size={20} className="text-yellow-400" />
              <h2 className="text-xl font-semibold text-white">Top Performers</h2>
            </div>
            <div className="space-y-3">
              {dashboardData.topPerformers.length > 0 ? (
                dashboardData.topPerformers.map((token, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{index + 1}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{token.symbol}</p>
                        <p className="text-gray-400 text-sm">{token.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-semibold">+{token.change}%</p>
                      <p className="text-gray-400 text-sm">${token.price}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Target size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No performance data</p>
                  <p className="text-gray-500 text-sm">Add tokens to your watchlist to track performance</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Wallet size={20} className="text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button className="w-full p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <TrendingUp size={20} />
                  <div>
                    <p className="font-medium">List New Token</p>
                    <p className="text-sm opacity-90">Add your token to the platform</p>
                  </div>
                </div>
              </button>
              <button className="w-full p-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <Activity size={20} />
                  <div>
                    <p className="font-medium">Fuel Token</p>
                    <p className="text-sm opacity-90">Boost token visibility</p>
                  </div>
                </div>
              </button>
              <button className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <Star size={20} />
                  <div>
                    <p className="font-medium">View Watchlist</p>
                    <p className="text-sm opacity-90">Manage your favorite tokens</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
