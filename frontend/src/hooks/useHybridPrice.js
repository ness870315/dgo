import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import websocketService from '../services/websocketService';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

// Generate unique connection ID for this hook instance
const generateConnectionId = () => `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useHybridPrice = (tokenAddress, pollingInterval = 5000, enableWebSocket = true) => {
  const [priceData, setPriceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  const connectionIdRef = useRef(generateConnectionId());
  const lastWebSocketUpdateRef = useRef(null);

  // 🚀 NEW: WebSocket integration for real-time updates
  useEffect(() => {
    if (!enableWebSocket || !tokenAddress) return;

    const handleConnected = () => {
      console.log('🔌 [useHybridPrice] WebSocket connected');
      setIsWebSocketConnected(true);
      setIsLive(true);
    };

    const handleDisconnected = () => {
      console.log('🔌 [useHybridPrice] WebSocket disconnected');
      setIsWebSocketConnected(false);
      setIsLive(false);
    };

    const handlePriceUpdate = (data) => {
      if (data.tokenAddress === tokenAddress && mountedRef.current) {
        console.log('📈 [useHybridPrice] WebSocket price update received:', data.priceData);
        setPriceData(data.priceData);
        setError(null);
        setIsLive(true);
        lastWebSocketUpdateRef.current = Date.now();
      }
    };

    const handleSwapUpdate = (data) => {
      if (data.tokenAddress === tokenAddress && mountedRef.current) {
        console.log('🔄 [useHybridPrice] WebSocket swap update received:', data.swapData);
        // You can emit swap updates to parent components or update local state
        // For now, we'll just log it
      }
    };

    const handleError = (error) => {
      console.error('❌ [useHybridPrice] WebSocket error:', error);
      setError(error);
    };

    // Connect to WebSocket if not already connected
    if (!websocketService.isConnected) {
      websocketService.connect();
    }

    // Subscribe to token updates
    websocketService.subscribeToToken(tokenAddress);

    // Set up event listeners
    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);
    websocketService.on('priceUpdate', handlePriceUpdate);
    websocketService.on('swapUpdate', handleSwapUpdate);
    websocketService.on('error', handleError);

    // Check initial connection status
    setIsWebSocketConnected(websocketService.isConnected);

    return () => {
      // Unsubscribe from token updates
      websocketService.unsubscribeFromToken(tokenAddress);
      
      // Remove event listeners
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.off('priceUpdate', handlePriceUpdate);
      websocketService.off('swapUpdate', handleSwapUpdate);
      websocketService.off('error', handleError);
    };
  }, [tokenAddress, enableWebSocket]);

  // 🚀 NEW: Cleanup connection when component unmounts
  const cleanupConnection = useCallback(async () => {
    if (tokenAddress && connectionIdRef.current) {
      try {
        await axios.post(`${API_BASE}/api/hybrid-price/cleanup`, {
          tokenAddress,
          connectionId: connectionIdRef.current
        });
      } catch (error) {
        console.warn('Failed to cleanup connection:', error.message);
      }
    }
  }, [tokenAddress]);

  // Fetch price data from the new hybrid endpoint
  const fetchPriceData = useCallback(async () => {
    if (!tokenAddress || !mountedRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE}/api/tokens/${tokenAddress}/hybrid-price`, {
        timeout: 15000,
        headers: {
          'X-Connection-ID': connectionIdRef.current
        },
        params: {
          _t: Date.now() // Cache busting parameter
        }
      });

      if (response.data.success && mountedRef.current) {
        setPriceData(response.data.data);
        setIsLive(true);
        setError(null);
      } else {
        throw new Error(response.data.error || 'Failed to fetch price data');
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error('Error fetching hybrid price data:', err.message);
        setError(err.message);
        setIsLive(false);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [tokenAddress]);

  // Start polling when tokenAddress changes (smart polling based on WebSocket status)
  useEffect(() => {
    if (!tokenAddress) {
      setPriceData(null);
      setIsLive(false);
      return;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Fetch immediately
    fetchPriceData();

    // Set up smart polling - only poll if WebSocket is not connected or not receiving updates
    const shouldPoll = !enableWebSocket || !isWebSocketConnected || 
                      (lastWebSocketUpdateRef.current && 
                       Date.now() - lastWebSocketUpdateRef.current > pollingInterval * 2);

    if (shouldPoll) {
      intervalRef.current = setInterval(() => {
        // Only poll if we haven't received a WebSocket update recently
        const timeSinceLastWebSocketUpdate = lastWebSocketUpdateRef.current ? 
          Date.now() - lastWebSocketUpdateRef.current : Infinity;
        
        if (timeSinceLastWebSocketUpdate > pollingInterval) {
          fetchPriceData();
        }
      }, pollingInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tokenAddress, pollingInterval, fetchPriceData, enableWebSocket, isWebSocketConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // 🚀 NEW: Cleanup connection tracking
      cleanupConnection();
    };
  }, [cleanupConnection]);

  const formatPrice = useCallback((price) => {
    if (!price) return '$0.00';
    
    if (price < 0.0001) {
      return `$${price.toExponential(2)}`;
    } else if (price < 1) {
      return `$${price.toFixed(6)}`;
    } else {
      return `$${price.toFixed(2)}`;
    }
  }, []);

  const formatLiquidity = useCallback((liquidity) => {
    if (!liquidity) return '$0';
    
    if (liquidity >= 1000000) {
      return `$${(liquidity / 1000000).toFixed(1)}M`;
    } else if (liquidity >= 1000) {
      return `$${(liquidity / 1000).toFixed(1)}K`;
    } else {
      return `$${liquidity.toFixed(0)}`;
    }
  }, []);

  const formatMarketCap = useCallback((marketCap) => {
    if (!marketCap) return '$0';
    
    if (marketCap >= 1000000000) {
      return `$${(marketCap / 1000000000).toFixed(2)}B`;
    } else if (marketCap >= 1000000) {
      return `$${(marketCap / 1000000).toFixed(1)}M`;
    } else if (marketCap >= 1000) {
      return `$${(marketCap / 1000).toFixed(1)}K`;
    } else {
      return `$${marketCap.toFixed(0)}`;
    }
  }, []);

  return {
    priceData,
    isLoading,
    error,
    isLive,
    isWebSocketConnected,
    formatPrice,
    formatLiquidity,
    formatMarketCap,
    // Helper methods
    getPriceUsd: () => priceData?.priceUsd || 0,
    getMarketCap: () => priceData?.marketCap || 0,
    getLiquidity: () => priceData?.liquidity || 0,
    getVolume24h: () => priceData?.volume24h || 0,
    getPriceChange24h: () => priceData?.priceChange24h || 0,
    getSource: () => priceData?.source || '',
    getLastUpdate: () => priceData?.timestamp || null,
    // Manual refresh
    refresh: fetchPriceData,
    // WebSocket stats
    websocketStats: websocketService.getStats()
  };
};

export default useHybridPrice;
