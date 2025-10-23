import { useEffect, useRef, useState, useCallback } from 'react';
import websocketService from '../services/websocketService';

const useRealTimePrice = (tokenAddress) => {
  const [priceData, setPriceData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const priceDataRef = useRef(null);
  const isSubscribedRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    priceDataRef.current = priceData;
    isSubscribedRef.current = isSubscribed;
  }, [priceData, isSubscribed]);

  // Handle WebSocket connection status
  useEffect(() => {
    const handleConnected = () => {
      console.log('🔌 [useRealTimePrice] WebSocket connected');
      setIsConnected(true);
      setError(null);
    };

    const handleDisconnected = () => {
      console.log('🔌 [useRealTimePrice] WebSocket disconnected');
      setIsConnected(false);
      setIsSubscribed(false);
    };

    const handleError = (error) => {
      console.error('❌ [useRealTimePrice] WebSocket error:', error);
      setError(error);
    };

    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);
    websocketService.on('error', handleError);

    // Check initial connection status
    setIsConnected(websocketService.isConnected);

    return () => {
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.off('error', handleError);
    };
  }, []);

  // Handle price updates
  useEffect(() => {
    const handlePriceUpdate = (data) => {
      if (data.tokenAddress === tokenAddress) {
        console.log('📈 [useRealTimePrice] Price update received:', data.priceData);
        setPriceData(data.priceData);
        setLastUpdate(new Date());
        setError(null);
      }
    };

    websocketService.on('priceUpdate', handlePriceUpdate);

    return () => {
      websocketService.off('priceUpdate', handlePriceUpdate);
    };
  }, [tokenAddress]);

  // Handle subscription confirmations
  useEffect(() => {
    const handleSubscriptionConfirmed = (data) => {
      if (data.tokenAddress === tokenAddress) {
        console.log('✅ [useRealTimePrice] Subscription confirmed for:', tokenAddress);
        setIsSubscribed(true);
        setError(null);
      }
    };

    const handleUnsubscriptionConfirmed = (data) => {
      if (data.tokenAddress === tokenAddress) {
        console.log('✅ [useRealTimePrice] Unsubscription confirmed for:', tokenAddress);
        setIsSubscribed(false);
      }
    };

    websocketService.on('subscriptionConfirmed', handleSubscriptionConfirmed);
    websocketService.on('unsubscriptionConfirmed', handleUnsubscriptionConfirmed);

    return () => {
      websocketService.off('subscriptionConfirmed', handleSubscriptionConfirmed);
      websocketService.off('unsubscriptionConfirmed', handleUnsubscriptionConfirmed);
    };
  }, [tokenAddress]);

  // Subscribe to token when component mounts or tokenAddress changes
  useEffect(() => {
    if (tokenAddress && isConnected) {
      console.log('📤 [useRealTimePrice] Subscribing to token:', tokenAddress);
      const success = websocketService.subscribeToToken(tokenAddress);
      
      if (success) {
        setIsSubscribed(true);
      } else {
        // If not connected, add to pending subscriptions
        setIsSubscribed(false);
      }
    }

    // Cleanup: unsubscribe when component unmounts or tokenAddress changes
    return () => {
      if (tokenAddress && isSubscribedRef.current) {
        console.log('📤 [useRealTimePrice] Unsubscribing from token:', tokenAddress);
        websocketService.unsubscribeFromToken(tokenAddress);
        setIsSubscribed(false);
      }
    };
  }, [tokenAddress, isConnected]);

  // Connect WebSocket when hook is first used
  useEffect(() => {
    if (!websocketService.isConnected) {
      console.log('🔌 [useRealTimePrice] Connecting WebSocket...');
      websocketService.connect();
    }

    return () => {
      // Don't disconnect on cleanup - let other components use the same connection
      // websocketService.disconnect();
    };
  }, []);

  // Manual subscription control
  const subscribe = useCallback(() => {
    if (tokenAddress) {
      const success = websocketService.subscribeToToken(tokenAddress);
      if (success) {
        setIsSubscribed(true);
      }
      return success;
    }
    return false;
  }, [tokenAddress]);

  const unsubscribe = useCallback(() => {
    if (tokenAddress) {
      const success = websocketService.unsubscribeFromToken(tokenAddress);
      if (success) {
        setIsSubscribed(false);
      }
      return success;
    }
    return false;
  }, [tokenAddress]);

  // Force refresh price data
  const refreshPrice = useCallback(async () => {
    if (!tokenAddress) return;

    try {
      // Make a direct API call to get fresh data
      const response = await fetch(`/api/tokens/${tokenAddress}/hybrid-price?_t=${Date.now()}`, {
        headers: {
          'X-Connection-ID': `refresh_${Date.now()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPriceData(data.data);
          setLastUpdate(new Date());
          setError(null);
        } else {
          setError(data.error || 'Failed to fetch price data');
        }
      } else {
        setError('Failed to fetch price data');
      }
    } catch (err) {
      console.error('❌ [useRealTimePrice] Error refreshing price:', err);
      setError(err.message);
    }
  }, [tokenAddress]);

  return {
    priceData,
    isConnected,
    isSubscribed,
    error,
    lastUpdate,
    subscribe,
    unsubscribe,
    refreshPrice,
    // Additional stats
    stats: websocketService.getStats()
  };
};

export default useRealTimePrice;