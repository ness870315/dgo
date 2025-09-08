import React, { useState, useEffect } from 'react';
import { X, Twitter, MessageCircle, ExternalLink, Star, Flame, Brain } from 'lucide-react';
import kolCallsService from '../services/kolCallsService';
import watchlistService from '../services/watchlistService';
import priorityService from '../services/priorityService';
import { useAuth } from '../contexts/AuthContext';

const TokenDetails = ({ token, fueledTokens = [], onClose, onNavigateToPremium }) => {
  const { isAuthenticated } = useAuth();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [selectedFuel, setSelectedFuel] = useState(null);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [fuelMessage, setFuelMessage] = useState({ text: '', type: '' });
  const [contractValidated, setContractValidated] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [callRecorded, setCallRecorded] = useState(false);
  
  // AI Analysis states
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Check if token is fueled and get fuel multiplier
  const getFuelMultiplier = () => {
    if (!token?.symbol || !fueledTokens?.length) return null;
    
    // Handle both array and wrapped object structure
    const fueledArray = Array.isArray(fueledTokens) ? fueledTokens : (fueledTokens.value || []);
    
    const fueledToken = fueledArray.find(fuel => 
      fuel.symbol?.toLowerCase() === token.symbol?.toLowerCase()
    );
    
    if (fueledToken) {
      // Extract multiplier from fuel type (e.g., "10x" -> "10x")
      return fueledToken.fuelType || null;
    }
    
    return null;
  };

  const fuelMultiplier = getFuelMultiplier();

  useEffect(() => {
    // Debug: Log token data consistency
    console.log('🔍 TokenDetails DEBUG - Token data:', {
      symbol: token?.symbol,
      name: token?.name,
      contractAddress: token?.contractAddress,
      overallScore: token?.overallScore,
      score: token?.score,
      mentions: token?.mentions,
      twitterMentions: token?.twitterData?.mentions,
      communityScore: token?.communityScore
    });

    // Check if token is in watchlist on component mount (backend source of truth)
    const checkWatchlistStatus = async () => {
      try {
        if (!token?.symbol) return;
        const inList = await watchlistService.isInWatchlist(token.symbol, token.contractAddress);
        setIsInWatchlist(!!inList);
      } catch (err) {
        // Fallback to localStorage only if API fails
        const fallback = JSON.parse(localStorage.getItem('watchlist') || '[]');
        setIsInWatchlist(fallback.some(item => item.symbol === token?.symbol));
      }
    };

    checkWatchlistStatus();
    
    // Boost token priority when viewed
    if (token?.contractAddress) {
      priorityService.boostTokenOnView(token.contractAddress, token.symbol);
    }
  }, [token]);

  // Check for pending fuel payment on modal open
  useEffect(() => {
    if (showFuelModal) {
      const pendingData = localStorage.getItem('pendingFuelPayment');
      if (pendingData) {
        try {
          const pending = JSON.parse(pendingData);
          if (pending.contractAddress === token?.contractAddress) {
            setSelectedFuel(pending.fuelType);
            setPaymentCompleted(true);
            setContractValidated(true);
            setFuelMessage({ text: '💳 Payment completed! Ready to apply fuel boost.', type: 'success' });
            console.log('Found pending fuel payment for this token:', pending);
          }
        } catch (error) {
          console.error('Error parsing pending fuel payment:', error);
        }
      }
    }
  }, [showFuelModal, token?.contractAddress]);

  // Ensure Helio script is present
  useEffect(() => {
    if (!showFuelModal) return;
    if (document.querySelector('script[src*="embed.hel.io/assets/index-v1.js"]')) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.crossOrigin = 'anonymous';
    script.src = 'https://embed.hel.io/assets/index-v1.js';
    document.head.appendChild(script);
  }, [showFuelModal]);

  // Initialize Helio when selection + validated
  useEffect(() => {
    if (!showFuelModal || !selectedFuel || !contractValidated) return;
    if (!window.helioCheckout) return;
    const container = document.getElementById('helioCheckoutContainerToken');
    if (!container) return;
    const map = {
      '10x': '68b50d01c743122a7be16ce9',
      '50x': '68b50dd130074e35926e3c8d',
      '500x': '68b50cef3d14a3c150c1f6cb',
      '1000x': '68b50ded2b102da2c16c2359'
    };
    try {
      window.helioCheckout(container, {
        paylinkId: map[selectedFuel],
        theme: { themeMode: 'dark' },
        primaryColor: '#7C3AED',
        neutralColor: '#5A6578',
        display: 'inline',
        onSuccess: (e) => console.log('Helio success', e),
        onError: (e) => console.log('Helio error', e),
        onPending: (e) => console.log('Helio pending', e),
        onCancel: () => console.log('Cancelled payment'),
        onStartPayment: () => console.log('Starting payment')
      });
    } catch (err) {
      console.error('Failed to mount Helio widget in TokenDetails:', err);
    }
  }, [showFuelModal, selectedFuel, contractValidated]);

  const toggleWatchlist = async () => {
    if (!token?.symbol) return;
    // Optimistic UI update
    const next = !isInWatchlist;
    setIsInWatchlist(next);
    try {
    if (!isAuthenticated) {
        console.warn('Watchlist: user not authenticated');
      }

      if (next) {
        const payload = {
          symbol: token.symbol,
          name: token.name,
          image: token?.jupiterData?.icon || token?.image,
          contractAddress: token.contractAddress
        };
        await watchlistService.addToWatchlist(payload);
        // Update local fallback
        const local = JSON.parse(localStorage.getItem('watchlist') || '[]');
        local.push(payload);
        localStorage.setItem('watchlist', JSON.stringify(local));
        
        // Boost token priority when added to watchlist
        if (token.contractAddress) {
          priorityService.boostTokenOnWatchlist(token.contractAddress, token.symbol);
        }
      } else {
        await watchlistService.removeFromWatchlist(token.symbol, token.contractAddress);
        // Update local fallback
        const local = JSON.parse(localStorage.getItem('watchlist') || '[]');
        const updated = local.filter(item => (item.contractAddress && token.contractAddress)
          ? item.contractAddress !== token.contractAddress
          : item.symbol !== token.symbol);
        localStorage.setItem('watchlist', JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
      // Revert optimistic update on failure
      setIsInWatchlist(!next);
    }
  };

  // AI Analysis functionality
  const fetchAIAnalysis = async () => {
    if (!token?.contractAddress && !token?.symbol) {
      setAiError('Token contract address or symbol required for AI analysis');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    
    try {
      const sessionId = localStorage.getItem('sessionId');
      const identifier = token.contractAddress || token.symbol;
      const url = `${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/ai/social-context/${identifier}`;
      
      const params = new URLSearchParams();
      if (sessionId) params.append('sessionId', sessionId);
      params.append('useCache', 'true');
      
      const response = await fetch(`${url}?${params.toString()}`);
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 429) {
          // Usage limit exceeded
          throw new Error(`${data.message || 'Usage limit exceeded'} (${data.usageCount || 0}/${data.limit || 5} used)`);
        }
        throw new Error(data.message || data.error || 'AI analysis failed');
      }
      
      setAiAnalysis(data);
      setShowAIAnalysis(true);
      
    } catch (error) {
      console.error('AI Analysis error:', error);
      setAiError(error.message || 'Failed to get AI analysis');
    } finally {
      setAiLoading(false);
    }
  };

  const submitAIFeedback = async (analysisId, feedback) => {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisId,
          feedback,
          sessionId
        })
      });
      
      if (response.ok) {
        console.log('AI feedback submitted successfully');
      }
    } catch (error) {
      console.error('Failed to submit AI feedback:', error);
    }
  };

  // Fuel Token functionality
  const fuelOptions = [
    {
      type: '10x',
      icon: '🚀',
      boost: '15%',
      multiplier: 1.15,
      price: '$45',
      helioLink: 'https://app.hel.io/pay/68b50d01c743122a7be16ce9',
      description: 'Basic fuel boost'
    },
    {
      type: '50x',
      icon: '🔥',
      boost: '25%',
      multiplier: 1.25,
      price: '$195',
      helioLink: 'https://app.hel.io/pay/68b50dd130074e35926e3c8d',
      description: 'Popular choice'
    },
    {
      type: '500x',
      icon: '⚡',
      boost: '35%',
      multiplier: 1.35,
      price: '$695',
      helioLink: 'https://app.hel.io/pay/68b50cef3d14a3c150c1f6cb',
      description: 'High performance'
    },
    {
      type: '1000x',
      icon: '💎',
      boost: '45%',
      multiplier: 1.45,
      price: '$995',
      helioLink: 'https://app.hel.io/pay/68b50ded2b102da2c16c2359',
      description: 'Maximum boost'
    }
  ];

  const handleFuelClick = () => {
    if (!token?.contractAddress) {
      setFuelMessage({ text: 'No contract address available for this token', type: 'error' });
      return;
    }
    setShowFuelModal(true);
    setFuelMessage({ text: '', type: '' });
  };

  const handleApplyFuel = async () => {
    setFuelLoading(true);
    setFuelMessage({ text: '', type: '' });

    try {
      // Check if there's pending payment data
      const pendingData = localStorage.getItem('pendingFuelPayment');
      let fuelType = selectedFuel;

      if (pendingData) {
        const pending = JSON.parse(pendingData);
        fuelType = pending.fuelType;
        console.log('Found pending fuel payment:', pending);
      }

      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/fuel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractAddress: token.contractAddress,
          fuelType: fuelType
        })
      });

      const result = await response.json();

      if (response.ok) {
        setFuelMessage({ text: `✅ ${result.message}`, type: 'success' });
        setSelectedFuel(null);
        setContractValidated(false);
        setPaymentCompleted(false);
        localStorage.removeItem('pendingFuelPayment');
        // Close modal after 2 seconds
        setTimeout(() => {
          setShowFuelModal(false);
          setFuelMessage({ text: '', type: '' });
        }, 2000);
      } else {
        setFuelMessage({ text: `❌ ${result.error}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error applying fuel:', error);
      setFuelMessage({ text: '❌ Failed to apply fuel. Please try again.', type: 'error' });
    } finally {
      setFuelLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (!num || isNaN(num)) return 'N/A';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  };

  const formatPercentage = (num) => {
    if (!num || isNaN(num)) return 'N/A';
    return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
  };

  const formatPrice = (price) => {
    if (!price || isNaN(price)) return 'N/A';
    if (price < 0.000001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };



  const getHypeLevel = (score) => {
    if (!score || score >= 8) return { level: 'VIRAL', icon: '🚀', color: 'text-purple-400' };
    if (score >= 6) return { level: 'TRENDING', icon: '🔥', color: 'text-orange-400' };
    if (score >= 4) return { level: 'BUILDING', icon: '📈', color: 'text-blue-400' };
    return { level: 'SLEEPING', icon: '😴', color: 'text-gray-400' };
  };

  const sentimentEmoji = getSentimentEmoji(token?.sentimentScore || 5);
  const hypeLevel = getHypeLevel(token?.score || token?.overallScore || 0);

  function getSentimentEmoji(score) {
    if (score >= 8) return '😊';
    if (score >= 6) return '😐';
    if (score >= 4) return '😟';
    return '😢';
  }

  // Aggregate tweets once and derive unique mentions (unique authors)
  const aggregatedTweets = React.useMemo(() => {
    try {
      let tweets = [];
      if (token?.twitterData?.tweets) tweets = token.twitterData.tweets;
      else if (token?.jupiterData?.twitterData?.tweets) tweets = token.jupiterData.twitterData.tweets;
      else if (token?.recentPosts) tweets = token.recentPosts;
      else if (token?.tweets) tweets = token.tweets;
      return Array.isArray(tweets) ? tweets : [];
    } catch (_) {
      return [];
    }
  }, [token]);

  const uniqueMentionsCount = React.useMemo(() => {
    const authors = new Set();
    aggregatedTweets.forEach(tw => {
      const author = tw?.author || tw?.user?.screen_name || tw?.user?.username || tw?.user?.name;
      if (author) authors.add(String(author).toLowerCase());
    });
    return authors.size;
  }, [aggregatedTweets]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2">
      <div className="bg-dark-bg border border-gray-700 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
          {/* Header */}
        <div className="sticky top-0 bg-dark-bg border-b border-gray-700 p-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {(token?.image || token?.jupiterData?.icon) && (
              <img src={token?.jupiterData?.icon || token?.image} alt={token.name} className="w-16 h-16 rounded-full border-2 border-blue-500" />
              )}
              <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white">{token?.name || 'Unknown Token'}</h2>
                {fuelMultiplier && (
                  <span className="px-1.5 py-0.5 bg-black border border-orange-500 text-orange-400 text-xs font-bold rounded flex items-center space-x-1">
                    <span className="text-xs">🔥</span>
                    <span>{fuelMultiplier}</span>
                  </span>
                )}
              </div>
              <p className="text-gray-400">${token?.symbol || 'UNKNOWN'}</p>
              <div className="flex items-center space-x-2 mt-1">
                <code className="text-xs text-gray-500 font-mono">
                  {token?.contractAddress ? 
                    `${token.contractAddress.slice(0, 8)}...${token.contractAddress.slice(-6)}` : 
                    'No Contract Address'
                      }
                    </code>
                {token?.contractAddress && (
                  <div className="relative"
                       onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                       onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}>
                    <button
                      onClick={(event) => {
                        navigator.clipboard.writeText(token.contractAddress);
                        const button = event.currentTarget;
                        const originalText = button.innerHTML;
                        button.innerHTML = '✅';
                        setTimeout(() => {
                          button.innerHTML = originalText;
                        }, 2000);
                      }}
                      className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
                    >
                      📋
                    </button>
                    <div className="bubble-tooltip mt-1 left-1/2 -translate-x-1/2" style={{ display: 'none' }}>
                      <div className="text-xs leading-tight">
                        <span className="font-semibold text-white">Copy:</span>
                        <span className="text-gray-300 ml-1">Copy contract address to clipboard</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            <div className="flex items-center space-x-2">
            {/* AI Analysis Button with bubble-tooltip */}
            <div className="relative"
                 onMouseEnter={(e) => {
                   const tip = e.currentTarget.querySelector('.bubble-tooltip');
                   if (tip) tip.style.display = 'block';
                 }}
                 onMouseLeave={(e) => {
                   const tip = e.currentTarget.querySelector('.bubble-tooltip');
                   if (tip) tip.style.display = 'none';
                 }}>
              <button
                onClick={isAuthenticated ? fetchAIAnalysis : undefined}
                disabled={!isAuthenticated || aiLoading}
                className={`px-2 py-1 rounded-lg border border-solana-purple/60 bg-transparent text-xs flex items-center gap-1 transition-all duration-200 ${
                  (!isAuthenticated || aiLoading)
                    ? 'text-gray-500 cursor-not-allowed opacity-60 pointer-events-none' 
                    : 'text-gray-200 hover:bg-gray-700'
                }`}
              >
                {aiLoading ? (
                  <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full"></div>
                ) : (
                  <>
                    <Brain size={16} />
                    <span>Oracle AI</span>
                  </>
                )}
              </button>
              <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50" style={{ display: 'none' }}>
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-white">Oracle AI:</span>
                  <span className="text-gray-300 ml-1">{isAuthenticated ? 'Deep-dive analysis with hype, risks, and plays' : 'Log in to use this feature'}</span>
                </div>
              </div>
            </div>
            
            {/* Fuel Token Button with bubble-tooltip */}
            <div className="relative"
                 onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                 onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}>
              <button
                onClick={handleFuelClick}
                className="p-2 rounded-lg transition-all duration-200 text-orange-400 hover:text-orange-300 hover:bg-orange-400/10"
              >
                <Flame size={20} />
              </button>
              <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50" style={{ display: 'none' }}>
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-white">Fuel:</span>
                  <span className="text-gray-300 ml-1">Boost visibility and priority for this token</span>
                </div>
              </div>
            </div>

            {/* Watchlist Star */}
              <div className="relative"
                   onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                   onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}>
                <button
                  onClick={isAuthenticated ? toggleWatchlist : undefined}
                  disabled={!isAuthenticated}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    !isAuthenticated
                      ? 'text-gray-500 cursor-not-allowed opacity-60 pointer-events-none'
                      : isInWatchlist 
                        ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20' 
                        : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10'
                }`}
                >
                    <Star 
                      size={20} 
                      stroke="currentColor"
                      fill={isInWatchlist ? 'currentColor' : 'none'} 
                    />
                </button>
                <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50" style={{ display: 'none' }}>
                  <div className="text-xs leading-tight">
                    <span className="font-semibold text-white">Watchlist:</span>
                    <span className="text-gray-300 ml-1">{isAuthenticated ? (isInWatchlist ? 'Remove from your watchlist' : 'Add to your watchlist') : 'Log in to use this feature'}</span>
                  </div>
                </div>
              </div>

              {/* Call it! */}
              <div className="relative"
                   onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                   onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}>
                <button
                  onClick={isAuthenticated ? (async () => {
                  try {
                    const payload = {
                      symbol: token.symbol,
                      name: token.name,
                      contractAddress: token.contractAddress
                    };
                    try {
                      await kolCallsService.addCall(payload);
                      alert('✅ You\'ve made your call... let\'s see if you have what it takes to become the next KOL.');
                      setCallRecorded(true);
                    } catch (err) {
                      // @ts-ignore
                      if (err && err.code === 'already_called') {
                        alert('Come on chad! You already called this one!');
                        return;
                      }
                      // @ts-ignore
                      if (err && err.code === 'limit_exceeded') {
                        const upgrade = window.confirm('🚀 ' + err.message + '\n\nWould you like to upgrade now?');
                        if (upgrade && onNavigateToPremium) {
                          onNavigateToPremium();
                        }
                        return;
                      }
                      throw err;
                    }
                  } catch (e) {
                    console.error('Call it failed:', e);
                    alert('❌ Failed to record call');
                  }
                }) : undefined}
                  disabled={!isAuthenticated}
                  className={`px-2 py-1 ml-1 rounded-lg bg-transparent border border-solana-purple/60 text-xs ${
                    !isAuthenticated ? 'text-gray-500 cursor-not-allowed opacity-60 pointer-events-none' : 'text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  Call it!
                </button>
                <div className="bubble-tooltip absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50" style={{ display: 'none' }}>
                  <div className="text-xs leading-tight">
                    <span className="font-semibold text-white">Call it:</span>
                    <span className="text-gray-300 ml-1">{isAuthenticated ? 'Record your play at current MCAP' : 'Log in to use this feature'}</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="relative"
                   onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
                   onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}>
                <button
                  onClick={() => {
                  try {
                    if (callRecorded) {
                      window.dispatchEvent(new CustomEvent('kol-call-added'));
                    }
                  } catch (_) {}
                  onClose && onClose();
                }}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="bubble-tooltip mt-1 left-1/2 -translate-x-1/2" style={{ display: 'none' }}>
                  <div className="text-xs leading-tight">
                    <span className="font-semibold text-white">Close:</span>
                    <span className="text-gray-300 ml-1">Close token details</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {/* ⭐ Section 1 – Performance Overview */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              ⭐ Performance Overview
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Section - Market Data (2x2 Square Grid) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Market Cap - Blue Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded border border-blue-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent"></div>
                  <span className="text-blue-200 text-sm mb-1 relative z-10">🏦 Market Cap</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatNumber(token?.jupiterData?.mcap || token?.marketCap)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.priceChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.priceChange || 0)}
                    </span>
              </div>
              </div>

                {/* Price - Green Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded border border-green-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-600/5 to-transparent"></div>
                  <span className="text-green-200 text-sm mb-1 relative z-10">📈 Price</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatPrice(token?.jupiterData?.usdPrice || token?.price)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.priceChangePercentage || 0)}
                    </span>
              </div>
            </div>

                {/* Liquidity - Purple Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-600/20 to-violet-600/20 rounded border border-purple-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent"></div>
                  <span className="text-purple-200 text-sm mb-1 relative z-10">💰 Liquidity</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatNumber(token?.jupiterData?.liquidity)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.liquidityChange || 0)}
                    </span>
              </div>
              </div>

                {/* Holders - Orange Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-orange-600/20 to-amber-600/20 rounded border border-orange-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-600/5 to-transparent"></div>
                  <span className="text-orange-200 text-sm mb-1 relative z-10">👥 Holders</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    {formatNumber(token?.jupiterData?.holderCount)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.holderChange || 0)}
                    </span>
                </div>
                </div>
              </div>

              {/* Right Section - Scores & Social (2x2 Grid) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Overall Score - Takes up 2 squares (spans both columns) - TOP POSITION */}
                <div className="col-span-2 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded border border-blue-500/30 aspect-[2/1]">
                  <span className="text-blue-300 text-sm mb-2">📊 Overall Score</span>
                  <span className="text-white font-bold text-3xl">
                    {(token?.score || token?.overallScore || 0).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-3 bg-dark-bg rounded border border-gray-700 aspect-square">
                  <div className="flex items-center space-x-1 mb-2">
                    <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                    <span className="text-gray-400 text-xs">Mentions</span>
              </div>
                  <div className="text-center">
                    <span className="text-white font-semibold text-sm block">
                      {formatNumber(token?.twitterData?.mentions || 0)}
                    </span>
                    <span className={`text-xs font-medium ${
                      (token?.twitterData?.mentionsTrend || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.twitterData?.mentionsTrend || 0) >= 0 ? '↗' : '↘'} {formatPercentage(token?.twitterData?.mentionsTrend || 0)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center p-3 bg-dark-bg rounded border border-gray-700 aspect-square">
                  <span className="text-gray-400 text-xs mb-2">🏆 Community</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.communityHealthScore || token?.communityScore || 0).toFixed(1)}/10
                  </span>
                </div>
                </div>
              </div>
            </div>

          {/* 🔍 Section 2 – Insights (Market Data) */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🔍 Insights (Market Data)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">💎 FDV:</span>
                  <span className="text-white font-semibold text-sm">
                    ${formatNumber(token?.jupiterData?.fdv)}
                  </span>
              </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📊 Volume (24h):</span>
                  <span className="text-white font-semibold text-sm">
                    ${formatNumber((token?.jupiterData?.stats24h?.buyVolume || 0) + (token?.jupiterData?.stats24h?.sellVolume || 0))}
                  </span>
              </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📈 Price Change (24h):</span>
                  <span className={`font-semibold text-sm ${
                    (token?.jupiterData?.stats24h?.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token?.jupiterData?.stats24h?.priceChange)}
                  </span>
              </div>
            </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🎯 Organic Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {((token?.jupiterData?.organicScore || 0) / 10).toFixed(1)}/10
                  </span>
              </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">💰 Total Supply:</span>
                  <span className="text-white font-semibold text-sm">
                    {formatNumber(token?.jupiterData?.totalSupply)}
                  </span>
              </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🔄 Circulating Supply:</span>
                  <span className="text-white font-semibold text-sm">
                    {formatNumber(token?.jupiterData?.circSupply)}
                  </span>
              </div>
              </div>
            </div>
          </div>

          {/* 🛡️ Section 3 – Audit Information */}
          {token?.jupiterData?.audit && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <h3 className="text-lg font-bold mb-3 text-white flex items-center">
                🛡️ Audit Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">👨‍💻 Dev Balance %:</span>
                    <span className="text-white font-semibold text-sm">
                      {((token.jupiterData.audit.devBalancePercentage || 0) * 100).toFixed(2)}%
                    </span>
              </div>
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">🏆 Top Holders %:</span>
                    <span className="text-white font-semibold text-sm">
                      {(token.jupiterData.audit.topHoldersPercentage || 0).toFixed(2)}%
                    </span>
              </div>
              </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">📅 Creation Date:</span>
                    <span className="text-white font-semibold text-sm">
                      {(() => {
                        // Try different date sources in order of preference
                        const creationDate = token.jupiterData.audit?.creationDate || 
                                           token.jupiterData.creationTime ||
                                           token.jupiterData.firstPool?.createdAt;
                        
                        if (creationDate) {
                          const date = new Date(creationDate);
                          return !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Invalid Date';
                        }
                        return 'N/A';
                      })()}
                    </span>
            </div>
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">🚀 Launchpad:</span>
                    <span className="text-white font-semibold text-sm">
                      {token.jupiterData.launchpad || token.jupiterData.audit?.launchpad || 'N/A'}
                    </span>
              </div>
              </div>
              </div>
            </div>
          )}

          {/* 📈 Section 4 – Detailed Stats Timeline */}
          {(token?.jupiterData?.stats1h || token?.jupiterData?.stats6h || token?.jupiterData?.stats24h) && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <h3 className="text-lg font-bold mb-3 text-white flex items-center">
                📈 Detailed Stats Timeline
              </h3>
              
              {/* 1 Hour Stats */}
              {token?.jupiterData?.stats1h && (
                <div className="mb-4">
                  <h4 className="text-md font-semibold text-blue-400 mb-2">⏰ 1 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.priceChange)}
              </div>
              </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.holderChange)}
              </div>
            </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.liquidityChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numBuys || 0)}
              </div>
              </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numSells || 0)}
              </div>
            </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numTraders || 0)}
              </div>
              </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numOrganicBuyers || 0)}
              </div>
            </div>
          </div>
                </div>
              )}

              {/* 6 Hour Stats */}
              {token?.jupiterData?.stats6h && (
                <div className="mb-4">
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">⏰ 6 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.priceChange)}
              </div>
              </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.holderChange)}
              </div>
            </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.liquidityChange)}
          </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numBuys || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numSells || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numTraders || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numOrganicBuyers || 0)}
                      </div>
              </div>
                  </div>
                </div>
              )}

              {/* 24 Hour Stats */}
              {token?.jupiterData?.stats24h && (
                <div>
                  <h4 className="text-md font-semibold text-green-400 mb-2">⏰ 24 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.priceChange)}
                </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.holderChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.liquidityChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numBuys || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numSells || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numTraders || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numOrganicBuyers || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Net Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numNetBuyers || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 🪪 Section 5 – Profile Information */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🪪 Profile Information
            </h3>
            
            {/* Top Row - Community Type and Official Profile Status */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Community Type */}
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded border border-gray-700">
                <span className="text-gray-400 text-sm">🌍 Community Type:</span>
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                  (token?.jupiterData?.audit?.devBalancePercentage || 0) === 0 ? 'bg-green-400/10 text-green-400' : 'bg-blue-400/10 text-blue-400'
                }`}>
                  {(token?.jupiterData?.audit?.devBalancePercentage || 0) === 0 ? '🟢 CTO' : '🔵 Official'}
                </span>
              </div>

              {/* Official Profile Status */}
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded border border-gray-700">
                <span className="text-gray-400 text-sm">🏷️ Official Profile:</span>
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                  (token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {(token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) ? '✅ Found' : '❌ Not Found'}
                </span>
                  </div>
            </div>

            {/* Social Links Section */}
            <div className="space-y-3">
              <h4 className="text-md font-semibold text-white mb-2">🔗 Social Links</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                
                {/* Twitter Link */}
                {(token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={
                        token?.socials?.twitter ||
                        token?.jupiterData?.twitter ||
                        `https://twitter.com/${token?.twitterHandle}`
                      }
                    target="_blank"
                    rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors w-full"
                  >
                      <Twitter className="w-4 h-4" />
                      <span className="text-sm font-medium">Twitter</span>
                  </a>
                </div>
              )}

                {/* Website Link */}
                {(token?.socials?.website || token?.jupiterData?.website) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={token?.socials?.website || token?.jupiterData?.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors w-full"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm font-medium">Website</span>
                    </a>
                </div>
                )}

                {/* Telegram Link */}
                {(token?.socials?.telegram || token?.jupiterData?.telegram) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={token?.socials?.telegram || token?.jupiterData?.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white p-2 rounded transition-colors w-full"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Telegram</span>
                    </a>
              </div>
                )}

                {/* Discord Link */}
                {(token?.socials?.discord || token?.jupiterData?.discord) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={token?.socials?.discord || token?.jupiterData?.discord}
                          target="_blank"
                          rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded transition-colors w-full"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Discord</span>
                    </a>
            </div>
                )}

                {/* CoinGecko Link */}
                {(token?.socials?.coingecko || token?.jupiterData?.coingecko) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={token?.socials?.coingecko || token?.jupiterData?.coingecko}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white p-2 rounded transition-colors w-full"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm font-medium">CoinGecko</span>
                    </a>
          </div>
                )}

                {/* CoinMarketCap Link */}
                {(token?.socials?.coinmarketcap || token?.jupiterData?.coinmarketcap) && (
                  <div className="p-2 bg-dark-bg rounded border border-gray-700">
                    <a
                      href={token?.socials?.coinmarketcap || token?.jupiterData?.coinmarketcap}
                          target="_blank"
                          rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 bg-blue-800 hover:bg-blue-900 text-white p-2 rounded transition-colors w-full"
                        >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm font-medium">CMC</span>
                        </a>
                  </div>
                      )}

                    </div>

              {/* No Social Links Message */}
              {!(token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) &&
               !(token?.socials?.website || token?.jupiterData?.website) &&
               !(token?.socials?.telegram || token?.jupiterData?.telegram) &&
               !(token?.socials?.discord || token?.jupiterData?.discord) &&
               !(token?.socials?.coingecko || token?.jupiterData?.coingecko) &&
               !(token?.socials?.coinmarketcap || token?.jupiterData?.coinmarketcap) && (
                <div className="text-center py-4 text-gray-400">
                  <p className="text-sm">📭 No social links available</p>
                  <p className="text-xs mt-1">Links can be added via Token List or Update Token feature</p>
                  </div>
              )}
                </div>
                </div>

          {/* 🐦 Section 6 – Social Activity */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🐦 Social Activity
            </h3>
            {(() => {
              // Get tweets from Twitter API data collected by our backend
              let tweets = [];

              // Try different possible sources for tweet data
              if (token?.twitterData?.tweets) {
                tweets = token.twitterData.tweets;
              } else if (token?.jupiterData?.twitterData?.tweets) {
                tweets = token.jupiterData.twitterData.tweets;
              } else if (token?.recentPosts) {
                tweets = token.recentPosts;
              } else if (token?.tweets) {
                tweets = token.tweets;
              }

              // Deduplicate tweets based on text content and author to avoid duplicates
              const uniqueTweets = [];
              const seenTweets = new Set();
              
              tweets.forEach(tweet => {
                // Create a unique key based on text content and author
                const uniqueKey = `${tweet.author || 'unknown'}_${(tweet.text || tweet.content || '').substring(0, 100)}`;
                
                if (!seenTweets.has(uniqueKey)) {
                  seenTweets.add(uniqueKey);
                  uniqueTweets.push(tweet);
                }
              });

              // Sort by likes (highest first) - convert to numbers for proper sorting
              const sortedTweets = [...uniqueTweets].sort((a, b) => {
                const likesA = typeof a.likes === 'number' ? a.likes : parseInt(a.likes) || 0;
                const likesB = typeof b.likes === 'number' ? b.likes : parseInt(b.likes) || 0;
                return likesB - likesA;
              });
              
              if (sortedTweets.length === 0) {
                return (
                  <div className="bg-dark-bg p-3 rounded border border-gray-700 text-center">
                    <div className="text-gray-400 text-sm">
                      <Twitter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No recent social activity found
                    </div>
                  </div>
                );
              }

                              return (
                <div className="space-y-2">
                  {sortedTweets.slice(0, 5).map((post, index) => {
                    // Primary: Use direct tweet link if we have tweetId
                    let tweetUrl = null;
                    if (post.tweetId && post.author) {
                      tweetUrl = `https://twitter.com/${post.author}/status/${post.tweetId}`;
                    } 
                    // Fallback: Use Twitter search for the tweet content if we have author
                    else if (post.author && post.text) {
                      // Create a more targeted search query using the first few words
                      const firstWords = post.text.split(' ').slice(0, 8).join(' ').replace(/[^\w\s$#@]/g, '');
                      const searchQuery = encodeURIComponent(`from:${post.author} ${firstWords}`);
                      tweetUrl = `https://twitter.com/search?q=${searchQuery}&f=live`;
                    }
                    // Last resort: Just go to the author's profile
                    else if (post.author) {
                      tweetUrl = `https://twitter.com/${post.author}`;
                    }

                    const tweetContent = (
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <Twitter className="w-5 h-5 text-blue-400 mt-1 group-hover:text-blue-300 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Author info with hover indicator */}
                          {(post.author || post.authorName) && (
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-blue-400 text-xs font-medium group-hover:text-blue-300 transition-colors">
                                @{post.author || 'unknown'}
                              </span>
                              {post.authorName && post.authorName !== post.author && (
                                <span className="text-gray-400 text-xs">
                                  ({post.authorName})
                                </span>
                              )}
                              {tweetUrl && (
                                <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-2">
                                  {post.tweetId ? '🔗 Click to view tweet' : post.text ? '🔍 Click to search tweet' : '👤 Click to view profile'}
                                </span>
              )}
            </div>
                          )}
                          
                          {/* Tweet content */}
                          <p className="text-white text-sm leading-relaxed mb-2 group-hover:text-gray-100 transition-colors">
                            {post.text || post.content || 'No content available'}
                          </p>
                          
                          {/* Engagement metrics */}
                          <div className="flex items-center space-x-4 text-xs text-gray-400">
                            <span className="flex items-center space-x-1">
                              <span>❤️</span>
                              <span className="font-medium">{post.likes || 0}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <span>🔄</span>
                              <span>{post.retweets || 0}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <span>💬</span>
                              <span>{post.replies || 0}</span>
                            </span>
                            {(post.date || post.createdAt) && (
                              <span className="text-gray-500">
                                {new Date(post.date || post.createdAt).toLocaleDateString()}
                              </span>
                            )}
          </div>
                        </div>
                      </div>
                    );

                    return tweetUrl ? (
                      <a
                        key={`tweet-${index}-${post.author || 'unknown'}`}
                        href={tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        className="block bg-dark-bg p-3 rounded border border-gray-700 hover:border-blue-500 hover:bg-gray-600 transition-all duration-200 cursor-pointer group no-underline"
                      >
                        {tweetContent}
                      </a>
                    ) : (
                      <div
                        key={`tweet-${index}-${post.author || 'unknown'}`}
                        className="bg-dark-bg p-3 rounded border border-gray-700"
                      >
                        {tweetContent}
                  </div>
                    );
                  })}
                </div>
              );
            })()}
                  </div>

          {/* 📊 Section 7 – Metrics Breakdown */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              📊 Metrics Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">😊 Sentiment Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {sentimentEmoji} {(token?.sentimentScore || 5).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📣 Engagement Rate:</span>
                  <span className="text-white font-semibold text-sm">
                    {((token?.engagementRate || 0.05) * 100).toFixed(1)}%
                  </span>
                  </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🧑‍🤝‍🧑 Unique Mentions:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.uniqueMentions ?? uniqueMentionsCount).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🚀 Hype Level:</span>
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${hypeLevel.color}`}>
                    {hypeLevel.icon} {hypeLevel.level}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">⏰ Last Updated:</span>
                  <span className="text-white font-semibold text-sm">
                    {token?.lastUpdated ? new Date(token.lastUpdated).toLocaleTimeString() : 'N/A'}
                  </span>
                  </div>
                </div>
              </div>
              
            {token?.enhancedScore?.calculationTime && (
              <div className="mt-3 pt-2 border-t border-gray-600">
                <div className="text-center text-gray-400 text-xs">
                  Last calculated: {new Date(token.enhancedScore.calculationTime).toLocaleString()}
                </div>
            </div>
                      )}
                    </div>
                  </div>

        {/* Fuel Token Modal */}
        {showFuelModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-bg border border-gray-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6 p-6 pb-0">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Flame className="text-orange-400" size={24} />
                  Fuel Token - {token?.symbol}
                </h3>
                <button
                  onClick={() => setShowFuelModal(false)}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
                </div>

              <div className="px-6 pb-6">
                {/* Token Info */}
                <div className="bg-dark-card border border-gray-600 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="text-2xl">{fuelMultiplier ? '🔥' : '🪙'}</div>
                    <div>
                      <div className="text-lg font-bold text-white">{token?.symbol}</div>
                      <div className="text-sm text-gray-400">{token?.name}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono bg-gray-800 p-2 rounded">
                    {token?.contractAddress}
                  </div>
                  {fuelMultiplier && (
                    <div className="mt-2 text-sm text-orange-400">
                      🔥 Currently fueled: {fuelMultiplier}
                </div>
              )}
            </div>

                {/* Contract Validation */}
                {!contractValidated && !paymentCompleted && (
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
                    <h4 className="text-blue-300 font-medium mb-2">🔍 Contract Validation Required</h4>
                    <p className="text-blue-200 text-sm mb-4">
                      We need to verify this token exists in our database before proceeding with fuel.
                    </p>
                    <button
                      onClick={async () => {
                        setFuelLoading(true);
                        setFuelMessage({ text: '', type: '' });

                        try {
                          // Check if token exists in our database
                          const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens?contract=${token.contractAddress}`);
                          const tokens = await response.json();

                          if (tokens && tokens.length > 0) {
                            setFuelMessage({ text: '✅ Contract address validated! Token found in database.', type: 'success' });
                            setContractValidated(true);
                          } else {
                            setFuelMessage({ text: '⚠️ Contract address not found in database. This token may need to be listed first.', type: 'error' });
                          }
                        } catch (error) {
                          console.error('Error validating contract:', error);
                          setFuelMessage({ text: '❌ Failed to validate contract address. Please try again.', type: 'error' });
                        } finally {
                          setFuelLoading(false);
                        }
                      }}
                      disabled={fuelLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50"
                    >
                      {fuelLoading ? '🔍 Validating...' : '🔍 Validate Contract Address'}
                    </button>
          </div>
          )}

                {/* Fuel Selection */}
                {contractValidated && !paymentCompleted && (
            <div className="mb-6">
                    <h4 className="text-white font-medium mb-4">Choose Fuel Boost</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {fuelOptions.map((fuel) => (
                        <button
                          key={fuel.type}
                          onClick={() => setSelectedFuel(fuel.type)}
                          className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                            selectedFuel === fuel.type
                              ? 'border-orange-500 bg-orange-900/20'
                              : 'border-gray-600 hover:border-orange-400 bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="text-2xl">{fuel.icon}</div>
                            <div className="text-left">
                              <div className="text-white font-bold">Fuel {fuel.type}</div>
                              <div className="text-sm text-gray-400">{fuel.description}</div>
                  </div>
                </div>
                          <div className="text-xl font-bold text-green-400">{fuel.price}</div>
                          <div className="text-xs text-gray-500">Duration: 12 hours</div>
                        </button>
                      ))}
                  </div>

                    {/* Proceed to Payment (Inline Helio widget) */}
                    {selectedFuel && (
                      <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/30">
                        <h4 className="text-white font-semibold text-lg mb-4 flex items-center">
                          <span className="mr-2">🔒</span>
                          Secure Payment (Powered by Helio)
                        </h4>
                        <div className="flex justify-center">
                          <div id="helioCheckoutContainerToken" className="w-full max-w-md"></div>
                </div>
                        <p className="text-xs text-gray-400 mt-3">Complete your payment securely. The widget is embedded and does not redirect.</p>
                  </div>
                    )}
                </div>
                )}

                {/* Apply Fuel (after payment) */}
                {paymentCompleted && (
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-6">
                    <h4 className="text-green-300 font-medium mb-2">✅ Payment Completed!</h4>
                    <p className="text-green-200 text-sm mb-4">
                      Your payment has been processed successfully. Click below to apply the fuel boost to {token?.symbol}.
                    </p>
                    <button
                      onClick={handleApplyFuel}
                      disabled={fuelLoading}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50"
                    >
                      {fuelLoading ? '🔥 Applying Fuel...' : '🔥 Apply Fuel Boost'}
                    </button>
                  </div>
                )}

                {/* Message Display */}
                {fuelMessage.text && (
                  <div className={`mb-4 p-3 rounded-lg text-sm ${
                    fuelMessage.type === 'success'
                      ? 'bg-green-900/20 border border-green-500 text-green-400'
                      : fuelMessage.type === 'error'
                      ? 'bg-red-900/20 border border-red-500 text-red-400'
                      : 'bg-blue-900/20 border border-blue-500 text-blue-400'
                  }`}>
                    {fuelMessage.text}
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowFuelModal(false);
                      setSelectedFuel(null);
                      setContractValidated(false);
                      setPaymentCompleted(false);
                      setFuelMessage({ text: '', type: '' });
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
        </div>
          </div>
        )}

        {/* AI Analysis Modal */}
        {showAIAnalysis && aiAnalysis && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-bg border border-gray-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6 p-6 pb-0">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Brain className="text-purple-400" size={24} />
                  DeGen Oracle AI Analysis
                </h3>
                <button
                  onClick={() => setShowAIAnalysis(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="px-6 pb-6">
                {/* Token Info Header */}
                <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-3">
                    {aiAnalysis.tokenInfo?.contractAddress && (
                      <img 
                        src={token?.jupiterData?.icon || token?.image} 
                        alt={aiAnalysis.tokenInfo.symbol} 
                        className="w-12 h-12 rounded-full"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div>
                      <h4 className="text-white font-semibold text-lg">
                        {aiAnalysis.tokenInfo?.name} (${aiAnalysis.tokenInfo?.symbol})
                      </h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <span>Price: ${aiAnalysis.tokenInfo?.currentPrice || 'N/A'}</span>
                        <span>MCap: ${aiAnalysis.tokenInfo?.marketCap ? (aiAnalysis.tokenInfo.marketCap / 1e6).toFixed(2) + 'M' : 'N/A'}</span>
                        <span className={`px-2 py-1 rounded text-xs ${aiAnalysis.isPremium ? 'bg-purple-900 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>
                          {aiAnalysis.isPremium ? 'Premium Analysis' : 'Free Analysis'}
                      </span>
                        {!aiAnalysis.isPremium && aiAnalysis.usageCount !== undefined && (
                          <span className="px-2 py-1 rounded text-xs bg-orange-900 text-orange-300">
                            {aiAnalysis.usageCount + 1}/5 Used
                          </span>
                        )}
                  </div>
                </div>
            </div>
                </div>

                {/* Analysis Content */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Left Column */}
                  <div className="space-y-6">
                    
                    {/* Sentiment & Confidence */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        🎯 AI Assessment
                      </h5>
            <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Sentiment:</span>
                          <span className={`font-semibold px-2 py-1 rounded text-sm ${
                            aiAnalysis.analysis.sentiment === 'Bullish' ? 'bg-green-900 text-green-300' :
                            aiAnalysis.analysis.sentiment === 'Bearish' ? 'bg-red-900 text-red-300' :
                            'bg-yellow-900 text-yellow-300'
                          }`}>
                            {aiAnalysis.analysis.sentiment}
                </span>
              </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Confidence:</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-20 bg-gray-700 rounded-full h-2">
                              <div 
                                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(aiAnalysis.analysis.confidence * 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-white font-semibold text-sm">
                              {Math.round(aiAnalysis.analysis.confidence * 100)}%
                </span>
              </div>
                        </div>
                      </div>
                    </div>

                    {/* Key Insights */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        💡 Key Insights
                      </h5>
                      <div className="space-y-2">
                        {aiAnalysis.analysis.keyInsights?.map((insight, index) => (
                          <div key={index} className="flex items-start space-x-2">
                            <span className="text-purple-400 mt-1">•</span>
                            <span className="text-gray-300 text-sm">{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        📋 Summary
                      </h5>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Action:</span>
                          <span className={`font-semibold px-2 py-1 rounded text-sm ${
                            aiAnalysis.analysis.summary?.action === 'Strong Buy' || aiAnalysis.analysis.summary?.action === 'Buy' ? 'bg-green-900 text-green-300' :
                            aiAnalysis.analysis.summary?.action === 'Avoid' ? 'bg-red-900 text-red-300' :
                            'bg-yellow-900 text-yellow-300'
                          }`}>
                            {aiAnalysis.analysis.summary?.action}
                </span>
              </div>
                        <div className="text-gray-300 text-sm">
                          <span className="text-gray-400">Reasoning:</span> {aiAnalysis.analysis.summary?.reasoning}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Timeframe:</span>
                          <span className="text-white text-sm">{aiAnalysis.analysis.summary?.timeframe}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Entry Strategy:</span>
                          <span className="text-white text-sm">{aiAnalysis.analysis.summary?.entryStrategy}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    
                    {/* Social Momentum */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        📈 Social Momentum
                      </h5>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Direction:</span>
                          <span className={`font-semibold text-sm ${
                            aiAnalysis.analysis.socialMomentum?.direction === 'Accelerating' ? 'text-green-400' :
                            aiAnalysis.analysis.socialMomentum?.direction === 'Declining' ? 'text-red-400' :
                            'text-yellow-400'
                          }`}>
                            {aiAnalysis.analysis.socialMomentum?.direction}
                </span>
              </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Strength:</span>
                          <span className="text-white text-sm">{aiAnalysis.analysis.socialMomentum?.strength}</span>
            </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Sustainability:</span>
                          <span className="text-white text-sm">{aiAnalysis.analysis.socialMomentum?.sustainability}</span>
          </div>
        </div>
                    </div>

                    {/* Risk Assessment */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        ⚠️ Risk Assessment
                      </h5>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Risk Level:</span>
                          <span className={`font-semibold px-2 py-1 rounded text-sm ${
                            aiAnalysis.analysis.riskAssessment?.level === 'Low' ? 'bg-green-900 text-green-300' :
                            aiAnalysis.analysis.riskAssessment?.level === 'High' ? 'bg-red-900 text-red-300' :
                            'bg-yellow-900 text-yellow-300'
                          }`}>
                            {aiAnalysis.analysis.riskAssessment?.level}
                          </span>
                        </div>
                        {aiAnalysis.analysis.riskAssessment?.factors?.length > 0 && (
                          <div>
                            <span className="text-gray-400 text-sm">Risk Factors:</span>
                            <div className="mt-1 space-y-1">
                              {aiAnalysis.analysis.riskAssessment.factors.map((factor, index) => (
                                <div key={index} className="flex items-start space-x-2">
                                  <span className="text-red-400 mt-1">•</span>
                                  <span className="text-gray-300 text-sm">{factor}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiAnalysis.analysis.riskAssessment?.mitigants?.length > 0 && (
                          <div>
                            <span className="text-gray-400 text-sm">Positive Factors:</span>
                            <div className="mt-1 space-y-1">
                              {aiAnalysis.analysis.riskAssessment.mitigants.map((mitigant, index) => (
                                <div key={index} className="flex items-start space-x-2">
                                  <span className="text-green-400 mt-1">•</span>
                                  <span className="text-gray-300 text-sm">{mitigant}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Catalysts & Red Flags */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3 flex items-center">
                        🚀 Catalysts & 🚩 Red Flags
                      </h5>
                      <div className="space-y-3">
                        {(() => {
                          const list = Array.isArray(aiAnalysis.analysis.catalysts)
                            ? aiAnalysis.analysis.catalysts
                            : (aiAnalysis.analysis.catalysts ? [aiAnalysis.analysis.catalysts] : []);
                          return list.length > 0 && (
                            <div>
                              <span className="text-green-400 text-sm font-medium">Catalysts:</span>
                              <div className="mt-1 space-y-1">
                                {list.map((catalyst, index) => (
                                  <div key={index} className="flex items-start space-x-2">
                                    <span className="text-green-400 mt-1">•</span>
                                    <span className="text-gray-300 text-sm">{catalyst}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        {(() => {
                          const list = Array.isArray(aiAnalysis.analysis.redFlags)
                            ? aiAnalysis.analysis.redFlags
                            : (aiAnalysis.analysis.redFlags ? [aiAnalysis.analysis.redFlags] : []);
                          return list.length > 0 && (
                            <div>
                              <span className="text-red-400 text-sm font-medium">Red Flags:</span>
                              <div className="mt-1 space-y-1">
                                {list.map((flag, index) => (
                                  <div key={index} className="flex items-start space-x-2">
                                    <span className="text-red-400 mt-1">•</span>
                                    <span className="text-gray-300 text-sm">{flag}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actionable Recommendations */}
                {aiAnalysis.analysis.actionableRecommendations && aiAnalysis.analysis.actionableRecommendations.length > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg p-4 border border-purple-500/30">
                    <h5 className="text-white font-semibold mb-3 flex items-center">
                      🎯 Recommended Actions
                    </h5>
                    <div className="space-y-2">
                      {aiAnalysis.analysis.actionableRecommendations.map((rec, index) => (
                        <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${
                          rec.priority === 'high' ? 'border-red-500/30 bg-red-900/10' :
                          rec.priority === 'medium' ? 'border-yellow-500/30 bg-yellow-900/10' :
                          'border-gray-500/30 bg-gray-900/10'
                        }`}>
                          <div className="flex items-center space-x-3">
                            <span className="text-2xl">{rec.icon}</span>
                            <div>
                              <div className="text-white font-medium capitalize">
                                {rec.action.replace(/_/g, ' ')}
                              </div>
                              {rec.tool && (
                                <div className="text-purple-400 text-xs font-medium mb-1">
                                  🛠️ {rec.tool}
                                </div>
                              )}
                              <div className="text-gray-400 text-sm">{rec.reason}</div>
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            rec.priority === 'high' ? 'bg-red-900 text-red-300' :
                            rec.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                            'bg-gray-900 text-gray-300'
                          }`}>
                            {rec.priority}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Feedback & Footer */}
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-400 text-sm">Was this analysis helpful?</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => submitAIFeedback(aiAnalysis.analysis.metadata?.analysisId, 'positive')}
                          className="px-3 py-1 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded text-sm transition-colors"
                        >
                          👍 Yes
                        </button>
                        <button
                          onClick={() => submitAIFeedback(aiAnalysis.analysis.metadata?.analysisId, 'negative')}
                          className="px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-sm transition-colors"
                        >
                          👎 No
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Analysis ID: {aiAnalysis.analysis.metadata?.analysisId?.slice(-8) || 'N/A'} • 
                      Data Freshness: {aiAnalysis.dataFreshness} • 
                      Generated: {aiAnalysis.analysis.metadata?.analysisTimestamp ? new Date(aiAnalysis.analysis.metadata.analysisTimestamp).toLocaleTimeString() : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setShowAIAnalysis(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Error Display */}
        {aiError && (
          <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-500 text-red-200 px-4 py-3 rounded-lg max-w-md z-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">AI Analysis Failed</div>
                <div className="text-sm">{aiError}</div>
              </div>
              <button
                onClick={() => setAiError(null)}
                className="text-red-400 hover:text-red-200 ml-4"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TokenDetails;