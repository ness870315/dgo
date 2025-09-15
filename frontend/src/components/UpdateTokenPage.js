import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, AlertCircle, Loader, ArrowLeft, Twitter, Globe, MessageCircle, Music, Instagram, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const UpdateTokenPage = ({ onBack, onTokenUpdated, initialToken = null }) => {
  const { user, isAuthenticated } = useAuth(); // Use AuthContext instead of localStorage
  const [searchSymbol, setSearchSymbol] = useState(initialToken?.symbol || '');
  const [selectedToken, setSelectedToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  
  // Social links form state
  const [socials, setSocials] = useState({
    twitter: '',
    discord: '',
    instagram: '',
    tiktok: '',
    website: '',
    telegram: ''
  });
  
  const [validationComplete, setValidationComplete] = useState(false);
  const [currentSocials, setCurrentSocials] = useState(null);
  const [contractValidated, setContractValidated] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  
  // Helio payment widget state
  const [helioLoaded, setHelioLoaded] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Load current socials if token is pre-selected
  useEffect(() => {
    if (selectedToken) {
      loadCurrentSocials(selectedToken.symbol);
    }
  }, [selectedToken]);

  // Debug authentication state
  useEffect(() => {
    console.log('🔍 UpdateToken Auth Debug:', {
      user: user,
      isAuthenticated: isAuthenticated,
      userExists: !!user
    });
  }, [user, isAuthenticated]);

  // Debug component mount
  useEffect(() => {
    console.log('🚀 UpdateTokenPage COMPONENT MOUNTED!');
    console.log('📍 Current URL:', window.location.href);
    console.log('👤 Auth state:', { user, isAuthenticated });
  }, []);

  // Load Helio Pay script
  useEffect(() => {
    const loadHelioScript = () => {
      // Check if script is already loaded
      if (document.querySelector('script[src*="embed.hel.io"]')) {
        setHelioLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.crossOrigin = 'anonymous';
      script.src = 'https://embed.hel.io/assets/index-v1.js';
      script.onload = () => {
        console.log('✅ Helio Pay script loaded for Update Token');
        setHelioLoaded(true);
      };
      script.onerror = () => {
        console.error('❌ Failed to load Helio Pay script for Update Token');
      };
      document.head.appendChild(script);
    };

    loadHelioScript();
  }, []);

  // Initialize Helio widget when conditions are met
  useEffect(() => {
    console.log('🔍 Helio Widget Init Check:', {
      helioLoaded,
      validationComplete,
      selectedToken: !!selectedToken,
      paymentCompleted,
      helioCheckoutExists: !!window.helioCheckout
    });
    
    if (helioLoaded && validationComplete && selectedToken && !paymentCompleted) {
      // Add a small delay to ensure the container is rendered
      const initializeWidget = () => {
        const container = document.getElementById('helioUpdateCheckoutContainer');
        console.log('🔍 Container found:', !!container);
        
        if (container && window.helioCheckout) {
          console.log('🎯 Initializing Helio Pay widget for Update Token...');
          
          try {
            window.helioCheckout(container, {
              paylinkId: "68b51815c743122a7be18721", // Update Token paylink ID
              theme: { "themeMode": "dark" },
              primaryColor: "#FE5300", // Orange color as specified
              neutralColor: "#5A6578",
              display: "inline",
              // Add additional configuration to help with authorization
              environment: "production",
              allowedDomains: ["degen-oracle.com", "localhost"],
              onSuccess: async (event) => {
                console.log('✅ Update Token Payment Success:', event);
                setPaymentCompleted(true);
                setPaymentProcessing(false);
                
                // Store payment info for processing
                localStorage.setItem('pendingUpdatePayment', JSON.stringify({
                  tokenData: selectedToken,
                  socials: socials,
                  paymentId: event.paymentId || `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  paymentInitiated: new Date().toISOString(),
                  helioEvent: event
                }));
                
                // Automatically apply the social updates
                try {
                  console.log('🚀 Auto-applying social updates after payment success...');
                  await handleApplyUpdate();
                } catch (error) {
                  console.error('❌ Error auto-applying updates:', error);
                }
              },
              onError: (event) => {
                console.error('❌ Update Token Payment Error:', event);
                setPaymentProcessing(false);
                alert('Payment failed. Please try again.');
              },
              onPending: (event) => {
                console.log('⏳ Update Token Payment Pending:', event);
                setPaymentProcessing(true);
              },
              onCancel: () => {
                console.log('❌ Update Token Payment Cancelled');
                setPaymentProcessing(false);
              },
              onStartPayment: () => {
                console.log('🚀 Update Token Payment Started');
                setPaymentProcessing(true);
              }
            });
          } catch (error) {
            console.error('❌ Helio widget initialization error:', error);
          }
        } else {
          console.log('⏳ Container not ready, retrying in 500ms...');
          setTimeout(initializeWidget, 500);
        }
      };
      
      // Try to initialize immediately, then retry if needed
      setTimeout(initializeWidget, 100);
    }
  }, [helioLoaded, validationComplete, selectedToken, paymentCompleted, socials]);

  // Expose debug function globally for testing
  useEffect(() => {
    window.debugHelioWidget = () => {
      console.log('🔧 DEBUG: Manual Helio Widget Check');
      console.log('helioLoaded:', helioLoaded);
      console.log('validationComplete:', validationComplete);
      console.log('selectedToken:', selectedToken);
      console.log('paymentCompleted:', paymentCompleted);
      console.log('window.helioCheckout exists:', !!window.helioCheckout);
      
      const container = document.getElementById('helioUpdateCheckoutContainer');
      console.log('Container found:', !!container);
      console.log('Container element:', container);
      
      if (container && window.helioCheckout) {
        console.log('🎯 Manually initializing Helio widget...');
        try {
          window.helioCheckout(container, {
            paylinkId: "68b51815c743122a7be18721",
            theme: { "themeMode": "dark" },
            primaryColor: "#FE5300",
            neutralColor: "#5A6578",
            display: "inline",
            environment: "production",
            allowedDomains: ["degen-oracle.com", "localhost"],
            onSuccess: (event) => console.log('✅ Manual Success:', event),
            onError: (event) => console.error('❌ Manual Error:', event),
            onPending: (event) => console.log('⏳ Manual Pending:', event),
            onCancel: () => console.log('❌ Manual Cancel'),
            onStartPayment: () => console.log('🚀 Manual Start')
          });
        } catch (error) {
          console.error('❌ Manual initialization error:', error);
        }
      }
    };
    
    window.debugContractValidation = async () => {
      console.log('🔧 DEBUG: Testing contract validation...');
      try {
        const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        const response = await fetch(`${apiBase}/api/tokens`);
        const tokens = await response.json();
        console.log('📊 API returned', tokens.length, 'tokens');

        const targetContract = '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS';
        const foundToken = tokens.find(token =>
          token.contractAddress &&
          token.contractAddress.toLowerCase() === targetContract.toLowerCase()
        );

        if (foundToken) {
          console.log('✅ FOUND MEMEPUTER:', foundToken.symbol, '-', foundToken.contractAddress);
          return { success: true, token: foundToken };
        } else {
          console.log('❌ MEMEPUTER NOT FOUND in API response');
          console.log('🔍 First 5 tokens:');
          tokens.slice(0, 5).forEach((token, index) => {
            console.log(`${index + 1}. ${token.symbol} - ${token.contractAddress}`);
          });
          return { success: false };
        }
      } catch (error) {
        console.log('❌ Debug error:', error);
        return { success: false, error: error.message };
      }
    };
  }, []);

  // Check for pending update payment on component mount
  useEffect(() => {
    const pendingData = localStorage.getItem('pendingUpdatePayment');
    if (pendingData) {
      try {
        const pending = JSON.parse(pendingData);
        setSelectedToken(pending.tokenData);
        setSocials(pending.socials || {});
        setPaymentCompleted(true);
        console.log('Found pending update payment:', pending);
      } catch (error) {
        console.error('Error parsing pending update payment:', error);
        localStorage.removeItem('pendingUpdatePayment');
      }
    }
  }, []);

  // Search for tokens
  const searchTokens = async (symbol) => {
    console.log('🔍 searchTokens called with:', symbol);
    if (!symbol || symbol.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens`);
      const tokens = await response.json();
      const tokenArray = Array.isArray(tokens) ? tokens : (tokens.tokens || []);
      
      // Filter tokens by symbol, name, or contract address
      const filtered = tokenArray.filter(token =>
        token.symbol?.toLowerCase().includes(symbol.toLowerCase()) ||
        token.name?.toLowerCase().includes(symbol.toLowerCase()) ||
        token.contractAddress?.toLowerCase().includes(symbol.toLowerCase())
      ).slice(0, 10); // Limit to 10 results

      console.log('🔍 Search results for "' + symbol + '":', filtered.length + ' tokens found');
      filtered.forEach((token, index) => {
        console.log(`${index + 1}. ${token.symbol} (${token.contractAddress})`);
      });

      setSearchResults(filtered);
      setShowResults(true);
    } catch (error) {
      console.error('Error searching tokens:', error);
      setSearchResults([]);
    }
  };

  // Load current social links for a token
  const loadCurrentSocials = async (symbol) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/${symbol}/socials`);
      const data = await response.json();
      
      if (data.success && data.socials) {
        setCurrentSocials(data.socials);
        // Pre-fill form with existing socials
        setSocials({
          twitter: data.socials.socials?.twitter || '',
          discord: data.socials.socials?.discord || '',
          instagram: data.socials.socials?.instagram || '',
          tiktok: data.socials.socials?.tiktok || '',
          website: data.socials.socials?.website || ''
        });
      } else {
        setCurrentSocials(null);
        // Reset form
        setSocials({
          twitter: '',
          discord: '',
          instagram: '',
          tiktok: '',
          website: ''
        });
      }
    } catch (error) {
      console.error('Error loading current socials:', error);
      setCurrentSocials(null);
    }
  };

  // Handle token selection
  const handleTokenSelect = (token) => {
    console.log('🎯 TOKEN SELECTED:', token);
    console.log('🔗 CONTRACT ADDRESS:', token.contractAddress);
    console.log('📋 FULL TOKEN OBJECT:', token);

    setSelectedToken(token);
    setSearchSymbol(token.symbol);
    setShowResults(false);
    setValidationComplete(true);
    loadCurrentSocials(token.symbol);
  };

  // Handle social link input changes
  const handleSocialChange = (platform, value) => {
    setSocials(prev => ({
      ...prev,
      [platform]: value
    }));
  };

  // Validate social links
  const validateSocials = () => {
    const errors = [];
    
    // Twitter handle validation
    if (socials.twitter && !/^[a-zA-Z0-9_]{1,15}$/.test(socials.twitter.replace(/^@/, ''))) {
      errors.push('Invalid Twitter handle format');
    }
    
    // Website URL validation
    if (socials.website && socials.website.trim()) {
      try {
        const url = socials.website.startsWith('http') ? socials.website : `https://${socials.website}`;
        new URL(url);
      } catch {
        errors.push('Invalid website URL format');
      }
    }
    
    return errors;
  };

  // Test Mode: Update token without payment (for testing)
  const handleApplyUpdate = async () => {
    if (!selectedToken) {
      setError('No token selected');
      return;
    }

    if (!user) {
      setError('Please login to update token socials');
      return;
    }

    const validationErrors = validateSocials();
    if (validationErrors.length > 0) {
      setError('Validation errors:\n' + validationErrors.join('\n'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check if there's pending payment data
      const pendingData = localStorage.getItem('pendingUpdatePayment');
      let paymentEvent = null;

      if (pendingData) {
        const pending = JSON.parse(pendingData);
        paymentEvent = {
          id: pending.paymentId,
          type: 'social_update',
          amount: 35,
          currency: 'USD',
          status: 'completed',
          validatedAt: new Date().toISOString()
        };
        console.log('Found pending update payment:', pending);
      }

      const result = await submitSocialsUpdate(socials, paymentEvent);

      if (result.success) {
        const successMessage = `🎉 SOCIAL LINKS UPDATED!\n\n` +
          `Token Updated: ${selectedToken.name} (${selectedToken.symbol})\n\n` +
          `📱 UPDATED SOCIAL LINKS:\n` +
          `• Twitter: ${socials.twitter ? '@' + socials.twitter : 'Not set'}\n` +
          `• Discord: ${socials.discord || 'Not set'}\n` +
          `• Instagram: ${socials.instagram ? '@' + socials.instagram : 'Not set'}\n` +
          `• TikTok: ${socials.tiktok ? '@' + socials.tiktok : 'Not set'}\n` +
          `• Website: ${socials.website || 'Not set'}\n\n` +
          `📊 COMMUNITY SCORE IMPACT:\n` +
          `${result.communityScoreImpact?.description || 'No bonus calculated'}\n\n` +
          `✅ Social links updated successfully!`;

        console.log('🎉 DETAILED UPDATE RESULTS:', result);

        // Show success modal
        setUpdateSuccess(true);
        setShowSuccessModal(true);

        // Notify parent component that token was updated
        if (onTokenUpdated && selectedToken) {
          onTokenUpdated(selectedToken);
        }

        // Note: Score recalculation is handled automatically by the backend
        // when social links are updated via updateMainTokensCache()
        console.log('✅ Social links updated - backend handles score recalculation automatically');

        // Reset form after a delay to allow user to see success modal
        setTimeout(() => {
          setSearchSymbol('');
          setSelectedToken(null);
          setSocials({
            twitter: '',
            discord: '',
            instagram: '',
            tiktok: '',
            website: '',
            telegram: ''
          });
          setCurrentSocials(null);
          setValidationComplete(false);
          setContractValidated(false);
          setPaymentCompleted(false);
          localStorage.removeItem('pendingUpdatePayment');
          setError('');
          setShowSuccessModal(false);
          setUpdateSuccess(false);
        }, 3000);
      } else {
        setError(`Update failed: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Update error:', error);
      setError(`Update error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestModeUpdate = async () => {
    if (!selectedToken) {
      alert('No token selected');
      return;
    }

    if (!user) {
      alert('Please login to update token socials');
      return;
    }

    const validationErrors = validateSocials();
    if (validationErrors.length > 0) {
      alert('Validation errors:\n' + validationErrors.join('\n'));
      return;
    }

    console.log('🧪 TEST MODE: Updating token socials without payment');
    
    try {
      const testPaymentEvent = {
        id: 'TEST_UPDATE_' + Date.now(),
        type: 'test_mode_update',
        amount: 0,
        currency: 'TEST',
        status: 'completed_test_mode'
      };

      const result = await submitSocialsUpdate(socials, testPaymentEvent);
      
      if (result.success) {
        const successMessage = `🎉 TEST MODE SUCCESS!\n\n` +
          `Token Updated: ${selectedToken.name} (${selectedToken.symbol})\n\n` +
          `📱 UPDATED SOCIAL LINKS:\n` +
          `• Twitter: ${socials.twitter ? '@' + socials.twitter : 'Not set'}\n` +
          `• Discord: ${socials.discord || 'Not set'}\n` +
          `• Instagram: ${socials.instagram ? '@' + socials.instagram : 'Not set'}\n` +
          `• TikTok: ${socials.tiktok ? '@' + socials.tiktok : 'Not set'}\n` +
          `• Website: ${socials.website || 'Not set'}\n\n` +
          `📊 COMMUNITY SCORE IMPACT:\n` +
          `${result.communityScoreImpact?.description || 'No bonus calculated'}\n\n` +
          `✅ Social links updated successfully!`;
        
        alert(successMessage);
        
        console.log('🎉 DETAILED UPDATE RESULTS:', result);
        
        // Notify parent component that token was updated
        if (onTokenUpdated && selectedToken) {
          onTokenUpdated(selectedToken);
        }
        
        // Reset form
        setSearchSymbol('');
        setSelectedToken(null);
        setSocials({
          twitter: '',
          discord: '',
          instagram: '',
          tiktok: '',
          website: ''
        });
        setCurrentSocials(null);
        setValidationComplete(false);
        setError('');
      } else {
        alert(`❌ Update failed: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Test mode error:', error);
      alert(`❌ Test mode error: ${error.message}`);
    }
  };

  // Submit socials update to backend
  const submitSocialsUpdate = async (socialsData, paymentEvent) => {
    try {
      console.log('🔄 Submitting socials update:', {
        symbol: selectedToken.symbol,
        socials: socialsData,
        user: user
      });
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/update-socials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selectedToken.symbol,
          socials: socialsData,
          userId: user.id,
          paymentData: paymentEvent
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ Socials successfully updated:', result);
      } else {
        console.error('❌ Failed to update socials:', result);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error submitting socials update:', error);
      return { success: false, message: error.message };
    }
  };

  // Get social platform icon
  const getSocialIcon = (platform) => {
    switch (platform) {
      case 'twitter': return <Twitter size={16} className="text-blue-400" />;
      case 'discord': return <MessageCircle size={16} className="text-indigo-400" />;
      case 'instagram': return <Instagram size={16} className="text-pink-400" />;
      case 'tiktok': return <Music size={16} className="text-red-400" />;
      case 'website': return <Globe size={16} className="text-green-400" />;
      case 'telegram': return <Send size={16} className="text-cyan-400" />;
      default: return null;
    }
  };

  // Get social platform placeholder
  const getSocialPlaceholder = (platform) => {
    switch (platform) {
      case 'twitter': return 'username (without @)';
      case 'discord': return 'discord.gg/invite or server name';
      case 'instagram': return 'username (without @)';
      case 'tiktok': return 'username (without @)';
      case 'website': return 'https://example.com';
      case 'telegram': return 't.me/username or @username';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-solana-purple/60 bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              title="Go back"
            >
              <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-white">Update Token Socials</h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">Add or update social media links for better community scoring</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Display */}
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-xl p-4 sm:p-6 text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Update Token Socials</h2>
          <div className="text-2xl sm:text-3xl font-bold text-white">$35</div>
          <p className="text-green-100 mt-2 text-sm sm:text-base">One-time social update fee</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Left Column - Token Search & Social Form */}
          <div className="space-y-6">
            {/* Authentication Check */}
            {!user && (
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <AlertCircle size={16} className="text-yellow-400" />
                  <p className="text-yellow-300 font-medium">Authentication Required</p>
                </div>
                <p className="text-yellow-200 text-sm mt-1">
                  Please login to update token social links. This helps prevent spam and ensures quality updates.
                </p>
              </div>
            )}

            {/* Token Search */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Find Token</h2>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchSymbol}
                  onChange={(e) => {
                    setSearchSymbol(e.target.value);
                    searchTokens(e.target.value);
                  }}
                  placeholder="Search by token symbol or name..."
                  className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                  disabled={loading}
                />
              </div>

              {/* Search Results */}
              {showResults && searchResults.length > 0 && (
                <div className="mt-4 bg-dark-bg border border-gray-600 rounded-lg max-h-60 overflow-y-auto">
                  {searchResults.map((token, index) => (
                    <button
                      key={index}
                      onClick={() => handleTokenSelect(token)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700 border-b border-gray-600 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {token.jupiterData?.icon ? (
                          <img 
                            src={token.jupiterData.icon} 
                            alt={token.symbol}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-bold">
                              {token.symbol?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{token.symbol}</p>
                          <p className="text-gray-400 text-sm">{token.name}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showResults && searchResults.length === 0 && searchSymbol.length > 2 && (
                <div className="mt-4 p-4 bg-gray-800 rounded-lg text-center">
                  <p className="text-gray-400">No tokens found matching "{searchSymbol}"</p>
                </div>
              )}
            </div>

            {/* Social Links Form */}
            {selectedToken && validationComplete && (
              <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Update Social Links</h2>
                
                {/* Current Socials Display */}
                {currentSocials && (
                  <div className="mb-6 p-4 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-600">
                    <p className="text-blue-300 font-medium mb-2">Current Social Links:</p>
                    <div className="space-y-1 text-sm">
                      {Object.entries(currentSocials.socials || {}).map(([platform, value]) => (
                        <div key={platform} className="flex items-center space-x-2">
                          {getSocialIcon(platform)}
                          <span className="text-blue-200 capitalize">{platform}:</span>
                          <span className="text-blue-100">{value || 'Not set'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {Object.entries(socials).map(([platform, value]) => (
                    <div key={platform}>
                      <label className="block text-sm font-medium text-gray-300 mb-2 capitalize">
                        <div className="flex items-center space-x-2">
                          {getSocialIcon(platform)}
                          <span>{platform}</span>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleSocialChange(platform, e.target.value)}
                        placeholder={getSocialPlaceholder(platform)}
                        className="block w-full px-3 py-3 border border-gray-600 rounded-lg bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                        disabled={!user}
                      />
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 flex items-center space-x-2 p-3 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg">
                    <AlertCircle size={16} className="text-red-400" />
                    <span className="text-red-400 text-sm">{error}</span>
                  </div>
                )}

                {/* Proceed to Payment */}
                {user && selectedToken && (
                  <div className="mt-6">
                    {!contractValidated ? (
                      <div className="mb-4">
                        <button
                          onClick={async () => {
                            setLoading(true);
                            try {
                              console.log('🔍 Starting contract validation...');
                              console.log('📋 Selected token:', selectedToken);
                              console.log('🔗 Contract address to validate:', selectedToken?.contractAddress);

                              // Check if token exists in our database by fetching all tokens and filtering
                              const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens`);
                              const tokens = await response.json();
                              console.log('📊 Fetched tokens from API:', tokens.length);

                              // Find the token by contract address (case insensitive)
                              const contractAddress = selectedToken.contractAddress;
                              console.log('🔍 Searching for contract:', contractAddress);

                              const foundToken = tokens.find(token => {
                                const tokenContract = token.contractAddress;
                                const match = tokenContract &&
                                  tokenContract.toLowerCase() === contractAddress.toLowerCase();
                                if (match) {
                                  console.log('✅ Found matching token:', token.symbol, '-', tokenContract);
                                }
                                return match;
                              });

                              if (foundToken) {
                                setContractValidated(true);
                                setError('');
                                console.log('✅ Contract validation successful:', foundToken.symbol);
                              } else {
                                console.log('❌ Token not found. Available tokens:', tokens.map(t => ({ symbol: t.symbol, contract: t.contractAddress })));
                                const availableTokens = tokens.filter(t => t.symbol).map(t => t.symbol).join(', ');
                                setError(`Token not found in database. Available tokens: ${availableTokens}. This token may need to be listed first.`);
                              }
                            } catch (error) {
                              console.error('Error validating contract:', error);
                              setError('Failed to validate contract address. Please try again.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                        >
                          {loading ? (
                            <div className="flex items-center justify-center space-x-2">
                              <Loader size={16} className="animate-spin" />
                              <span>Validating...</span>
                            </div>
                          ) : (
                            '🔍 Validate Contract Address (Check Available Tokens)'
                          )}
                        </button>
                      </div>
                    ) : !paymentCompleted ? (
                      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                        <div className="p-6">
                          <div className="flex items-center space-x-3 mb-6">
                            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                              <span className="text-white text-sm font-bold">$</span>
                            </div>
                            <h3 className="text-lg font-semibold text-white">Secure Payment</h3>
                          </div>
                          
                          <div className="space-y-3 mb-6">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Service:</span>
                              <span className="text-white font-semibold">Social Links Update</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Token:</span>
                              <span className="text-white font-semibold">{selectedToken.symbol}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Price:</span>
                              <span className="text-white font-semibold">$35</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Payment Method:</span>
                              <span className="text-green-400 font-semibold">USDC</span>
                            </div>
                          </div>
                          
                          <div className="border-t border-gray-600 pt-4 mb-6">
                            <p className="text-gray-300 text-sm mb-2">Complete your payment to update social links</p>
                            <p className="text-gray-400 text-xs">Secure payment powered by Helio Pay • USDC on Solana</p>
                          </div>
                          
                          {/* Helio Widget Container - Original Size */}
                          <div className="relative">
                            <div id="helioUpdateCheckoutContainer" className="w-full -ml-4">
                              {!helioLoaded && (
                                <div className="min-h-[300px] flex flex-col items-center justify-center space-y-4 text-gray-400">
                                  <div className="flex items-center space-x-3">
                                    <Loader className="w-5 h-5 animate-spin text-orange-400" />
                                    <span className="text-base font-medium">Loading payment widget...</span>
                                  </div>
                                  <div className="w-6 h-1 bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full animate-pulse"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Security Footer */}
                          <div className="mt-6 pt-4 border-t border-gray-600">
                            <div className="flex items-center justify-center space-x-6 text-xs text-gray-400">
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                <span className="font-medium">SSL Encrypted</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                <span className="font-medium">PCI Compliant</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                                <span className="font-medium">Instant Processing</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                        <h4 className="text-green-300 font-medium mb-2">✅ Payment Completed!</h4>
                        <p className="text-green-200 text-sm mb-4">
                          Your payment has been processed successfully. Social updates are being applied automatically...
                        </p>
                        {loading && (
                          <div className="flex items-center justify-center space-x-2 text-green-300">
                            <Loader size={16} className="animate-spin" />
                            <span>Applying Updates...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Token Preview & Benefits */}
          <div className="space-y-6">
            {/* Selected Token Preview */}
            {selectedToken && (
              <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckCircle size={20} className="text-green-400" />
                  <h2 className="text-xl font-semibold text-white">Selected Token</h2>
                </div>

                <div className="flex items-center space-x-3 mb-4">
                  {selectedToken.jupiterData?.icon ? (
                    <img 
                      src={selectedToken.jupiterData.icon} 
                      alt={selectedToken.name}
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">
                        {selectedToken.symbol?.charAt(0) || '?'}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedToken.name}</h3>
                    <p className="text-gray-400">{selectedToken.symbol}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-bg p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Current Score</p>
                    <p className="text-lg font-semibold text-white">
                      {selectedToken.communityScore?.toFixed(1) || 'N/A'}/10
                    </p>
                  </div>
                  <div className="bg-dark-bg p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Mentions (24h)</p>
                    <p className="text-lg font-semibold text-white">
                      {selectedToken.mentions || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Benefits Info */}
            <div className="bg-dark-card border border-green-500 rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-4">
                <CheckCircle size={20} className="text-green-400" />
                <h2 className="text-xl font-semibold text-white">Community Score Benefits</h2>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <p className="text-gray-300 text-sm">
                    <strong className="text-white">+1 point</strong> for 2+ social platforms
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <p className="text-gray-300 text-sm">
                    <strong className="text-white">+2 points</strong> for 3+ social platforms
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <p className="text-gray-300 text-sm">
                    <strong className="text-white">+3 points</strong> for all 5 social platforms
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-green-900 bg-opacity-30 rounded-lg">
                <p className="text-green-300 text-sm">
                  💡 <strong>Pro Tip:</strong> Adding official Twitter handles improves tweet relevance and community scoring accuracy!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && updateSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-green-500 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-8 text-center">
              {/* Success Icon */}
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-white" />
              </div>
              
              {/* Success Title */}
              <h2 className="text-2xl font-bold text-white mb-4">
                🎉 Social Links Updated!
              </h2>
              
              {/* Success Message */}
              <div className="space-y-3 mb-6">
                <p className="text-gray-300">
                  Your social links for <span className="text-white font-semibold">{selectedToken?.symbol}</span> have been successfully updated!
                </p>
                <div className="bg-green-900 bg-opacity-30 rounded-lg p-4 border border-green-500">
                  <p className="text-green-300 text-sm">
                    ✅ Payment processed successfully<br/>
                    ✅ Social links applied<br/>
                    ✅ Community score updated automatically
                  </p>
                </div>
              </div>
              
              {/* Action Button */}
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setUpdateSuccess(false);
                }}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
              >
                🚀 Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateTokenPage;
