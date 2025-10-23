import React, { useMemo } from 'react';
import { useWrappedReownAdapter } from '@jup-ag/jup-mobile-adapter';

const JupiterMobileAdapter = ({ children }) => {
  // Initialize Jupiter Mobile Adapter with WalletConnect/Reown configuration
  // This adapter enables mobile wallet connections through WalletConnect protocol
  const { jupiterAdapter } = useWrappedReownAdapter({
    appKitOptions: {
      metadata: {
        name: 'Degen Oracle',
        description: 'Degen Oracle - Real-time crypto token analytics and trading',
        url: 'https://degen-oracle.com',
        icons: ['https://degen-oracle.com/dgo.png'],
      },
      projectId: process.env.REACT_APP_REOWN_PROJECT_ID || '', // Get your project id from https://dashboard.reown.com/
      features: {
        analytics: false,
        socials: ['google', 'x', 'apple'],
        email: false,
      },
      // Disable built-in wallet list to use only Jupiter Mobile Adapter
      enableWallets: false,
    },
  });
  
  // Configure wallet adapters for the UnifiedWalletProvider
  // This memoized array includes the Jupiter Mobile Adapter and filters out any invalid adapters
  // The filter ensures each adapter has required properties (name and icon) before being used
  const wallets = useMemo(() => {
    return [
      jupiterAdapter, // Jupiter Mobile Adapter with WalletConnect integration
    ].filter((item) => item && item.name && item.icon);
  }, [jupiterAdapter]);

  // Store wallets globally for Jupiter widget to use
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.jupiterMobileWallets = wallets;
      console.log('🚀 Jupiter Mobile Adapter initialized with wallets:', wallets.map(w => w.name));
    }
  }, [wallets]);

  return children;
};

export default JupiterMobileAdapter;
