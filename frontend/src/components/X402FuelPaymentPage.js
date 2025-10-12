import React, { useState, useEffect } from 'react';
import { createX402Client } from '@payai/x402-solana/client';

function X402FuelPaymentPage() {
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState(null);
  const [expiryTime, setExpiryTime] = useState('');
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState(null);

  // Get nonce from URL
  const nonce = new URLSearchParams(window.location.search).get('nonce');

  // Load payment details
  useEffect(() => {
    if (!nonce) {
      setError('Invalid payment link');
      setLoading(false);
      return;
    }

    loadPaymentDetails();
  }, [nonce]);

  // Expiry timer
  useEffect(() => {
    if (!paymentDetails) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, paymentDetails.expiresAt - Date.now());
      if (remaining === 0) {
        setError('Payment link has expired');
        clearInterval(interval);
        return;
      }
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setExpiryTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [paymentDetails]);

  async function loadPaymentDetails() {
    try {
      const response = await fetch(`https://api.degen-oracle.com/api/x402/payment-details/${nonce}`);
      if (!response.ok) throw new Error('Payment not found or expired');
      
      const data = await response.json();
      setPaymentDetails(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // Connect wallet first
  async function connectWallet() {
    setStatus({ message: 'Connecting to wallet...', type: 'info' });
    
    try {
      if (!window.solana?.isPhantom) {
        throw new Error('Phantom wallet not found. Install from phantom.app');
      }

      await window.solana.connect();
      const phantomWallet = window.solana;
      
      console.log('[Payment] ✅ Wallet connected:', phantomWallet.publicKey.toString());
      
      // Create wallet adapter for PayAI SDK (must have 'address' property)
      const walletAdapter = {
        address: phantomWallet.publicKey.toString(),  // ← PayAI SDK requires 'address' as string
        publicKey: phantomWallet.publicKey,
        signTransaction: async (transaction) => {
          console.log('[Payment] 🔐 Requesting signature from wallet...');
          const signed = await phantomWallet.signTransaction(transaction);
          console.log('[Payment] ✅ Transaction signed');
          return signed;
        }
      };
      
      setConnectedWallet(walletAdapter);
      setWalletConnected(true);
      setStatus(null);
      
    } catch (err) {
      console.error('[Payment] ❌ Wallet connection error:', err);
      if (err.message.includes('rejected')) {
        setStatus({ message: 'Connection cancelled by user', type: 'error' });
      } else {
        setStatus({ message: `Failed to connect: ${err.message}`, type: 'error' });
      }
    }
  }

  // Process payment after wallet is connected
  async function processPayment() {
    if (!connectedWallet) {
      setStatus({ message: 'Please connect your wallet first', type: 'error' });
      return;
    }
    
    setStatus({ message: 'Creating x402 payment...', type: 'info' });
    
    try {
      // Create x402 client with connected wallet
      const client = createX402Client({
        wallet: connectedWallet,
        network: 'solana',
        rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=e20ea2f4-232f-484e-be1e-e41b698a7850'
      });

      setStatus({ message: 'Requesting payment approval...', type: 'info' });

      // Make paid request - SDK will prompt for transaction signature
      const resourceUrl = `https://api.degen-oracle.com/api/x402/fuel/${nonce}`;
      const response = await client.fetch(resourceUrl);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Payment failed: ${response.status}`);
      }

      await response.json();
      setSuccess(true);
      setStatus(null);

    } catch (err) {
      console.error('[Payment] ❌ Payment error:', err);
      if (err.message.includes('rejected')) {
        setStatus({ message: 'Payment cancelled by user', type: 'error' });
      } else {
        setStatus({ message: `Payment failed: ${err.message}`, type: 'error' });
      }
    }
  }
  
  // Handle button click - connect wallet or process payment
  async function handleButtonClick() {
    if (!walletConnected) {
      await connectWallet();
    } else {
      await processPayment();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-md w-full bg-gray-900 rounded-2xl border-2 border-red-500 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <a href="https://degen-oracle.com" className="text-purple-400 hover:text-purple-300">
            Return to DeGen Oracle →
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-md w-full bg-gray-900 rounded-2xl border-2 border-green-500 p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-2">Fuel Applied!</h2>
          <p className="text-gray-400 mb-2">
            Your <span className="text-orange-400 font-bold">{paymentDetails.fuelType}</span> Fuel has been applied to
          </p>
          <p className="text-white text-xl font-bold mb-4">${paymentDetails.tokenSymbol}</p>
          <p className="text-gray-400 text-sm mb-6">Check your Twitter mentions for confirmation!</p>
          <a 
            href="https://degen-oracle.com" 
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all"
          >
            View on DeGen Oracle →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl border-2 border-purple-500 shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">🔥 Fuel Payment</h1>
          <p className="text-gray-400 text-sm">Powered by @PayAINetwork</p>
        </div>

        {/* Token Info */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400">Token:</span>
            <span className="text-white font-bold text-xl">${paymentDetails.tokenSymbol}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400">Fuel Tier:</span>
            <span className="text-orange-400 font-bold">{paymentDetails.fuelType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Requested by:</span>
            <span className="text-blue-400">@{paymentDetails.userHandle}</span>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-gradient-to-r from-purple-900 to-purple-700 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-200 line-through">${paymentDetails.originalPrice.toFixed(2)} USD</span>
            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold">90% OFF</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white text-sm">You pay:</span>
            <span className="text-white font-bold text-3xl">{paymentDetails.amount.toFixed(2)}</span>
            <span className="text-white text-xl">USDC</span>
          </div>
          <p className="text-purple-200 text-xs mt-2">Gas fees covered by @PayAINetwork</p>
        </div>

        {/* Expiry Timer */}
        <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-3 mb-6 text-center">
          <p className="text-yellow-200 text-sm">
            ⏰ Link expires in <span className="font-bold">{expiryTime}</span>
          </p>
        </div>

        {/* Pay Button - Changes text based on wallet state */}
        <button
          onClick={handleButtonClick}
          disabled={status !== null}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg mb-4"
        >
          {!walletConnected ? '🔗 Connect Wallet' : '💳 Pay with Wallet'}
        </button>

        {/* Status */}
        {status && (
          <div className={`p-4 rounded-lg text-center border ${
            status.type === 'error' 
              ? 'bg-red-900 border-red-600' 
              : 'bg-blue-900 border-blue-600'
          }`}>
            <p className={status.type === 'error' ? 'text-red-200' : 'text-blue-200'}>
              {status.message}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-gray-400 text-center mt-4">
          ⚡ Powered by PayAI x402 Protocol • Secure on-chain payments
        </div>
      </div>
    </div>
  );
}

export default X402FuelPaymentPage;

