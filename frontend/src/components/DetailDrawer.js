import React, { useState, useEffect } from 'react';
import { X, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import chartService from '../services/chartService';

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
  if (!call || !call.calledMc) {
    return { x: 0, pnl: 0, athX: 0, timeToAth: "—", ddPct: 0 };
  }
  
  const calledMc = call.calledMc || 0;
  const currentMC = call.currentMC || calledMc;
  const athMC = call.athMC || currentMC;
  
  const x = calledMc > 0 ? currentMC / calledMc : 0;
  const pnl = calledMc > 0 ? ((currentMC - calledMc) / calledMc) * 100 : 0;
  const athX = calledMc > 0 ? athMC / calledMc : 0;
  
  // Calculate time to ATH
  let timeToAth = "—";
  if (call.athTimestamp && call.calledAt) {
    try {
      const athTime = new Date(call.athTimestamp).getTime();
      const callTime = new Date(call.calledAt).getTime();
      const diffMs = athTime - callTime;
      if (diffMs > 0) {
        timeToAth = humanizeMs(diffMs);
      }
    } catch (e) {
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
function Stat({ label, value, hint, good }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/5 border border-white/10">
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
export default function DetailDrawer({ call, onClose }) {
  const [chartData, setChartData] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  
  // Load chart data when call changes
  useEffect(() => {
    const contract = call?.token?.contractAddress || call?.contractAddress;
    const calledAt = call?.calledAt || call?.calledTs;
    if (call && contract && calledAt) {
      setLoadingChart(true);
      chartService.getMcapChart(contract, calledAt)
        .then(response => {
          if (response.success) {
            setChartData(response.data);
          }
        })
        .catch(error => {
          console.error('Failed to load chart data:', error);
        })
        .finally(() => {
          setLoadingChart(false);
        });
    }
  }, [call]);
  
  if (!call) return null;
  
  const { x, pnl, athX, timeToAth, ddPct } = derive(call);
  
  // Build chart data for detail view
  let series, callIndex, athIndex;
  
  if (chartData && chartData.snapshots && chartData.snapshots.length > 0) {
    // Use real chart data
    series = chartData.snapshots.map(s => s.mcap);
    callIndex = chartData.callIndex;
    athIndex = chartData.athIndex;
  } else {
    // Fallback to mock data
    const mockSparkData = call.calledMc && call.currentMC ? 
      [call.calledMc, call.calledMc * 1.1, call.calledMc * 0.9, call.currentMC] : 
      [100, 120, 90, 150];
    series = mockSparkData;
    callIndex = 0;
    athIndex = series.indexOf(Math.max(...series));
  }
  
  const min = Math.min(...series);
  const max = Math.max(...series);
  const w = 640;
  const h = 220;
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const norm = series.map((v) => (v - min) / (max - min || 1));
  const path = norm.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - v * (h - 2) - 1}`).join(" ");

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full md:w-[720px] bg-dark-card border-l border-gray-700 overflow-y-auto">
        {/* Header */}
        <div className="p-5 md:p-6 sticky top-0 bg-dark-card/90 backdrop-blur border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-xs font-bold">
              {(call.token?.symbol || call.token || "?").slice(0, 3)}
            </div>
            <div>
              <div className="text-lg font-semibold text-white">
                {call.token?.symbol || call.token || "Unknown"} 
                <span className="text-white/50"> · {call.token?.name || "Unknown Token"}</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <ChainPill chain="sol" />
                <span>Called {formatDate(new Date(call.calledAt || call.createdAt).getTime())}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm text-white"
              onClick={() => window.alert("Share card coming soon")}
            >
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
            />
            <Stat label="PnL" value={formatPct(pnl)} good={pnl >= 0} />
            <Stat label="X Multiple" value={`${x.toFixed(2)}×`} good={x >= 1} />
            <Stat label="Max Drawdown" value={formatPct(ddPct)} good={false} />
            <Stat label="Liquidity" value={formatUSD(0)} hint="Coming soon" />
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
                <path d={`${path} L ${w},${h} L 0,${h} Z`} fill="url(#grad)" opacity={0.35} />
                {/* line */}
                <path d={path} fill="none" stroke="rgb(52,211,153)" strokeWidth={2} />
                {/* call marker */}
                {callIndex >= 0 && (
                  <g>
                    <line x1={callIndex * step} x2={callIndex * step} y1={0} y2={h} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" />
                    <text x={callIndex * step + 5} y={15} className="text-xs fill-white/60">Call</text>
                  </g>
                )}
                {/* ATH marker */}
                {athIndex >= 0 && athIndex !== callIndex && (
                  <g>
                    <line x1={athIndex * step} x2={athIndex * step} y1={0} y2={h} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" />
                    <circle cx={athIndex * step} cy={h - norm[athIndex] * (h - 2) - 1} r={4} fill="rgb(52,211,153)" />
                    <text x={athIndex * step + 5} y={30} className="text-xs fill-white/60">ATH</text>
                  </g>
                )}
              </svg>
            )}
            
            <div className="mt-2 text-xs text-white/60">
              {chartData && chartData.snapshots && chartData.snapshots.length > 0 ? 
                `Showing ${chartData.snapshots.length} data points from ${new Date(call.calledAt).toLocaleDateString()}` :
                "Call (dashed line at left). ATH marker shows peak since call."
              }
            </div>
          </div>

          {/* Social & On-chain Context */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm font-medium mb-2 text-white">On-chain context</div>
              <ul className="text-sm list-disc pl-5 space-y-1 text-white/80">
                <li>LP: Coming soon (trend analysis)</li>
                <li>Holder growth: Analysis pending</li>
                <li>Whale netflow: Data integration in progress</li>
                <li>Contract: Security analysis pending</li>
              </ul>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm font-medium mb-2 text-white">Social context</div>
              <ul className="text-sm list-disc pl-5 space-y-1 text-white/80">
                <li>Mentions: Social tracking coming soon</li>
                <li>Top amplifiers: KOL analysis pending</li>
                <li>Sentiment tilt: Sentiment analysis in dev</li>
                <li>Influence coefficient: Impact tracking coming</li>
              </ul>
            </div>
          </div>

          {/* Thesis & Proof */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-sm font-medium mb-2 text-white">Thesis & receipts</div>
            <div className="text-sm text-white/80">
              {call.note || "No thesis provided for this call."}
            </div>
            {call.proof && (
              <a 
                href={call.proof} 
                target="_blank" 
                rel="noreferrer" 
                className="text-xs text-emerald-300 underline mt-2 inline-flex items-center gap-1"
              >
                View proof on X <ExternalLink size={12} />
              </a>
            )}
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
