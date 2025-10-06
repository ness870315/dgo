import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NFTGatedAccess from './NFTGatedAccess';

export default function PremiumPage({ onBack, headerAuth }) {
  const { sessionId, user } = useAuth();
  const containerRef = useRef(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const helioInitializedRef = useRef(false);
  const [referral, setReferral] = useState('');
  const [refStatus, setRefStatus] = useState('');

  // Guarded initializer to avoid double-mounts and handle first-load race conditions
  const initHelio = (attempt = 0) => {
    if (helioInitializedRef.current) return;
    if (!containerRef.current) return;
    if (!window.helioCheckout) {
      if (attempt < 10) setTimeout(() => initHelio(attempt + 1), 200);
      return;
    }
    if (isInitializing) return;
    setIsInitializing(true);
    try {
      window.helioCheckout(
        containerRef.current,
        {
          paylinkId: '68b8ed60cf71471addc8adb6',
          theme: { themeMode: 'dark' },
          primaryColor: '#FE5300',
          neutralColor: '#5A6578',
          display: 'inline',
          onStartPayment: () => setStatusMsg('Starting payment...'),
          onPending: (event) => { setStatusMsg('Payment pending...'); console.log('Helio pending', event); },
          onCancel: () => setStatusMsg('Payment cancelled'),
          onError: (event) => { setStatusMsg('Payment error'); console.error('Helio error', event); },
          onSuccess: async (event) => {
            try {
              setStatusMsg('Payment successful! Activating Premium...');
              const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
              
              // Prepare payment data similar to fuel token flow
              const paymentId = event.paymentId || event.id || `premium_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const paymentData = {
                paymentId: paymentId,
                amount: 5000, // $50.00 in cents for premium
                currency: 'USD',
                status: 'completed',
                timestamp: new Date().toISOString(),
                source: 'helio_widget',
                ...event
              };
              
              const resp = await fetch(`${apiBase}/api/user/premium/activate`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  sessionId, 
                  receipt: event, 
                  paylinkId: '68b8ed60cf71471addc8adb6',
                  paymentId: paymentId,
                  paymentData: paymentData
                })
              });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              await resp.json();
              setStatusMsg('✅ Premium activated! Enjoy your new features.');
            } catch (err) {
              console.error('Failed to activate premium', err);
              setStatusMsg('❌ Premium activation failed. Please contact support.');
            }
          }
        }
      );
      helioInitializedRef.current = true;
    } catch (err) {
      console.error('Failed to initialize Helio widget:', err);
      if (attempt < 10) setTimeout(() => initHelio(attempt + 1), 300);
    } finally {
      setIsInitializing(false);
    }
  };

  // Ensure Helio script is present once and initialize on load
  useEffect(() => {
    const existing = document.querySelector('script[src*="embed.hel.io/assets/index-v1.js"]');
    if (existing) {
      if (window.helioCheckout) initHelio(0);
      else existing.addEventListener('load', () => initHelio(0), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.crossOrigin = 'anonymous';
    script.src = 'https://embed.hel.io/assets/index-v1.js';
    script.addEventListener('load', () => initHelio(0), { once: true });
    document.head.appendChild(script);
  }, []);

  // Fallback: if container becomes available later, attempt init
  useEffect(() => {
    if (containerRef.current && !helioInitializedRef.current) {
      initHelio(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current, sessionId]);
  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="bg-dark-card border-b border-solana-purple px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">👑 Premium</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            {headerAuth}
            <button onClick={onBack} className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-solana-purple/60 text-sm sm:text-base">
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="bg-dark-card border border-gray-700 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Premium DeGen Oracle</h2>
          <p className="text-gray-300 text-sm sm:text-base">Level up your edge. Track calls with proof, monitor momentum shifts, and showcase your performance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Free Tier */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Free Tier</h3>
            <ul className="space-y-2 sm:space-y-3 text-gray-300 text-xs sm:text-sm">
              <li>• Access to Degen Bubbles (real-time bubble map of trending tokens)</li>
              <li>• Personal dashboard</li>
              <li>• Unlimited tokens in Watchlist</li>
              <li>• Hype-over-Time charts for up to 5 coins</li>
              <li>• Calls: 1 call/month (timestamped with market cap at call time)</li>
            </ul>
          </div>

          {/* Premium Tier */}
          <div className="bg-dark-card border border-solana-purple rounded-xl p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
              <span>Premium Tier</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-solana-purple/20 text-solana-purple border border-solana-purple/50">Recommended</span>
            </h3>
            <ul className="space-y-2 sm:space-y-3 text-gray-300 text-xs sm:text-sm">
              <li>• Everything in Free, plus:</li>
              <li>• Hype-over-Time: Unlimited coins → spot momentum shifts and time entries better</li>
              <li>• Unlimited Calls with proof links and automatic performance tracking</li>
              <li>• KOL Leaderboard access: showcase your efficiency (Xs, hit rate); gain followers and visibility</li>
              <li>• Oracle AI: summarizes on-chain + social signals into actionable insights to improve your calls</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Helio Payment */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3">Upgrade to Premium</h3>
            <p className="text-gray-300 text-xs sm:text-sm mb-4">Complete your secure payment below. Your account will be upgraded automatically after success.</p>
            <div className="flex justify-center">
              <div id="helioCheckoutPremium" ref={containerRef} className="w-full max-w-xl" />
            </div>
            {statusMsg && (
              <div className="mt-4 text-xs sm:text-sm text-gray-300">{statusMsg}</div>
            )}
          </div>

          {/* NFT Holder Access */}
          <NFTGatedAccess />

          {/* Referral Code Redeem */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3">Have a Referral Code?</h3>
            <p className="text-gray-300 text-xs sm:text-sm mb-4">Redeem a valid code to get 30 days of Premium for free.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="flex-1 bg-transparent border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 text-sm"
              />
              <button
                onClick={async () => {
                  try {
                    setRefStatus('Processing...');
                    const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
                    const resp = await fetch(`${apiBase}/api/user/premium/redeem`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId, code: referral })
                    });
                    const data = await resp.json();
                    if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
                    setRefStatus('✅ Code applied! Premium active for 30 days.');
                  } catch (e) {
                    setRefStatus(`❌ ${e.message}`);
                  }
                }}
                className="px-4 py-2 bg-solana-purple hover:bg-purple-700 text-white rounded-md text-sm"
              >
                Redeem
              </button>
            </div>
            {refStatus && <div className="mt-3 text-xs sm:text-sm text-gray-300">{refStatus}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


