import React, { useState, useEffect, useMemo } from 'react';
import { X, Twitter } from 'lucide-react';
import { Flame, Rocket, Zap, Gem, ArrowLeft, Search } from 'lucide-react';
import fuelImageGenerator from '../services/fuelImageGenerator';
import { useAuth } from '../contexts/AuthContext';

const FuelTokenPage = ({ onBack, headerAuth = null, onFuelApplied }) => {
  const { sessionId } = useAuth();
  const [selectedFuel, setSelectedFuel] = useState(null);
  const [contractAddress, setContractAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [fueledTokens, setFueledTokens] = useState([]);
  const [contractValidated, setContractValidated] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  
  // Fuel Share states
  const [showFuelShareModal, setShowFuelShareModal] = useState(false);
  const [fuelShareMessage, setFuelShareMessage] = useState('');
  const [appliedFuelType, setAppliedFuelType] = useState(null);
  const [appliedTokenSymbol, setAppliedTokenSymbol] = useState('');
  const [fuelImageDataURL, setFuelImageDataURL] = useState('');

  const fuelOptions = [
    {
      type: '10x',
      icon: '🚀',
      boost: '15%',
      multiplier: 1.15,
      price: '$45',
      duration: '12 hours',
      helioLink: 'https://app.hel.io/pay/68b50d01c743122a7be16ce9',
      description: 'Basic fuel boost'
    },
    {
      type: '50x',
      icon: '🔥',
      boost: '25%',
      multiplier: 1.25,
      price: '$195',
      duration: '18 hours',
      helioLink: 'https://app.hel.io/pay/68b50dd130074e35926e3c8d',
      description: 'Popular choice'
    },
    {
      type: '500x',
      icon: '⚡',
      boost: '35%',
      multiplier: 1.35,
      price: '$695',
      duration: '24 hours',
      helioLink: 'https://app.hel.io/pay/68b50cef3d14a3c150c1f6cb',
      description: 'High performance'
    },
    {
      type: '1000x',
      icon: '💎',
      boost: '45%',
      multiplier: 1.45,
      price: '$995',
      duration: '24 hours',
      helioLink: 'https://app.hel.io/pay/68b50ded2b102da2c16c2359',
      description: 'Maximum boost'
    }
  ];

  // Map fuel type to Helio Paylink IDs
  const paylinkByType = useMemo(() => ({
    '10x': '68b50d01c743122a7be16ce9',
    '50x': '68b50dd130074e35926e3c8d',
    '500x': '68b50cef3d14a3c150c1f6cb',
    '1000x': '68b50ded2b102da2c16c2359'
  }), []);

  useEffect(() => {
    loadFueledTokens();
    const interval = setInterval(loadFueledTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  // Refresh fueled tokens when component becomes visible (e.g., when navigating from TokenDetails)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔥 FuelTokenPage: Page became visible, refreshing fueled tokens...');
        loadFueledTokens();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also refresh when component mounts (in case user navigated here from TokenDetails)
    console.log('🔥 FuelTokenPage: Component mounted, refreshing fueled tokens...');
    loadFueledTokens();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Remove any stale pending payment; do not auto-show any modal/message on load
  useEffect(() => {
    try { localStorage.removeItem('pendingFuelPayment'); } catch (_) {}
  }, []);



  const loadFueledTokens = async () => {
    try {
      console.log('🔥 FuelTokenPage: Loading fueled tokens...');
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/fuel`);
      console.log('🔥 FuelTokenPage: API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔥 FuelTokenPage: API response data:', data);
        const fueledArray = data.value || data;
        console.log('🔥 FuelTokenPage: Setting fueled tokens:', fueledArray);
        setFueledTokens(fueledArray);
      } else {
        console.error('🔥 FuelTokenPage: API error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('🔥 FuelTokenPage: Error loading fueled tokens:', error);
    }
  };

  const handleFuelSelect = (fuelType) => {
    setSelectedFuel(fuelType);
  };

  const handleValidateContract = async () => {
    if (!contractAddress.trim()) {
      setMessage({ text: 'Please enter a contract address', type: 'error' });
      return;
    }

    // Basic validation for Solana contract address format
    if (contractAddress.length !== 44 && contractAddress.length !== 32) {
      setMessage({ text: 'Invalid contract address format (must be 32 or 44 characters)', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Check if token exists in our database
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens?contract=${contractAddress.trim()}`);
      const tokens = await response.json();

      if (tokens && tokens.length > 0) {
        setMessage({ text: '✅ Contract address validated! Token found in database.', type: 'success' });
        setContractValidated(true);
      } else {
        setMessage({ text: '⚠️ Contract address not found in database. This token may need to be listed first.', type: 'error' });
      }
    } catch (error) {
      console.error('Error validating contract:', error);
      setMessage({ text: '❌ Failed to validate contract address. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToPayment = () => {
    if (!selectedFuel) {
      setMessage({ text: 'Please select a fuel type', type: 'error' });
      return;
    }

    const selectedFuelOption = fuelOptions.find(f => f.type === selectedFuel);
    if (selectedFuelOption && selectedFuelOption.helioLink) {
      // Store payment info in localStorage for post-payment processing
      localStorage.setItem('pendingFuelPayment', JSON.stringify({
        contractAddress: contractAddress.trim(),
        fuelType: selectedFuel,
        paymentId: `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentInitiated: new Date().toISOString()
      }));

      // Open Helio payment link
      window.open(selectedFuelOption.helioLink, '_blank');
      setMessage({ text: '💳 Payment page opened! Complete your payment and return here.', type: 'info' });
    } else {
      setMessage({ text: '❌ Payment link not available for selected fuel type.', type: 'error' });
    }
  };

  // Generate random fuel share messages
  const generateFuelShareMessage = (symbol, fuelType) => {
    const messages = [
      `I just Fueled #${symbol} for a ${fuelType} on @dgnoracle - a new cult is about to form 🔥`,
      `🚀 Just dropped ${fuelType} fuel on #${symbol} via @dgnoracle - this is about to go parabolic!`,
      `⚡ Fueled #${symbol} with ${fuelType} boost on @dgnoracle - the degen army is assembling!`,
      `🔥 ${fuelType} fuel applied to #${symbol} on @dgnoracle - watch this space, it's about to explode!`,
      `💎 Just fueled #${symbol} for ${fuelType} on @dgnoracle - the next alpha is loading...`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const handleApplyFuel = async () => {
    if (!contractAddress.trim()) {
      setMessage({ text: 'Please enter a contract address', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

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
          contractAddress: contractAddress.trim(),
          fuelType: fuelType,
          sessionId: sessionId
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ text: `✅ ${result.message}`, type: 'success' });
        
        // Get token symbol from the result or use a placeholder
        const tokenSymbol = result.token?.symbol || 'TOKEN';
        setAppliedFuelType(fuelType);
        setAppliedTokenSymbol(tokenSymbol);
        
        // Generate share message
        const shareMessage = generateFuelShareMessage(tokenSymbol, fuelType);
        setFuelShareMessage(shareMessage);
        
        // Generate fuel image
        try {
          const imageDataURL = await fuelImageGenerator.generateFuelImageDataURL(fuelType, tokenSymbol);
          setFuelImageDataURL(imageDataURL);
        } catch (error) {
          console.error('Error generating fuel image:', error);
          setFuelImageDataURL('');
        }
        
        // Show share modal
        setShowFuelShareModal(true);
        
        setContractAddress('');
        setSelectedFuel(null);
        setContractValidated(false);
        setPaymentCompleted(false);
        localStorage.removeItem('pendingFuelPayment');
        loadFueledTokens();
        
        // Notify parent component that fuel was applied
        if (onFuelApplied) {
          onFuelApplied();
        }
      } else {
        setMessage({ text: `❌ ${result.error}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error applying fuel:', error);
      setMessage({ text: '❌ Failed to apply fuel. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleFuelShare = () => {
    if (fuelShareMessage && appliedFuelType && appliedTokenSymbol) {
      try {
        // Use the main domain with URL parameters for fuel sharing (will redirect to API)
        // Updated: Fixed proxy route implementation for Twitter link previews
        const fuelPageUrl = `https://degen-oracle.com/?fuel=${appliedFuelType}&symbol=${appliedTokenSymbol}`;
        
        // Create Twitter URL with the fuel page link
        const twitterUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({
          text: `${fuelShareMessage}\n\n${fuelPageUrl}`
        }).toString()}`;
        
        // Open Twitter with the message and link
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Error sharing fuel:', error);
        // Fallback to text-only sharing
        const twitterUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({
          text: fuelShareMessage
        }).toString()}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleCloseFuelShare = () => {
    setShowFuelShareModal(false);
    setFuelShareMessage('');
    setAppliedFuelType(null);
    setAppliedTokenSymbol('');
  };

  const formatTimeRemaining = (remainingTime) => {
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m left`;
  };

  // Ensure Helio embed script
  useEffect(() => {
    if (document.querySelector('script[src*="embed.hel.io/assets/index-v1.js"]')) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.crossOrigin = 'anonymous';
    script.src = 'https://embed.hel.io/assets/index-v1.js';
    document.head.appendChild(script);
  }, []);

  // Initialize Helio widget once validated and fuel selected
  useEffect(() => {
    if (!selectedFuel || !contractValidated) return;
    if (!window.helioCheckout) return; // wait for script
    const container = document.getElementById('helioCheckoutContainerFuel');
    if (!container) return;

    try {
      window.helioCheckout(container, {
        paylinkId: paylinkByType[selectedFuel],
        theme: { themeMode: 'dark' },
        primaryColor: '#7C3AED',
        neutralColor: '#5A6578',
        display: 'inline',
        onSuccess: async (e) => {
          console.log('✅ Helio payment success:', e);
          setPaymentCompleted(true);
          
          // Store payment data for fuel application
          localStorage.setItem('pendingFuelPayment', JSON.stringify({
            contractAddress: contractAddress.trim(),
            fuelType: selectedFuel,
            paymentId: e.paymentId || `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            paymentInitiated: new Date().toISOString(),
            helioEvent: e
          }));
          
          // Auto-apply fuel after payment success
          try {
            console.log('🔥 Auto-applying fuel after payment success...');
            await handleApplyFuel();
          } catch (error) {
            console.error('❌ Error auto-applying fuel:', error);
            setMessage({ 
              text: '❌ Payment successful but fuel application failed. Please try again.', 
              type: 'error' 
            });
          }
        },
        onError: (e) => {
          console.error('❌ Helio payment error:', e);
          setMessage({ 
            text: '❌ Payment failed. Please try again.', 
            type: 'error' 
          });
        },
        onPending: (e) => {
          console.log('⏳ Helio payment pending:', e);
          setMessage({ 
            text: '⏳ Payment processing...', 
            type: 'info' 
          });
        },
        onCancel: () => {
          console.log('❌ Payment cancelled');
          setMessage({ 
            text: 'Payment cancelled', 
            type: 'info' 
          });
        },
        onStartPayment: () => {
          console.log('🚀 Starting payment');
          setMessage({ 
            text: '🚀 Processing payment...', 
            type: 'info' 
          });
        }
      });
    } catch (err) {
      console.error('Failed to init Helio widget:', err);
    }
  }, [selectedFuel, contractValidated, paylinkByType]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="bg-dark-card border-b border-solana-purple px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">🔥 Fuel Token</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            {headerAuth}
            <button
              onClick={onBack}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-solana-purple/60 flex items-center gap-2 text-sm sm:text-base"
            >
              <ArrowLeft size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Back to Main App</span>
              <span className="sm:hidden">Back</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className={`rounded-lg p-4 border ${selectedFuel ? 'border-green-400 bg-green-900/20' : 'border-gray-700 bg-gray-800/40'}`}>
            <div className="text-sm text-gray-300 mb-1">Step 1</div>
            <div className="text-white font-semibold">Select your Fuel</div>
          </div>
          <div className={`rounded-lg p-4 border ${contractValidated ? 'border-green-400 bg-green-900/20' : 'border-gray-700 bg-gray-800/40'}`}>
            <div className="text-sm text-gray-300 mb-1">Step 2</div>
            <div className="text-white font-semibold">Enter contract and Validate Token</div>
          </div>
          <div className={`rounded-lg p-4 border ${(selectedFuel && contractValidated) ? 'border-green-400 bg-green-900/20' : 'border-gray-700 bg-gray-800/40'}`}>
            <div className="text-sm text-gray-300 mb-1">Step 3</div>
            <div className="text-white font-semibold">Proceed to Payment</div>
          </div>
        </div>
        {/* Pricing Overview */}
        <div className="bg-gradient-to-r from-green-700/30 via-blue-700/30 to-purple-700/30 border border-purple-500/40 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">💰 Fuel Token Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div className="bg-dark-card p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">$45</div>
              <div className="text-sm text-gray-400">10x Fuel</div>
              <button onClick={() => setSelectedFuel('10x')} className={`mt-3 px-3 py-1 rounded ${selectedFuel==='10x' ? 'bg-solana-purple text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Select 10x</button>
            </div>
            <div className="bg-dark-card p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">$195</div>
              <div className="text-sm text-gray-400">50x Fuel</div>
              <button onClick={() => setSelectedFuel('50x')} className={`mt-3 px-3 py-1 rounded ${selectedFuel==='50x' ? 'bg-solana-purple text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Select 50x</button>
            </div>
            <div className="bg-dark-card p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">$695</div>
              <div className="text-sm text-gray-400">500x Fuel</div>
              <button onClick={() => setSelectedFuel('500x')} className={`mt-3 px-3 py-1 rounded ${selectedFuel==='500x' ? 'bg-solana-purple text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Select 500x</button>
            </div>
            <div className="bg-dark-card p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">$995</div>
              <div className="text-sm text-gray-400">1000x Fuel</div>
              <button onClick={() => setSelectedFuel('1000x')} className={`mt-3 px-3 py-1 rounded ${selectedFuel==='1000x' ? 'bg-solana-purple text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Select 1000x</button>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-4">
            💡 All fuel boosts last 12 hours and significantly increase your token's visibility and performance metrics.
          </p>
        </div>



        {/* Contract Address Input */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Search size={20} />
            Enter Contract Address
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Contract Address (CA):
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  placeholder="Enter Solana contract address..."
                  className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter a valid Solana contract address (32-44 characters)
              </p>
            </div>

            <button
              onClick={handleValidateContract}
              disabled={!contractAddress.trim() || loading}
              className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg transition-all duration-300 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-purple-600"
            >
              {loading ? '🔍 Validating...' : '🔍 Validate Contract Address'}
            </button>
          </div>
        </div>

        {/* Secure Payment (Helio) */}
        {(selectedFuel && contractValidated) && (
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">🔒 Secure Payment (Powered by Helio)</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-300">Selected Fuel:</span><span className="text-white font-semibold">{selectedFuel}</span></div>
              <div className="flex justify-between"><span className="text-gray-300">Duration:</span><span className="text-white font-semibold">12 hours</span></div>
              <div className="flex justify-between"><span className="text-gray-300">Price:</span><span className="text-white font-semibold">{fuelOptions.find(f => f.type === selectedFuel)?.price}</span></div>
            </div>
            <div className="mt-4 flex justify-center">
              <div id="helioCheckoutContainerFuel" className="w-full max-w-md"></div>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">By proceeding, you agree to Helio's terms. Payment initializes in a secure iframe.</p>
          </div>
        )}

        {/* Fuel Selection (only show before payment) */}
        {contractValidated && !selectedFuel && (
          <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Flame size={20} />
              Choose Fuel Boost
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {fuelOptions.map((fuel) => (
                <div
                  key={fuel.type}
                  onClick={() => setSelectedFuel(fuel.type)}
                  className={`bg-dark-bg border-2 rounded-lg p-4 text-center cursor-pointer transition-all duration-300 hover:scale-105 ${
                    selectedFuel === fuel.type
                      ? 'border-orange-500 bg-orange-900 bg-opacity-20'
                      : 'border-gray-600 hover:border-orange-400'
                  }`}
                >
                  <div className="text-3xl mb-2">{fuel.icon}</div>
                  <div className="text-lg font-bold text-white mb-1">{fuel.type}</div>
                  <div className="text-xl font-bold text-green-400 mb-1">{fuel.price}</div>
                  <div className="text-sm text-orange-400 mb-1">Duration: {fuel.duration}</div>
                  <div className="text-gray-400 text-sm">{fuel.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Display */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-900 bg-opacity-20 border-green-500 text-green-400'
              : 'bg-red-900 bg-opacity-20 border-red-500 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Currently Fueled Tokens */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Flame size={20} />
            Currently Fueled Tokens
          </h3>
          
          
          {fueledTokens.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-6xl mb-4">🚫</div>
              <div className="text-lg mb-2">No tokens are currently fueled</div>
              <div className="text-sm">Apply fuel to see tokens here</div>
            </div>
          ) : (
            <div className="space-y-4">
              {fueledTokens.map((token, index) => (
                <div key={index} className="bg-dark-bg border border-gray-600 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-lg font-bold text-yellow-400">{token.symbol}</div>
                      <div className="text-gray-400">{token.name || 'Unknown'}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                       <div className="text-sm text-gray-400">Total Boost</div>
                       <div className="text-yellow-400 font-bold">{token.totalBoost || token.boostMultiplier}x</div>
                     </div>
                    
                    <div className="text-center">
                      <div className="text-sm text-gray-400">Time Remaining</div>
                      <div className="text-orange-400">{formatTimeRemaining(token.remainingTime)}</div>
                    </div>
                    
                                         <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                       {token.fuelTypes ? token.fuelTypes.join(' + ') : token.fuelType}
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fuel Share Modal */}
        {showFuelShareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center">
                  <span className="mr-2">🔥</span>
                  Fuel Applied Successfully!
                </h3>
                <button
                  onClick={handleCloseFuelShare}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-300 mb-4">
                  Your {appliedFuelType} fuel has been applied to <strong className="text-white">#{appliedTokenSymbol}</strong>! 
                  Share your alpha with the community on X:
                </p>
                
                {/* Generated Fuel Image */}
                {fuelImageDataURL && (
                  <div className="mb-4 flex justify-center">
                    <img 
                      src={fuelImageDataURL} 
                      alt={`${appliedFuelType} fuel for ${appliedTokenSymbol}`}
                      className="max-w-full h-auto rounded-lg border border-orange-500/30"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                )}
                
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
                  <p className="text-white text-sm leading-relaxed">
                    "{fuelShareMessage}"
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleFuelShare}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center"
                  >
                    <Twitter size={16} className="mr-2" />
                    Share on X
                  </button>
                  
                  <button
                    onClick={async () => {
                      const newMessage = generateFuelShareMessage(appliedTokenSymbol, appliedFuelType);
                      setFuelShareMessage(newMessage);
                      
                      // Also regenerate the image
                      try {
                        const imageDataURL = await fuelImageGenerator.generateFuelImageDataURL(appliedFuelType, appliedTokenSymbol);
                        setFuelImageDataURL(imageDataURL);
                      } catch (error) {
                        console.error('Error regenerating fuel image:', error);
                      }
                    }}
                    className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center"
                    title="Generate new message and image"
                  >
                    🔄
                  </button>
                </div>

                <p className="text-xs text-gray-400 mt-3 text-center">
                  Click "Share on X" to open Twitter with your message ready to post
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCloseFuelShare}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FuelTokenPage;
