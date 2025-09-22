import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Star, TrendingUp, Activity, Wallet, Users, Calendar, Award, Target, Crown, ArrowLeft, Plus, Zap, Edit, Trash, Brain, Info, AlertTriangle, CheckCircle, TrendingDown, Clock, Gauge, HelpCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TokenDetails from './TokenDetails';
import hypeService from '../services/hypeService';
import priorityService from '../services/priorityService';
import leaderboardService from '../services/leaderboardService';
import KolCallsModal from './KolCallsModal';
import watchlistService from '../services/watchlistService';
import KOLLeaderboardGuide from './KOLLeaderboardGuide';
import AIChatModal from './AIChatModal';
import FloatingChatButton from './FloatingChatButton';
import { getStatusFromScore } from '../utils/statusUtils';

const UserDashboard = ({ onNavigateToListToken, onNavigateToFuelToken, onNavigateToUpdateToken, onNavigateToPremium }) => {
  const { user, sessionId, isPremium } = useAuth();
  
  // All hooks must be called before any early returns
  const [dashboardData, setDashboardData] = useState({
    watchlistCount: 0,
    tokensListed: 0,
    tokensFueled: 0,
    tokensUpdated: 0,
    referralCode: '',
    kolCalls: [],
    kolLeaderboard: [],
    leaderboardError: null,
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
  
  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatPosition, setChatPosition] = useState(null);
  
  // Additional state hooks
  const [hypeSeries, setHypeSeries] = useState([]);
  const [showKolCalls, setShowKolCalls] = useState(false);
  const [hypePage, setHypePage] = useState(0);
  const [showManageHype, setShowManageHype] = useState(false);
  const [hypeSelected, setHypeSelected] = useState([]); // array of contractAddress
  const [showHypeAI, setShowHypeAI] = useState(false);
  const [hypeAIData, setHypeAIData] = useState(null);
  const [hypeAILoading, setHypeAILoading] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [showLeaderboardGuide, setShowLeaderboardGuide] = useState(false);
  const [selectedKolUser, setSelectedKolUser] = useState(null);
  const [kolStats, setKolStats] = useState(null);
  const [kolCalls, setKolCalls] = useState([]);
  const [kolLoading, setKolLoading] = useState(false);
  const [kolFollowBusy, setKolFollowBusy] = useState(false);
  const [kolIsFollowing, setKolIsFollowing] = useState(false);
  // DGO Followers/Following
  const [dgoFollowers, setDgoFollowers] = useState([]);
  const [dgoFollowing, setDgoFollowing] = useState([]);
  const [dgoFollowingUsers, setDgoFollowingUsers] = useState([]);
  const [dgoFollowersLoading, setDgoFollowersLoading] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  // Seasons (monthly)
  const [seasonMonth, setSeasonMonth] = useState(() => new Date().toISOString().slice(0,7)); // YYYY-MM
  const [winners, setWinners] = useState([]);
  const [winnersLoading, setWinnersLoading] = useState(false);
  
  // Handler for opening chat from floating button
  const handleOpenChat = () => {
    setShowAIChat(true);
  };

  // Callback hooks
  const loadDgoFollowers = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setDgoFollowersLoading(true);
      const response = await fetch(`${API_BASE}/api/user/followers?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      
      if (data.success) {
        // Clean up self-follows (users shouldn't follow themselves)
        const cleanFollowers = (data.followers || []).filter(id => id !== user?.id);
        const cleanFollowing = (data.following || []).filter(id => id !== user?.id);
        
        setDgoFollowers(cleanFollowers);
        setDgoFollowing(cleanFollowing);
        
        // Fetch user details for following list
        if (cleanFollowing.length > 0) {
          try {
            const userPromises = cleanFollowing.map(async (userId) => {
              try {
                // Try multiple methods to get user profile data
                let userData = null;
                
                // Method 1: Try leaderboard service
                try {
                  const profile = await leaderboardService.getUserProfile(userId);
                  userData = profile?.user || profile;
                } catch (leaderboardError) {
                  console.warn(`⚠️ Leaderboard service failed for ${userId}:`, leaderboardError);
                }
                
                // Method 2: If no data from leaderboard, try direct API call
                if (!userData || !userData.username || userData.username.startsWith('user_')) {
                  try {
                    const directResponse = await fetch(`${API_BASE}/api/kol/${encodeURIComponent(userId)}/profile`);
                    if (directResponse.ok) {
                      const directData = await directResponse.json();
                      userData = directData?.user || directData;
                    }
                  } catch (directError) {
                    console.warn(`⚠️ Direct API failed for ${userId}:`, directError);
                  }
                }
                
                // Method 3: If still no real data, use generic fallback
                if (!userData || !userData.username || userData.username.startsWith('user_')) {
                  console.warn(`⚠️ No real profile data found for user ${userId}, using generic fallback`);
                  return {
                    id: userId,
                    username: `user_${String(userId).slice(-6)}`,
                    displayName: `User ${String(userId).slice(-6)}`,
                    profileImage: null
                  };
                }
                
                // Use actual X profile data
                const username = userData.username || `user_${String(userId).slice(-6)}`;
                const displayName = userData.displayName || userData.username || `User ${String(userId).slice(-6)}`;
                const profileImage = userData.profileImage || null;
                
                return {
                  id: userData.id || userId,
                  username: username,
                  displayName: displayName,
                  profileImage: profileImage
                };
                
              } catch (error) {
                console.warn(`❌ All methods failed for user ${userId}:`, error);
                return {
                  id: userId,
                  username: `user_${String(userId).slice(-6)}`,
                  displayName: `User ${String(userId).slice(-6)}`,
                  profileImage: null
                };
              }
            });
            
            const userDetails = await Promise.all(userPromises);
            setDgoFollowingUsers(userDetails);
          } catch (error) {
            console.error('❌ Failed to fetch following user details:', error);
            setDgoFollowingUsers([]);
          }
        } else {
          setDgoFollowingUsers([]);
        }
      }
    } catch (error) {
      console.error('Failed to load DGO followers:', error);
    } finally {
      setDgoFollowersLoading(false);
    }
  }, [user?.id, sessionId]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch user profile and watchlist
      const [profileResponse, watchlistResponse] = await Promise.all([
        fetch(`${API_BASE}/api/user/profile?sessionId=${sessionId}`),
        fetch(`${API_BASE}/api/user/watchlist?sessionId=${sessionId}`)
      ]);

      const profileData = await profileResponse.json();
      const watchlistData = await watchlistResponse.json();

      if (profileData.success) {
        setDashboardData(prev => ({
          ...prev,
          watchlistCount: profileData.user?.watchlistCount || 0,
          tokensListed: profileData.user?.tokensListed || 0,
          tokensFueled: profileData.user?.tokensFueled || 0,
          tokensUpdated: profileData.user?.tokensUpdated || 0,
          referralCode: profileData.user?.referralCode || '',
          isPremium: profileData.user?.isPremium || false,
          premiumExpiry: profileData.user?.premiumExpiry || null
        }));
      }

      if (watchlistData.success) {
        setDashboardData(prev => ({
          ...prev,
          watchlist: watchlistData.watchlist || []
        }));
      }
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId, API_BASE]);
  
  // Early return if user is not loaded yet
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-solana-purple mx-auto mb-4"></div>
          <p>Loading user dashboard...</p>
        </div>
        
        {/* Floating Chat Button - always visible */}
        <FloatingChatButton onOpenChat={handleOpenChat} />
      </div>
    );
  }

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

    if (!user?.id) return;
    
    try {
      setDgoFollowersLoading(true);
      const response = await fetch(`${API_BASE}/api/user/followers?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      



      
      if (data.success) {
        // Clean up self-follows (users shouldn't follow themselves)
        const cleanFollowers = (data.followers || []).filter(id => id !== user?.id);
        const cleanFollowing = (data.following || []).filter(id => id !== user?.id);
        


        
        setDgoFollowers(cleanFollowers);
        setDgoFollowing(cleanFollowing);
        
        // Fetch user details for following list
        if (cleanFollowing.length > 0) {
          try {
            const userPromises = cleanFollowing.map(async (userId) => {
              try {

                
                // Try multiple methods to get user profile data
                let userData = null;
                
                // Method 1: Try leaderboard service
                try {
                  const profile = await leaderboardService.getUserProfile(userId);
                  userData = profile?.user || profile;

                } catch (leaderboardError) {
                  console.warn(`⚠️ Leaderboard service failed for ${userId}:`, leaderboardError);
                }
                
                // Method 2: If no data from leaderboard, try direct API call
                if (!userData || !userData.username || userData.username.startsWith('user_')) {
                  try {
                    const directResponse = await fetch(`${API_BASE}/api/kol/${encodeURIComponent(userId)}/profile`);
                    if (directResponse.ok) {
                      const directData = await directResponse.json();
                      userData = directData?.user || directData;

                    }
                  } catch (directError) {
                    console.warn(`⚠️ Direct API failed for ${userId}:`, directError);
                  }
                }
                
                // Method 3: If still no real data, use generic fallback
                if (!userData || !userData.username || userData.username.startsWith('user_')) {
                  console.warn(`⚠️ No real profile data found for user ${userId}, using generic fallback`);
                  return {
                    id: userId,
                    username: `user_${String(userId).slice(-6)}`,
                    displayName: `User ${String(userId).slice(-6)}`,
                    profileImage: null
                  };
                }
                
                // Use actual X profile data
                const username = userData.username || `user_${String(userId).slice(-6)}`;
                const displayName = userData.displayName || userData.username || `User ${String(userId).slice(-6)}`;
                const profileImage = userData.profileImage || null;
                

                
                return {
                  id: userData.id || userId,
                  username: username,
                  displayName: displayName,
                  profileImage: profileImage
                };
                
              } catch (error) {
                console.warn(`❌ All methods failed for user ${userId}:`, error);
                return {
                  id: userId,
                  username: `user_${String(userId).slice(-6)}`,
                  displayName: `User ${String(userId).slice(-6)}`,
                  profileImage: null
                };
              }
            });
            
            const userDetails = await Promise.all(userPromises);

            setDgoFollowingUsers(userDetails);
          } catch (error) {
            console.error('❌ Failed to fetch following user details:', error);
            setDgoFollowingUsers([]);
          }
        } else {
          setDgoFollowingUsers([]);
        }
      }
    } catch (error) {
      console.error('Failed to load DGO followers:', error);
    } finally {
      setDgoFollowersLoading(false);
    }
  }, [user?.id, sessionId]);

  // Tooltip content for AI analysis terms
  const getTooltipContent = (key) => {
    switch (key) {
      case 'strength':
        return {
          title: '💪 Regime Strength',
          description: 'How many technical indicators agree on the current regime. 70%+ = high confidence, 50-69% = medium, <50% = low confidence'
        };
      case 'ewma':
        return {
          title: '📊 EWMA',
          description: 'Exponential Weighted Moving Average - tracks recent momentum vs historical average'
        };
      case 'derivative':
        return {
          title: '📈 Derivative',
          description: 'Rate of change analysis - velocity (speed) and acceleration (change in speed)'
        };
      case 'changepoints':
        return {
          title: '🎯 Change Points',
          description: 'Bayesian detection of significant regime shifts (upturn/downturn moments)'
        };
      case 'forecast':
        return {
          title: '🔮 Forecast',
          description: '6-12h prediction based on current momentum, velocity, and acceleration patterns'
        };
      case 'confidence':
        return {
          title: '🎯 Confidence',
          description: 'AI certainty in the prediction. Higher % = more reliable forecast'
        };
      default:
        return { title: key, description: '' };
    }
  };

  // Persisted selection for Hype list per user (sync with backend if available)
  useEffect(() => {
    (async () => {
      const key = `hypeSelected:${user?.id || 'anon'}`;
      // Try backend first
      try {
        const sessionId = localStorage.getItem('sessionId');
        if (sessionId) {
          const res = await fetch(`${API_BASE}/api/user/hype?sessionId=${encodeURIComponent(sessionId)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.list)) {
              setHypeSelected(data.list);
              try { localStorage.setItem(key, JSON.stringify(data.list)); } catch (_) {}
              return;
            }
          }
        }
      } catch (_) {}
      // Fallback to local
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(saved)) setHypeSelected(saved);
      } catch (_) {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const key = `hypeSelected:${user?.id || 'anon'}`;
    try { localStorage.setItem(key, JSON.stringify(hypeSelected)); } catch (_) {}
    // Push to backend
    (async () => {
      try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) return;
        // Fetch current list to diff and minimize requests
        const res = await fetch(`${API_BASE}/api/user/hype?sessionId=${encodeURIComponent(sessionId)}`);
        let serverList = [];
        if (res.ok) {
          const data = await res.json();
          serverList = Array.isArray(data.list) ? data.list : [];
        }
        const toAdd = hypeSelected.filter(ca => !serverList.includes(ca));
        const toRemove = serverList.filter(ca => !hypeSelected.includes(ca));
        await Promise.all([
          ...toAdd.map(ca => fetch(`${API_BASE}/api/user/hype`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, contractAddress: ca })
          })),
          ...toRemove.map(ca => fetch(`${API_BASE}/api/user/hype/${encodeURIComponent(ca)}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }))
        ]);
      } catch (_) {}
    })();
  }, [hypeSelected, user?.id]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      
      // Fetch user profile and watchlist
      const [profileResponse, watchlistResponse] = await Promise.all([
        fetch(`${API_BASE}/api/user/profile?sessionId=${sessionId}`),
        fetch(`${API_BASE}/api/user/watchlist?sessionId=${sessionId}`)
      ]);




      if (profileResponse.ok && watchlistResponse.ok) {
        const profileData = await profileResponse.json();
        const watchlistData = await watchlistResponse.json();
        

        
        const entries = Array.isArray(watchlistData.watchlist) ? watchlistData.watchlist : [];

        // Get premium status from user profile
        const isPremium = profileData.user?.isPremium || false;
        const premiumExpiry = profileData.user?.premiumExpiry || null;
        


        // Try to fetch leaderboard (premium feature)
        let leaderboard = [];
        let leaderboardError = null;


        try {

          const leaderboardData = await leaderboardService.getLeaderboard();

          
          if (leaderboardData && leaderboardData.success) {
            leaderboard = leaderboardData.leaderboard || [];

          } else {
            console.warn('🏆 Leaderboard response indicates failure:', leaderboardData);
            leaderboardError = leaderboardData?.error || 'Unknown error';
          }
        } catch (err) {
          console.error('🏆 Leaderboard fetch failed:', err);
          leaderboardError = err.message || 'Failed to fetch leaderboard';
          
          // Check if it's a premium-related error
          if (err.code === 'premium_required') {

            leaderboardError = null; // Don't show error for expected premium restriction
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
          leaderboardError: leaderboardError,
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
          leaderboardError: null,
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

    if (user && sessionId) {
      fetchDashboardData();
      loadDgoFollowers();
    } else {

      setLoading(false);
    }
  }, [user, sessionId, fetchDashboardData, loadDgoFollowers]);

  // Load KOL profile data when modal opens
  useEffect(() => {
    (async () => {
      if (!selectedKolUser) return;
      try {
        setKolLoading(true);
        const userId = selectedKolUser.userId || selectedKolUser.id;
        const [statsRes, callsRes] = await Promise.all([
          leaderboardService.getUserStats(userId),
          leaderboardService.getUserCalls(userId)
        ]);
        setKolStats(statsRes?.stats || null);
        setKolIsFollowing(!!statsRes?.isFollowing);
        setKolCalls(Array.isArray(callsRes?.calls) ? callsRes.calls : []);
      } catch (e) {
        console.error('Failed to load KOL profile', e);
        setKolStats(null);
        setKolCalls([]);
      } finally {
        setKolLoading(false);
      }
    })();
  }, [selectedKolUser]);

  // Load monthly winners from server-side endpoint
  useEffect(() => {
    (async () => {
      try {
        setWinnersLoading(true);
        const resp = await leaderboardService.getMonthlyWinners(seasonMonth, 3);
        setWinners(Array.isArray(resp?.winners) ? resp.winners : []);
      } catch (e) {
        console.error('Failed to compute monthly winners', e);
        setWinners([]);
      } finally {
        setWinnersLoading(false);
      }
    })();
  }, [seasonMonth]);

  // Load hype data when a token is selected
  useEffect(() => {
    (async () => {
      if (!selectedHypeToken?.contractAddress) {
        setHypeSeries([]);
        return;
      }


      
      try {
        const res = await hypeService.getHype(selectedHypeToken.contractAddress, hypeRange);

        setHypeSeries(res.data || []);
      } catch (e) {
        console.error('❌ Hype fetch error:', e);
        // @ts-ignore
        if (e && e.code === 'limit_exceeded') {
          const upgrade = window.confirm('🚀 ' + e.message + '\n\nWould you like to upgrade now?');
          if (upgrade && onNavigateToPremium) {
            onNavigateToPremium();
          }
          return;
        }
        setHypeSeries([]);
      }
    })();
  }, [selectedHypeToken, hypeRange, onNavigateToPremium]);

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
    dashboardData.isPremium ? {
      title: 'Premium',
      value: dashboardData.premiumExpiry ? (() => {
        const expiry = new Date(dashboardData.premiumExpiry);
        const now = new Date();
        const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        return `${daysLeft} days`;
      })() : 'Active',
      icon: Crown,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      isButton: false
    } : {
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
    <div className="min-h-screen bg-dark-bg p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          {/* Return to Main App Button */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 space-y-3 sm:space-y-0">
            <button 
              onClick={() => window.location.href = '/'}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-solana-purple/60 text-sm"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Return to Main App</span>
              <span className="sm:hidden">Back</span>
            </button>
            
            {/* Referral Code Display */}
            {dashboardData.referralCode && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                <div className="text-left sm:text-right">
                  <p className="text-gray-400 text-xs sm:text-sm">Your Referral Code</p>
                  <p className="text-white font-mono text-sm sm:text-lg">{dashboardData.referralCode}</p>
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?${new URLSearchParams({
                    text: `Here is my referral code ${dashboardData.referralCode} for a 1 month Premium subscription for DeGen Oracle. Spot the next cult before it goes viral and become a KOL.`,
                    url: `https://degen-oracle.com`
                  }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-transparent border border-solana-purple/60 text-gray-200 hover:bg-gray-700 rounded-lg text-xs sm:text-sm"
                  title="Share on X"
                >
                  Share on X
                </a>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3 sm:space-x-4 mb-4">
            {user?.profileImage ? (
              <img 
                src={user.profileImage} 
                alt={user?.displayName || 'User'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-solana-purple"
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-solana-purple rounded-full flex items-center justify-center border-2 border-solana-purple">
                <Users size={20} className="text-white sm:w-6 sm:h-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-3xl font-bold text-white truncate">{user?.displayName || 'User'}</h1>
              <p className="text-gray-400 text-sm sm:text-base">@{user?.username || 'unknown'}</p>
              {user?.verified && (
                <div className="flex items-center space-x-1 mt-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-blue-400 text-xs sm:text-sm">Verified</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
            <button 
              className="flex items-center space-x-2 hover:text-blue-400 transition-colors"
              onClick={() => setShowFollowersModal(true)}
              disabled={dgoFollowersLoading}
            >
              <Users size={16} />
              <span>{dgoFollowersLoading ? '...' : dgoFollowers.length} DGO followers</span>
            </button>
            <button 
              className="flex items-center space-x-2 hover:text-blue-400 transition-colors"
              onClick={() => setShowFollowingModal(true)}
              disabled={dgoFollowersLoading}
            >
              <Users size={16} />
              <span>{dgoFollowersLoading ? '...' : dgoFollowing.length} DGO following</span>
            </button>
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-dark-card border border-gray-700 rounded-lg p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-gray-400 text-xs sm:text-sm truncate">{stat.title}</p>
                  {stat.isButton ? (
                    <button onClick={stat.onClick} className="text-lg sm:text-2xl font-bold text-purple-400 mt-1 hover:text-purple-300 transition-colors">
                      {stat.value}
                    </button>
                  ) : (
                    <p className="text-lg sm:text-2xl font-bold text-white mt-1">{stat.value}</p>
                  )}
                </div>
                <div className={`p-2 sm:p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon size={20} className={`${stat.color} sm:w-6 sm:h-6`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Hype over Time - TOP LEFT */}
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <BarChart3 size={20} className="text-blue-400" />
                <h2 className="text-xl font-semibold text-white">Hype over Time</h2>
                <span className="text-xs text-gray-400">{`${Math.min(hypeSelected.length, 5)} / ${dashboardData.isPremium ? '∞' : '5'}`}</span>
              </div>
              <button
                onClick={() => setShowManageHype(true)}
                className="px-3 py-1 text-sm rounded border border-solana-purple/60 text-white hover:bg-gray-700"
              >
                + Manage Hype List
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">View hype trends for the tokens in your watchlist across multiple time ranges.</p>
            {/* Inline Hype list (reuse existing modal content) */}
            <div className="mt-2">
              {(() => {
                const perPage = 8;
                const visible = dashboardData.watchlist.filter(t => {
                  if (dashboardData.isPremium) return hypeSelected.length ? hypeSelected.includes(t.contractAddress) : true;
                  // free users: only show ones explicitly selected up to 5
                  return hypeSelected.includes(t.contractAddress);
                });
                const total = visible.length;
                const totalPages = Math.max(1, Math.ceil(total / perPage));
                const currentPage = Math.min(hypePage, totalPages - 1);
                const start = currentPage * perPage;
                const pageItems = visible.slice(start, start + perPage);
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
                              // remove only from hype selection
                              setHypeSelected(prev => prev.filter(ca => ca !== token.contractAddress));
                            } catch (err) {
                              console.error('Failed to remove from watchlist:', err);
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <BarChart3 size={20} className="text-green-400" />
                <h2 className="text-xl font-semibold text-white">KOL Leaderboard</h2>
                {!dashboardData.isPremium && (
                  <Crown size={16} className="text-yellow-400" title="Premium Feature" />
                )}
              </div>
              <button
                onClick={() => setShowLeaderboardGuide(true)}
                className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                title="How KOL Leaderboard Works"
              >
                <HelpCircle size={14} />
                Help
              </button>
            </div>
            {dashboardData.isPremium && (
              <div className="flex items-center gap-2 mb-4 text-sm">
                <button
                  onClick={() => setSeasonMonth(new Date().toISOString().slice(0,7))}
                  className={`px-2 py-1 rounded border ${seasonMonth === new Date().toISOString().slice(0,7) ? 'bg-purple-600 border-purple-500 text-white' : 'bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                >This Month</button>
                <button
                  onClick={() => { const d = new Date(); d.setMonth(d.getMonth()-1); setSeasonMonth(d.toISOString().slice(0,7)); }}
                  className="px-2 py-1 rounded border bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700"
                >Last Month</button>
                <input type="month" value={seasonMonth} onChange={(e)=>setSeasonMonth(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 ml-auto" />
              </div>
            )}
            {dashboardData.isPremium && (() => {
              const currentMonth = new Date().toISOString().slice(0,7);
              const showWinners = seasonMonth !== currentMonth && winners.length > 0;
              return showWinners ? (
                <div className="mb-3 p-2 rounded border border-gray-700 bg-gray-800/40">
                  <div className="flex items-center gap-2 mb-1">
                    <Award size={14} className="text-yellow-400" />
                    <span className="text-white font-medium text-sm">Winners {seasonMonth}</span>
                    {winnersLoading && <span className="text-gray-400 text-xs">computing…</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {winners.map((w, i) => (
                      <button key={w.userId || i} onClick={()=>setSelectedKolUser(w)} className="p-2 rounded bg-gray-800/60 border border-gray-700 hover:bg-gray-800 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-semibold text-sm">#{i+1}</span>
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded ${i===0?'bg-yellow-500':i===1?'bg-gray-400':'bg-amber-700'}`}></span>
                          <span className="text-white font-medium text-sm truncate">{w.displayName}</span>
                          <span className="text-blue-400 text-[11px] truncate">@{w.username}</span>
                        </div>
                        <div className="text-[11px] text-gray-300 flex gap-2">
                          <span>Calls: {w.callCount}</span>
                          <span>Median X: {w.medianX.toFixed(1)}x</span>
                          <span>Hit: {(w.hitRate*100).toFixed(0)}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
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
              ) : dashboardData.leaderboardError ? (
                <div className="text-center py-8">
                  <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
                  <p className="text-red-400 mb-2">Leaderboard Error</p>
                  <p className="text-gray-400 text-sm">{dashboardData.leaderboardError}</p>
                  <button
                    onClick={fetchDashboardData}
                    className="mt-4 px-4 py-2 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg hover:bg-red-600/30 transition-all text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : dashboardData.kolLeaderboard.length > 0 ? (
                dashboardData.kolLeaderboard.slice(0, 10).map((kol, index) => {
                  const rank = kol.rank || (index + 1);
                  const trophy = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
                  const trophyClass = trophy === 'gold' ? 'text-yellow-400' : trophy === 'silver' ? 'text-gray-300' : 'text-amber-700';
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedKolUser(kol)}
                      className="w-full flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-left"
                      title="View profile"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center border border-gray-600">
                          <span className="text-white text-xs font-bold">#{rank}</span>
                        </div>
                        {kol.profileImage ? (
                          <img src={kol.profileImage} alt={kol.displayName || kol.username} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-bold">{(kol.displayName || kol.username || '?').slice(0,1).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{kol.displayName}</p>
                            {trophy && <Award size={16} className={trophyClass} />}
                          </div>
                          <p className="text-blue-400 text-sm font-medium">@{kol.username}</p>
                          <div className="flex items-center space-x-4 text-xs text-gray-400">
                            <span>{kol.callCount} calls</span>
                            <span>Hit Rate: {(kol.metrics?.hitRate * 100 || 0).toFixed(1)}%</span>
                            <span>Median X: {kol.metrics?.medianX?.toFixed(1) || 'N/A'}x</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold text-lg">{kol.score}</p>
                        <p className="text-gray-400 text-sm">Efficiency: {kol.efficiency?.toFixed(2) || 'N/A'}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <Award size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No KOL leaderboard data</p>
                  <p className="text-gray-500 text-sm">KOL rankings will appear here once users make calls</p>
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

        {/* Manage Hype List Modal */}
        {showManageHype && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-bg border border-gray-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-white text-lg font-semibold">Manage Hype List</h3>
                <button className="text-gray-400 hover:text-white" onClick={() => setShowManageHype(false)}>✕</button>
              </div>
              <div className="p-4">
                <p className="text-gray-400 text-sm mb-3">Select tokens from your watchlist to include in Hype over Time.</p>
                <div className="text-xs text-gray-500 mb-4">Selected: {Math.min(hypeSelected.length, 5)} / {dashboardData.isPremium ? 'Unlimited' : '5'}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboardData.watchlist.map((t, i) => {
                    const selected = hypeSelected.includes(t.contractAddress);
                    const atLimit = !dashboardData.isPremium && !selected && hypeSelected.length >= 5;
                    return (
                      <label key={`${t.contractAddress || t.symbol}-${i}`} className={`flex items-center justify-between p-3 rounded border ${selected ? 'border-blue-500 bg-blue-900/10' : 'border-gray-600 bg-gray-800/40'} ${atLimit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <div>
                          <div className="text-white font-medium">{t.symbol}</div>
                          <div className="text-gray-400 text-xs">{t.name}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={atLimit}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setHypeSelected(prev => {
                              if (checked) {
                                if (dashboardData.isPremium) return Array.from(new Set([...prev, t.contractAddress]));
                                if (prev.length >= 5) return prev; // guard
                                return Array.from(new Set([...prev, t.contractAddress]));
                              } else {
                                return prev.filter(ca => ca !== t.contractAddress);
                              }
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button className="px-3 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-700" onClick={() => setShowManageHype(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KOL Profile Modal */}
        {selectedKolUser && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-gray-700 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedKolUser.profileImage ? (
                    <img src={selectedKolUser.profileImage} alt={selectedKolUser.displayName || selectedKolUser.username} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{(selectedKolUser.displayName || selectedKolUser.username || '?').slice(0,1).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white text-lg font-semibold">{selectedKolUser.displayName}</h3>
                      <span className="text-gray-400 text-sm">@{selectedKolUser.username}</span>
                    </div>
                    <div className="text-xs text-gray-400 flex gap-3 mt-1">
                      <span>Rank #{selectedKolUser.rank || '-'}</span>
                      <span>Score {selectedKolUser.score}</span>
                      <span>Calls {selectedKolUser.callCount}</span>
                    </div>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-white" onClick={() => setSelectedKolUser(null)}>✕</button>
              </div>
              <KolProfile
                kol={selectedKolUser}
                onClose={() => setSelectedKolUser(null)}
                stats={kolStats}
                calls={kolCalls}
                loading={kolLoading}
                isFollowing={kolIsFollowing}
                onToggleFollow={async () => {
                  if (!selectedKolUser) return;
                  
                  // Prevent self-following
                  if (selectedKolUser.userId === user?.id || selectedKolUser.id === user?.id) {
                    alert('You cannot follow yourself!');
                    return;
                  }
                  
                  try {
                    setKolFollowBusy(true);
                    if (kolIsFollowing) {
                      await leaderboardService.unfollow(selectedKolUser.userId || selectedKolUser.id);
                      setKolIsFollowing(false);
                    } else {
                      await leaderboardService.follow(selectedKolUser.userId || selectedKolUser.id);
                      setKolIsFollowing(true);
                    }
                  } catch (e) {
                    console.error('Follow toggle failed', e);
                    alert('Failed to update follow state');
                  } finally {
                    setKolFollowBusy(false);
                  }
                }}
                followBusy={kolFollowBusy}
              />
            </div>
          </div>
        )}

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
                      onClick={async () => {
                        try {
                          // Fetch complete token data from API for watchlist tokens
                          const response = await fetch(`${API_BASE}/api/tokens/${token.contractAddress}`);
                          if (response.ok) {
                            const data = await response.json();
                            if (data.success && data.token) {
                              setSelectedToken(data.token);
                              return;
                            }
                          }
                        } catch (error) {
                          console.warn('Failed to fetch complete token data, using stored data:', error);
                        }
                        // Fallback to stored watchlist data if API fails
                        setSelectedToken(token);
                      }}
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
                <div className="flex items-center gap-2">

                  {dashboardData.isPremium ? (
                    <button
                      onClick={async () => {



                        setHypeAILoading(true);
                        try {
                          const response = await fetch(`${API_BASE}/api/hype-trend/${selectedHypeToken.contractAddress}?range=${hypeRange}`);
                          const data = await response.json();
                          
                          if (data.success) {

                            setHypeAIData(data);
                            setShowHypeAI(true);
                          } else {
                            alert(data.message || 'Failed to analyze hype trend');
                          }
                        } catch (error) {
                          console.error('Hype trend analysis error:', error);
                          alert('Failed to analyze hype trend');
                        } finally {
                          setHypeAILoading(false);
                        }
                      }}
                      disabled={hypeAILoading}
                      className="flex items-center gap-1 px-3 py-1 bg-transparent border border-solana-purple/60 text-gray-200 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
                      title="Oracle AI"
                    >
                      <Brain size={16} />
                      {hypeAILoading ? 'Analyzing...' : 'Oracle AI'}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1 px-3 py-1 bg-gray-800/50 border border-gray-600 text-gray-500 rounded text-sm cursor-not-allowed opacity-60"
                      title="Oracle AI only available on Premium"
                    >
                      <Brain size={16} />
                      Oracle AI
                    </button>
                  )}
                  <button onClick={() => setSelectedHypeToken(null)} className="text-gray-400 hover:text-white">✕</button>
                </div>
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
                <div>
                  {(() => {
                    // Show the freshest available status (most recent data from hype series)
                    if (hypeSeries.length > 0) {
                      const latestHypeData = hypeSeries[hypeSeries.length - 1];
                      const latestScore = latestHypeData.score || 0;
                      
                      const latestLabel = latestHypeData.label || getStatusFromScore(latestScore).level;
                      const emoji = getStatusFromScore(latestScore).icon;
                      
                      // Show timestamp of when this data was captured
                      const dataTime = new Date(latestHypeData.timestamp).toLocaleTimeString();
                      const timeAgo = Math.round((Date.now() - new Date(latestHypeData.timestamp).getTime()) / (1000 * 60)); // minutes ago
                      
                      return `Current: ${latestLabel} ${emoji} (${timeAgo}m ago)`;
                    } else {
                      // Fallback to token data if no hype series available
                      const currentScore = selectedHypeToken?.overallScore || selectedHypeToken?.enhancedScore || selectedHypeToken?.score || 0;
                      const currentLabel = getStatusFromScore(currentScore).level;
                      const emoji = getStatusFromScore(currentScore).icon;
                      
                      return `Current: ${currentLabel} ${emoji} (from token data)`;
                    }
                  })()}
                </div>
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

        {/* Hype AI Analysis Modal */}
        {showHypeAI && hypeAIData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <Brain size={24} className="text-purple-400" />
                  <h2 className="text-xl font-semibold text-white">Hype Trend Analysis</h2>
                  <span className="text-sm text-gray-400">• {selectedHypeToken?.symbol}</span>
                </div>
                <button onClick={() => setShowHypeAI(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {/* Current Regime */}
              <div className="mb-6 p-4 bg-gradient-to-r from-gray-800/50 to-gray-800/30 rounded-lg border border-gray-700 shadow-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-gray-700/50 rounded-full">
                    <span className="text-2xl">{hypeAIData.analysis?.regime?.emoji}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white capitalize">{hypeAIData.analysis?.regime?.type || 'Unknown'} Regime</h3>
                      <Gauge size={16} className="text-gray-400" />
                    </div>
                    <p className="text-gray-400 text-sm">{hypeAIData.analysis?.regime?.description || 'No description available'}</p>
                  </div>
                </div>
                
                <div className="relative">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 relative">
                      <span className="text-gray-400">Strength:</span>
                      <Info 
                        size={14} 
                        className="text-gray-500 cursor-help"
                        onMouseEnter={() => setHoveredTooltip('strength')}
                        onMouseLeave={() => setHoveredTooltip(null)}
                      />
                      
                      {/* Tooltip */}
                      {hoveredTooltip === 'strength' && (
                        <div className="bubble-tooltip absolute bottom-full left-0 mb-2 z-50">
                          <div className="text-xs leading-tight">
                            <span className="font-semibold text-white">{getTooltipContent('strength').title}:</span>
                            <span className="text-gray-300 ml-1">{getTooltipContent('strength').description}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-gray-700 rounded-full h-3 shadow-inner">
                      <div 
                        className="h-3 rounded-full transition-all duration-500 shadow-sm"
                        style={{ 
                          width: `${(hypeAIData.analysis?.regime?.strength || 0.5) * 100}%`,
                          backgroundColor: hypeAIData.analysis?.regime?.color || '#6b7280',
                          boxShadow: `0 0 8px ${hypeAIData.analysis?.regime?.color || '#6b7280'}40`
                        }}
                      ></div>
                    </div>
                    <span className="text-white font-medium">{((hypeAIData.analysis?.regime?.strength || 0.5) * 100).toFixed(0)}%</span>
                  </div>
                  
                  {/* Pro Tip */}
                  <div className="mt-3 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs">
                    <div className="flex items-center gap-1 text-blue-400 font-medium mb-1">
                      <Info size={12} />
                      💡 PRO TIP:
                    </div>
                    <p className="text-gray-300">
                      Look for <span className="text-green-400 font-medium">70%+ strength</span> for high-confidence signals. 
                      At <span className="text-yellow-400 font-medium">{((hypeAIData.analysis?.regime?.strength || 0.5) * 100).toFixed(0)}%</span>, the AI is saying 
                      <span className="text-white font-medium"> "I think it's {hypeAIData.analysis?.regime?.type || 'unknown'}, but {(hypeAIData.analysis?.regime?.strength || 0.5) >= 0.7 ? 'I\'m confident!' : 'be cautious!'}"</span>
                    </p>
                  </div>
                </div>
              </div>


              {/* Technical Analysis Section */}
              {hypeAIData.analysis?.technicalIndicators && (
                <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/30 to-blue-800/20 rounded-lg border border-blue-700/50 shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-700/50 rounded-full">
                      <Gauge size={20} className="text-blue-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">Technical Analysis</h3>
                      <p className="text-blue-300 text-sm">EWMA + Derivative + Bayesian Analysis</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* EWMA Analysis */}
                    {hypeAIData.analysis?.technicalIndicators?.ewma && (
                      <div className="p-3 bg-gray-800/50 rounded border border-gray-600/50">
                        <h4 className="text-blue-400 text-sm font-medium mb-2">📈 EWMA (Trend Smoothing)</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Score EWMA:</span>
                            <span className="text-white font-medium">
                              {hypeAIData.analysis?.technicalIndicators?.ewma?.currentScore?.toFixed(2) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Mention EWMA:</span>
                            <span className="text-white font-medium">
                              {hypeAIData.analysis?.technicalIndicators?.ewma?.currentMentions?.toFixed(2) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Trend:</span>
                            <span className={`font-medium ${
                              hypeAIData.analysis?.technicalIndicators?.ewma?.trend === 'rising' ? 'text-green-400' :
                              hypeAIData.analysis?.technicalIndicators?.ewma?.trend === 'falling' ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.ewma?.trend || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Momentum:</span>
                            <span className="text-white font-medium">
                              {hypeAIData.analysis?.technicalIndicators?.ewma?.momentum?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Derivative Analysis */}
                    {hypeAIData.analysis?.technicalIndicators?.derivative && (
                      <div className="p-3 bg-gray-800/50 rounded border border-gray-600/50">
                        <h4 className="text-green-400 text-sm font-medium mb-2">⚡ Derivative (Rate of Change)</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Score Derivative:</span>
                            <span className={`font-medium ${
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.scoreDerivative || 0) > 0 ? 'text-green-400' :
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.scoreDerivative || 0) < 0 ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.derivative?.scoreDerivative?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Mention Derivative:</span>
                            <span className={`font-medium ${
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.mentionDerivative || 0) > 0 ? 'text-green-400' :
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.mentionDerivative || 0) < 0 ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.derivative?.mentionDerivative?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Velocity:</span>
                            <span className={`font-medium ${
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.velocity || 0) > 0 ? 'text-green-400' :
                              (hypeAIData.analysis?.technicalIndicators?.derivative?.velocity || 0) < 0 ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.derivative?.velocity?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Accelerating:</span>
                            <span className={`font-medium ${
                              hypeAIData.analysis?.technicalIndicators?.derivative?.isAccelerating ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.derivative?.isAccelerating ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bayesian Change Points */}
                    {hypeAIData.analysis?.technicalIndicators?.changePoints && (
                      <div className="p-3 bg-gray-800/50 rounded border border-gray-600/50">
                        <h4 className="text-purple-400 text-sm font-medium mb-2">🎯 Bayesian Change Points</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Change Points:</span>
                            <span className="text-white font-medium">
                              {hypeAIData.analysis?.technicalIndicators?.changePoints?.length || 0}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Recent Change:</span>
                            <span className={`font-medium ${
                              hypeAIData.analysis?.technicalIndicators?.changePoints?.hasRecentChange ? 'text-yellow-400' : 'text-gray-400'
                            }`}>
                              {hypeAIData.analysis?.technicalIndicators?.changePoints?.hasRecentChange ? 'Yes' : 'No'}
                            </span>
                          </div>
                          {hypeAIData.analysis?.technicalIndicators?.changePoints?.hasRecentChange && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Direction:</span>
                              <span className={`font-medium ${
                                hypeAIData.analysis?.technicalIndicators?.changePoints?.changeDirection === 'upturn' ? 'text-green-400' :
                                hypeAIData.analysis?.technicalIndicators?.changePoints?.changeDirection === 'downturn' ? 'text-red-400' :
                                'text-gray-400'
                              }`}>
                                {hypeAIData.analysis?.technicalIndicators?.changePoints?.changeDirection || 'Unknown'}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400">Confidence:</span>
                            <span className="text-white font-medium">
                              {hypeAIData.confidence ? `${(hypeAIData.confidence * 100).toFixed(1)}%` : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Why Bearish/Bullish? Explainer */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={16} className="text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Why {hypeAIData.analysis?.trend === 'bearish' ? 'Bearish' : hypeAIData.analysis?.trend === 'bullish' ? 'Bullish' : 'Neutral'}?</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const chips = [];
                    const ewma = hypeAIData.analysis?.technicalIndicators?.ewma || {};
                    const deriv = hypeAIData.analysis?.technicalIndicators?.derivative || {};
                    const cp = hypeAIData.analysis?.technicalIndicators?.changePoints || {};
                    const liquidity = selectedHypeToken?.jupiterData?.liquidity || 0;
                    const price24h = selectedHypeToken?.jupiterData?.stats24h?.priceChange ?? selectedHypeToken?.priceChange24h ?? null;

                    // Bearish drivers
                    if (hypeAIData.analysis?.trend === 'bearish') {
                      if (deriv.velocity < 0) chips.push({ type: 'bearish', text: 'Mentions velocity falling', tip: 'Rate of change is negative; momentum is decelerating' });
                      if (deriv.acceleration < 0) chips.push({ type: 'bearish', text: 'Acceleration negative', tip: 'Momentum weakening over time (second derivative < 0)' });
                      if (ewma.trend === 'falling') chips.push({ type: 'bearish', text: 'EWMA trend down', tip: 'EWMA shows recent momentum below historical' });
                      if (cp.hasRecentChange && cp.changeDirection === 'downturn') chips.push({ type: 'bearish', text: 'Change-point: downturn', tip: 'Recent statistical regime shift to downside' });
                      if (typeof price24h === 'number' && price24h <= -30) chips.push({ type: 'risk', text: `24h price ${price24h.toFixed(0)}%`, tip: 'Large drawdown increases fade risk' });
                      if (liquidity > 0 && liquidity < 25000) chips.push({ type: 'risk', text: `Low liquidity $${Math.round(liquidity).toLocaleString()}`, tip: 'Thin books amplify downside/volatility' });
                    }

                    // Bullish drivers
                    if (hypeAIData.analysis?.trend === 'bullish') {
                      if (deriv.velocity > 0) chips.push({ type: 'bullish', text: 'Mentions velocity rising', tip: 'Momentum increasing (rate of change > 0)' });
                      if (deriv.acceleration > 0) chips.push({ type: 'bullish', text: 'Acceleration positive', tip: 'Momentum strengthening (second derivative > 0)' });
                      if (ewma.trend === 'rising') chips.push({ type: 'bullish', text: 'EWMA trend up', tip: 'Recent momentum above historical baseline' });
                      if (cp.hasRecentChange && cp.changeDirection === 'upturn') chips.push({ type: 'bullish', text: 'Change-point: upturn', tip: 'Recent statistical shift to upside' });
                      if (liquidity >= 25000) chips.push({ type: 'bullish', text: `Healthy liquidity $${Math.round(liquidity).toLocaleString()}`, tip: 'Deeper liquidity supports sustained moves' });
                    }

                    // Neutral or fallback
                    if (chips.length === 0) {
                      chips.push({ type: 'neutral', text: 'Mixed signals', tip: 'Indicators do not align strongly; consolidation likely' });
                    }

                    const iconFor = (t) => t === 'bullish' ? <CheckCircle size={12} /> : t === 'bearish' ? <AlertTriangle size={12} /> : <Info size={12} />;
                    const styleFor = (t) => t === 'bullish' ? 'bg-green-900/20 border-green-700 text-green-300' : t === 'bearish' ? 'bg-red-900/20 border-red-700 text-red-300' : 'bg-gray-800/40 border-gray-700 text-gray-300';

                    return chips.map((c, i) => (
                      <div
                        key={i}
                        className="relative inline-block"
                        onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                        onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${styleFor(c.type)}`}
                        >
                          {iconFor(c.type)}
                          {c.text}
                        </span>
                        <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50" style={{ display: 'none' }}>
                          <div className="text-xs leading-tight">
                            <span className="font-semibold text-white">{c.text}:</span>
                            <span className="text-gray-300 ml-1">{c.tip}</span>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Forecast */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="p-4 bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-lg border border-gray-700 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gray-700/50 rounded-full">
                      <span className="text-2xl">{hypeAIData.analysis?.direction || '➡️'}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Prediction</h3>
                    {hypeAIData.analysis?.trend === 'bullish' && <TrendingUp size={16} className="text-green-400" />}
                    {hypeAIData.analysis?.trend === 'bearish' && <TrendingDown size={16} className="text-red-400" />}
                    {hypeAIData.analysis?.trend === 'sideways' && <Activity size={16} className="text-gray-400" />}
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Trend:</span>
                      <span className={`font-medium flex items-center gap-1 ${
                        hypeAIData.analysis?.trend === 'bullish' ? 'text-green-400' :
                        hypeAIData.analysis?.trend === 'bearish' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {hypeAIData.analysis?.trend || 'sideways'}
                        {hypeAIData.analysis?.trend === 'bullish' && '📈'}
                        {hypeAIData.analysis?.trend === 'bearish' && '📉'}
                        {hypeAIData.analysis?.trend === 'sideways' && '➡️'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center relative">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">Confidence:</span>
                        <Info 
                          size={12} 
                          className="text-gray-500 cursor-help"
                          onMouseEnter={() => setHoveredTooltip('confidence')}
                          onMouseLeave={() => setHoveredTooltip(null)}
                        />
                        {hoveredTooltip === 'confidence' && (
                          <div className="bubble-tooltip absolute bottom-full left-0 mb-2 z-50">
                            <div className="text-xs leading-tight">
                              <span className="font-semibold text-white">{getTooltipContent('confidence').title}:</span>
                              <span className="text-gray-300 ml-1">{getTooltipContent('confidence').description}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-white font-medium">{((hypeAIData.analysis?.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-gray-400" />
                        <span className="text-gray-400">Time Horizon:</span>
                      </div>
                      <span className="text-white">{hypeAIData.forecast?.[0]?.timeOffset || '6-12h'}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-lg border border-gray-700 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gray-700/50 rounded-full">
                      {hypeAIData.analysis?.recommendation?.action === 'BULLISH' && <CheckCircle size={20} className="text-green-400" />}
                      {hypeAIData.analysis?.recommendation?.action === 'BEARISH' && <AlertTriangle size={20} className="text-red-400" />}
                      {hypeAIData.analysis?.recommendation?.action === 'NEUTRAL' && <Info size={20} className="text-gray-400" />}
                    </div>
                    <h3 className="text-lg font-semibold text-white">Recommendation</h3>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm ${
                        hypeAIData.analysis?.recommendation?.action === 'BULLISH' ? 'bg-green-600 text-white shadow-green-600/20' :
                        hypeAIData.analysis?.recommendation?.action === 'BEARISH' ? 'bg-red-600 text-white shadow-red-600/20' :
                        'bg-gray-600 text-white shadow-gray-600/20'
                      }`}>
                        {hypeAIData.analysis?.recommendation?.action || 'NEUTRAL'}
                      </span>
                      <span className="text-gray-400 text-xs">Risk: <span className="text-white">{hypeAIData.analysis?.recommendation?.riskLevel || 'medium'}</span></span>
                    </div>
                    <div className="p-2 bg-gray-700/30 rounded border-l-2 border-blue-500">
                      <p className="text-gray-300 text-sm">{hypeAIData.analysis?.recommendation?.message || 'No recommendation message available'}</p>
                    </div>
                    <p className="text-gray-400 text-xs italic">{hypeAIData.analysis?.recommendation?.reasoning || 'No reasoning available'}</p>
                  </div>
                </div>
              </div>

              {/* Forecast Section */}
              {hypeAIData.analysis?.forecast && hypeAIData.analysis.forecast.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-gray-800/50 to-gray-800/30 rounded-lg border border-gray-700 shadow-lg">
                  <div className="flex items-center gap-2 mb-3 relative">
                    <div className="p-2 bg-gray-700/50 rounded-full">
                      <Clock size={18} className="text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">6-12h Hype Score Forecast</h3>
                    <Info 
                      size={14} 
                      className="text-gray-500 cursor-help"
                      onMouseEnter={() => setHoveredTooltip('forecast')}
                      onMouseLeave={() => setHoveredTooltip(null)}
                    />
                    {hoveredTooltip === 'forecast' && (
                      <div className="bubble-tooltip absolute top-full left-0 mt-2 z-50">
                        <div className="text-xs leading-tight">
                          <span className="font-semibold text-white">{getTooltipContent('forecast').title}:</span>
                          <span className="text-gray-300 ml-1">{getTooltipContent('forecast').description}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {hypeAIData.analysis.forecast.map((point, index) => (
                      <div key={index} className="text-center p-3 bg-gradient-to-b from-gray-700/50 to-gray-700/30 rounded-lg border border-gray-600/50 shadow-sm">
                        <div className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                          <Clock size={10} />
                          {point.timeOffset}
                        </div>
                        <div className="text-lg font-semibold text-white mb-1">{point.predictedScore}</div>
                        <div className="text-xs text-gray-500">{(point.confidence * 100).toFixed(0)}% conf.</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signals */}
              {hypeAIData.analysis?.signals && hypeAIData.analysis.signals.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Signals</h3>
                  <div className="space-y-2">
                    {hypeAIData.analysis.signals.map((signal, index) => (
                      <div key={index} className={`p-3 rounded-lg border ${
                        signal.type === 'bullish' ? 'bg-green-900/20 border-green-700' :
                        signal.type === 'bearish' ? 'bg-red-900/20 border-red-700' :
                        'bg-gray-800/50 border-gray-700'
                      }`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-medium">{signal.message}</p>
                            <p className="text-gray-400 text-sm">{signal.action}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            signal.strength === 'strong' ? 'bg-orange-600 text-white' :
                            signal.strength === 'medium' ? 'bg-yellow-600 text-white' :
                            'bg-gray-600 text-white'
                          }`}>
                            {signal.strength}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
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

        {/* DGO Followers Modal */}
        {showFollowersModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-white font-semibold">DGO Followers</h3>
                <button 
                  onClick={() => setShowFollowersModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {dgoFollowersLoading ? (
                  <div className="text-gray-400 text-center">Loading...</div>
                ) : dgoFollowers.length > 0 ? (
                  <div className="space-y-2">
                    {dgoFollowers.map((follower, index) => {
                      const userId = follower.id || follower;
                      const userIdStr = String(userId || 'unknown');
                      const username = `user_${userIdStr.slice(-6)}`;
                      const displayName = `User ${userIdStr.slice(-6)}`;
                      
                      return (
                        <button
                          key={userId || index}
                          className="w-full flex items-center space-x-3 p-2 rounded hover:bg-gray-800 transition-colors"
                          onClick={async () => {
                            try {
                              const profile = await leaderboardService.getUserProfile(userId);
                              const basic = profile?.user || { 
                                id: userId, 
                                username: username, 
                                displayName: displayName 
                              };
                              setSelectedKolUser({
                                id: userId,
                                userId: userId,
                                username: basic.username,
                                displayName: basic.displayName,
                                profileImage: basic.profileImage || null,
                                rank: undefined,
                                score: undefined,
                                callCount: undefined
                              });
                              setShowFollowersModal(false);
                            } catch (error) {
                              console.error('Failed to load user profile:', error);
                            }
                          }}
                        >
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{String(userId).slice(-2).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium">@{username}</div>
                            <div className="text-gray-400 text-sm">{displayName}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">No followers yet</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DGO Following Modal */}
        {showFollowingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-white font-semibold">DGO Following</h3>
                <button 
                  onClick={() => setShowFollowingModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {dgoFollowersLoading ? (
                  <div className="text-gray-400 text-center">Loading...</div>
                ) : dgoFollowingUsers.length > 0 ? (
                  <div className="space-y-2">
                    {dgoFollowingUsers.map((user, index) => {
                      const userId = user.id;
                      const username = user.username || `user_${String(userId).slice(-6)}`;
                      const displayName = user.displayName || `User ${String(userId).slice(-6)}`;
                      const profileImage = user.profileImage;
                      
                      return (
                        <button
                          key={userId || index}
                          className="w-full flex items-center space-x-3 p-2 rounded hover:bg-gray-800 transition-colors"
                          onClick={async () => {
                            try {
                              setSelectedKolUser({
                                id: userId,
                                userId: userId,
                                username: username,
                                displayName: displayName,
                                profileImage: profileImage || null,
                                rank: undefined,
                                score: undefined,
                                callCount: undefined
                              });
                              setShowFollowingModal(false);
                            } catch (error) {
                              console.error('Failed to load user profile:', error);
                            }
                          }}
                        >
                          {profileImage ? (
                            <img 
                              src={profileImage} 
                              alt={displayName} 
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">{String(userId).slice(-2).toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium">@{username}</div>
                            <div className="text-gray-400 text-sm">{displayName}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">Not following anyone yet</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* KOL Leaderboard Guide */}
        {showLeaderboardGuide && (
          <KOLLeaderboardGuide
            onClose={() => setShowLeaderboardGuide(false)}
          />
        )}
        
        {/* AI Chat Modal */}
        <AIChatModal
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
          initialPosition={chatPosition}
        />
        
        {/* Floating Chat Button */}
        <FloatingChatButton onOpenChat={handleOpenChat} />
      </div>
    </div>
  );
};

export default UserDashboard;

// KOL Profile content
function KolProfile({ kol, stats, calls, loading, isFollowing, onToggleFollow, followBusy, onClose }) {
  return (
    <div>
      <div className="p-4">
        {loading ? (
          <div className="text-gray-400 text-sm">Loading profile…</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700 text-gray-300">Total Calls: {Array.isArray(calls) ? calls.length : (stats?.totalCalls ?? 0)}</span>
              <span className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700 text-gray-300">30d Calls: {stats?.recentCalls30d ?? 0}</span>
              <span className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700 text-gray-300">Hit Rate: {((stats?.hitRate || 0) * 100).toFixed(1)}%</span>
              <span className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700 text-gray-300">Median X: {stats?.medianX ? stats.medianX.toFixed(2) : 'N/A'}x</span>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-gray-400 text-sm">
                Followers: {Array.isArray(stats?.follows?.followers) ? stats.follows.followers.length : 0} · Following: {Array.isArray(stats?.follows?.following) ? stats.follows.following.length : 0}
              </div>
              <button
                onClick={onToggleFollow}
                disabled={followBusy}
                className={`px-3 py-2 rounded border text-sm ${isFollowing ? 'border-red-500 text-red-300 hover:bg-red-500/10' : 'border-blue-500 text-blue-300 hover:bg-blue-500/10'} ${followBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {isFollowing ? (followBusy ? 'Unfollowing…' : 'Unfollow') : (followBusy ? 'Following…' : 'Follow')}
              </button>
            </div>

            <div className="mt-6">
              <h4 className="text-white font-semibold mb-3">
                Recent Calls {Array.isArray(calls) && calls.length > 0 && `(${calls.length})`}
              </h4>
              {Array.isArray(calls) && calls.length > 0 ? (
                <div className="divide-y divide-gray-700 border border-gray-700 rounded">
                  {calls.slice().reverse().slice(0, 20).map((c, i) => (
                    <div key={c.id || i} className="p-3 text-sm flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{c.token?.symbol || 'UNKNOWN'} <span className="text-gray-400">• {c.token?.name}</span></div>
                        <div className="text-gray-400">{new Date(c.calledAt || c.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-gray-300">Called MC: ${Number(c.calledMc || c.calledMC || 0).toLocaleString()}</div>
                        {Number(c.athMC) > 0 && Number(c.calledMc || c.calledMC || 0) > 0 && (() => {
                          const athMultiple = Number(c.athMC) / Number(c.calledMc || c.calledMC);
                          const athClass = athMultiple >= 2 ? 'text-green-400 font-semibold' : 
                                         athMultiple >= 1.5 ? 'text-green-300' : 
                                         athMultiple >= 1 ? 'text-yellow-400' : 
                                         athMultiple >= 0.5 ? 'text-orange-400' : 'text-red-400';
                          return (
                            <div className={`${athClass} font-medium`}>
                              ATH since call: {athMultiple.toFixed(2)}× 
                              <span className="text-gray-500 ml-1">(${Number(c.athMC).toLocaleString()})</span>
                            </div>
                          );
                        })()}
                        {typeof c.maxDrawdownPct === 'number' && (
                          <div className={`text-sm ${c.maxDrawdownPct < 0 ? 'text-red-400' : 'text-gray-300'}`}>Max Drawdown: {c.maxDrawdownPct.toFixed(2)}%</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No calls yet</div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="p-4 border-t border-gray-700 flex items-center justify-end gap-2">
        <button className="px-3 py-2 bg-transparent border border-gray-600 text-gray-200 hover:bg-gray-700 rounded" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

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
    { y: yScale(6), h: yScale(8) - yScale(6), color: 'rgba(59,130,246,0.10)', label: 'Trending (6.0-7.9)' },
    { y: yScale(4), h: yScale(6) - yScale(4), color: 'rgba(234,179,8,0.10)', label: 'Building (4.0-5.9)' },
    { y: yScale(0), h: yScale(4) - yScale(0), color: 'rgba(148,163,184,0.10)', label: 'Sleeping (<4.0)' }
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
