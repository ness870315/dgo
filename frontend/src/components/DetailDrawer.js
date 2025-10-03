import React, { useState, useEffect } from 'react';
import { X, ExternalLink, TrendingUp, TrendingDown, Twitter, Info } from 'lucide-react';
import chartService from '../services/chartService';
import priorityService from '../services/priorityService';

// Helper functions
function formatUSD(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(2) + "K";
  return "$" + n.toFixed(2);
}

function formatPct(p) {
  if (p === undefined || p === null || Number.isNaN(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return sign + p.toFixed(2) + "%";
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

// Compute X multiple and PnL
function derive(call) {
  if (!call) {
    return { x: 0, pnl: 0, athX: 0, timeToAth: "—", ddPct: 0 };
  }
  
  const calledMc = call.calledMc || call.calledMC || 0;
  const currentMC = call.currentMC || calledMc || 0;
  const athMC = call.athMC || currentMC || calledMc || 0;
  
  // Debug logging removed for production
  
  const x = calledMc > 0 ? currentMC / calledMc : 0;
  const pnl = calledMc > 0 ? ((currentMC - calledMc) / calledMc) * 100 : 0;
  const athX = calledMc > 0 ? athMC / calledMc : 0;
  
  // Calculate time to ATH
  let timeToAth = "—";
  if (call.athTimestamp && (call.calledAt || call.calledTs)) {
    try {
      const athTime = new Date(call.athTimestamp).getTime();
      const callTime = new Date(call.calledAt || call.calledTs).getTime();
      const diffMs = athTime - callTime;
      if (diffMs > 0) {
        timeToAth = humanizeMs(diffMs);
      }
    } catch (e) {
      console.error('Time to ATH calculation error:', e);
      timeToAth = "—";
    }
  }
  
  // Use stored max drawdown percentage
  const ddPct = call.maxDrawdownPct || 0;
  
  return { x, pnl, athX, timeToAth, ddPct };
}

function humanizeMs(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Chain pill component
function ChainPill({ chain = "sol" }) {
  const colors = {
    sol: "bg-emerald-600/15 text-emerald-300",
    eth: "bg-indigo-600/15 text-indigo-300",
    bsc: "bg-yellow-600/15 text-yellow-300",
    base: "bg-blue-600/15 text-blue-300",
  };
  const labels = {
    sol: "Solana",
    eth: "Ethereum", 
    bsc: "BSC",
    base: "Base",
  };
  return (
    <span className={classNames("px-2 py-0.5 rounded-full text-xs font-medium", colors[chain] || colors.sol)}>
      {labels[chain] || labels.sol}
    </span>
  );
}

// Stat component
function Stat({ label, value, hint, good, tooltip }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative flex flex-col gap-1 p-3 rounded-2xl bg-white/5 border border-white/10"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="text-xs text-white/60">{label}</div>
      <div className={classNames(
        "text-lg font-semibold", 
        good === true ? "text-emerald-300" : 
        good === false ? "text-rose-300" : 
        "text-white"
      )}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-white/50">{hint}</div>}
      {tooltip && hover && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 px-2 py-1 rounded bg-black/85 border border-white/10 shadow-lg max-w-[220px]">
          <div className="text-[11px] leading-snug text-gray-200">
            <span className="font-semibold text-white">{label}:</span>
            <span className="text-gray-300 ml-1">{tooltip}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple sparkline using SVG
function Sparkline({ data = [], width = 120, height = 32, color = "rgb(52,211,153)" }) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className="text-gray-500">
        <text x={width/2} y={height/2} textAnchor="middle" className="text-xs fill-current">No data</text>
      </svg>
    );
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const norm = data.map((v) => (v - min) / (max - min || 1));
  const step = width / (data.length - 1);
  const d = norm
    .map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${height - v * (height - 2) - 1}`)
    .join(" ");
    
  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

// Main DetailDrawer component
export default function DetailDrawer({ call, onClose, onRefresh }) {
  const [chartData, setChartData] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [jupToken, setJupToken] = useState(null);
  const [loadingJup, setLoadingJup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [milestonePostsPage, setMilestonePostsPage] = useState(1);
  const MILESTONE_POSTS_PER_PAGE = 3; // Show 3 milestone posts per page
  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  
  // Generate share tweet variations
  const generateShareTweet = () => {
    const { x, athX, timeToAth } = derive(call);
    const symbol = call?.symbol || call?.token?.symbol || 'TOKEN';
    const calledMC = formatUSD(call?.calledMc || call?.calledMC || 0);
    const currentMC = formatUSD(call?.currentMC || 0);
    
    const variations = [
      `Called $${symbol} at ${calledMC} MC — now ${currentMC} (${x.toFixed(2)}×). ATH since call: ${athX.toFixed(2)}× in ${timeToAth}. The community knew what was up! This is just the beginning of the run. Track my calls on @dgnoracle : https://degen-oracle.com`,
      
      `$${symbol} call update: Started at ${calledMC}, sitting at ${currentMC} (${x.toFixed(2)}×). Peaked at ${athX.toFixed(2)}× in ${timeToAth}. Still early! Follow my plays on @dgnoracle : https://degen-oracle.com`,
      
      `Another banger! $${symbol} from ${calledMC} to ${currentMC} — that's ${x.toFixed(2)}× and counting. Hit ${athX.toFixed(2)}× ATH in just ${timeToAth}. Not financial advice but I'm calling bangers daily on @dgnoracle : https://degen-oracle.com`,
      
      `$${symbol} update: ${x.toFixed(2)}× since my call at ${calledMC} MC. Currently ${currentMC}. ATH was ${athX.toFixed(2)}× in ${timeToAth}. The degen thesis was solid! More alpha on @dgnoracle : https://degen-oracle.com`,
      
      `GM! $${symbol} doing numbers. Called at ${calledMC}, now ${currentMC} (${x.toFixed(2)}×). Hit ${athX.toFixed(2)}× peak in ${timeToAth}. This one's got legs! Check my track record: @dgnoracle https://degen-oracle.com`
    ];
    
    // Pick a random variation
    return variations[Math.floor(Math.random() * variations.length)];
  };
  
  // Handle share to Twitter
  const handleShareToTwitter = () => {
    const tweetText = generateShareTweet();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };
  
  // Refresh call data to get latest milestone posts
  const refreshCallData = async () => {
    if (!onRefresh) return;
    
    setRefreshing(true);
    try {
      await onRefresh();
      // Call data refreshed successfully
    } catch (error) {
      // Failed to refresh call data silently
    } finally {
      setRefreshing(false);
    }
  };

  // Reset pagination when call changes
  useEffect(() => {
    setMilestonePostsPage(1);
  }, [call?.id]);

  // Pagination logic for milestone posts
  const milestonePosts = call?.milestonePosts || [];
  const totalMilestonePages = Math.ceil(milestonePosts.length / MILESTONE_POSTS_PER_PAGE);
  const startIndex = (milestonePostsPage - 1) * MILESTONE_POSTS_PER_PAGE;
  const endIndex = startIndex + MILESTONE_POSTS_PER_PAGE;
  const currentMilestonePosts = milestonePosts.slice(startIndex, endIndex);
  
  // Load chart data when call changes
  useEffect(() => {
    const contract = call?.token?.contractAddress || call?.contractAddress;
    const calledAt = call?.calledAt || call?.calledTs;
    
    if (call && contract && calledAt) {
      // Boost priority for this token when DetailDrawer is opened
      const tokenSymbol = call?.token?.symbol || call?.token?.name || 'Unknown';
      priorityService.boostTokenOnView(contract, tokenSymbol);
      
      setLoadingChart(true);
      chartService.getMcapChart(contract, calledAt)
        .then(response => {
          if (response.success && response.data && response.data.snapshots && response.data.snapshots.length > 0) {
            setChartData(response.data);
          } else {
            setChartData(null);
          }
        })
        .catch(error => {
          // Fallback to mock data silently
          setChartData(null);
        })
        .finally(() => {
          setLoadingChart(false);
        });
    } else {
      setChartData(null);
    }
  }, [call]);
  
  // Fetch Jupiter token details for header (symbol, name, icon)
  useEffect(() => {
    const contract = call?.token?.contractAddress || call?.contractAddress;
    if (!contract) return;
    setLoadingJup(true);
    fetch(`${API_BASE}/api/jupiter/raw/${encodeURIComponent(contract)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(data => {
        const raw = data?.raw || data?.token || data;
        setJupToken(raw || null);
      })
      .catch(() => setJupToken(null))
      .finally(() => setLoadingJup(false));
  }, [call, API_BASE]);

  
  if (!call) return null;
  
  const { x, pnl, athX, timeToAth, ddPct } = derive(call);
  
  // Build chart data for detail view
  let series, callIndex, athIndex;
  
  if (chartData && chartData.snapshots && chartData.snapshots.length > 0) {
    // Use real chart data
    series = chartData.snapshots.map(s => s.mcap);
    callIndex = chartData.callIndex;
    athIndex = chartData.athIndex;
    // Using real historical data from backend
  } else {
    // Fallback to mock data - create a more realistic progression
    const calledMc = call.calledMc || call.calledMC || 1000000;
    const currentMC = call.currentMC || calledMc;
    const athMC = call.athMC || Math.max(calledMc, currentMC);
    
    // Generate a realistic price progression over time
    const numPoints = 20;
    const mockSeries = [];
    
    for (let i = 0; i < numPoints; i++) {
      const progress = i / (numPoints - 1);
      
      if (i === 0) {
        // Start at called MC
        mockSeries.push(calledMc);
      } else if (i === numPoints - 1) {
        // End at current MC
        mockSeries.push(currentMC);
      } else {
        // Create some volatility between called and current
        const baseValue = calledMc + (currentMC - calledMc) * progress;
        const volatility = Math.sin(progress * Math.PI * 3) * calledMc * 0.2;
        const athBoost = progress > 0.3 && progress < 0.7 ? athMC - baseValue : 0;
        mockSeries.push(Math.max(baseValue + volatility + athBoost * 0.5, calledMc * 0.5));
      }
    }
    
    // Ensure ATH is represented in the series
    if (athMC > Math.max(...mockSeries)) {
      const athPosition = Math.floor(numPoints * 0.6); // Place ATH around 60% through
      mockSeries[athPosition] = athMC;
    }
    
    series = mockSeries;
    callIndex = 0;
    athIndex = series.indexOf(Math.max(...series));
    
    // Using simulated data - real historical data not available yet
  }
  
  const min = Math.min(...series);
  const max = Math.max(...series);
  const w = 640;
  const h = 220;
  // Add padding to prevent clipping of markers
  const padding = { top: 15, right: 50, bottom: 5, left: 5 };
  const chartWidth = w - padding.left - padding.right;
  const chartHeight = h - padding.top - padding.bottom;
  const step = series.length > 1 ? chartWidth / (series.length - 1) : chartWidth;
  const norm = series.map((v) => (v - min) / (max - min || 1));
  const path = norm.map((v, i) => 
    `${i === 0 ? "M" : "L"}${padding.left + i * step},${padding.top + chartHeight - v * (chartHeight - 2) - 1}`
  ).join(" ");
  
  // Chart generated successfully

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full md:w-[720px] bg-dark-card border-l border-gray-700 overflow-y-auto">
        {/* Header */}
        <div className="p-5 md:p-6 sticky top-0 bg-dark-card/90 backdrop-blur border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9">
              {jupToken?.icon && (
                <img 
                  src={jupToken.icon} 
                  alt="icon" 
                  className="h-9 w-9 rounded-xl object-cover border border-white/10"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              )}
              {!jupToken?.icon && (
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-xs font-bold">
                  {(jupToken?.symbol || call.token?.symbol || call.token || "?").slice(0, 3)}
                </div>
              )}
            </div>
            <div>
              <div className="text-lg font-semibold text-white">
                {jupToken?.symbol || call.token?.symbol || call.token || "Unknown"} 
                <span className="text-white/50"> · {jupToken?.name || call.token?.name || "Unknown Token"}</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <ChainPill chain="sol" />
                <span>Called {(() => { const raw = call?.calledAt || call?.calledTs || call?.createdAt; const t = (typeof raw === 'number') ? raw : Date.parse(raw || ''); return Number.isFinite(t) ? formatDate(t) : '—'; })()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-105"
              onClick={handleShareToTwitter}
            >
              <Twitter size={16} />
              Share card
            </button>
            <button 
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm text-white"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 md:p-6 flex flex-col gap-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Called MC" value={formatUSD((call.calledMc ?? call.calledMC ?? 0))} />
            <Stat label="Current MC" value={formatUSD(call.currentMC || 0)} />
            <Stat 
              label="ATH since call" 
              value={`${athX.toFixed(2)}×`} 
              hint={`${formatUSD(call.athMC || call.currentMC || 0)} · ${timeToAth}`} 
              good={true}
              tooltip={"The best multiple it hit at any time since you called it, even if it later dropped."}
            />
            <Stat 
              label="PnL" 
              value={formatPct(pnl)} 
              good={pnl >= 0}
              tooltip={"Unrealized % return since your call, based on market cap at call vs current market cap."}
            />
            <Stat 
              label="X Multiple" 
              value={`${x.toFixed(2)}×`} 
              good={x >= 1}
              tooltip={"How many × you are up right now."}
            />
            <Stat 
              label="Max Drawdown" 
              value={formatPct(ddPct)} 
              good={false}
              tooltip={"From the highest market cap reached since my call, how far did it fall at the worst point?"}
            />
            <Stat label="Liquidity" value={formatUSD(call.liquidity ?? jupToken?.liquidity ?? 0)} hint={loadingJup ? 'Loading...' : undefined} />
            <Stat label="Holders" value={(call.holderCount || 0).toLocaleString()} />
          </div>

          {/* Chart */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-sm font-medium mb-3 text-white flex items-center justify-between">
              <span>Market Cap since call</span>
              {loadingChart && <span className="text-xs text-gray-400">Loading chart data...</span>}
            </div>
            
            {loadingChart ? (
              <div className="flex items-center justify-center" style={{height: h}}>
                <div className="text-gray-400 text-sm">Loading chart...</div>
              </div>
            ) : (
              <svg width={w} height={h} className="max-w-full">
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(52,211,153)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* area fill */}
                <path d={`${path} L ${padding.left + chartWidth},${h} L ${padding.left},${h} Z`} fill="url(#grad)" opacity={0.35} />
                {/* line */}
                <path d={path} fill="none" stroke="rgb(52,211,153)" strokeWidth={2} />
                {/* call marker */}
                {callIndex >= 0 && (
                  <g>
                    <line x1={padding.left + callIndex * step} x2={padding.left + callIndex * step} y1={padding.top} y2={h} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" />
                    <text x={padding.left + callIndex * step + 5} y={padding.top + 5} className="text-xs fill-white/60">Call</text>
                  </g>
                )}
                {/* ATH marker */}
                {athIndex >= 0 && (
                  <g>
                    <circle cx={padding.left + athIndex * step} cy={padding.top + chartHeight - norm[athIndex] * (chartHeight - 2) - 1} r={4} fill="rgb(52,211,153)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                    <text x={padding.left + athIndex * step + 5} y={padding.top + 15} className="text-xs fill-white/60">ATH</text>
                  </g>
                )}
              </svg>
            )}
            
            <div className="mt-3 text-xs text-white/60 space-y-1">
              {chartData && chartData.snapshots && chartData.snapshots.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">📊 Real Data:</span>
                  <span>Showing {chartData.snapshots.length} hourly snapshots from {new Date(call.calledAt || call.calledTs).toLocaleDateString()}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-orange-400">🎯 Simulated:</span>
                  <span>Chart shows estimated progression (real historical data not yet available)</span>
                </div>
              )}
              <div className="mt-2">
                <div className="font-medium text-white/70 mb-1">How to read this chart:</div>
                <ul className="space-y-0.5 text-[11px] leading-relaxed">
                  <li>• <span className="text-white/80">Dashed vertical line</span> = the exact time you made the call.</li>
                  <li>• <span className="text-emerald-300">Green line & area</span> = market cap movement since the call (scaled to fit the panel).</li>
                  <li>• <span className="text-emerald-300">Green dot</span> = ATH since your call; the "ATH since call" tile shows the multiple and time to peak.</li>
                  <li>• <span className="text-white/80">Y‑axis is normalized</span> (no ticks); use the tiles above for exact Called MC, Current MC, and ATH values.</li>
                </ul>
              </div>
            </div>
          </div>


          {/* Proof-of-Call & Receipts */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-sm font-medium mb-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🐦</span>
                Proof-of-Call & Receipts
                <div className="group relative">
                  <Info size={16} className="text-gray-400 hover:text-white cursor-help" />
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300 shadow-lg z-50">
                    Auto tweets on first calls and milestones are performed as "Proof-of-Call" and "Receipts" to provide transparent, on-chain verified tracking of all predictions.
                  </div>
                </div>
              </div>
              <button
                onClick={refreshCallData}
                disabled={refreshing}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 rounded text-white transition-colors"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            {/* Proof-of-Call */}
            {call.twitterPostId ? (
              <div className="mb-4">
                <div className="text-xs font-medium text-white/70 mb-2">Proof-of-Call</div>
                <div className="p-3 bg-gray-800/50 border border-gray-600/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Twitter size={14} className="text-blue-400" />
                    <span className="text-xs text-blue-400">Posted to Twitter</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">{new Date(call.calledAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    🚀 CALL: ${call.token.symbol} at ${(call.calledMC / 1000000).toFixed(1)}M MC
                    <br />
                    {call.thesis || call.note || "Based on our analytics engine signals."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <div className="text-xs font-medium text-white/70 mb-2">Call Details</div>
                <div className="p-3 bg-gray-800/50 border border-gray-600/50 rounded-lg">
                  <p className="text-sm text-white/90 leading-relaxed">
                    🚀 CALL: ${call.token.symbol} at ${(call.calledMC / 1000000).toFixed(1)}M MC
                    <br />
                    {call.thesis || call.note || "Based on our analytics engine signals."}
                  </p>
                </div>
              </div>
            )}

            {/* Receipts */}
            <div className="space-y-3">
              <div className="text-xs font-medium text-white/70">Receipts</div>
              
              {/* Initial Call Post */}
              {call.twitterPostId && (
                <div className="p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-300">Initial Call</span>
                    <span className="text-xs text-white/50">
                      {call.calledAt ? new Date(call.calledAt).toLocaleString() : 'Unknown time'}
                    </span>
                  </div>
                  <div className="text-sm text-white/80 mb-2">{call.thesis || 'Call posted to Twitter'}</div>
                  <a 
                    href={`https://twitter.com/i/web/status/${call.twitterPostId}`}
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs text-blue-300 underline inline-flex items-center gap-1"
                  >
                    View on X <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {/* Milestone Posts */}
              {call.milestonePosts && call.milestonePosts.length > 0 ? (
                <div className="space-y-2">
                  {currentMilestonePosts.map((post, index) => (
                    <div key={index} className="p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-green-300">
                          {post.milestone}× Milestone
                        </span>
                        <span className="text-xs text-white/50">
                          {post.postedAt ? new Date(post.postedAt).toLocaleString() : 'Unknown time'}
                        </span>
                      </div>
                      <div className="text-sm text-white/80 mb-2">{post.postText}</div>
                      <a 
                        href={`https://twitter.com/i/web/status/${post.tweetId}`}
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-xs text-green-300 underline inline-flex items-center gap-1"
                      >
                        View on X <ExternalLink size={12} />
                      </a>
                    </div>
                  ))}
                  
                  {/* Pagination Controls */}
                  {totalMilestonePages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                      <div className="text-xs text-white/60">
                        Showing {startIndex + 1}-{Math.min(endIndex, milestonePosts.length)} of {milestonePosts.length} milestone posts
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setMilestonePostsPage(prev => Math.max(1, prev - 1))}
                          disabled={milestonePostsPage === 1}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white transition-colors"
                        >
                          Previous
                        </button>
                        <span className="text-xs text-white/60">
                          {milestonePostsPage} / {totalMilestonePages}
                        </span>
                        <button
                          onClick={() => setMilestonePostsPage(prev => Math.min(totalMilestonePages, prev + 1))}
                          disabled={milestonePostsPage === totalMilestonePages}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg">
                  <div className="text-sm text-white/60 italic">
                    No milestone posts yet
                  </div>
                </div>
              )}

              {/* No Twitter Posts */}
              {!call.twitterPostId && (!call.milestonePosts || call.milestonePosts.length === 0) && (
                <div className="p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg">
                  <div className="text-sm text-white/60 italic">
                    No Twitter posts for this call
                  </div>
                </div>
              )}
            </div>

            {/* Call Status - Hidden per user request */}
            {/* <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  call.status === 'active' ? 'bg-green-900/30 text-green-300' :
                  call.status === 'closed' ? 'bg-gray-900/30 text-gray-300' :
                  'bg-yellow-900/30 text-yellow-300'
                }`}>
                  {call.status || 'active'}
                </span>
              </div>
              {call.twitterEnabled && (
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-white/60">Twitter Posting:</span>
                  <span className="text-green-300">Enabled</span>
                </div>
              )}
            </div> */}
          </div>

          {/* Performance Summary */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30">
            <div className="text-sm font-medium mb-2 text-white flex items-center gap-2">
              {pnl >= 0 ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
              Call Performance Summary
            </div>
            <div className="text-sm text-white/80">
              {pnl >= 0 ? (
                <>This call is currently <span className="text-emerald-400 font-semibold">profitable</span> with a {formatPct(pnl)} return and {x.toFixed(2)}× multiple.</>
              ) : (
                <>This call is currently <span className="text-rose-400 font-semibold">underwater</span> with a {formatPct(pnl)} loss, trading at {x.toFixed(2)}× the called price.</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
