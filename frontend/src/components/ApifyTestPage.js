import React, { useState, useEffect } from 'react';
import EnhancedTokenCard from './EnhancedTokenCard';

const ApifyTestPage = () => {
  const [trendingTokens, setTrendingTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apifyStatus, setApifyStatus] = useState(null);

  // Fetch trending tokens from Apify
  const fetchTrendingTokens = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/trending-tokens');
      const data = await response.json();
      
      if (data.tokens && data.tokens.length > 0) {
        setTrendingTokens(data.tokens);
        setApifyStatus(data.apifyStatus);
        console.log(`✅ Loaded ${data.tokens.length} trending tokens from ${data.source}`);
      } else {
        setError('No trending tokens available');
      }
    } catch (err) {
      setError(`Failed to fetch trending tokens: ${err.message}`);
      console.error('Error fetching trending tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get Apify service status
  const fetchApifyStatus = async () => {
    try {
      const response = await fetch('/api/apify/status');
      const data = await response.json();
      
      if (data.success) {
        setApifyStatus(data.status);
      }
    } catch (err) {
      console.error('Error fetching Apify status:', err);
    }
  };

  // Manually trigger Apify collection
  const triggerApifyCollection = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/apify/trigger', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Apify collection triggered successfully');
        // Wait a bit then fetch status
        setTimeout(() => {
          fetchApifyStatus();
        }, 2000);
      }
    } catch (err) {
      console.error('Error triggering Apify collection:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchTrendingTokens();
    fetchApifyStatus();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchApifyStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-dark-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-solana-purple mb-4">
            🚀 Apify Integration Test
          </h1>
          <p className="text-gray-400 text-lg">
            Testing the enhanced token cards with real-time Apify data
          </p>
        </div>

        {/* Apify Status */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center">
            📊 Apify Service Status
          </h2>
          
          {apifyStatus ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">Status</div>
                <div className={`font-semibold ${apifyStatus.isRunning ? 'text-green-500' : 'text-red-500'}`}>
                  {apifyStatus.isRunning ? '🟢 Running' : '🔴 Stopped'}
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">Last Run</div>
                <div className="font-semibold">
                  {apifyStatus.lastRun ? 
                    new Date(apifyStatus.lastRun.startedAt).toLocaleString() : 
                    'None'
                  }
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">Next Run</div>
                <div className="font-semibold">
                  {apifyStatus.nextRun ? 
                    new Date(apifyStatus.nextRun).toLocaleString() : 
                    'N/A'
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">Loading status...</div>
          )}
          
          <div className="mt-6 flex space-x-4">
            <button
              onClick={triggerApifyCollection}
              disabled={loading}
              className="bg-solana-purple hover:bg-purple-600 disabled:opacity-50 px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {loading ? '🔄 Triggering...' : '🚀 Trigger Collection'}
            </button>
            
            <button
              onClick={fetchTrendingTokens}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              🔄 Refresh Tokens
            </button>
            
            <button
              onClick={fetchApifyStatus}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              📊 Refresh Status
            </button>
          </div>
        </div>

        {/* Trending Tokens */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              🔥 Trending Tokens ({trendingTokens.length})
            </h2>
            
            {loading && (
              <div className="flex items-center space-x-2 text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Loading...</span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900 border border-red-600 rounded-lg p-4 mb-6">
              <div className="text-red-200 font-semibold">❌ Error</div>
              <div className="text-red-300">{error}</div>
            </div>
          )}

          {trendingTokens.length === 0 && !loading && !error && (
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 text-center">
              <div className="text-gray-400 text-lg mb-4">No trending tokens available</div>
              <div className="text-gray-500">
                Try triggering a collection or wait for the automatic 15-minute cycle
              </div>
            </div>
          )}

          {/* Token Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {trendingTokens.map((token, index) => (
              <EnhancedTokenCard
                key={`${token.symbol}-${index}`}
                token={token}
                onTokenSelect={() => console.log('Token selected:', token.symbol)}
              />
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4">📖 How It Works</h3>
          <div className="space-y-3 text-gray-300">
            <div>• <strong>Automatic Collection:</strong> Apify runs every 15 minutes to fetch trending tokens</div>
            <div>• <strong>Market Cap Filter:</strong> Only tokens with market cap ≥ $20K are included</div>
            <div>• <strong>Real-time Data:</strong> Price changes, volume, transactions, and social links</div>
            <div>• <strong>Enhanced Cards:</strong> Comprehensive display of all token metrics</div>
            <div>• <strong>Fallback System:</strong> If Apify fails, falls back to alternative sources</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApifyTestPage;





