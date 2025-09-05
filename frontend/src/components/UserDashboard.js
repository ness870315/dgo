import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Star, TrendingUp, Activity, Wallet, Users, Calendar, Award, Target, Crown, ArrowLeft, Plus, Zap, Edit, Trash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TokenDetails from './TokenDetails';
import hypeService from '../services/hypeService';
import priorityService from '../services/priorityService';
import leaderboardService from '../services/leaderboardService';
import KolCallsModal from './KolCallsModal';
import watchlistService from '../services/watchlistService';

const UserDashboard = ({ onNavigateToListToken, onNavigateToFuelToken, onNavigateToUpdateToken, onNavigateToPremium }) => {
  const { user, sessionId } = useAuth();
  const [dashboardData, setDashboardData] = useState({
    watchlistCount: 0,
    tokensListed: 0,
    tokensFueled: 0,
    tokensUpdated: 0,
    referralCode: '',
    kolCalls: [],
    kolLeaderboard: [],
    watchlist: [],
    isPremium: false,
    premiumExpiry: null
  });
  const [loading, setLoading] = useState(true);
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showHypeModal, setShowHypeModal] = useState(false);
  const [selectedHypeToken, setSelectedHypeToken] = useState(null);
  const [hypeRange, setHypeRange] = useState('7d');
  const [hypeSeries, setHypeSeries] = useState([]);
  const [showKolCalls, setShowKolCalls] = useState(false);
  const [hypePage, setHypePage] = useState(0);

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching dashboard data for session:', sessionId, '- Premium features active');
      
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
        
        const entries = Array.isArray(watchlistData.watchlist) ? watchlistData.watchlist : [];

        // Try to fetch leaderboard (premium feature)
        let leaderboard = [];
        let isPremium = false;
        let premiumExpiry = null;
        
        try {
          const leaderboardData = await leaderboardService.getLeaderboard();
          leaderboard = leaderboardData.leaderboard || [];
          isPremium = true; // If we got leaderboard data, user is premium
        } catch (err) {
          // @ts-ignore
          if (err && err.code === 'premium_required') {
            isPremium = false;
          } else {
            console.warn('Failed to fetch leaderboard:', err);
          }
        }

        setDashboardData({
          watchlistCount: entries.length,
          tokensListed: profileData.user?.stats?.tokensListed || 0,
          tokensFueled: profileData.user?.stats?.tokensFueled || 0,
          tokensUpdated: profileData.user?.stats?.tokensUpdated || 0,
          referralCode: profileData.user?.referralCode || '',
          kolCalls: [], // TODO: Implement KOL calls
          kolLeaderboard: leaderboard,
          watchlist: entries,
          isPremium: isPremium,
          premiumExpiry: premiumExpiry
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
          referralCode: '',
          kolCalls: [],
          kolLeaderboard: [],
          watchlist: [],
          isPremium: false,
          premiumExpiry: null
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
      title: 'Upgrade',
      value: 'Premium',
      icon: Crown,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
      isButton: true,
      onClick: () => { if (onNavigateToPremium) onNavigateToPremium(); }
    }
  ];

  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          {/* Return to Main App Button */}
          <div className="flex justify-between items-center mb-6">
            <button 
              onClick={() => window.location.href = '/'}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-solana-purple/60"
            >
              <ArrowLeft size={20} />
              <span>Return to Main App</span>
            </button>
            
            {/* Referral Code Display */}
            {dashboardData.referralCode && (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Your Referral Code</p>
                  <p className="text-white font-mono text-lg">{dashboardData.referralCode}</p>
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?${new URLSearchParams({
                    text: `Here is my referral code ${dashboardData.referralCode} for a 1 month Premium subscription for DeGen Oracle, spot the next cult before it goes Viral and become a KOL`,
                    url: `https://degen-oracle.com`,
                    hashtags: "DeGenOracle,Crypto,KOL"
                  }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-solana-purple hover:bg-purple-700 text-white rounded-lg text-sm"
                  title="Share on X"
                >
                  Share on X
                </a>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4 mb-4">
            {user.profileImage ? (
              <img 
                src={user.profileImage} 
                alt={user.displayName}
                className="w-16 h-16 rounded-full border-2 border-solana-purple"
              />
            ) : (
              <div className="w-16 h-16 bg-solana-purple rounded-full flex items-center justify-center border-2 border-solana-purple">
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
                  {stat.isButton ? (
                    <button onClick={stat.onClick} className="text-2xl font-bold text-purple-400 mt-1 hover:text-purple-300 transition-colors">
                      {stat.value}
                    </button>
                  ) : (
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                  )}
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
          {/* Hype over Time - TOP LEFT */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 size={20} className="text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Hype over Time</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">View hype trends for the tokens in your watchlist across multiple time ranges.</p>
            {/* Inline Hype list (reuse existing modal content) */}
            <div className="mt-2">
              {(() => {
                const perPage = 8;
                const total = dashboardData.watchlist.length;
                const totalPages = Math.max(1, Math.ceil(total / perPage));
                const currentPage = Math.min(hypePage, totalPages - 1);
                const start = currentPage * perPage;
                const pageItems = dashboardData.watchlist.slice(start, start + perPage);
                return (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pageItems.map((token, index) => (
                  <div
                    key={`${token.contractAddress || token.symbol}-${index}`}
                    onClick={async () => {
                      setSelectedHypeToken(token);
                      
                      // Boost priority when hype chart is viewed from inline grid
                      if (token.contractAddress) {
                        priorityService.boostTokenOnView(token.contractAddress, token.symbol);
                      }
                      
                      try {
                        const res = await hypeService.getHype(token.contractAddress, hypeRange);
                        setHypeSeries(res.data || []);
                      } catch (e) {
                        // @ts-ignore
                        if (e && e.code === 'limit_exceeded') {
                          const upgrade = window.confirm('🚀 ' + e.message + '\n\nWould you like to upgrade now?');
                          if (upgrade && onNavigateToPremium) {
                            onNavigateToPremium();
                          }
                          return;
                        }
                        console.error('Hype fetch error:', e);
                        setHypeSeries([]);
                      }
                    }}
                    className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{token.symbol}</p>
                        <p className="text-gray-400 text-sm">{token.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              // optimistic removal
                              setDashboardData(prev => ({
                                ...prev,
                                watchlist: prev.watchlist.filter(t => (t.contractAddress && token.contractAddress)
                                  ? t.contractAddress !== token.contractAddress
                                  : t.symbol !== token.symbol)
                              }));
                              await watchlistService.removeFromWatchlist(token.symbol, token.contractAddress);
                            } catch (err) {
                              console.error('Failed to remove from watchlist:', err);
                              // reload watchlist on failure
                              try {
                                const wlRes = await fetch(`${API_BASE}/api/user/watchlist?sessionId=${sessionId}`);
                                if (wlRes.ok) {
                                  const wlData = await wlRes.json();
                                  setDashboardData(prev => ({ ...prev, watchlist: wlData.watchlist || [] }));
                                }
                              } catch (_) {}
                            }
                          }}
                          title="Remove from Hype over Time"
                          className="p-1 rounded border border-red-500/60 text-red-300 hover:bg-red-500/10"
                        >
                          <Trash size={16} />
                        </button>
                        <BarChart3 size={20} className="text-blue-400" />
                      </div>
                    </div>
                  </div>
                    ))}
                    {dashboardData.watchlist.length === 0 && (
                  <div className="text-gray-400 text-sm">Your watchlist is empty</div>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-end gap-3 mt-3 text-sm">
                      <button
                        onClick={() => setHypePage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className={`px-2 py-1 rounded border ${currentPage === 0 ? 'border-gray-700 text-gray-600' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                        title="Previous"
                      >
                        ◀
                      </button>
                      <span className="text-gray-400">Page {currentPage + 1} of {totalPages}</span>
                      <button
                        onClick={() => setHypePage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className={`px-2 py-1 rounded border ${currentPage >= totalPages - 1 ? 'border-gray-700 text-gray-600' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                        title="Next"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* KOL Leaderboard - TOP RIGHT */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 size={20} className="text-green-400" />
              <h2 className="text-xl font-semibold text-white">KOL Leaderboard</h2>
              {!dashboardData.isPremium && (
                <Crown size={16} className="text-yellow-400" title="Premium Feature" />
              )}
            </div>
            <div className="space-y-4">
              {!dashboardData.isPremium ? (
                <div className="text-center py-8">
                  <Crown size={48} className="mx-auto text-yellow-400 mb-4" />
                  <p className="text-gray-400 mb-4">Leaderboard is a Premium feature</p>
                  <button
                    onClick={onNavigateToPremium}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
                  >
                    Upgrade to Premium
                  </button>
                </div>
              ) : dashboardData.kolLeaderboard.length > 0 ? (
                dashboardData.kolLeaderboard.map((kol, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{kol.rank}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{kol.username}</p>
                        <p className="text-gray-400 text-sm">{kol.calls} calls</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-semibold">{kol.winRate}%</p>
                      <p className="text-gray-400 text-sm">+${kol.totalPnL}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Award size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No KOL leaderboard data</p>
                  <p className="text-gray-500 text-sm">KOL rankings will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* KOL Calls - BELOW ROW */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6 lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <Activity size={20} className="text-green-400" />
              <h2 className="text-xl font-semibold text-white">KOL Calls</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">Your recorded calls with performance metrics.</p>
            <KolCallsModal open asInline onClose={() => {}} onOpenToken={(row) => {
              const tokenMatch = dashboardData.watchlist.find(t => (t.contractAddress && row.contractAddress) && t.contractAddress.toLowerCase() === row.contractAddress.toLowerCase());
              if (tokenMatch) {
                setSelectedToken(tokenMatch);
              }
            }} />
          </div>


        </div>

        {/* Quick Actions */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mt-8">
          <div className="flex items-center space-x-2 mb-4">
            <Wallet size={20} className="text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <button 
              onClick={() => {
                if (onNavigateToListToken) onNavigateToListToken();
                else window.location.href = '/list-token';
              }}
              className="w-full p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <Plus size={20} />
                <div>
                  <p className="font-medium">List New Token</p>
                  <p className="text-sm opacity-90">Add your token to the platform</p>
                </div>
              </div>
            </button>
            <button 
              onClick={() => {
                if (onNavigateToFuelToken) onNavigateToFuelToken();
                else window.location.href = '/fuel-token';
              }}
              className="w-full p-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <Zap size={20} />
                <div>
                  <p className="font-medium">Fuel Token</p>
                  <p className="text-sm opacity-90">Boost token visibility</p>
                </div>
              </div>
            </button>
            <button 
              onClick={() => {
                if (onNavigateToUpdateToken) onNavigateToUpdateToken();
                else window.location.href = '/update-token';
              }}
              className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <Edit size={20} />
                <div>
                  <p className="font-medium">Update Token</p>
                  <p className="text-sm opacity-90">Update token information</p>
                </div>
              </div>
            </button>
            <button 
              onClick={() => setShowWatchlistModal(true)}
              className="w-full p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <Star size={20} />
                <div>
                  <p className="font-medium">View Watchlist</p>
                  <p className="text-sm opacity-90">Manage your favorite tokens</p>
                </div>
              </div>
            </button>
            {/* Hype over Time moved under KOL Calls */}
          </div>
        </div>

        {/* Watchlist Modal */}
        {showWatchlistModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Your Watchlist</h2>
                <button 
                  onClick={() => setShowWatchlistModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              {dashboardData.watchlist.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dashboardData.watchlist.map((token, index) => (
                    <div 
                      key={index}
                      onClick={() => setSelectedToken(token)}
                      className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{token.symbol}</p>
                          <p className="text-gray-400 text-sm">{token.name}</p>
                        </div>
                        <Star size={20} className="text-yellow-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Star size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Your watchlist is empty</p>
                  <p className="text-gray-500 text-sm">Add tokens to your watchlist to see them here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hype Over Time - Watchlist List Modal */}
        {showHypeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Hype over Time</h2>
                <button onClick={() => setShowHypeModal(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              {dashboardData.watchlist.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dashboardData.watchlist.map((token, index) => (
                    <div
                      key={index}
                      onClick={async () => {
                        setSelectedHypeToken(token);
                        
                        // Boost priority when hype chart is viewed for more real-time updates
                        if (token.contractAddress) {
                          priorityService.boostTokenOnView(token.contractAddress, token.symbol);
                        }
                        
                        try {
                          const res = await hypeService.getHype(token.contractAddress, hypeRange);
                          setHypeSeries(res.data || []);
                        } catch (e) {
                          // @ts-ignore
                          if (e && e.code === 'limit_exceeded') {
                            const upgrade = window.confirm('🚀 ' + e.message + '\n\nWould you like to upgrade now?');
                            if (upgrade && onNavigateToPremium) {
                              onNavigateToPremium();
                            }
                            return;
                          }
                          console.error('Hype fetch error:', e);
                          setHypeSeries([]);
                        }
                      }}
                      className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{token.symbol}</p>
                          <p className="text-gray-400 text-sm">{token.name}</p>
                        </div>
                        <BarChart3 size={20} className="text-blue-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Your watchlist is empty</p>
                  <p className="text-gray-500 text-sm">Add tokens to see hype trends here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hype Chart Modal */}
        {selectedHypeToken && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">{selectedHypeToken.symbol} • Hype over Time</h2>
                <button onClick={() => setSelectedHypeToken(null)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                {['1d','3d','7d','15d','30d'].map(r => (
                  <button
                    key={r}
                    onClick={async () => {
                      setHypeRange(r);
                      
                      // Boost priority when hype range is changed for more real-time updates
                      if (selectedHypeToken?.contractAddress) {
                        priorityService.boostTokenOnView(selectedHypeToken.contractAddress, selectedHypeToken.symbol);
                      }
                      
                      try {
                        const res = await hypeService.getHype(selectedHypeToken.contractAddress, r);
                        setHypeSeries(res.data || []);
                      } catch (e) {
                        // @ts-ignore
                        if (e && e.code === 'limit_exceeded') {
                          const upgrade = window.confirm('🚀 ' + e.message + '\n\nWould you like to upgrade now?');
                          if (upgrade && onNavigateToPremium) {
                            onNavigateToPremium();
                          }
                          return;
                        }
                        console.error('Hype fetch error:', e);
                        setHypeSeries([]);
                      }
                    }}
                    className={`px-3 py-1 rounded text-sm border ${hypeRange===r ? 'bg-blue-600 border-blue-500 text-white' : 'bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                  >{r}</button>
                ))}
              </div>

              {/* Simple inline chart rendering using SVG for zero-deps */}
              <HypeMiniChart data={hypeSeries} />

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300">
                <div>Last points: {hypeSeries.length}</div>
                <div>Latest label: {hypeSeries[hypeSeries.length-1]?.label || '—'}</div>
              </div>
            </div>
          </div>
        )}

        {/* KOL Calls Modal */}
        {showKolCalls && (
          <KolCallsModal
            open={showKolCalls}
            onClose={() => setShowKolCalls(false)}
            onOpenToken={(row) => {
              // When clicking a KOL call row, open the TokenDetails modal if we have it in cache
              // Fallback: open hype chart modal if not found
              const tokenMatch = dashboardData.watchlist.find(t => (t.contractAddress && row.contractAddress) && t.contractAddress.toLowerCase() === row.contractAddress.toLowerCase());
              if (tokenMatch) {
                setSelectedToken(tokenMatch);
                setShowKolCalls(false);
              }
            }}
          />
        )}

        {/* Token Details Modal */}
        {selectedToken && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Token Details</h2>
                <button 
                  onClick={() => setSelectedToken(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <TokenDetails token={selectedToken} onClose={() => setSelectedToken(null)} onNavigateToPremium={onNavigateToPremium} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;

// Lightweight SVG chart for hype score over time (0-10)
function HypeMiniChart({ data }) {
  const width = 720;
  const height = 220;
  const padding = 32;
  const points = Array.isArray(data) ? data : [];
  if (points.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-gray-500 border border-gray-700 rounded">
        No data yet
      </div>
    );
  }

  const xs = points.map(p => new Date(p.timestamp).getTime());
  const ys = points.map(p => (typeof p.score === 'number' ? p.score : 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = 0;
  const maxY = 10;

  const xScale = t => padding + (maxX === minX ? 0 : ((t - minX) / (maxX - minX)) * (width - padding * 2));
  const yScale = v => height - padding - ((v - minY) / (maxY - minY)) * (height - padding * 2);

  const path = points.map((p, i) => {
    const x = xScale(new Date(p.timestamp).getTime());
    const y = yScale(typeof p.score === 'number' ? p.score : 0);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  // Label bands
  const bands = [
    { y: yScale(8), h: yScale(10) - yScale(8), color: 'rgba(34,197,94,0.10)', label: 'Viral (≥8)' },
    { y: yScale(5), h: yScale(8) - yScale(5), color: 'rgba(59,130,246,0.10)', label: 'Trending (≥5)' },
    { y: yScale(3), h: yScale(5) - yScale(3), color: 'rgba(234,179,8,0.10)', label: 'Building (≥3)' },
    { y: yScale(0), h: yScale(3) - yScale(0), color: 'rgba(148,163,184,0.10)', label: 'Sleeping (<3)' }
  ];

  return (
    <svg width={width} height={height} className="w-full h-56 bg-gray-900/40 border border-gray-700 rounded">
      {bands.map((b, i) => (
        <g key={i}>
          <rect x={padding} y={b.y} width={width - padding * 2} height={Math.max(0, b.h)} fill={b.color} />
        </g>
      ))}
      <polyline fill="none" stroke="#7c3aed" strokeWidth="2" points={points.map(p => `${xScale(new Date(p.timestamp).getTime())},${yScale(p.score||0)}`).join(' ')} />
      <path d={path} fill="none" stroke="#8b5cf6" strokeWidth="2" />
      {/* Axes */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#475569" />
      {/* Y ticks */}
      {[0,2,4,6,8,10].map(v => (
        <g key={v}>
          <line x1={padding - 4} y1={yScale(v)} x2={width - padding} y2={yScale(v)} stroke="#334155" strokeDasharray="3,3" />
          <text x={8} y={yScale(v) + 4} fill="#94a3b8" fontSize="10">{v}</text>
        </g>
      ))}
    </svg>
  );
}
