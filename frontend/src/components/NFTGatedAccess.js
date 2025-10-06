import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const NFTGatedAccess = () => {
  const { sessionId } = useAuth();
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [nfts, setNfts] = useState([]);

  // Check if Phantom wallet is installed
  const isPhantomInstalled = () => {
    return window.solana && window.solana.isPhantom;
  };

  // Connect wallet
  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      setStatusMessage('');

      if (!isPhantomInstalled()) {
        setStatusMessage('❌ Phantom wallet not found. Please install Phantom to continue.');
        window.open('https://phantom.app/', '_blank');
        return;
      }

      const resp = await window.solana.connect();
      const address = resp.publicKey.toString();
      setWalletAddress(address);
      setStatusMessage(`✅ Wallet connected: ${address.slice(0, 4)}...${address.slice(-4)}`);
      
      // Auto-verify after connection
      await verifyNFTOwnership(address);

    } catch (error) {
      console.error('Wallet connection error:', error);
      setStatusMessage('❌ Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      if (window.solana) {
        await window.solana.disconnect();
      }
      setWalletAddress(null);
      setNfts([]);
      setStatusMessage('');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // Verify NFT ownership
  const verifyNFTOwnership = async (address) => {
    try {
      setIsVerifying(true);
      setStatusMessage('🔍 Verifying NFT ownership...');

      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${apiBase}/api/user/premium/verify-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          walletAddress: address || walletAddress
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      // Success!
      setNfts(data.nfts || []);
      setStatusMessage(`✅ ${data.message}`);
      
      // Reload page after 2 seconds to refresh Premium status
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('NFT verification error:', error);
      setStatusMessage(`❌ ${error.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-connect if wallet was previously connected
  useEffect(() => {
    const autoConnect = async () => {
      if (isPhantomInstalled() && window.solana.isConnected) {
        const address = window.solana.publicKey.toString();
        setWalletAddress(address);
      }
    };
    autoConnect();
  }, []);

  return (
    <div className="bg-dark-card border border-gray-700 rounded-xl p-4 sm:p-6">
      <h3 className="text-base sm:text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <span>🎨</span>
        <span>NFT Holder Access</span>
      </h3>
      
      <p className="text-gray-300 text-xs sm:text-sm mb-4">
        Own an NFT from our collection? Connect your wallet to get Premium access automatically!
      </p>

      {!walletAddress ? (
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Connecting...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>👻</span>
              <span>Connect Phantom Wallet</span>
            </span>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
            <div>
              <div className="text-xs text-gray-400">Connected Wallet</div>
              <div className="text-sm text-white font-mono">
                {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
              </div>
            </div>
            <button
              onClick={disconnectWallet}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Disconnect
            </button>
          </div>

          {nfts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400">NFTs Found:</div>
              {nfts.slice(0, 3).map((nft, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                  {nft.image && (
                    <img src={nft.image} alt={nft.name} className="w-10 h-10 rounded" />
                  )}
                  <div className="text-xs text-white">{nft.name}</div>
                </div>
              ))}
              {nfts.length > 3 && (
                <div className="text-xs text-gray-400">+ {nfts.length - 3} more</div>
              )}
            </div>
          )}

          {!isVerifying && nfts.length === 0 && (
            <button
              onClick={() => verifyNFTOwnership()}
              className="w-full px-4 py-2 bg-solana-purple hover:bg-purple-700 text-white rounded-lg text-sm transition-colors"
            >
              Verify NFT Ownership
            </button>
          )}
        </div>
      )}

      {statusMessage && (
        <div className={`mt-3 p-3 rounded-lg text-xs sm:text-sm ${
          statusMessage.startsWith('✅') 
            ? 'bg-green-900/20 border border-green-500/30 text-green-300'
            : statusMessage.startsWith('❌')
            ? 'bg-red-900/20 border border-red-500/30 text-red-300'
            : 'bg-blue-900/20 border border-blue-500/30 text-blue-300'
        }`}>
          {statusMessage}
        </div>
      )}

      {isVerifying && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-300">
          <div className="w-4 h-4 border-2 border-solana-purple border-t-transparent rounded-full animate-spin"></div>
          <span>Verifying...</span>
        </div>
      )}

      {!isPhantomInstalled() && (
        <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <div className="text-xs text-yellow-300">
            💡 Don't have Phantom wallet? 
            <a 
              href="https://phantom.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-1 underline hover:text-yellow-200"
            >
              Install it here
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default NFTGatedAccess;
