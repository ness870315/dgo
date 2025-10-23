import React, { useEffect, useState } from 'react';

const JupiterWidget = ({ selectedToken }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  // Function to apply custom z-index to Jupiter widget elements
  const applyJupiterZIndex = () => {
    try {
      // Find all possible Jupiter widget elements
      const jupiterSelectors = [
        '[class*="jupiter-widget"]',
        '[class*="jupiter-swap"]',
        '[data-jupiter-widget]',
        '.jupiter-widget-button',
        '.jupiter-widget-trigger',
        '.jupiter-floating-widget',
        '.jupiter-widget-container',
        '.jupiter-widget-icon',
        '.jupiter-widget-trigger-button'
      ];

      // Find Jupiter modal/interface elements
      const jupiterModalSelectors = [
        '[class*="jupiter-modal"]',
        '[class*="jupiter-interface"]',
        '.jupiter-modal',
        '.jupiter-interface',
        '.jupiter-swap-interface',
        '.jupiter-modal-overlay',
        '.jupiter-modal-content',
        '.jupiter-swap-modal',
        '.jupiter-widget-modal',
        '[data-jupiter-modal]',
        '.jupiter-dialog',
        '.jupiter-popup'
      ];

      // Apply z-index to widget elements
      jupiterSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          element.style.zIndex = '99999';
          element.style.position = 'fixed';
          console.log(`🎯 Applied z-index to Jupiter widget element:`, selector);
        });
      });

      // Apply z-index to modal elements
      jupiterModalSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          element.style.zIndex = '999999';
          console.log(`🎯 Applied z-index to Jupiter modal element:`, selector);
        });
      });

      // Also try to find elements by looking for Jupiter-specific attributes or classes
      const allElements = document.querySelectorAll('*');
      allElements.forEach(element => {
        const className = element.className || '';
        const id = element.id || '';
        
        // Check if element is Jupiter-related
        if (className.includes('jupiter') || id.includes('jupiter') || 
            element.getAttribute('data-jupiter') || 
            element.getAttribute('data-testid')?.includes('jupiter')) {
          
          // Determine if it's a widget or modal based on context
          if (className.includes('modal') || className.includes('interface') || 
              className.includes('dialog') || className.includes('popup')) {
            element.style.zIndex = '999999';
            console.log(`🎯 Applied z-index to Jupiter modal (detected):`, element);
          } else {
            element.style.zIndex = '99999';
            element.style.position = 'fixed';
            console.log(`🎯 Applied z-index to Jupiter widget (detected):`, element);
          }
        }
      });

      console.log('✅ Jupiter z-index applied successfully');
    } catch (error) {
      console.error('❌ Error applying Jupiter z-index:', error);
    }
  };

  useEffect(() => {
    const initializeJupiter = async () => {
      // Check if Jupiter is available
      if (typeof window !== 'undefined' && window.Jupiter) {
        try {
          // Wait a bit for the DOM to be ready
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 🚀 NEW: Mobile wallet detection and setup
          const detectMobileWallet = () => {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true;
            
            console.log('📱 Mobile detection:', { isMobile, isPWA });
            
            if (isMobile || isPWA) {
              // Check for mobile wallet availability
              const mobileWallets = {
                phantom: window.solana?.isPhantom,
                solflare: window.solflare,
                backpack: window.backpack,
                coinbase: window.coinbaseSolana,
                trust: window.trust,
                exodus: window.exodus
              };
              
              const availableWallets = Object.entries(mobileWallets)
                .filter(([name, wallet]) => wallet)
                .map(([name]) => name);
              
              console.log('💰 Available mobile wallets:', availableWallets);
              return { isMobile: true, availableWallets };
            }
            
            return { isMobile: false, availableWallets: [] };
          };
          
          const mobileInfo = detectMobileWallet();
          
          // Close existing widget if it exists
          if (window.Jupiter.close) {
            window.Jupiter.close();
          }
          
          window.Jupiter.init({
            displayMode: "widget",
            widgetStyle: {
              position: "bottom-right",
              size: "sm"
              // Custom icon handled via CSS override
            },
            formProps: {
              initialInputMint: "So11111111111111111111111111111111111111112", // SOL
              initialOutputMint: selectedToken?.contractAddress || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Selected token or USDC default
              swapMode: "ExactInOrOut",
              referralAccount: "CwkvssRLmaxVUoo6ywxJDtWS4sNEizUkhbJXijByynEi", // Your referral account
              referralFee: 100 // 100 basis points = 1% fee
            },
            branding: {
              logoUri: "/dgo.png", // Use Degen Oracle logo
              name: "Degen Oracle" // Replace with our branding
            },
            // 🚀 NEW: Mobile wallet configuration
            wallet: {
              // Enable mobile wallet detection
              enableMobileWalletAdapter: true,
              // Support for mobile wallets
              supportedWallets: [
                'phantom',
                'solflare',
                'backpack',
                'coinbase',
                'trust',
                'exodus'
              ],
              // Mobile-specific configuration
              mobileWalletAdapter: {
                // Enable deep linking for mobile wallets
                enableDeepLink: true,
                // Support for wallet connect
                enableWalletConnect: true,
                // Mobile browser detection
                detectMobileBrowser: true
              }
            },
            onSuccess: ({ txid, swapResult, quoteResponseMeta }) => {
              console.log("✅ Jupiter swap successful:", txid);
              // You can add success notification here
            },
            onSwapError: ({ error, quoteResponseMeta }) => {
              console.error("❌ Jupiter swap failed:", error);
              // You can add error notification here
            },
            // 🚀 NEW: Mobile wallet connection handlers
            onWalletConnect: (wallet) => {
              console.log("🔗 Wallet connected:", wallet);
              if (mobileInfo.isMobile) {
                console.log("📱 Mobile wallet connected successfully");
              }
            },
            onWalletDisconnect: () => {
              console.log("🔌 Wallet disconnected");
            },
            onWalletError: (error) => {
              console.error("❌ Wallet error:", error);
              if (mobileInfo.isMobile) {
                console.log("📱 Mobile wallet error - check if wallet app is installed");
              }
            }
          });
          
          // Apply custom z-index to ensure Jupiter widget stays above modals
          setTimeout(() => {
            applyJupiterZIndex();
          }, 500); // Wait for Jupiter to create DOM elements

          // Set up MutationObserver to watch for new Jupiter elements
          const observer = new MutationObserver((mutations) => {
            let shouldApplyZIndex = false;
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const element = node;
                  const className = element.className || '';
                  const id = element.id || '';
                  
                  if (className.includes('jupiter') || id.includes('jupiter') || 
                      element.getAttribute('data-jupiter') || 
                      element.getAttribute('data-testid')?.includes('jupiter')) {
                    shouldApplyZIndex = true;
                  }
                }
              });
            });
            
            if (shouldApplyZIndex) {
              setTimeout(() => {
                applyJupiterZIndex();
              }, 100);
            }
          });

          // Start observing
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });

          // Store observer for cleanup
          window.jupiterObserver = observer;
          
          setIsInitialized(true);
        } catch (error) {
          console.error("❌ Failed to initialize Jupiter widget:", error);
        }
      }
    };

    initializeJupiter();
  }, [selectedToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.Jupiter && window.Jupiter.close) {
        window.Jupiter.close();
      }
      
      // Clean up MutationObserver
      if (window.jupiterObserver) {
        window.jupiterObserver.disconnect();
        window.jupiterObserver = null;
      }
    };
  }, []);

  return null; // This component doesn't render anything visible
};

export default JupiterWidget;
