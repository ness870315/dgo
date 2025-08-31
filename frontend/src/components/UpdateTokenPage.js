import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, AlertCircle, Loader, ArrowLeft, Twitter, Globe, MessageCircle, Music, Instagram } from 'lucide-react';
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
    website: ''
  });
  
  const [validationComplete, setValidationComplete] = useState(false);
  const [currentSocials, setCurrentSocials] = useState(null);

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

  // Search for tokens
  const searchTokens = async (symbol) => {
    if (!symbol || symbol.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/api/tokens`);
      const tokens = await response.json();
      const tokenArray = Array.isArray(tokens) ? tokens : (tokens.tokens || []);
      
      // Filter tokens by symbol or name
      const filtered = tokenArray.filter(token => 
        token.symbol?.toLowerCase().includes(symbol.toLowerCase()) ||
        token.name?.toLowerCase().includes(symbol.toLowerCase())
      ).slice(0, 10); // Limit to 10 results
      
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
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/api/tokens/${symbol}/socials`);
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
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/api/tokens/update-socials`, {
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
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">Update Token Socials</h1>
              <p className="text-gray-400 mt-1">Add or update social media links for better community scoring</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

                {/* Test Mode Button */}
                {user && (
                  <div className="mt-6">
                    <button
                      onClick={handleTestModeUpdate}
                      className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                      disabled={loading}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center space-x-2">
                          <Loader size={16} className="animate-spin" />
                          <span>Updating...</span>
                        </div>
                      ) : (
                        '🧪 Test Mode - Update Socials (Skip Payment)'
                      )}
                    </button>
                    <p className="text-yellow-200 text-xs mt-2 text-center">
                      For testing purposes only - bypasses payment
                    </p>
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
    </div>
  );
};

export default UpdateTokenPage;
