import React, { useState, useEffect } from 'react';
import { X, Twitter, ExternalLink, Star, AlertTriangle, TrendingUp, Clock, Copy, Users } from 'lucide-react';
import GraduationStatusBar from './GraduationStatusBar';
import PreBondingChart from './PreBondingChart';

const PreTokenDetail = ({ token, onClose, onNavigateToPremium }) => {
  const [showPriceChart, setShowPriceChart] = useState(false);
  const [bondingData, setBondingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [holdersData, setHoldersData] = useState(null);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mock bonding data - will be replaced with real API call
  useEffect(() => {
    // Simulate API call
    const fetchBondingData = async () => {
      setLoading(true);
      try {
        // Use actual token data from API
        const bondingData = {
          bondingProgress: token.bondingCurveProgress || 95.5,
          proximityLevel: token.graduationProximity || 'CLOSE_TO_GRADUATION',
          liquidity: token.liquidity || 45000,
          fullyDilutedValuation: token.fullyDilutedValuation || 75000,
          priceUsd: token.priceUsd || 0.000067557,
          priceNative: token.priceNative || 0.000000355,
          firstSeen: token.firstSeen || Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
          totalProgressGained: token.totalProgressGained || 2.5,
          graduationAlerts: token.graduationAlerts || 0
        };
        
        setBondingData(bondingData);
      } catch (error) {
        console.error('Failed to fetch bonding data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBondingData();
  }, [token]);

  const formatNumber = (num) => {
    // Convert to number if it's a string
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    
    if (isNaN(numValue)) {
      return '0.00';
    }
    
    if (numValue >= 1000000) {
      return (numValue / 1000000).toFixed(1) + 'M';
    } else if (numValue >= 1000) {
      return (numValue / 1000).toFixed(1) + 'K';
    }
    return numValue.toFixed(2);
  };

  const formatPrice = (price) => {
    // Convert to number if it's a string
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    
    if (isNaN(numPrice)) {
      return '$0.000000';
    }
    
    if (numPrice < 0.000001) {
      return `$${numPrice.toExponential(2)}`;
    } else if (numPrice < 0.01) {
      return `$${numPrice.toFixed(6)}`;
    } else {
      return `$${numPrice.toFixed(4)}`;
    }
  };

  const getDaysTracked = () => {
    if (!bondingData?.firstSeen) return 0;
    return Math.floor((Date.now() - bondingData.firstSeen) / (24 * 60 * 60 * 1000));
  };

  const copyContractAddress = async () => {
    try {
      const address = token.contractAddress || token.tokenAddress;
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy contract address:', error);
    }
  };

  const fetchHolders = async () => {
    setHoldersLoading(true);
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${apiBase}/api/tokens/${token.contractAddress || token.tokenAddress}/holders`);
      const data = await response.json();
      
      if (data.success) {
        setHoldersData(data);
        console.log('Holders data:', data);
      } else {
        console.log('Holders endpoint not available for bonding tokens');
        setHoldersData({ message: 'Holders data not available for pre-bonding tokens' });
      }
    } catch (error) {
      console.log('Holders endpoint not available for bonding tokens:', error.message);
      setHoldersData({ message: 'Holders data not available for pre-bonding tokens' });
    } finally {
      setHoldersLoading(false);
    }
  };

  const getProximityIcon = (level) => {
    switch (level) {
      case 'IMMINENT_GRADUATION':
        return <AlertTriangle className="text-red-400" size={20} />;
      case 'VERY_CLOSE_TO_GRADUATION':
        return <AlertTriangle className="text-orange-400" size={20} />;
      case 'CLOSE_TO_GRADUATION':
        return <Clock className="text-yellow-400" size={20} />;
      case 'APPROACHING_GRADUATION':
        return <TrendingUp className="text-blue-400" size={20} />;
      default:
        return <TrendingUp className="text-gray-400" size={20} />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-solana-purple mx-auto mb-4"></div>
          <p className="text-white">Loading bonding data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div className="flex items-center space-x-4">
              {/* Token Logo */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-solana-purple to-blue-600 flex items-center justify-center">
                {token.logo ? (
                  <img 
                    src={token.logo} 
                    alt={token.symbol} 
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-lg" style={{ display: token.logo ? 'none' : 'flex' }}>
                  {token.symbol?.charAt(0) || '?'}
                </div>
              </div>

              {/* Token Info */}
              <div>
                <h2 className="text-2xl font-bold text-white">{token.name}</h2>
                <p className="text-gray-400 text-lg">{token.symbol}</p>
                <div className="flex items-center space-x-2 mt-1">
                  {getProximityIcon(bondingData?.proximityLevel)}
                  <span className="text-sm text-gray-400">
                    {bondingData?.proximityLevel?.replace(/_/g, ' ') || 'Unknown Status'}
                  </span>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Graduation Status Section */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <AlertTriangle className="text-yellow-400" size={20} />
                <span>Graduation Status</span>
              </h3>
              
              <GraduationStatusBar 
                bondingProgress={bondingData?.bondingProgress}
                proximityLevel={bondingData?.proximityLevel}
                showLabel={true}
                compact={false}
              />

              {/* Additional Bonding Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Days Tracked</p>
                  <p className="text-white font-semibold">{getDaysTracked()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Progress Gained</p>
                  <p className="text-white font-semibold">+{bondingData?.totalProgressGained?.toFixed(1)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Graduation Alerts</p>
                  <p className="text-white font-semibold">{bondingData?.graduationAlerts || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Status</p>
                  <p className="text-white font-semibold">TRACKING</p>
                </div>
              </div>
            </div>

            {/* Token Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Price & Market Data */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Market Data</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Current Price</span>
                    <span className="text-white font-semibold">
                      {formatPrice(bondingData?.priceUsd || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Native Price</span>
                    <span className="text-white font-semibold">
                      {bondingData?.priceNative || '0'} SOL
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Liquidity</span>
                    <span className="text-white font-semibold">
                      ${formatNumber(bondingData?.liquidity || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">FDV</span>
                    <span className="text-white font-semibold">
                      ${formatNumber(bondingData?.fullyDilutedValuation || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Token Info */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Token Information</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Contract</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-mono text-sm">
                        {(token.contractAddress || token.tokenAddress)?.substring(0, 8)}...{(token.contractAddress || token.tokenAddress)?.substring(-8)}
                      </span>
                      <button
                        onClick={copyContractAddress}
                        className={`${copied ? 'text-green-400' : 'text-gray-400'} hover:text-white transition-colors`}
                        title={copied ? 'Copied!' : 'Copy contract address'}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Decimals</span>
                    <span className="text-white font-semibold">{token.decimals || 6}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Exchange</span>
                    <span className="text-white font-semibold">PumpFun</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white font-semibold">Pre-Bonding</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => setShowPriceChart(true)}
                className="px-6 py-3 bg-solana-purple text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center space-x-2"
              >
                <TrendingUp size={20} />
                <span>View Chart</span>
              </button>
              
              <button
                onClick={fetchHolders}
                disabled={holdersLoading}
                className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                <Users size={20} />
                <span>{holdersLoading ? 'Loading...' : 'Holders'}</span>
              </button>

              {token.twitter && (
                <button
                  onClick={() => window.open(token.twitter, '_blank')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Twitter size={20} />
                  <span>Twitter</span>
                </button>
              )}
            </div>

            {/* Warning Notice */}
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-yellow-400 mt-0.5" size={20} />
                <div>
                  <h4 className="text-yellow-400 font-semibold mb-1">Pre-Bonding Token Notice</h4>
                  <p className="text-yellow-200 text-sm">
                    This token is currently on a bonding curve and has not yet graduated to a full DEX. 
                    Graduation typically occurs at 100% bonding curve completion. Monitor the graduation 
                    status for important updates.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Bonding Chart Modal */}
      {showPriceChart && (
        <PreBondingChart 
          token={token} 
          onClose={() => setShowPriceChart(false)} 
        />
      )}
    </>
  );
};

export default PreTokenDetail;
