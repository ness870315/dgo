import React, { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle, AlertCircle, Loader, ArrowLeft, Twitter, Globe, MessageCircle, Music, Instagram, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Professional Success Modal Function
const showProfessionalSuccessModal = (tokenData, recordTokenListing) => {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20px;
    padding: 40px;
    max-width: 500px;
    width: 90%;
    text-align: center;
    color: white;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
    position: relative;
    animation: modalSlideIn 0.3s ease-out;
  `;

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes modalSlideIn {
      from {
        opacity: 0;
        transform: translateY(-50px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  modal.innerHTML = `
    <div style="margin-bottom: 30px;">
      <div style="font-size: 60px; margin-bottom: 20px;">🎉</div>
      <h2 style="margin: 0; font-size: 28px; font-weight: 700; margin-bottom: 10px;">
        Token Listed Successfully!
      </h2>
      <p style="margin: 0; font-size: 18px; opacity: 0.9;">
        ${tokenData.name} (${tokenData.symbol}) is being processed by DeGen Oracle.
      </p>
    </div>

    <div style="background: rgba(255, 255, 255, 0.1); border-radius: 15px; padding: 25px; margin-bottom: 30px;">
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <div style="font-size: 24px; margin-right: 10px;">⏱️</div>
        <span style="font-size: 16px; font-weight: 600;">Processing Time: Approximately 2-3 minutes</span>
      </div>

      <div style="text-align: left; margin-bottom: 20px;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center;">
          📊 DeGen Oracle is calculating:
        </div>
        <div style="display: grid; gap: 8px; font-size: 14px;">
          <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">•</span>
            <span>Market metrics and price data</span>
          </div>
          <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">•</span>
            <span>Community sentiment scores</span>
          </div>
          <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">•</span>
            <span>Social media presence</span>
          </div>
          <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">•</span>
            <span>Overall ranking position</span>
          </div>
        </div>
      </div>
    </div>

    <button id="successModalOK" style="
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 12px 30px;
      border-radius: 25px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'"
       onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
      OK
    </button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Handle OK button click
  document.getElementById('successModalOK').onclick = () => {
    // Record token listing for user stats
    if (recordTokenListing) {
      recordTokenListing(tokenData);
    }
    
    document.body.removeChild(overlay);
    document.head.removeChild(style);

    // Redirect to main page after closing modal
    window.location.href = window.location.origin;
  };

  // Handle overlay click to close
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
      document.head.removeChild(style);

      // Redirect to main page after closing modal
      window.location.href = window.location.origin;
    }
  };
};

// Professional Error Modal Function
const showErrorModal = (message) => {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
    border-radius: 20px;
    padding: 40px;
    max-width: 400px;
    width: 90%;
    text-align: center;
    color: white;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
    position: relative;
    animation: modalSlideIn 0.3s ease-out;
  `;

  modal.innerHTML = `
    <div style="margin-bottom: 30px;">
      <div style="font-size: 60px; margin-bottom: 20px;">❌</div>
      <h2 style="margin: 0; font-size: 24px; font-weight: 700; margin-bottom: 15px;">
        Error
      </h2>
      <p style="margin: 0; font-size: 16px; opacity: 0.9; line-height: 1.4;">
        ${message}
      </p>
    </div>

    <button id="errorModalOK" style="
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 12px 30px;
      border-radius: 25px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'"
       onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
      OK
    </button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Handle OK button click
  document.getElementById('errorModalOK').onclick = () => {
    document.body.removeChild(overlay);
  };

  // Handle overlay click to close
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
};

const ListTokenPage = ({ onBack, onTokenAdded }) => {
  const { sessionId } = useAuth();
  const [contractAddress, setContractAddress] = useState('');
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationComplete, setValidationComplete] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState(null);

  // Social links state (optional)
  const [showSocialLinks, setShowSocialLinks] = useState(false);
  const [socials, setSocials] = useState({
    twitter: '',
    discord: '',
    instagram: '',
    tiktok: '',
    website: ''
  });
  const [helioLoaded, setHelioLoaded] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Call token listing API to update user stats
  const recordTokenListing = useCallback(async (tokenData) => {
    if (!sessionId) {
      console.log('⚠️ No sessionId available, skipping token listing record');
      return;
    }

    try {
      console.log('📝 Recording token listing for user stats:', tokenData.symbol);
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/user/tokens/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          contractAddress: tokenData.contractAddress,
          symbol: tokenData.symbol,
          name: tokenData.name,
          socialLinks: tokenData.socialLinks
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Token listing recorded successfully:', result.message);
      } else {
        console.warn('⚠️ Failed to record token listing:', result.error);
      }
    } catch (error) {
      console.error('❌ Error recording token listing:', error);
    }
  }, [sessionId]);

  // Submit token to database after successful payment (moved up for useEffect)
  const submitTokenToDatabase = useCallback(async (tokenData, paymentEvent) => {
    try {
      console.log('🔥 Submitting paid token to database:', tokenData);
      console.log('💳 Payment event data:', paymentEvent);
      console.log('🔍 Token data structure check:', {
        hasSymbol: !!tokenData?.symbol,
        hasName: !!tokenData?.name,
        hasContractAddress: !!tokenData?.contractAddress,
        symbol: tokenData?.symbol,
        name: tokenData?.name,
        contractAddress: tokenData?.contractAddress
      });

      // Generate a payment ID if not provided by Helio
      const paymentId = paymentEvent?.paymentId || `helio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare payment data for validation
      const paymentData = {
        paymentId: paymentId,
        amount: 9500, // $95.00 in cents
        currency: 'USD',
        status: 'completed',
        timestamp: new Date().toISOString(),
        source: 'helio_widget',
        ...paymentEvent
      };

      // First validate the payment with backend
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const paymentValidation = await fetch(`${apiBase}/api/payments/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: paymentId,
          paymentData: paymentData
        })
      });

      const validationResult = await paymentValidation.json();
      console.log('🔍 Payment validation result:', validationResult);

      if (!validationResult.success || !validationResult.validation?.isValid) {
        throw new Error('Payment validation failed. Please contact support.');
      }

      console.log('✅ Payment validated successfully');

      // Validate social links if provided
      const socialValidationErrors = validateSocials();
      if (socialValidationErrors.length > 0) {
        console.warn('⚠️ Social validation errors (will skip socials):', socialValidationErrors);
      }

      // Prepare payload with validated payment data and optional social links
      const payload = {
        tokenData: tokenData,
        paymentData: {
          ...paymentData,
          validated: true,
          validationResult: validationResult.validation
        }
      };

      // Add social links if any are provided and valid
      const hasSocials = Object.values(socials).some(value => value && value.trim());
      if (hasSocials && socialValidationErrors.length === 0) {
        payload.socialLinks = socials;
        console.log('📱 Including social links:', socials);
      }

      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/add-paid-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('🔍 Backend response:', result);

      if (!result.success) {
        console.error('❌ Backend error details:', result);
        throw new Error(result.error || 'Failed to add token to database');
      }

      console.log('🎉 Token added to database successfully:', result.token);
      return result;

    } catch (error) {
      console.error('❌ Error submitting token to database:', error);
      throw error;
    }
  }, [socials]);

  // Manual payment completion helper for debugging
  const processPendingPayment = useCallback(async () => {
    console.log('🔧 Manual payment processing triggered...');

    const pendingData = localStorage.getItem('pendingTokenListing');
    if (!pendingData) {
      console.warn('⚠️ No pending payment data found in localStorage');
      return false;
    }

    try {
      const { paymentId, paymentUrl, paymentInitiated, ...tokenData } = JSON.parse(pendingData);
      console.log('📦 Processing pending token:', tokenData);

      await submitTokenToDatabase(tokenData, {
        paymentId,
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      localStorage.removeItem('pendingTokenListing');
      console.log('✅ Manual payment processing completed!');
      return true;
    } catch (error) {
      console.error('❌ Manual payment processing failed:', error);
      return false;
    }
  }, [submitTokenToDatabase]);

  // Handle payment completion on page load
  useEffect(() => {
    const handlePaymentCompletion = async () => {
      console.log('🔍 Checking for payment completion...');

      // Check URL parameters for payment success
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get('payment');
      const currentUrl = window.location.href;

      console.log('📍 Current URL:', currentUrl);
      console.log('💳 Payment status parameter:', paymentStatus);

      if (paymentStatus === 'success') {
        console.log('🎉 Payment success detected! Processing pending token...');

        // Check for pending payment data in localStorage
        const pendingData = localStorage.getItem('pendingTokenListing');
        console.log('💾 localStorage pending data exists:', !!pendingData);

        if (pendingData) {
          try {
            const { paymentId, paymentUrl, paymentInitiated, ...tokenData } = JSON.parse(pendingData);
            console.log('📦 Found pending token data:', {
              symbol: tokenData.symbol,
              name: tokenData.name,
              contractAddress: tokenData.contractAddress?.substring(0, 10) + '...'
            });

            // Process the payment and add token
            console.log('🚀 Starting token submission to database...');
            await submitTokenToDatabase(tokenData, {
              paymentId,
              status: 'completed',
              timestamp: new Date().toISOString()
            });
            console.log('✅ Token submission completed successfully!');

            // Clear the pending data
            localStorage.removeItem('pendingTokenListing');
            console.log('🧹 Cleared pending data from localStorage');

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log('🔄 Cleared URL parameters');

            // Show success message
            console.log('🎊 Showing success modal...');
            showProfessionalSuccessModal(tokenData, recordTokenListing);

          } catch (error) {
            console.error('❌ Failed to process pending payment:', error);
            console.error('❌ Error details:', error.message);
            showErrorModal('Failed to complete token listing. Please contact support with your payment confirmation.');
          }
        } else {
          console.warn('⚠️ Payment success detected but no pending token data found in localStorage');
          console.log('💡 This might happen if the page was refreshed before processing or data was cleared');
        }
      } else {
        console.log('ℹ️ No payment success detected in URL parameters');
      }
    };

    // Run immediately
    handlePaymentCompletion();

    // Also run after a short delay to catch any timing issues
    const timeoutId = setTimeout(() => {
      console.log('⏰ Running delayed payment completion check...');
      handlePaymentCompletion();
    }, 2000);

    // Cleanup timeout
    return () => clearTimeout(timeoutId);
  }, [submitTokenToDatabase]); // Include submitTokenToDatabase as dependency

  // Load Helio Pay script and initialize widget
  useEffect(() => {
    const loadHelioScript = () => {
      // Check if script already exists
      if (document.querySelector('script[src*="embed.hel.io"]')) {
        setHelioLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.crossOrigin = 'anonymous';
      script.src = 'https://embed.hel.io/assets/index-v1.js';
      script.onload = () => {
        console.log('✅ Helio Pay script loaded');
        setHelioLoaded(true);
      };
      script.onerror = () => {
        console.error('❌ Failed to load Helio Pay script');
      };
      document.head.appendChild(script);
    };

    loadHelioScript();
  }, []);

  // Initialize Helio widget when script is loaded and payment step is reached
  useEffect(() => {
    if (helioLoaded && validationComplete && !duplicateCheck?.exists && tokenData) {
      const initializeHelioWidget = () => {
        const container = document.getElementById('helioCheckoutContainer');
        if (container && window.helioCheckout) {
          console.log('🎯 Initializing Helio Pay widget...');
          
          window.helioCheckout(container, {
            paylinkId: "68ae3424a561997f2bc70c7e", // Your paylink ID
            theme: { "themeMode": "dark" },
            primaryColor: "#9333ea", // Solana purple
            neutralColor: "#5A6578",
            display: "inline",
            width: "100%",
            onSuccess: (event) => {
              console.log('🎉 Payment successful!', event);
              setPaymentProcessing(true);
              
              // Process the token immediately
              submitTokenToDatabase(tokenData, event).then(() => {
                showProfessionalSuccessModal(tokenData, recordTokenListing);
                setPaymentProcessing(false);
                
                // Close the modal after success
                setTimeout(() => {
                  if (onTokenAdded) onTokenAdded();
                  if (onBack) onBack();
                }, 3000);
              }).catch((error) => {
                console.error('❌ Token submission failed:', error);
                setPaymentProcessing(false);
                alert('Payment successful but token submission failed. Please contact support.');
              });
            },
            onError: (event) => {
              console.error('❌ Payment error:', event);
              alert('Payment failed. Please try again.');
            },
            onPending: (event) => {
              console.log('⏳ Payment pending:', event);
              setPaymentProcessing(true);
            },
            onCancel: () => {
              console.log('❌ Payment cancelled');
              setPaymentProcessing(false);
            },
            onStartPayment: () => {
              console.log('🚀 Starting payment...');
              setPaymentProcessing(true);
            }
          });
        }
      };

      // Small delay to ensure DOM is ready
      setTimeout(initializeHelioWidget, 100);
    }
  }, [helioLoaded, validationComplete, duplicateCheck, tokenData, submitTokenToDatabase, onTokenAdded, onBack]);

  // Validate Solana contract address format
  const isValidSolanaAddress = (address) => {
    // Complete Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    // Excludes: 0, O, I, l (to avoid visual confusion)
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,44}$/;
    const result = base58Regex.test(address);
    console.log('🔍 Validation check:', { address, length: address.length, result });
    return result;
  };

  // Get detailed validation error message
  const getValidationError = (address) => {
    if (!address || address.length < 32 || address.length > 44) {
      return 'Solana addresses must be 32-44 characters long';
    }
    
    const invalidChars = [];
    const validBase58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    for (let i = 0; i < address.length; i++) {
      const char = address[i];
      if (!validBase58Chars.includes(char)) {
        invalidChars.push(`'${char}' at position ${i + 1}`);
      }
    }
    
    if (invalidChars.length > 0) {
      return `Invalid characters found: ${invalidChars.join(', ')}. Base58 excludes: 0, O, I, l`;
    }
    
    return 'Invalid Solana contract address format';
  };

  // Fetch token metadata from Bitquery with fallback
  const fetchTokenMetadata = async (ca) => {
    try {
      console.log('🔍 Attempting to fetch token metadata from Jupiter API for:', ca);
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/jupiter/test/${ca}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jupiter API HTTP error:', response.status, errorText);
        throw new Error(`Jupiter API HTTP error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Jupiter API response received:', data);

      if (!data.success) {
        console.error('❌ Jupiter API error:', data.error);
        throw new Error(`Jupiter API error: ${data.error}`);
      }

      const tokenData = data.tokenData;
      
      if (!tokenData) {
        console.log('⚠️ No token data found in Jupiter API for this address');
        throw new Error('Token not found in Jupiter API. This token may not exist or may not be tradeable.');
      }

      console.log('✅ Successfully retrieved token metadata from Jupiter API:', tokenData);
      
      return {
        name: tokenData.name || 'Unknown Token',
        symbol: tokenData.symbol || 'UNKNOWN',
        decimals: tokenData.decimals || 9,
        totalSupply: tokenData.totalSupply || 0,
        description: `Token: ${tokenData.name || 'Unknown Token'}`,
        image: tokenData.icon || null,
        contractAddress: ca,
        updateAuthority: tokenData.updateAuthority || null,
        isMutable: tokenData.isMutable || false,
        uri: tokenData.uri || null,
        source: 'jupiter_api',
        // Additional Jupiter API data
        holderCount: tokenData.holderCount || 0,
        marketCap: tokenData.marketCap || 0,
        price: tokenData.usdPrice || 0,
        liquidity: tokenData.liquidity || 0,
        organicScore: tokenData.organicScore || 0,
        socials: tokenData.socials || {}
      };
    } catch (error) {
      console.error('❌ Failed to fetch token metadata from Jupiter API:', error);
      throw new Error(`Failed to fetch token metadata: ${error.message}`);
    }
  };

  // Fetch price data from Bitquery
  const fetchPriceData = async (ca) => {
    try {
      console.log('🔍 Fetching price data from Jupiter API for:', ca);
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/jupiter/test/${ca}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Jupiter API price data received:', data);

      if (!data.success || !data.tokenData) {
        console.log('⚠️ No price data found in Jupiter API');
        return {
          price: 0,
          volume24h: 0,
          marketCap: 0,
          priceChange24h: 0,
          lastTradeTime: null,
          symbol: 'UNKNOWN',
          name: 'Unknown Token'
        };
      }

      const tokenData = data.tokenData;
      console.log('✅ Successfully retrieved price data from Jupiter API:', tokenData);
      
      return {
        price: tokenData.price || tokenData.usdPrice || 0,
        volume24h: tokenData.volume24h || 0,
        marketCap: tokenData.marketCap || tokenData.mcap || 0,
        priceChange24h: tokenData.priceChange24h || (tokenData.stats24h?.priceChange || 0),
        lastTradeTime: tokenData.lastTradeTime || new Date().toISOString(),
        symbol: tokenData.symbol || 'UNKNOWN',
        name: tokenData.name || 'Unknown Token',
        // Additional Jupiter API price data
        fdv: tokenData.fdv || 0,
        liquidity: tokenData.liquidity || 0,
        priceChange1h: tokenData.stats1h?.priceChange || 0,
        priceChange6h: tokenData.stats6h?.priceChange || 0,
        source: 'jupiter_api'
      };
    } catch (error) {
      console.error('❌ Failed to fetch price data from Jupiter API:', error);
      return {
        price: 0,
        volume24h: 0,
        marketCap: 0,
        priceChange24h: 0,
        lastTradeTime: null,
        symbol: 'UNKNOWN',
        name: 'Unknown Token'
      };
    }
  };

  // Check if token already exists in our database/cache
  const checkTokenExists = async (ca, symbol, name) => {
    try {
      console.log('🔍 Checking if token already exists:', { ca, symbol, name });
      
      // Check by contract address first (most reliable)
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens`);
      const tokens = await response.json();
      
      // Convert to array if it's an object with tokens property
      const tokenArray = Array.isArray(tokens) ? tokens : (tokens.tokens || []);
      
      console.log('🔍 DEBUGGING CONTRACT CHECK:');
      console.log('   Input CA:', ca);
      console.log('   Total tokens:', tokenArray.length);
      
      // Debug: Look for memeputer tokens specifically
      const memeputerTokens = tokenArray.filter(token => 
        token.name && token.name.toLowerCase().includes('memeputer')
      );
      console.log('   Memeputer tokens found:', memeputerTokens.map(t => ({
        name: t.name,
        symbol: t.symbol,
        contractAddress: t.contractAddress
      })));
      
      // Check for duplicates by contract address (primary)
      const existingByContract = tokenArray.find(token => 
        token.contractAddress && token.contractAddress.toLowerCase() === ca.toLowerCase()
      );
      
      console.log('   Contract match result:', existingByContract ? 'FOUND' : 'NOT FOUND');
      
      if (existingByContract) {
        console.log('⚠️ Token found by contract address:', existingByContract);
        return {
          exists: true,
          reason: 'contract_address',
          existingToken: existingByContract,
          message: `This token is already listed in our database with the contract address ${ca}`
        };
      }
      
      // REMOVED: Symbol/name checking to avoid false positives
      // Only contract address checking is reliable for Solana tokens
      
      console.log('✅ Token is not in database - safe to list');
      return {
        exists: false,
        message: 'Token is not in our database. Safe to proceed with listing.'
      };
      
    } catch (error) {
      console.error('❌ Error checking token existence:', error);
      return {
        exists: false,
        error: true,
        message: 'Could not verify if token exists. Proceeding with caution.'
      };
    }
  };

  // Fetch market cap data from Jupiter API
  const fetchMarketCapData = async (ca) => {
    try {
      console.log('🔍 Fetching market cap data from Jupiter API for:', ca);
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/jupiter/test/${ca}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Jupiter API market cap data received:', data);

      if (!data.success || !data.tokenData) {
        console.log('⚠️ No market cap data found in Jupiter API');
        return {
          marketCap: 0,
          totalSupply: 0,
          marketCapSource: 'no_data'
        };
      }

      const tokenData = data.tokenData;
      console.log('✅ Successfully retrieved market cap data from Jupiter API:', tokenData);
      
      return {
        marketCap: tokenData.marketCap || tokenData.mcap || 0,
        totalSupply: tokenData.totalSupply || tokenData.circSupply || 0,
        marketCapSource: 'jupiter_api',
        lastSupplyUpdate: tokenData.lastUpdated || new Date().toISOString(),
        // Additional Jupiter API market data
        fdv: tokenData.fdv || 0,
        liquidity: tokenData.liquidity || 0,
        holderCount: tokenData.holderCount || 0
      };

    } catch (error) {
      console.error('❌ Failed to fetch market cap data from Jupiter API:', error);
      return {
        marketCap: 0,
        totalSupply: 0,
        marketCapSource: 'error'
      };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const trimmedAddress = contractAddress.trim();
    console.log('🧪 Validation Debug:', {
      address: trimmedAddress,
      length: trimmedAddress.length,
      isValid: isValidSolanaAddress(trimmedAddress),
      regex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedAddress)
    });
    
    if (!trimmedAddress) {
      setError('Please enter a contract address');
      return;
    }

    // Validate Solana address format
    if (!isValidSolanaAddress(trimmedAddress)) {
      const errorMsg = getValidationError(trimmedAddress);
      console.log('❌ Validation failed:', errorMsg);
      setError(errorMsg);
      return;
    }

    setLoading(true);
    setError('');
    setTokenData(null);
    setValidationComplete(false);

    try {
      console.log('🔍 Fetching token metadata for:', contractAddress);
      
      // Step 1: Get basic metadata from Bitquery
      const metadata = await fetchTokenMetadata(contractAddress);
      
      // Step 2: Get real price data from Bitquery
      const priceData = await fetchPriceData(contractAddress);
      
      // Step 3: Get market cap data from Bitquery
      const marketCapData = await fetchMarketCapData(contractAddress);

      // Step 4: Check if token already exists in our database
      const duplicateCheckResult = await checkTokenExists(
        contractAddress.trim(),
        metadata.symbol || priceData?.symbol || 'UNKNOWN',
        metadata.name || 'Unknown Token'
      );
      
      setDuplicateCheck(duplicateCheckResult);

          // Calculate market cap manually if not available from Bitquery
    let finalMarketCap = marketCapData?.marketCap || 0;
    
    console.log('🔍 Market cap calculation check:');
    console.log('   finalMarketCap:', finalMarketCap);
    console.log('   priceData?.price:', priceData?.price);
    console.log('   marketCapData?.totalSupply:', marketCapData?.totalSupply);
    
    if (!finalMarketCap && priceData?.price && marketCapData?.totalSupply) {
      finalMarketCap = priceData.price * marketCapData.totalSupply;
      console.log('💡 Calculated market cap manually:');
      console.log('   price:', priceData.price);
      console.log('   totalSupply:', marketCapData.totalSupply);
      console.log('   calculatedMarketCap:', finalMarketCap);
    } else {
      console.log('❌ Manual calculation skipped - missing data or already have market cap');
    }

    // Combine all data
    const combinedData = {
      contractAddress: contractAddress.trim(),
      ...metadata,
      ...(priceData || {}),
      ...(marketCapData || {}),
      marketCap: finalMarketCap, // Override with calculated value if needed
      // Generate score based on available data
      score: calculateTokenScore(metadata, priceData, marketCapData)
    };

      console.log('🎯 FINAL TOKEN DATA FOR UI:', {
        marketCap: combinedData.marketCap,
        totalSupply: combinedData.totalSupply,
        price: combinedData.price,
        marketCapCheck: combinedData.marketCap && combinedData.marketCap > 0,
        fullCombinedData: combinedData
      });
      
      setTokenData(combinedData);
      setValidationComplete(true);
      
    } catch (err) {
      setError(err.message || 'Failed to fetch token data');
    } finally {
      setLoading(false);
    }
  };

  const calculateTokenScore = (metadata, coinGecko, dexScreener) => {
    let score = 5; // Base score
    
    // Add points for available data
    if (metadata?.name && metadata?.symbol) score += 1;
    if (coinGecko?.marketCap > 100000) score += 1;
    if (dexScreener?.liquidity > 50000) score += 1;
    if (coinGecko?.volume24h > 10000) score += 1;
    
    return Math.min(score, 10);
  };

  // Handle social link input changes
  const handleSocialChange = (platform, value) => {
    setSocials(prev => ({
      ...prev,
      [platform]: value
    }));
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


  // Helio Pay Configuration with enhanced callbacks
  const helioConfig = {
    paylinkId: "68ae3424a561997f2bc70c7e",
    theme: { "themeMode": "dark" },
    primaryColor: "#FE5300",
    neutralColor: "#5A6578",
    display: "inline",
    onSuccess: event => {
      console.log('✅ Payment successful:', event);
      
      // Get pending token data
      const pendingToken = localStorage.getItem('pendingTokenListing');
      if (pendingToken) {
        const tokenData = JSON.parse(pendingToken);
        console.log('Processing successful payment for token:', tokenData);

        // Show immediate professional success message
        showProfessionalSuccessModal(tokenData, recordTokenListing);
        
        // Mark as payment completed
        localStorage.setItem('completedTokenListing', JSON.stringify({
          ...tokenData,
          paymentCompleted: new Date().toISOString(),
          paymentEvent: event
        }));
        
        // Remove pending status
        localStorage.removeItem('pendingTokenListing');
        
        // Send to backend API to add token to database (async, don't wait)
        submitTokenToDatabase(tokenData, event).catch(error => {
          console.error('❌ Background token submission error:', error);
        });

        // Small delay before redirect to let user read the message
        setTimeout(() => {
          window.location.href = `${window.location.origin}/?payment=success&token=${tokenData.symbol || 'TOKEN'}`;
        }, 2000);
      } else {
        // No pending token data, redirect immediately
        window.location.href = `${window.location.origin}/?payment=success`;
      }
    },
    onError: event => {
      console.log('❌ Payment error:', event);
      
      // Redirect back with error message
      window.location.href = `${window.location.origin}/?payment=error&reason=${event?.error || 'unknown'}`;
    },
    onPending: event => {
      console.log('🕐 Payment pending:', event);
      
      // Store pending status
      const pendingToken = localStorage.getItem('pendingTokenListing');
      if (pendingToken) {
        const tokenData = JSON.parse(pendingToken);
        localStorage.setItem('pendingTokenListing', JSON.stringify({
          ...tokenData,
          paymentStatus: 'pending',
          lastUpdate: new Date().toISOString()
        }));
      }
    },
    onCancel: () => {
      console.log("❌ Payment cancelled");
      
      // Redirect back with cancellation message
      window.location.href = `${window.location.origin}/?payment=cancelled`;
    },
    onStartPayment: () => {
      console.log("🚀 Starting payment");

      // Store token data for post-payment handling
              if (tokenData) {
                localStorage.setItem('pendingTokenListing', JSON.stringify({
                  contractAddress: tokenData.contractAddress,
                  name: tokenData.name,
                  symbol: tokenData.symbol,
                  paymentInitiated: new Date().toISOString(),
          socialLinks: socials // Include social links if provided
        }));
        console.log('💾 Token data stored for post-payment processing');
      }
    },
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-solana-purple/60 bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              title="Go back"
            >
              <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-white">List a Token</h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">If you can't find your token, you can list it here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Price Display */}
          <div className="lg:col-span-2 mb-4 sm:mb-6">
            <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-xl p-4 sm:p-6 text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">List Your Token</h2>
              <div className="text-3xl font-bold text-white">$95 USDC</div>
              <p className="text-green-100 mt-2">One-time listing fee</p>
            </div>
          </div>

          {/* Steps */}
          <div className="lg:col-span-2 mb-6">
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">How to List Your Token</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start space-x-3">
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">1</div>
                  <div>
                    <h4 className="text-white font-medium">Paste Contract Address</h4>
                    <p className="text-gray-400 text-sm">Validate your coin</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">2</div>
                  <div>
                    <h4 className="text-white font-medium">Add Socials</h4>
                    <p className="text-gray-400 text-sm">Optional</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">3</div>
                  <div>
                    <h4 className="text-white font-medium">Proceed to Payment</h4>
                    <p className="text-gray-400 text-sm">Powered by Helio</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Left Column - Form */}
          <div className="space-y-6">
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Token Information</h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Contract Address *
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
                      className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a valid Solana contract address (32-44 characters)
                  </p>
                </div>

                {error && (
                  <div className="flex items-center space-x-2 p-3 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg">
                    <AlertCircle size={16} className="text-red-400" />
                    <span className="text-red-400 text-sm">{error}</span>
                  </div>
                )}

                {/* Validation Status - appears right after CA input */}
                {duplicateCheck && (
                  <div className="space-y-3">
                    {duplicateCheck.exists ? (
                      <div className="p-4 bg-red-900 bg-opacity-30 rounded-lg border border-red-600">
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertCircle size={16} className="text-red-400" />
                          <p className="text-red-300 font-medium">Token Already Listed!</p>
                        </div>
                        <p className="text-red-200 text-sm mb-3">{duplicateCheck.message}</p>
                        
                        {duplicateCheck.existingToken && (
                          <div className="bg-red-800 bg-opacity-40 p-3 rounded-lg">
                            <p className="text-red-200 text-xs font-medium mb-2">Existing Token Details:</p>
                            <div className="space-y-1">
                              <p className="text-red-100 text-xs">Name: {duplicateCheck.existingToken.name}</p>
                              <p className="text-red-100 text-xs">Symbol: {duplicateCheck.existingToken.symbol}</p>
                              <p className="text-red-100 text-xs font-mono">CA: {duplicateCheck.existingToken.contractAddress}</p>
                              <p className="text-red-100 text-xs">Market Cap: ${Number(duplicateCheck.existingToken.marketCap || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-3">
                          <button
                            onClick={() => {
                              setContractAddress('');
                              setTokenData(null);
                              setDuplicateCheck(null);
                              setValidationComplete(false);
                              setError('');
                            }}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm"
                          >
                            Try Another Token
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-green-900 bg-opacity-30 rounded-lg border border-green-600">
                        <div className="flex items-center space-x-2 mb-2">
                          <CheckCircle size={16} className="text-green-400" />
                          <p className="text-green-300 font-medium">✅ Available for Listing</p>
                        </div>
                        <p className="text-green-200 text-sm mb-3">
                          Token validated and ready for listing. Proceed with payment to add it to DeGen Oracle.
                        </p>
                        
                        {/* Optional Social Links Section */}
                        <div className="mt-4 pt-4 border-t border-green-600">
                          <button
                            onClick={() => setShowSocialLinks(!showSocialLinks)}
                            className="w-full flex items-center justify-between px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                          >
                            <div className="flex items-center space-x-2">
                              <span>📱</span>
                              <span>Add Social Links (Optional)</span>
                            </div>
                            {showSocialLinks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <p className="text-purple-200 text-xs mt-1 text-center">
                            Boost community score by adding social media links
                          </p>

                          {/* Social Links Form */}
                          {showSocialLinks && (
                            <div className="mt-4 space-y-3 p-4 bg-purple-900 bg-opacity-30 rounded-lg border border-purple-600">
                              <p className="text-purple-200 text-sm mb-3">
                                Adding social links will improve your token's community score and visibility.
                              </p>

                              {Object.entries(socials).map(([platform, value]) => (
                                <div key={platform}>
                                  <label className="block text-sm font-medium text-purple-200 mb-1 capitalize">
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
                                    className="block w-full px-3 py-2 border border-purple-500 rounded-lg bg-dark-bg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                                  />
                                </div>
                              ))}

                              <div className="mt-3 p-3 bg-purple-800 bg-opacity-40 rounded-lg">
                                <p className="text-purple-200 text-xs">
                                  💡 <strong>Community Score Bonus:</strong> +1 for 2+ socials, +2 for 3+ socials, +3 for all 5 socials
                                </p>
                        </div>
                            </div>
                          )}
                        </div>


                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !contractAddress.trim()}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-solana-purple hover:bg-opacity-80 disabled:bg-gray-600 disabled:cursor-not-allowed border border-solana-purple rounded-lg transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader size={16} className="animate-spin" />
                      <span className="text-white">Validating Token...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span className="text-white font-medium">Validate Token</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column - Token Preview */}
          <div className="space-y-6">
            {tokenData && (
              <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckCircle size={20} className="text-green-400" />
                  <h2 className="text-xl font-semibold text-white">Token Preview</h2>
                </div>

                <div className="space-y-4">
                  {/* Token Basic Info */}
                  <div className="flex items-center space-x-3">
                    {(tokenData.image || tokenData.jupiterData?.icon) ? (
                      <img 
                        src={tokenData.jupiterData?.icon || tokenData.image}
                        alt={tokenData.name}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">
                          {tokenData.symbol?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white">{tokenData.name}</h3>
                      <p className="text-gray-400">{tokenData.symbol}</p>
                    </div>
                  </div>

                  {/* Token Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-dark-bg p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Price (USD)</p>
                      <p className="text-lg font-semibold text-white">
                        ${tokenData.price ? tokenData.price.toFixed(8) : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-dark-bg p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Market Cap</p>
                      <p className="text-lg font-semibold text-white">
                        {tokenData.marketCap != null && !isNaN(tokenData.marketCap) && tokenData.marketCap >= 0
                          ? (() => {
                              const marketCap = Number(tokenData.marketCap);
                              console.log('🎯 UI MARKET CAP DEBUG:', {
                                rawMarketCap: tokenData.marketCap,
                                convertedMarketCap: marketCap,
                                price: tokenData.price,
                                totalSupply: tokenData.totalSupply,
                                manualCalc: tokenData.price * tokenData.totalSupply
                              });
                              
                              // If marketCap is 0 but we have price and supply, calculate it here
                              let finalMarketCap = marketCap;
                              if (finalMarketCap === 0 && tokenData.price && tokenData.totalSupply) {
                                finalMarketCap = tokenData.price * tokenData.totalSupply;
                                console.log('💡 UI Fallback calculation:', finalMarketCap);
                              }
                              
                              return finalMarketCap >= 1000000
                                ? `$${(finalMarketCap / 1000000).toFixed(2)}M`
                                : finalMarketCap >= 1000
                                  ? `$${(finalMarketCap / 1000).toFixed(1)}K`
                                  : finalMarketCap >= 1
                                    ? `$${finalMarketCap.toFixed(0)}`
                                    : finalMarketCap > 0
                                      ? `$${finalMarketCap.toFixed(2)}`
                                      : '$0';
                            })()
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-dark-bg p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Total Supply</p>
                      <p className="text-lg font-semibold text-white">
                        {tokenData.totalSupply && tokenData.totalSupply > 0
                          ? `${(tokenData.totalSupply / 1000000).toFixed(2)}M`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Contract Address */}
                  <div className="bg-dark-bg p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Contract Address</p>
                    <p className="text-sm font-mono text-white break-all">{tokenData.contractAddress}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Secure Payment Section */}
            {validationComplete && tokenData && duplicateCheck && !duplicateCheck.exists && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm font-bold">$</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Secure Payment</h3>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Token Listing Fee:</span>
                      <span className="text-white font-semibold">$95</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Payment Method:</span>
                      <span className="text-green-400 font-semibold">USDC</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-600 pt-4 mb-6">
                    <p className="text-gray-300 text-sm mb-2">Complete your payment to list your token</p>
                    <p className="text-gray-400 text-xs">Secure payment powered by Helio Pay • USDC on Solana</p>
                  </div>
                  
                  {/* Helio Widget Container - Original Size */}
                  <div className="relative">
                    <div id="helioCheckoutContainer" className="w-full">
                      {!helioLoaded ? (
                        <div className="min-h-[300px] flex flex-col items-center justify-center space-y-4 text-gray-400">
                          <div className="flex items-center space-x-3">
                            <Loader className="w-5 h-5 animate-spin text-purple-400" />
                            <span className="text-base font-medium">Loading payment widget...</span>
                          </div>
                          <div className="w-6 h-1 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-[300px] flex flex-col items-center justify-center space-y-3 text-gray-400">
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                            <span className="text-base font-medium">Payment form ready</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Security Footer */}
                  <div className="mt-6 pt-4 border-t border-gray-600">
                    <div className="flex items-center justify-center space-x-6 text-xs text-gray-400">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="font-medium">SSL Encrypted</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <span className="font-medium">PCI Compliant</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                        <span className="font-medium">Instant Processing</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate Check Results */}


          </div>
        </div>
      </div>
    </div>
  );
};

export default ListTokenPage;