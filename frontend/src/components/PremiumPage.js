import React from 'react';

export default function PremiumPage({ onBack, headerAuth }) {
  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">👑 Premium</h1>
          <div className="flex items-center gap-3">
            {headerAuth}
            <button onClick={onBack} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-2">Premium DeGen Oracle</h2>
          <p className="text-gray-300">Level up your edge. Track calls with proof, monitor momentum shifts, and showcase your performance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free Tier */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Free Tier</h3>
            <ul className="space-y-3 text-gray-300 text-sm">
              <li>• Access to Degen Bubbles (real-time bubble map of trending tokens)</li>
              <li>• Personal dashboard</li>
              <li>• Unlimited tokens in Watchlist</li>
              <li>• Hype-over-Time charts for up to 5 coins</li>
              <li>• Calls: 1 call/month (timestamped with market cap at call time)</li>
            </ul>
          </div>

          {/* Premium Tier */}
          <div className="bg-dark-card border border-solana-purple rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>Premium Tier</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-solana-purple/20 text-solana-purple border border-solana-purple/50">Recommended</span>
            </h3>
            <ul className="space-y-3 text-gray-300 text-sm">
              <li>• Everything in Free, plus:</li>
              <li>• Hype-over-Time: Unlimited coins → spot momentum shifts and time entries better</li>
              <li>• Unlimited Calls with proof links and automatic performance tracking</li>
              <li>• KOL Leaderboard access: showcase your efficiency (Xs, hit rate); gain followers and visibility</li>
              <li>• Oracle AI: summarizes on-chain + social signals into actionable insights to improve your calls</li>
            </ul>
          </div>
        </div>

        <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">Notes</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• A Call is a public pick recorded with an immutable timestamp and the token’s market cap at that moment.</li>
            <li>• Leaderboard metrics include X multiple, hit rate, time-to-ATH, and drawdown, so performance is transparent and comparable.</li>
          </ul>
          <div className="mt-5">
            <button disabled className="px-4 py-2 bg-solana-purple/50 border border-solana-purple/40 text-white rounded-lg opacity-70 cursor-not-allowed">
              Helio payment coming soon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


