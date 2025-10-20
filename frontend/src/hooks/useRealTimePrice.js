import { useState, useEffect, useRef, useCallback } from 'react';
import RealTimePriceClient from '../services/RealTimePriceClient.js';

export const useRealTimePrice = (tokenAddress) => {
  const [priceData, setPriceData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const clientRef = useRef(null);

  // Initialize client
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new RealTimePriceClient();
      
      // Set up event listeners
      clientRef.current.on('priceUpdate', (data) => {
        if (data.tokenAddress === tokenAddress) {
          setPriceData(data);
        }
      });

      // Connect
      clientRef.current.connect()
        .then(() => {
          setIsConnected(true);
        })
        .catch((error) => {
          console.error('Failed to connect to real-time price service:', error);
          setIsConnected(false);
        });
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  // Subscribe/unsubscribe to token
  useEffect(() => {
    if (!clientRef.current || !isConnected || !tokenAddress) {
      return;
    }

    const subscribe = () => {
      const success = clientRef.current.subscribeToToken(tokenAddress);
      setIsSubscribed(success);
    };

    subscribe();

    return () => {
      if (clientRef.current && tokenAddress) {
        clientRef.current.unsubscribeFromToken(tokenAddress);
        setIsSubscribed(false);
        setPriceData(null);
      }
    };
  }, [tokenAddress, isConnected]);

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

  return {
    priceData,
    isConnected,
    isSubscribed,
    formatPrice,
    formatLiquidity,
    // Helper methods
    getPriceUsd: () => priceData?.priceUsd || 0,
    getPriceSol: () => priceData?.priceSol || 0,
    getLiquidity: () => priceData?.liquidity || 0,
    getDex: () => priceData?.dex || '',
    getLastUpdate: () => priceData?.timestamp || null
  };
};

export default useRealTimePrice;
