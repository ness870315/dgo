import React, { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle, AlertCircle, Loader, ArrowLeft, Twitter, Globe, MessageCircle, Music, Instagram, ChevronDown, ChevronUp } from 'lucide-react';

// Professional Success Modal Function
const showProfessionalSuccessModal = (tokenData) => {
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

  // Submit token to database after successful payment (moved up for useEffect)
  const submitTokenToDatabase = useCallback(async (tokenData, paymentEvent) => {
    try {
      console.log('🔥 Submitting paid token to database:', tokenData);

      // First validate the payment with backend
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const paymentValidation = await fetch(`${apiBase}/api/payments/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: paymentEvent?.paymentId || tokenData?.paymentId,
          paymentData: paymentEvent
        })
      });

      const validationResult = await paymentValidation.json();

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
          ...paymentEvent,
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

      if (!result.success) {
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
            showProfessionalSuccessModal(tokenData);

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
      console.log('🔍 Attempting to fetch token metadata from Bitquery for:', ca);
      
      const query = `
        query MyQuery {
          Solana(dataset: archive) {
            DEXTradeByTokens(
              where: {Trade: {Currency: {MintAddress: {is: "${ca}"}}}, Transaction: {Result: {Success: true}}}
              orderBy: {descending: Block_Time}
              limit: {count: 1}
            ) {
              Trade {
                Currency {
                  Uri
                  UpdateAuthority
                  Name
                  Symbol
                  IsMutable
                }
              }
            }
          }
        }
      `;

      console.log('🔍 Trying Bitquery API...');
      
      const response = await fetch('https://streaming.bitquery.io/eap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ory_at_gdYmaq9AHhGAwTIFSGzIsS6kas1bFJfJXuBthqzFDx4.StK99y_pGpRxVe91TPwftlfOi-PNOIu05KhQK-WAQiI'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Bitquery API HTTP error:', response.status, errorText);
        throw new Error(`Bitquery API HTTP error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Bitquery response received:', data);

      if (data.errors) {
        console.error('❌ Bitquery GraphQL errors:', data.errors);
        console.error('❌ Full error details:', JSON.stringify(data.errors, null, 2));
        throw new Error(`Bitquery GraphQL error: ${data.errors[0].message}`);
      }

      const tokenData = data.data?.Solana?.DEXTradeByTokens?.[0]?.Trade?.Currency;
      
      if (!tokenData) {
        console.log('⚠️ No token data found in DEX trades for this address');
        throw new Error('Token not found in DEX trading data. This token may not have been traded yet.');
      }

      console.log('✅ Successfully retrieved token metadata:', tokenData);
      
      return {
        name: tokenData.Name || 'Unknown Token',
        symbol: tokenData.Symbol || 'UNKNOWN', // Use actual symbol from Bitquery
        decimals: 9, // Default for Solana tokens
        totalSupply: 'Unknown',
        description: `Token: ${tokenData.Name || 'Unknown Token'}`,
        image: null,
        contractAddress: ca,
        updateAuthority: tokenData.UpdateAuthority || null,
        isMutable: tokenData.IsMutable || false,
        uri: tokenData.Uri || null,
        source: 'bitquery'
      };
    } catch (error) {
      console.error('❌ Failed to fetch token metadata:', error);
      throw new Error(`Failed to fetch token metadata: ${error.message}`);
    }
  };

  // Fetch price data from Bitquery
  const fetchPriceData = async (ca) => {
    try {
      console.log('🔍 Fetching price data from Bitquery for:', ca);
      
      const priceQuery = `{
        Solana {
          DEXTradeByTokens(
            orderBy: {descending: Block_Time}
            where: {Trade: {Currency: {MintAddress: {in: "${ca}"}}, Side: {Currency: {MintAddress: {is: "So11111111111111111111111111111111111111112"}}}}}
            limitBy: {by:Trade_Currency_MintAddress count: 1}
          ) {
            Block{
              Time
            }
            Trade{
              Currency{
                Name
                Symbol
                MintAddress
              }
              PriceInSol: Price
              PriceInUSD
              Side{
                Currency{
                  Name
                  MintAddress
                }
              }
            }
          }
        }
      }`;

      console.log('🔍 Price query:', priceQuery);
      
      const response = await fetch('https://streaming.bitquery.io/eap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ory_at_gdYmaq9AHhGAwTIFSGzIsS6kas1bFJfJXuBthqzFDx4.StK99y_pGpRxVe91TPwftlfOi-PNOIu05KhQK-WAQiI'
        },
        body: JSON.stringify({ query: priceQuery })
      });

      if (!response.ok) {
        throw new Error(`Price API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Price data received:', data);

      if (data.errors) {
        console.error('❌ Price query errors:', data.errors);
        throw new Error(`Price query error: ${data.errors[0].message}`);
      }

      const priceData = data.data?.Solana?.DEXTradeByTokens?.[0];
      
      if (!priceData) {
        console.log('⚠️ No price data found');
        return {
          price: 0,
          priceInSol: 0,
          volume24h: 0,
          marketCap: 0,
          priceChange24h: 0,
          lastTradeTime: null
        };
      }

      console.log('✅ Successfully retrieved price data:', priceData);
      
      return {
        price: priceData.Trade.PriceInUSD || 0,
        priceInSol: priceData.Trade.PriceInSol || 0,
        volume24h: 0, // Would need separate query for volume
        marketCap: 0, // Would need supply data to calculate
        priceChange24h: 0, // Would need historical comparison
        lastTradeTime: priceData.Block.Time,
        source: 'bitquery_price'
      };
    } catch (error) {
      console.error('❌ Failed to fetch price data:', error);
      return {
        price: 0,
        priceInSol: 0,
        volume24h: 0,
        marketCap: 0,
        priceChange24h: 0,
        lastTradeTime: null
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

  // Fetch market cap data from Bitquery
  const fetchMarketCapData = async (ca) => {
    try {
      console.log('🔍 Fetching market cap data from Bitquery for:', ca);
      
      // First try simple supply query
      const simpleSupplyQuery = `{
        Solana {
          TokenSupplyUpdates(
            where: {TokenSupplyUpdate: {Currency: {MintAddress: {is: "${ca}"}}}}
            orderBy: {descending: Block_Time}
            limit: {count: 1}
          ) {
            TokenSupplyUpdate {
              PostBalanceInUSD
              PostBalance
              Currency {
                Symbol
                MintAddress
                Name
              }
            }
            Block {
              Time
            }
          }
        }
      }`;

      console.log('🔍 Trying simple supply query first:', simpleSupplyQuery);
      
      let response = await fetch('https://streaming.bitquery.io/eap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ory_at_gdYmaq9AHhGAwTIFSGzIsS6kas1bFJfJXuBthqzFDx4.StK99y_pGpRxVe91TPwftlfOi-PNOIu05KhQK-WAQiI'
        },
        body: JSON.stringify({ query: simpleSupplyQuery })
      });

      if (response.ok) {
        const simpleData = await response.json();
        console.log('✅ Simple supply query response:', simpleData);
        
        if (!simpleData.errors && simpleData.data?.Solana?.TokenSupplyUpdates?.[0]) {
          const supplyData = simpleData.data.Solana.TokenSupplyUpdates[0].TokenSupplyUpdate;
          console.log('✅ Found supply data with simple query:', supplyData);
          console.log('🔍 Supply data details:');
          console.log('   PostBalanceInUSD:', supplyData.PostBalanceInUSD);
          console.log('   PostBalance:', supplyData.PostBalance);
          console.log('   hasMarketCap:', !!supplyData.PostBalanceInUSD);
          console.log('   marketCapValue:', supplyData.PostBalanceInUSD);
          console.log('   typeof PostBalanceInUSD:', typeof supplyData.PostBalanceInUSD);
          
          return {
            marketCap: supplyData.PostBalanceInUSD || 0,
            totalSupply: supplyData.PostBalance || 0,
            marketCapSource: 'simple_supply_query',
            lastSupplyUpdate: simpleData.data.Solana.TokenSupplyUpdates[0].Block.Time
          };
        }
      }

      console.log('⚠️ Simple query failed, trying complex join query...');
      
      // Get time 15 seconds ago for recent data
      const time15sAgo = new Date(Date.now() - 15000).toISOString();
      
      const marketCapQuery = `query MyQuery($time_15s: DateTime) {
        Solana {
          DEXTradeByTokens(
            where: {Trade: {Currency: {MintAddress: {is: "${ca}"}}}, Block: {Time: {since: $time_15s}}}
            limitBy: {by: Trade_Currency_MintAddress, count: 1}
          ) {
            Trade {
              PriceInUSD
            }
            joinTokenSupplyUpdates(
              TokenSupplyUpdate_Currency_MintAddress: Trade_Currency_MintAddress
              where: {Block: {Time: {since: $time_15s}}}
              orderBy: {ascending: Block_Time}
            ) {
              TokenSupplyUpdate {
                PostBalanceInUSD
                PostBalance
                Currency {
                  Symbol
                  MintAddress
                  Name
                }
              }
              Block {
                Time
              }
            }
          }
        }
      }`;

      console.log('🔍 Market cap query:', marketCapQuery);
      
      response = await fetch('https://streaming.bitquery.io/eap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ory_at_gdYmaq9AHhGAwTIFSGzIsS6kas1bFJfJXuBthqzFDx4.StK99y_pGpRxVe91TPwftlfOi-PNOIu05KhQK-WAQiI'
        },
        body: JSON.stringify({ 
          query: marketCapQuery,
          variables: {
            time_15s: time15sAgo
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Market cap API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Market cap data received:', data);

      if (data.errors) {
        console.error('❌ Market cap query errors:', data.errors);
        throw new Error(`Market cap query error: ${data.errors[0].message}`);
      }

      const marketCapData = data.data?.Solana?.DEXTradeByTokens?.[0];
      
      console.log('🔍 Detailed market cap response analysis:', {
        hasData: !!marketCapData,
        tradeData: marketCapData?.Trade,
        joinData: marketCapData?.joinTokenSupplyUpdates,
        rawResponse: data.data?.Solana
      });
      
      if (!marketCapData) {
        console.log('⚠️ No market cap data found - no DEXTradeByTokens results');
        return {
          marketCap: 0,
          totalSupply: 0,
          marketCapSource: 'no_trades'
        };
      }
      
      if (!marketCapData.joinTokenSupplyUpdates || marketCapData.joinTokenSupplyUpdates.length === 0) {
        console.log('⚠️ No supply updates found in join - trying alternative calculation');
        // Alternative: Calculate market cap from price and a common supply estimate
        const priceInUSD = marketCapData.Trade?.PriceInUSD;
        if (priceInUSD) {
          console.log('💡 Using price-based estimation for market cap');
          // Many Solana tokens have supplies in the millions/billions range
          // This is a fallback estimation
          return {
            marketCap: 0, // Can't calculate without supply
            totalSupply: 0,
            marketCapSource: 'price_only',
            priceForCalculation: priceInUSD
          };
        }
        
        return {
          marketCap: 0,
          totalSupply: 0,
          marketCapSource: 'no_supply_data'
        };
      }

      const supplyUpdate = marketCapData.joinTokenSupplyUpdates?.[0]?.TokenSupplyUpdate;
      
      console.log('✅ Successfully retrieved market cap data:', {
        marketCap: supplyUpdate?.PostBalanceInUSD,
        totalSupply: supplyUpdate?.PostBalance
      });
      
      return {
        marketCap: supplyUpdate?.PostBalanceInUSD || 0,
        totalSupply: supplyUpdate?.PostBalance || 0,
        marketCapSource: 'bitquery_supply',
        lastSupplyUpdate: marketCapData.joinTokenSupplyUpdates?.[0]?.Block?.Time
      };
    } catch (error) {
      console.error('❌ Failed to fetch market cap data:', error);
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
        showProfessionalSuccessModal(tokenData);
        
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
    },
  };

  const HelioPayComponent = () => {
    return (
      <div className="bg-dark-bg border border-orange-500 rounded-lg p-4">
        <div className="mb-4">
          <h3 className="text-white font-medium mb-2">Complete Payment to List Token</h3>
          <p className="text-gray-300 text-sm">
            Pay to list your token on DeGen Oracle and get exposure to our community.
          </p>
        </div>
        
        {/* Temporary placeholder while fixing React 19 compatibility */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-lg p-6 text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">💳</span>
            </div>
            <h4 className="text-white font-semibold text-lg mb-2">Helio Pay Integration</h4>
            <p className="text-blue-100 text-sm">
              Secure crypto payment portal ready - click below to proceed
            </p>
          </div>
          
          <button 
            onClick={() => {
              // Configure return URLs for post-payment handling
              const baseUrl = window.location.origin;
              const successUrl = `${baseUrl}/?payment=success`;
              const cancelUrl = `${baseUrl}/?payment=cancelled`;
              
              // Navigate to Helio Pay portal with return URLs
              const paymentUrl = `https://app.hel.io/pay/${helioConfig.paylinkId}?successUrl=${encodeURIComponent(successUrl)}&cancelUrl=${encodeURIComponent(cancelUrl)}`;
              
              console.log('Navigating to Helio Pay portal:', paymentUrl);
              console.log('Success URL:', successUrl);
              console.log('Token data for payment:', {
                contractAddress: tokenData?.contractAddress,
                name: tokenData?.name,
                symbol: tokenData?.symbol
              });
              
              // Store token data in localStorage for post-payment handling
              if (tokenData) {
                localStorage.setItem('pendingTokenListing', JSON.stringify({
                  contractAddress: tokenData.contractAddress,
                  name: tokenData.name,
                  symbol: tokenData.symbol,
                  paymentInitiated: new Date().toISOString(),
                  paymentUrl: paymentUrl,
                  successUrl: successUrl,
                  cancelUrl: cancelUrl
                }));
                
                console.log('✅ Token data stored in localStorage for post-payment handling');
              }
              
              // Navigate to payment portal
              window.location.href = paymentUrl;
            }}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105"
          >
            🚀 Pay Now - Open Payment Portal
          </button>
          
          <div className="mt-4 space-y-2">
            <p className="text-blue-200 text-xs">
              💳 Secure payment via Helio Pay
            </p>
            <p className="text-blue-200 text-xs">
              🔒 Supports SOL, USDC, and other crypto payments
            </p>
            <p className="text-gray-300 text-xs">
              PayLink ID: 68ae3424a561997f2bc70c7e
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">List a Token</h1>
              <p className="text-gray-400 mt-1">If you can't find your token, you can list it here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Price Display */}
          <div className="lg:col-span-2 mb-6">
            <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-xl p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">List Your Token</h2>
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
                    <p className="text-gray-400 text-sm">Redirect to Helio</p>
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
                      <p className="text-xs text-gray-400">Price (SOL)</p>
                      <p className="text-lg font-semibold text-white">
                        {tokenData.priceInSol ? tokenData.priceInSol.toFixed(10) : 'N/A'} SOL
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

            {/* Payment Section */}
            {validationComplete && tokenData && (
              <div className="bg-dark-card border border-green-500 rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckCircle size={20} className="text-green-400" />
                  <h2 className="text-xl font-semibold text-white">Token Address Validated!</h2>
                </div>
                
                <p className="text-gray-300 mb-4">
                  ✅ <strong>Solana contract address verified</strong> - Your token address passed Base58 validation and is confirmed as a valid Solana token address.
                </p>
                
                {tokenData.source === 'bitquery' && (
                  <p className="text-green-300 mb-4">
                    ✅ <strong>Token metadata found</strong> - Successfully retrieved token information from Bitquery.
                  </p>
                )}
                
                {/* Only show payment if duplicate check passed */}
                {duplicateCheck && !duplicateCheck.exists ? (
                  <>
                    <p className="text-gray-300 mb-6">
                      Your token is ready to be listed on DeGen Oracle. Please proceed to payment.
                    </p>
                    {/* Helio Pay Integration - Real Implementation */}
                    <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/30">
                      <h4 className="text-white font-semibold text-lg mb-4 flex items-center">
                        <span className="mr-2">💳</span>
                        Secure Payment
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-300">Token Listing Fee:</span>
                          <span className="text-white font-semibold">$95</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-300">Payment Method:</span>
                          <span className="text-green-400 font-medium">USDC</span>
                        </div>
                        <div className="pt-2 border-t border-gray-600">
                          <p className="text-xs text-gray-400 mb-4">
                            Secure payment powered by Helio Pay. Pay with USDC on Solana.
                          </p>
                      <button
                            onClick={async () => {
                              try {
                                console.log('💳 Creating payment for token:', tokenData?.symbol);

                                const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
                                const successUrl = `${window.location.origin}/?payment=success`;
                                const cancelUrl = `${window.location.origin}/?payment=cancelled`;

                                const response = await fetch(`${apiBase}/api/payments/create-token-listing`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    tokenData: tokenData,
                                    userId: 'user_' + Date.now(), // Generate temporary user ID
                                    successUrl: successUrl,
                                    cancelUrl: cancelUrl
                                  })
                                });

                                const result = await response.json();

                                if (result.success && result.payment) {
                                  console.log('✅ Payment created:', result.payment);

                                  // Store payment info in localStorage for post-payment processing
                                  localStorage.setItem('pendingTokenListing', JSON.stringify({
                                    ...tokenData,
                                    paymentId: result.payment.paymentId,
                                    paymentUrl: result.payment.paymentUrl,
                                    paymentInitiated: new Date().toISOString()
                                  }));

                                  // Navigate to Helio payment
                                  window.location.href = result.payment.paymentUrl;
                                } else {
                                  throw new Error(result.error || 'Payment creation failed');
                                }

                              } catch (error) {
                                console.error('❌ Payment creation error:', error);
                                showErrorModal('Failed to create payment. Please try again.');
                              }
                            }}
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-105"
                          >
                            💳 Proceed to Payment ($95)
                      </button>
                          <div className="flex items-center justify-center mt-3 space-x-4 text-xs text-gray-400">
                            <span className="flex items-center">
                              <span className="w-2 h-2 bg-green-400 rounded-full mr-1"></span>
                              Secure
                            </span>
                            <span className="flex items-center">
                              <span className="w-2 h-2 bg-blue-400 rounded-full mr-1"></span>
                              Instant
                            </span>
                            <span className="flex items-center">
                              <span className="w-2 h-2 bg-purple-400 rounded-full mr-1"></span>
                              Crypto
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : duplicateCheck?.exists ? (
                  <>
                    <p className="text-red-300 mb-6">
                      This token is already listed on DeGen Oracle. No payment is required.
                    </p>
                    <div className="bg-red-900 bg-opacity-30 rounded-lg p-4 border border-red-500">
                      <p className="text-red-400 font-medium">⚠️ Payment Blocked</p>
                      <p className="text-red-300 text-sm mt-1">
                        Token already exists in database - listing fee not required.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-yellow-300 mb-6">
                    Checking if token already exists in database...
                  </p>
                )}
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
