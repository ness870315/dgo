import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import BubbleMap from './components/BubbleMap';
import TokenRankedList from './components/TokenRankedList';
import ViewToggle from './components/ViewToggle';
import TokenDetails from './components/TokenDetails';
import Settings from './components/Settings';
import CategoryFilters from './components/CategoryFilters';
import TemperatureLegend from './components/TemperatureLegend';
import AuthButton from './components/AuthButton';
import WatchlistPanel from './components/WatchlistPanel';
import ListTokenPage from './components/ListTokenPage';
import FuelTokenPage from './components/FuelTokenPage';
import UpdateTokenPage from './components/UpdateTokenPage';
import UserDashboard from './components/UserDashboard';
import ApifyTestPage from './components/ApifyTestPage';
import PremiumPage from './components/PremiumPage';
import { AuthProvider } from './contexts/AuthContext';
import tokenService from './services/tokenService';
import './App.css';

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
        Payment Successful!
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

// Submit token to database function
const submitTokenToDatabase = async (tokenData) => {
  try {
    console.log('🔥 Submitting paid token to database:', tokenData);
    
    const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    const response = await fetch(`${apiBase}/api/tokens/add-paid-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contractAddress: tokenData.contractAddress,
        symbol: tokenData.symbol,
        name: tokenData.name,
        source: 'user_paid',
        paymentData: {
          status: 'completed',
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Token submitted successfully:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error submitting token to database:', error);
    throw error;
  }
};

function App() {
  const [tokens, setTokens] = useState([]);
  const [filteredTokens, setFilteredTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showListToken, setShowListToken] = useState(false);
  const [showFuelToken, setShowFuelToken] = useState(false);
  const [showUpdateToken, setShowUpdateToken] = useState(false);
  const [showUserDashboard, setShowUserDashboard] = useState(false);
  const [showApifyTest, setShowApifyTest] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [fueledTokens, setFueledTokens] = useState([]);
  const [viewMode, setViewMode] = useState('bubbles'); // 'bubbles' or 'cards'
  const [settings, setSettings] = useState({
    useRealTwitterData: true, // Using real backend API data now that backend is deployed
    enableRealTimeUpdates: true,
    enableSentimentAnalysis: true,
    enableRiskDetection: true,
    refreshInterval: 5
  });

  // Helper function to get market cap from the correct source (prefer normalized Jupiter field)
  const getMarketCap = (token) => {
    return (
      token?.jupiterData?.marketCap ??
      token?.jupiterData?.mcap ??
      token?.marketCap ??
      0
    );
  };
  const [filters, setFilters] = useState({
    minScore: 0,
    maxScore: 10,
    hasOfficialProfile: null,
    minMentions: 0,
    sortBy: 'score'
  });
  const [categoryFilters, setCategoryFilters] = useState({
    trending: true,
    cults: false,
    highCap: false,
    midCap: false,
    smallCap: false,
    microCap: false,
    volatile: false,
    stable: false
  });

  // View toggle state
  const [currentView, setCurrentView] = useState('bubbles'); // 'bubbles' or 'list'

  // Apply category filters function (mutually exclusive filters)
  const applyCategoryFilters = useCallback((tokenData, categories) => {
    console.log('Applying category filters to', tokenData.length, 'tokens with filters:', categories);
    
    // Since filters are mutually exclusive, find which one is active
    if (categories.trending) {
      // NEW TRENDING (refined + viral override):
      // - Base: Score ≥ 6 AND Market cap ≤ $10M (emerging)
      // - Viral override: include tokens with latest hype label 'Viral' (score ≥8) regardless of cap/CULT
      // - Freshness gate (updated within last 30m)
      // - Guardrails against recent dumps & weak socials
      // Ranking: Viral first, then base ranked by 50% score + 30% turnover + 20% volume
      // Limit: top 100
      const fueledSymbols = new Set(fueledTokens?.map(fuel => fuel.symbol) || []);
      
      // Base filter: score & market cap (emerging)
      const baseTokens = tokenData.filter(token =>
        (token.score || token.overallScore || 0) >= 6.0 &&
        getMarketCap(token) <= 10_000_000
      );

      // Viral override set (hype label Viral regardless of cap)
      const isViralOrTrendingToken = (t) => {
        const hypeLabel = t?.hypeAnalysis?.latestLabel || t?.hypeLabel;
        if (hypeLabel) return /viral|trending/i.test(hypeLabel);
        const s = (t.score || t.overallScore || 0);
        return s >= 8.0; // Viral (9.0+) and Trending (8.0-8.9) only
      };
      const viralAndTrendingCandidates = tokenData.filter(isViralOrTrendingToken);

      // Apply guardrails
      const now = Date.now();
      const highScoreTokens = baseTokens.filter(token => {
        const mcap = Math.max(getMarketCap(token), 0);
        const volume24h = (
          (token.jupiterData?.stats24h?.buyVolume || 0) +
          (token.jupiterData?.stats24h?.sellVolume || 0)
        ) || token.volume24h || 0;
        const turnover = mcap > 0 ? volume24h / mcap : 0;

        const lastUpdated = token.lastUpdated ? Date.parse(token.lastUpdated) : null;
        const isFresh = lastUpdated ? (now - lastUpdated) <= (30 * 60 * 1000) : true; // allow if unknown

        const mentions = token?.twitterData?.mentions ?? token?.mentions ?? 0;
        const community = token?.communityScore ?? token?.communityHealthScore ?? 0;

        const volChange1h = token?.jupiterData?.stats1h?.volumeChange ?? 0;
        const volChange6h = token?.jupiterData?.stats6h?.volumeChange ?? 0;

        // Guardrails - STRENGTHENED to prevent crashed micro-caps
        // 1) Freshness - CRITICAL: Exclude stale data from trending
        if (!isFresh) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: stale data (${Math.round((now - lastUpdated) / 60000)} min old)`);
          return false;
        }
        
        // 2) ABSOLUTE MICRO-CAP FILTER - No tokens under $50k market cap
        if (mcap > 0 && mcap < 50_000) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: micro-cap ($${mcap.toLocaleString()})`);
          return false;
        }
        
        // 3) PRICE CRASH PROTECTION - Exclude catastrophic dumps
        const priceChange24h = token?.jupiterData?.stats24h?.priceChange ?? token?.priceChange24h ?? 0;
        const priceChange7d = token?.jupiterData?.stats7d?.priceChange ?? 0;
        if (priceChange24h <= -75 || priceChange7d <= -90) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: price crash (24h: ${priceChange24h.toFixed(1)}%, 7d: ${priceChange7d.toFixed(1)}%)`);
          return false;
        }
        
        // 4) COMBINED RISK FILTER - Exclude small caps with major dumps
        if (mcap > 0 && mcap < 100_000 && priceChange24h <= -50) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: small-cap dump (mcap: $${mcap.toLocaleString()}, 24h: ${priceChange24h.toFixed(1)}%)`);
          return false;
        }
        
        // 5) Volume dump penalty → exclude if heavy dump across 1h and 6h
        if (volChange1h <= -50 && volChange6h <= -50) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: volume dump (1h: ${volChange1h.toFixed(1)}%, 6h: ${volChange6h.toFixed(1)}%)`);
          return false;
        }
        
        // 6) Social floor (relaxed) — only exclude if weak socials AND low score
        const score = (token.score || token.overallScore || 0);
        if (community < 4 && mentions < 5 && score < 7) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: weak socials (community: ${community}, mentions: ${mentions}, score: ${score})`);
          return false;
        }
        
        // 7) 🚨 NEW: TRADING ACTIVITY FILTER - Must have actual trading activity
        const buyVolume = token.jupiterData?.stats24h?.buyVolume || 0;
        const sellVolume = token.jupiterData?.stats24h?.sellVolume || 0;
        const totalVolume = buyVolume + sellVolume;
        
        // Exclude tokens with no trading activity
        if (totalVolume === 0) {
          console.log(`⚠️ Excluding ${token.symbol} from trending: no trading activity (volume: $0)`);
          return false;
        }
        
        // 8) 🚨 NEW: BUY PRESSURE FILTER - Must have some organic buying
        const buyPressure = buyVolume / (totalVolume || 1);
        if (buyPressure < 0.1) { // Less than 10% buy volume
          console.log(`⚠️ Excluding ${token.symbol} from trending: no organic buying (buy pressure: ${(buyPressure * 100).toFixed(1)}%)`);
          return false;
        }
        
        // 9) 🚨 NEW: MINIMUM VOLUME FILTER - Must have minimum trading volume
        if (totalVolume < 1000) { // Less than $1K volume
          console.log(`⚠️ Excluding ${token.symbol} from trending: insufficient volume ($${totalVolume.toLocaleString()})`);
          return false;
        }

        return true;
      });
      
      // Separate fueled and regular tokens
      const fueledTokensList = highScoreTokens.filter(token => fueledSymbols.has(token.symbol));
      const regularTokens = highScoreTokens.filter(token => !fueledSymbols.has(token.symbol));
      
      // Sort by refined formula: 50% score + 30% turnover + 20% volume
      const sortedFueledTokens = fueledTokensList.sort((a, b) => {
        const mcapA = Math.max(getMarketCap(a), 0);
        const mcapB = Math.max(getMarketCap(b), 0);
        const volume24hA = ((a.jupiterData?.stats24h?.buyVolume || 0) + (a.jupiterData?.stats24h?.sellVolume || 0)) || a.volume24h || 0;
        const volume24hB = ((b.jupiterData?.stats24h?.buyVolume || 0) + (b.jupiterData?.stats24h?.sellVolume || 0)) || b.volume24h || 0;
        const turnoverA = mcapA > 0 ? volume24hA / mcapA : 0;
        const turnoverB = mcapB > 0 ? volume24hB / mcapB : 0;
        const scoreA = (a.score || a.overallScore || 0) * 0.5 + Math.log10(turnoverA + 1) * 0.3 + Math.log10(volume24hA + 1) * 0.2;
        const scoreB = (b.score || b.overallScore || 0) * 0.5 + Math.log10(turnoverB + 1) * 0.3 + Math.log10(volume24hB + 1) * 0.2;
        return scoreB - scoreA;
      });
      
      const sortedRegularTokens = regularTokens.sort((a, b) => {
        const mcapA = Math.max(getMarketCap(a), 0);
        const mcapB = Math.max(getMarketCap(b), 0);
        const volume24hA = ((a.jupiterData?.stats24h?.buyVolume || 0) + (a.jupiterData?.stats24h?.sellVolume || 0)) || a.volume24h || 0;
        const volume24hB = ((b.jupiterData?.stats24h?.buyVolume || 0) + (b.jupiterData?.stats24h?.sellVolume || 0)) || b.volume24h || 0;
        const turnoverA = mcapA > 0 ? volume24hA / mcapA : 0;
        const turnoverB = mcapB > 0 ? volume24hB / mcapB : 0;
        const scoreA = (a.score || a.overallScore || 0) * 0.5 + Math.log10(turnoverA + 1) * 0.3 + Math.log10(volume24hA + 1) * 0.2;
        const scoreB = (b.score || b.overallScore || 0) * 0.5 + Math.log10(turnoverB + 1) * 0.3 + Math.log10(volume24hB + 1) * 0.2;
        return scoreB - scoreA;
      });
      
      // Combine Viral first (any cap), then emerging ranked, total 100
      // De-duplicate by contract/symbol
      const seen = new Set();
      const pushUnique = (arr, t) => {
        const key = (t.contractAddress || t.symbol || '').toLowerCase();
        if (!seen.has(key)) { seen.add(key); arr.push(t); }
      };
      let trendingTokens = [];
      // Viral and Trending tokens only (scores 8.0+)
      viralAndTrendingCandidates.forEach(t => {
        // Basic freshness guard only
        const lastUpdated = t.lastUpdated ? Date.parse(t.lastUpdated) : null;
        const isFresh = lastUpdated ? (Date.now() - lastUpdated) <= (30 * 60 * 1000) : true;
        if (isFresh) pushUnique(trendingTokens, t);
      });
      // No additional emerging tokens - only Viral and Trending
      trendingTokens = trendingTokens.slice(0, 100);

      // Safety fallback: never return zero — fall back to base tokens by score
      if (trendingTokens.length === 0) {
        const fallback = [...baseTokens]
          .sort((a, b) => (b.score || b.overallScore || 0) - (a.score || a.overallScore || 0))
          .slice(0, 100);
        console.log('⚠️ Trending fallback engaged: returning top-scored base tokens because guardrails filtered all');
        return fallback;
      }
      
      console.log(`🚀 NEW Trending filter: Viral + Trending only (scores 8.0+). Showing top 100`);
      console.log(`   Viral + Trending included: ${viralAndTrendingCandidates.length}. Returning: ${trendingTokens.length}`);
      console.log('Category filtering result:', trendingTokens.length, 'tokens out of', tokenData.length);
      return trendingTokens;
    }
    
    if (categories.cults) {
      // CULTS: Established coins with market cap ≥ $10M + score ≥ 3.0
      const fueledSymbols = new Set(fueledTokens?.map(fuel => fuel.symbol) || []);
      
      // First, separate fueled tokens from regular tokens
      const fueledTokensList = tokenData.filter(token => 
        getMarketCap(token) >= 10000000 && // ≥$10M market cap
        (token.score || token.overallScore || 0) >= 3.0 && // ≥3.0 score (balanced threshold)
        fueledSymbols.has(token.symbol) // Is fueled
      );
      
      const regularTokens = tokenData.filter(token => 
        getMarketCap(token) >= 10000000 && // ≥$10M market cap
        (token.score || token.overallScore || 0) >= 3.0 && // ≥3.0 score (balanced threshold)
        !fueledSymbols.has(token.symbol) // Not fueled
      );
      
      // Sort fueled tokens by combined score (they get priority)
      const sortedFueledTokens = fueledTokensList.sort((a, b) => {
        const scoreA = (a.score || a.overallScore || 0) * 0.6 + Math.log10(getMarketCap(a) + 1) * 0.3 + Math.log10((a.volume24h || 1) + 1) * 0.1;
        const scoreB = (b.score || b.overallScore || 0) * 0.6 + Math.log10(getMarketCap(b) + 1) * 0.3 + Math.log10((b.volume24h || 1) + 1) * 0.1;
        return scoreB - scoreA;
      });
      
      // Sort regular tokens by combined score
      const sortedRegularTokens = regularTokens.sort((a, b) => {
        const scoreA = (a.score || a.overallScore || 0) * 0.6 + Math.log10(getMarketCap(a) + 1) * 0.3 + Math.log10((a.volume24h || 1) + 1) * 0.1;
        const scoreB = (b.score || b.overallScore || 0) * 0.6 + Math.log10(getMarketCap(b) + 1) * 0.3 + Math.log10((b.volume24h || 1) + 1) * 0.1;
        return scoreB - scoreA;
      });
      
      // Combine: fueled tokens first, then regular tokens, total 50
      const cultsTokens = [...sortedFueledTokens, ...sortedRegularTokens].slice(0, 50);
      
      console.log(`🏛️ Cults filter: Showing top 50 established tokens (${sortedFueledTokens.length} fueled + ${Math.min(sortedRegularTokens.length, 50 - sortedFueledTokens.length)} regular) with score ≥3.0 and market cap ≥$10M`);
      console.log('Category filtering result:', cultsTokens.length, 'tokens out of', tokenData.length);
      return cultsTokens;
    }
    
    if (categories.highCap) {
      const highCapTokens = tokenData.filter(token => {
        const marketCap = getMarketCap(token);
        return marketCap >= 100000000; // ≥$100M
      });
      console.log('High Cap filter: Showing tokens ≥$100M market cap');
      console.log('Category filtering result:', highCapTokens.length, 'tokens out of', tokenData.length);
      return highCapTokens;
    }
    
    if (categories.midCap) {
      const midCapTokens = tokenData.filter(token => {
        const marketCap = getMarketCap(token);
        return marketCap >= 5000000 && marketCap <= 10000000; // ≥$5M to ≤$10M
      });
      console.log('Mid Cap filter: Showing tokens ≥$5M to ≤$10M market cap');
      console.log('Category filtering result:', midCapTokens.length, 'tokens out of', tokenData.length);
      return midCapTokens;
    }
    
    if (categories.smallCap) {
      const smallCapTokens = tokenData.filter(token => {
        const marketCap = getMarketCap(token);
        return marketCap > 500000 && marketCap < 5000000; // >$500K to <$5M
      });
      console.log('Small Cap filter: Showing tokens >$500K to <$5M market cap');
      console.log('Category filtering result:', smallCapTokens.length, 'tokens out of', tokenData.length);
      return smallCapTokens;
    }
    
    if (categories.microCap) {
      const microCapTokens = tokenData.filter(token => {
        const marketCap = getMarketCap(token);
        return marketCap >= 30000 && marketCap <= 500000; // $30K to $500K
      });
      console.log('Micro Cap filter: Showing tokens $30K to $500K market cap');
      console.log('Category filtering result:', microCapTokens.length, 'tokens out of', tokenData.length);
      return microCapTokens;
    }
    
    if (categories.volatile) {
      const volatileTokens = tokenData.filter(token => Math.abs(token.priceChange24h || 0) > 5);
      console.log('Volatile filter: Showing tokens with >5% daily change');
      console.log('Category filtering result:', volatileTokens.length, 'tokens out of', tokenData.length);
      return volatileTokens;
    }
    
    if (categories.stable) {
      const stableTokens = tokenData.filter(token => Math.abs(token.priceChange24h || 0) <= 5);
      console.log('Stable filter: Showing tokens with ≤5% daily change');
      console.log('Category filtering result:', stableTokens.length, 'tokens out of', tokenData.length);
      return stableTokens;
    }
    
    // No category filter active - return empty array (should not happen with trending default)
    console.log('No category filter active - returning empty array');
    return [];
  }, []);

  // Apply filters and search
  const applyFiltersAndSearch = useCallback((tokenData, currentFilters, currentSearchTerm) => {
    console.log('applyFiltersAndSearch called with:', tokenData.length, 'tokens');
    console.log('Category filters:', categoryFilters);
    console.log('Search term:', currentSearchTerm);
    
    // If there's a search term, SEARCH OVERRIDES ALL FILTERS
    if (currentSearchTerm && currentSearchTerm.trim()) {
      console.log('🔍 SEARCH MODE: Search overrides category filters');
      let filtered = tokenService.searchTokens(tokenData, currentSearchTerm);
      filtered = tokenService.filterTokens(filtered, currentFilters);
      filtered = tokenService.sortTokens(filtered, currentFilters.sortBy);
      console.log('🎯 Search results:', filtered.length, 'tokens found');
      setFilteredTokens(filtered);
      return;
    }
    
    // No search term - apply normal category filtering
    console.log('📂 FILTER MODE: Applying category filters');
    let filtered = tokenService.filterTokens(tokenData, currentFilters);
    filtered = applyCategoryFilters(filtered, categoryFilters);
    filtered = tokenService.sortTokens(filtered, currentFilters.sortBy);
    console.log('Final filtered tokens:', filtered.length);
    setFilteredTokens(filtered);
  }, [categoryFilters, applyCategoryFilters]);

  // Load initial data
  const loadTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
              const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
              const [tokenData, fueledData] = await Promise.all([
          tokenService.fetchTokens(settings.useRealTwitterData),
          fetch(`${apiBase}/api/tokens/fuel`).then(res => res.ok ? res.json() : { value: [] })
        ]);
        
        console.log('App.js Debug - Loaded tokenData:', tokenData.length, 'tokens');
        console.log('App.js Debug - First token sample:', tokenData[0]);
        console.log('App.js Debug - useRealTwitterData setting:', settings.useRealTwitterData);
        
        setTokens(tokenData);
        setFueledTokens(fueledData.value || fueledData);
        console.log('🔥 Fuel Token Debug: Loaded fueled tokens:', fueledData.value || fueledData);
        applyFiltersAndSearch(tokenData, filters, searchTerm);
    } catch (err) {
      setError('Failed to load token data. Please try again.');
      console.error('Error loading tokens:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters, searchTerm, settings.useRealTwitterData, applyFiltersAndSearch]);

  // Handle search
  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    applyFiltersAndSearch(tokens, filters, term);
  }, [tokens, filters, applyFiltersAndSearch]);

  // Handle filter changes
  const handleFilter = useCallback((newFilters) => {
    setFilters(newFilters);
    applyFiltersAndSearch(tokens, newFilters, searchTerm);
  }, [tokens, searchTerm, applyFiltersAndSearch]);

  // Handle token selection
  const handleTokenSelect = useCallback((token) => {
    setSelectedToken(token);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadTokens();
  }, [loadTokens]);

  // Handle settings
  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings);
    // Reload data if Twitter API setting changed
    if (newSettings.useRealTwitterData !== settings.useRealTwitterData) {
      loadTokens();
    }
  }, [settings.useRealTwitterData, loadTokens]);

  // Handle new token added
  const handleTokenAdded = useCallback(async (newToken) => {
    console.log('🆕 New token added, refreshing data:', newToken);
    
    // Show success message
    setSuccessMessage(`🎉 Token "${newToken.symbol}" successfully added! Refreshing data...`);
    setError(null);
    
    // Force immediate refresh with multiple attempts
    let refreshAttempts = 0;
    const maxAttempts = 3;
    
    const attemptRefresh = async () => {
      try {
        console.log(`🔄 Refresh attempt ${refreshAttempts + 1}/${maxAttempts}`);
        await loadTokens();
        
        // Check if the new token is now visible
        const [currentTokens, fueledData] = await Promise.all([
          tokenService.fetchTokens(settings.useRealTwitterData),
          fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/fuel`).then(res => res.ok ? res.json() : { value: [] })
        ]);
        setFueledTokens(fueledData.value || fueledData);
        
        const tokenFound = currentTokens.some(token => 
          token.symbol?.toLowerCase() === newToken.symbol?.toLowerCase() ||
          token.contractAddress === newToken.contractAddress
        );
        
        if (tokenFound) {
          console.log('✅ New token found in refreshed data!');
          setSuccessMessage(`🎉 Token "${newToken.symbol}" successfully added and is now visible!`);
        } else {
          console.log('⚠️ Token not found yet, will retry...');
          if (refreshAttempts < maxAttempts - 1) {
            refreshAttempts++;
            setTimeout(attemptRefresh, 2000); // Retry after 2 seconds
          } else {
            setSuccessMessage(`🎉 Token "${newToken.symbol}" added! If not visible, try refreshing manually.`);
          }
        }
      } catch (error) {
        console.error('❌ Refresh attempt failed:', error);
        if (refreshAttempts < maxAttempts - 1) {
          refreshAttempts++;
          setTimeout(attemptRefresh, 2000);
        }
      }
    };
    
    // Start the refresh process
    await attemptRefresh();
    
    // Clear success message after 20 seconds (longer for better UX)
    setTimeout(() => setSuccessMessage(null), 20000);
  }, [loadTokens, searchTerm, categoryFilters.trending, settings.useRealTwitterData]);

  // Handle token socials updated
  const handleTokenUpdated = useCallback(async (updatedToken) => {
    console.log('🔄 Token socials updated, refreshing data:', updatedToken);
    
    // Show success message
    setSuccessMessage(`🎉 Social links for "${updatedToken.symbol}" successfully updated! Refreshing data...`);
    setError(null);
    
    // Force immediate refresh
    try {
      await loadTokens();
      
      // Refresh fueled tokens data
      const fueledData = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/tokens/fuel`).then(res => res.ok ? res.json() : { value: [] });
      setFueledTokens(fueledData.value || fueledData);
      
      console.log('✅ Token data refreshed after socials update!');
      setSuccessMessage(`🎉 Social links for "${updatedToken.symbol}" updated and data refreshed!`);
    } catch (error) {
      console.error('❌ Refresh after update failed:', error);
      setSuccessMessage(`🎉 Social links for "${updatedToken.symbol}" updated! Manual refresh may be needed.`);
    }
    
    // Clear success message after 15 seconds
    setTimeout(() => setSuccessMessage(null), 15000);
  }, [loadTokens]);

  // Real-time updates with polling
  useEffect(() => {
    if (!settings.enableRealTimeUpdates) return;
    
    const interval = setInterval(async () => {
      try {
        console.log('🔄 Auto-refreshing token data...');
        const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        const [tokenData, fueledData] = await Promise.all([
          tokenService.fetchTokens(settings.useRealTwitterData),
          fetch(`${apiBase}/api/tokens/fuel`).then(res => res.ok ? res.json() : { value: [] })
        ]);
        
        // Update fueled tokens
        setFueledTokens(fueledData.value || fueledData);
        
        // Only update if we got new data and it's different
        if (tokenData && tokenData.length > 0 && tokenData.length !== tokens.length) {
          console.log(`🆕 Token count changed: ${tokens.length} → ${tokenData.length}`);
          setTokens(tokenData);
          applyFiltersAndSearch(tokenData, filters, searchTerm);
        } else if (tokenData && tokenData.length > 0) {
          // Check if any existing tokens have updated data
          const hasUpdates = tokenData.some((newToken, index) => {
            const oldToken = tokens[index];
            return oldToken && (
              (newToken.score || newToken.overallScore) !== (oldToken.score || oldToken.overallScore) ||
              (newToken.currentPrice || newToken.price || 0) !== (oldToken.currentPrice || oldToken.price || 0) ||
              newToken.volume24h !== oldToken.volume24h ||
              newToken.lastProcessed !== oldToken.lastProcessed
            );
          });
          
          if (hasUpdates) {
            console.log('🔄 Token data updated, refreshing...');
            setTokens(tokenData);
            applyFiltersAndSearch(tokenData, filters, searchTerm);
          }
        }
      } catch (error) {
        console.log('⚠️ Auto-refresh failed:', error.message);
      }
    }, settings.refreshInterval * 60 * 1000); // Convert minutes to milliseconds
    
    return () => clearInterval(interval);
  }, [settings.enableRealTimeUpdates, settings.refreshInterval, settings.useRealTwitterData, tokens.length, filters, searchTerm, applyFiltersAndSearch]);

  // Handle URL parameters for payment success/error messages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const tokenSymbol = urlParams.get('token');
    
    if (paymentStatus === 'success') {
      // Check for pending token data in localStorage
      const pendingToken = localStorage.getItem('pendingTokenListing');
      if (pendingToken) {
        try {
          const tokenData = JSON.parse(pendingToken);
          console.log('🎉 Payment successful! Processing token:', tokenData);
          
          // Show professional success modal
          showProfessionalSuccessModal(tokenData);
          
          // Submit token to backend
          submitTokenToDatabase(tokenData).catch(error => {
            console.error('❌ Background token submission error:', error);
          });
          
          // Clean up localStorage
          localStorage.removeItem('pendingTokenListing');
          
        } catch (error) {
          console.error('❌ Error processing payment success:', error);
          setSuccessMessage(`🎉 Payment successful! Token processing initiated.`);
        }
      } else if (tokenSymbol) {
        // Fallback for old URL format
        setSuccessMessage(`🎉 Payment successful! Token "${tokenSymbol}" has been added to the database.`);
      } else {
        setSuccessMessage(`🎉 Payment successful! Token processing initiated.`);
      }
      
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Auto-refresh data to show the new token
      setTimeout(() => {
        loadTokens();
      }, 2000);
    } else if (paymentStatus === 'error') {
      const reason = urlParams.get('reason') || 'unknown error';
      setError(`❌ Payment failed: ${reason}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
      setError('❌ Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadTokens]);

  const handleSettingsClick = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleWatchlistClick = useCallback(() => {
    console.log('🎯 Navigating to Watchlist');
    setShowWatchlist(true);
  }, []);

  const handleListTokenClick = useCallback(() => {
    // Ensure dashboard is hidden when navigating to List Token page
    setShowUserDashboard(false);
    setShowFuelToken(false);
    setShowUpdateToken(false);
    setShowPremium(false);
    setShowListToken(true);
  }, []);

  const handleFuelTokenClick = useCallback(() => {
    // Ensure dashboard is hidden when navigating to Fuel Token page
    setShowUserDashboard(false);
    setShowListToken(false);
    setShowUpdateToken(false);
    setShowPremium(false);
    setShowFuelToken(true);
  }, []);

  const handleUpdateTokenClick = useCallback(() => {
    console.log('🎯 Navigating to Update Token page');
    // Ensure dashboard is hidden when navigating to Update Token page
    setShowUserDashboard(false);
    setShowListToken(false);
    setShowFuelToken(false);
    setShowPremium(false);
    setShowUpdateToken(true);
  }, []);

  const handleUserDashboardClick = useCallback(() => {
    console.log('🎯 Navigating to User Dashboard');
    // Close other views when opening dashboard
    setShowListToken(false);
    setShowFuelToken(false);
    setShowUpdateToken(false);
    setShowPremium(false);
    setShowUserDashboard(true);
  }, []);



  const handleApifyTestClick = useCallback(() => {
    setShowApifyTest(true);
  }, []);

  const handlePremiumClick = useCallback(() => {
    // Ensure dashboard is hidden when navigating to Premium page
    setShowUserDashboard(false);
    setShowListToken(false);
    setShowFuelToken(false);
    setShowUpdateToken(false);
    setShowPremium(true);
  }, []);


  const handleCategoryFiltersChange = useCallback((newCategoryFilters) => {
    console.log('Applying category filters:', newCategoryFilters);
    setCategoryFilters(newCategoryFilters);
    applyFiltersAndSearch(tokens, filters, searchTerm);
  }, [tokens, filters, searchTerm, applyFiltersAndSearch]);

  // Load data on component mount
  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Set up real-time updates
  useEffect(() => {
    if (!settings.enableRealTimeUpdates) return;

    const interval = setInterval(() => {
      if (!isLoading) {
        loadTokens();
      }
    }, settings.refreshInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.enableRealTimeUpdates, settings.refreshInterval, isLoading, loadTokens]);

  if (error) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
          <button
            onClick={handleRefresh}
            className="px-6 py-2 bg-solana-purple text-white rounded-lg hover:bg-opacity-80 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show List Token page if requested
  if (showListToken) {
    return (
      <AuthProvider>
        <div className="min-h-screen bg-dark-bg">
          <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <h1 className="text-2xl font-bold text-white">📄 List Token</h1>
              <AuthButton 
                onNavigateToListToken={handleListTokenClick} 
                onNavigateToFuelToken={handleFuelTokenClick} 
                onNavigateToUpdateToken={handleUpdateTokenClick}
                onNavigateToDashboard={handleUserDashboardClick}
                onNavigateToWatchlist={handleWatchlistClick}
                onNavigateToSettings={handleSettingsClick}
              />
            </div>
          </div>
          <ListTokenPage 
            onBack={() => setShowListToken(false)}
            onTokenAdded={handleTokenAdded}
          />
        </div>
      </AuthProvider>
    );
  }

  // Show Fuel Token page if requested
  if (showFuelToken) {
    return (
      <AuthProvider>
        <FuelTokenPage 
          onBack={() => setShowFuelToken(false)}
          onFuelApplied={() => {
            // Refresh fueled tokens when fuel is applied from this page
            console.log('🔥 App: Fuel applied, refreshing main app data...');
            loadTokens();
          }}
          headerAuth={
            <AuthButton 
              onNavigateToListToken={handleListTokenClick} 
              onNavigateToFuelToken={handleFuelTokenClick} 
              onNavigateToUpdateToken={handleUpdateTokenClick}
              onNavigateToDashboard={handleUserDashboardClick}
              onNavigateToWatchlist={handleWatchlistClick}
              onNavigateToSettings={handleSettingsClick}
            />
          }
        />
      </AuthProvider>
    );
  }

  // Show Update Token page if requested
  if (showUpdateToken) {
    return (
      <AuthProvider>
        <div className="min-h-screen bg-dark-bg">
          <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <h1 className="text-2xl font-bold text-white">✏️ Update Token</h1>
              <AuthButton 
                onNavigateToListToken={handleListTokenClick} 
                onNavigateToFuelToken={handleFuelTokenClick} 
                onNavigateToUpdateToken={handleUpdateTokenClick}
                onNavigateToDashboard={handleUserDashboardClick}
                onNavigateToWatchlist={handleWatchlistClick}
                onNavigateToSettings={handleSettingsClick}
              />
            </div>
          </div>
          <UpdateTokenPage 
            onBack={() => setShowUpdateToken(false)}
            onTokenUpdated={handleTokenUpdated}
            initialToken={selectedToken}
          />
        </div>
      </AuthProvider>
    );
  }

  // Show User Dashboard page if requested (highest priority override)
  if (showUserDashboard) {
    return (
      <AuthProvider>
        <UserDashboard 
          onNavigateToListToken={handleListTokenClick}
          onNavigateToFuelToken={handleFuelTokenClick}
          onNavigateToUpdateToken={handleUpdateTokenClick}
          onNavigateToPremium={handlePremiumClick}
        />
      </AuthProvider>
    );
  }

  // Show Apify Test page if requested
  if (showApifyTest) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">🚀 Apify Integration Test</h1>
            <button
              onClick={() => setShowApifyTest(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-solana-purple/60"
            >
              ← Back to Main App
            </button>
          </div>
        </div>
        <ApifyTestPage />
      </div>
    );
  }

  // Show Premium page if requested
  if (showPremium) {
    return (
      <AuthProvider>
        <PremiumPage
          onBack={() => setShowPremium(false)}
          headerAuth={
            <AuthButton 
              onNavigateToListToken={handleListTokenClick} 
              onNavigateToFuelToken={handleFuelTokenClick} 
              onNavigateToUpdateToken={handleUpdateTokenClick}
              onNavigateToDashboard={handleUserDashboardClick}
              onNavigateToWatchlist={handleWatchlistClick}
              onNavigateToSettings={handleSettingsClick}
            />
          }
        />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-dark-bg">
        <Header
          onSearch={handleSearch}
          onFilter={handleFilter}
          onRefresh={handleRefresh}
          onSettingsClick={handleSettingsClick}
          onWatchlistClick={handleWatchlistClick}
          onApifyTestClick={handleApifyTestClick}

          authButton={<AuthButton 
            onNavigateToListToken={handleListTokenClick} 
            onNavigateToFuelToken={handleFuelTokenClick} 
            onNavigateToUpdateToken={handleUpdateTokenClick}
            onNavigateToDashboard={handleUserDashboardClick}
            onNavigateToWatchlist={handleWatchlistClick}
            onNavigateToSettings={handleSettingsClick}
            onNavigateToPremium={handlePremiumClick}
          />}
          isLoading={isLoading}
        />
        
        {/* Success/Error Notifications */}
        {(successMessage || error) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            {successMessage && (
              <div className="bg-green-600 border border-green-500 text-white px-4 py-3 rounded-md mb-2 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">🎉</span>
                  <span className="font-medium">{successMessage}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRefresh}
                    className="bg-green-700 hover:bg-green-800 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    🔄 Refresh Now
                  </button>
                  <button 
                    onClick={() => setSuccessMessage(null)}
                    className="text-green-200 hover:text-white text-lg font-bold"
                    title="Dismiss notification"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-600 border border-red-500 text-white px-4 py-3 rounded-md mb-2 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">❌</span>
                  <span className="font-medium">{error}</span>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="text-red-200 hover:text-white text-lg font-bold"
                  title="Dismiss notification"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      

      
      <main className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-solana-purple mx-auto mb-4"></div>
              <div className="text-gray-400">Loading token data...</div>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="bg-dark-card border-b border-gray-700 px-2 sm:px-4 lg:px-6 py-3 sm:py-4 mobile-stats-section">
              <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 space-y-3 lg:space-y-0">
                  {/* Stats Display - Desktop Only */}
                  <div className="hidden lg:flex items-center space-x-6 text-sm">
                    <div className="text-gray-400">
                      Total: <span className="font-semibold text-white">{tokens.length}</span>
                    </div>
                    <div className="text-gray-400">
                      Avg Score: <span className="font-semibold text-white">
                        {filteredTokens.length > 0 
                          ? (filteredTokens.reduce((sum, token) => sum + (token.score || token.overallScore || 0), 0) / filteredTokens.length).toFixed(2)
                          : '0.00'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Last Updated and Refresh - Responsive */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    {successMessage && (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                        <button
                          onClick={handleRefresh}
                          className="text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1 rounded-md transition-colors font-medium"
                          title="Refresh to see new tokens"
                        >
                          🔄 Refresh for New Tokens
                        </button>
                        <span className="text-xs text-green-400">
                          New token added!
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Category Filters and Controls - Responsive */}
                <div className="mobile-filters-controls-section">
                  {/* Desktop Layout */}
                  <div className="hidden md:flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0">
                    {/* Category Filters */}
                    <div className="flex-1">
                      <CategoryFilters 
                        onFiltersChange={handleCategoryFiltersChange} 
                        currentFilters={categoryFilters} 
                      />
                    </div>
                    
                    {/* View Toggle and Temperature Legend */}
                    <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                    {/* View Toggle */}
                    <ViewToggle 
                      currentView={currentView}
                      onViewChange={setCurrentView}
                      tokenCount={filteredTokens.length}
                    />
                    
                    {/* Temperature Legend with stats above */}
                    <div className="flex flex-col items-center space-y-1">
                      {/* Filtered tokens and Last updated above temp bar */}
                      <div className="flex items-center space-x-4 text-xs text-gray-400">
                        <div>
                          <span className="font-semibold text-white">{filteredTokens.length}</span> filtered tokens
                        </div>
                        <div>
                          Last updated: <span className="font-semibold text-white">
                            {tokens.length > 0 
                              ? new Date(Math.max(...tokens.map(token => 
                                  token.lastUpdated ? new Date(token.lastUpdated).getTime() : 0
                                ))).toLocaleTimeString()
                              : 'Loading...'
                            }
                          </span>
                        </div>
                      </div>
                      {/* Temperature Legend */}
                      <TemperatureLegend />
                    </div>
                    </div>
                  </div>
                  
                  {/* Mobile Layout - Horizontal */}
                  <div className="md:hidden flex items-stretch gap-2">
                    {/* Category Filters - Takes most space */}
                    <div className="flex-1">
                      <CategoryFilters 
                        onFiltersChange={handleCategoryFiltersChange} 
                        currentFilters={categoryFilters} 
                      />
                    </div>
                    
                    {/* View Toggle - Compact */}
                    <div className="flex-shrink-0">
                      <ViewToggle 
                        currentView={currentView}
                        onViewChange={setCurrentView}
                        tokenCount={filteredTokens.length}
                      />
                    </div>
                  </div>
                  
                  {/* Temperature Legend - Below on mobile */}
                  <div className="md:hidden mt-2">
                    <TemperatureLegend />
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className={`h-screen sm:h-[calc(100vh-200px)] lg:h-screen xl:h-[calc(100vh-150px)] 2xl:h-[calc(100vh-100px)] ${
              filteredTokens.length > 50 ? 'overflow-auto' : 'overflow-hidden'
            }`}>
              {filteredTokens.length > 0 ? (
                currentView === 'bubbles' ? (
                  <BubbleMap
                    tokens={filteredTokens}
                    fueledTokens={fueledTokens}
                    onTokenSelect={handleTokenSelect}
                  />
                ) : (
                  <TokenRankedList
                    tokens={filteredTokens}
                    fueledTokens={fueledTokens}
                    onTokenSelect={handleTokenSelect}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-gray-400 text-xl mb-2">No tokens found</div>
                    <div className="text-gray-500">Try adjusting your search or filters</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Token Details Modal */}
      {selectedToken && (
        <TokenDetails
          token={selectedToken}
          fueledTokens={fueledTokens}
          onClose={() => setSelectedToken(null)}
          onTokenUpdated={handleTokenUpdated}
        />
      )}

      {/* Settings Modal */}
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      {/* Watchlist Panel */}
      <WatchlistPanel
        isOpen={showWatchlist}
        onClose={() => setShowWatchlist(false)}
        onTokenSelect={(token) => setSelectedToken(token)}
        allTokensData={tokens}
      />
    </div>
    </AuthProvider>
  );
}

export default App;
