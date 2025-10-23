import React, { useEffect, useState } from 'react';

const JupiterWidget = ({ selectedToken }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeJupiter = async () => {
      // Check if Jupiter is available
      if (typeof window !== 'undefined' && window.Jupiter) {
        try {
          // Close existing widget if it exists
          if (window.Jupiter.close) {
            window.Jupiter.close();
          }
          
          window.Jupiter.init({
            displayMode: "widget",
            widgetStyle: {
              position: "bottom-right",
              size: "sm"
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
            onSuccess: ({ txid, swapResult, quoteResponseMeta }) => {
              console.log("✅ Jupiter swap successful:", txid);
            },
            onSwapError: ({ error, quoteResponseMeta }) => {
              console.error("❌ Jupiter swap failed:", error);
            }
          });
          
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
    };
  }, []);

  return null; // This component doesn't render anything visible
};

export default JupiterWidget;
