import React, { useState, useEffect, useMemo } from "react";
import { X, Users, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";

// --- Utilities ---
const fmt = new Intl.NumberFormat();
const pct = (v) => `${v.toFixed(2)}%`;
const classNames = (...xs) => xs.filter(Boolean).join(" ");

// --- Donut Chart (pure SVG) ---
function Donut({ data, size = 160, stroke = 20, colors }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const entries = Object.entries(data);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        {entries.map(([key, value], i) => {
          const frac = value / total;
          const dash = frac * circumference;
          const circle = (
            <circle
              key={key}
              r={radius}
              cx={0}
              cy={0}
              fill="transparent"
              stroke={colors[i % colors.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return circle;
        })}
        {/* inner hole */}
        <circle r={radius - stroke/2} fill="#0b0f17" />
        <text x="0" y="-6" textAnchor="middle" className="fill-slate-100 text-xl font-semibold">
          {fmt.format(total)}
        </text>
        <text x="0" y="14" textAnchor="middle" className="fill-slate-400 text-xs">holders</text>
      </g>
    </svg>
  );
}

// --- Pie Chart for Holder Segments ---
function HolderSegmentPie({ data, size = 200, colors }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  
  const radius = size / 2 - 10;
  let currentAngle = 0;
  const entries = Object.entries(data).filter(([_, value]) => value > 0);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        {entries.map(([key, value], i) => {
          const percentage = (value / total) * 100;
          const angle = (value / total) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          
          const x1 = Math.cos((startAngle - 90) * Math.PI / 180) * radius;
          const y1 = Math.sin((startAngle - 90) * Math.PI / 180) * radius;
          const x2 = Math.cos((endAngle - 90) * Math.PI / 180) * radius;
          const y2 = Math.sin((endAngle - 90) * Math.PI / 180) * radius;
          
          const largeArcFlag = angle > 180 ? 1 : 0;
          const pathData = [
            `M 0 0`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            `Z`
          ].join(' ');
          
          currentAngle += angle;
          
          return (
            <path
              key={key}
              d={pathData}
              fill={colors[i % colors.length]}
              stroke="#0b0f17"
              strokeWidth={1}
            />
          );
        })}
        {/* Center text */}
        <text x="0" y="-8" textAnchor="middle" className="fill-slate-100 text-lg font-semibold">
          {fmt.format(total)}
        </text>
        <text x="0" y="8" textAnchor="middle" className="fill-slate-400 text-sm">holders</text>
      </g>
    </svg>
  );
}

// --- Simple Line/Area chart (pure SVG) ---
function AreaLine({ points, width=520, height=160, strokeWidth=3, showDots=false }) {
  const padding = { l: 28, r: 10, t: 10, b: 24 };
  const W = width - padding.l - padding.r;
  const H = height - padding.t - padding.b;
  
  if (!points?.length || points.length < 2) return null;
  
  const xs = points.map((p,i)=>i);
  const ys = points.map(p=>p);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const y0 = min === max ? 0 : min;
  const yRange = max - y0 || 1; // Prevent division by zero
  const xRange = points.length - 1 || 1; // Prevent division by zero

  const x = (i)=> padding.l + (i / xRange) * W;
  const y = (v)=> padding.t + (1 - (v - y0) / yRange) * H;

  const path = points.map((v,i)=>`${i===0?"M":"L"}${x(i)},${y(v)}`).join(" ");
  const area = `${path} L ${padding.l + W},${padding.t + H} L ${padding.l},${padding.t + H} Z`;

  // grid (verticals at 4 ticks)
  const ticks = 4;
  const grid = new Array(ticks+1).fill(0).map((_,i)=>{
    const xx = padding.l + (i/ticks)*W;
    return <line key={i} x1={xx} x2={xx} y1={padding.t} y2={padding.t+H} className="stroke-slate-700/40" strokeDasharray="4 4" />
  });

  return (
    <svg width={width} height={height}>
      {/* y labels */}
      <text x={4} y={y(max)} className="fill-slate-400 text-[10px]">{fmt.format(max)}</text>
      <text x={4} y={y(min)} className="fill-slate-400 text-[10px]">{fmt.format(min)}</text>
      {/* grid */}
      {grid}
      {/* area */}
      <path d={area} fill="url(#grad)" />
      {/* stroke */}
      <path d={path} fill="none" strokeWidth={strokeWidth} stroke="#ff3ea5" />
      {/* dots */}
      {showDots && points.map((v,i)=> (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} className="fill-pink-400" />
      ))}
      <defs>
        <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff3ea5" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff3ea5" stopOpacity="0.05" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// --- Horizontal Bars (distribution buckets) ---
function HBars({ data, width=520, height=180, barH=18 }) {
  const entries = Object.entries(data);
  const padding = 12;
  const labelW = 90;
  const innerW = width - labelW - padding*2;
  const max = Math.max(...entries.map(([,v])=>v), 1); // Prevent division by zero
  const rows = entries.length;
  const totalH = Math.max(height, rows*(barH+10)+padding*2);

  if (entries.length === 0) return null;

  return (
    <svg width={width} height={totalH}>
      {entries.map(([k,v], i)=>{
        const y = padding + i*(barH+10);
        const w = (v/max) * innerW;
        return (
          <g key={k} transform={`translate(0, ${y})`}>
            <text x={6} y={barH-4} className="fill-slate-300 text-xs capitalize">{k}</text>
            <rect x={labelW} y={0} width={innerW} height={barH} rx={8} className="fill-slate-700/40" />
            <rect x={labelW} y={0} width={w} height={barH} rx={8} className="fill-pink-500/70" />
            <text x={labelW + w + 6} y={barH-4} className="fill-slate-400 text-xs">{fmt.format(v)}</text>
          </g>
        )
      })}
    </svg>
  );
}

// --- Supply Concentration Curve ---
function ConcentrationChart({ points, width=520, height=160 }) {
  // points: [{n:10, p:92.47}, ...]
  const padding = { l: 34, r: 10, t: 10, b: 22 };
  const W = width - padding.l - padding.r;
  const H = height - padding.t - padding.b;
  
  if (!points?.length) return null;
  
  const maxN = Math.max(...points.map(p=>p.n), 1); // Prevent division by zero
  const path = points.map((p,i)=>{
    const x = padding.l + (p.n/maxN) * W;
    const y = padding.t + (1 - p.p/100) * H;
    return `${i?"L":"M"}${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height}>
      <text x={2} y={12} className="fill-slate-400 text-[10px]">% supply held</text>
      <path d={`M${padding.l},${padding.t+H} ${path}`} fill="none" stroke="#ff3ea5" strokeWidth={3}/>
      <path d={`M${padding.l},${padding.t+H} ${path} L ${padding.l+W},${padding.t+H} Z`} fill="url(#grad2)" />
      {/* x ticks */}
      {[10,25,50,100,250,500].map(n=>{
        const x = padding.l + (n/maxN)*W;
        return <text key={n} x={x-6} y={height-6} className="fill-slate-400 text-[10px]">{n}</text>
      })}
      <defs>
        <linearGradient id="grad2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff3ea5" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#ff3ea5" stopOpacity="0.05" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// --- Holder Flow Chart (Segment In vs Out) ---
function HolderFlowChart({ flowData, width=520, height=180 }) {
  const padding = { l: 40, r: 20, t: 20, b: 40 };
  const W = width - padding.l - padding.r;
  const H = height - padding.t - padding.b;
  
  if (!flowData?.holderFlow) return null;
  
  const segments = ['whales', 'sharks', 'dolphins', 'fish', 'octopus', 'crabs', 'shrimps'];
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  
  const maxValue = Math.max(
    ...segments.map(s => Math.max(...flowData.holderFlow.in[s], ...flowData.holderFlow.out[s]))
  );
  
  if (maxValue === 0) return null;
  
  const barWidth = W / segments.length;
  
  return (
    <svg width={width} height={height}>
      <text x={2} y={12} className="fill-slate-400 text-[10px]">Holders In/Out by Segment</text>
      
      {segments.map((segment, i) => {
        const inValue = flowData.holderFlow.in[segment].reduce((a, b) => a + b, 0);
        const outValue = flowData.holderFlow.out[segment].reduce((a, b) => a + b, 0);
        const x = padding.l + i * barWidth;
        const inHeight = (inValue / maxValue) * H * 0.4;
        const outHeight = (outValue / maxValue) * H * 0.4;
        
        return (
          <g key={segment}>
            {/* In bars (positive) */}
            <rect 
              x={x + 2} 
              y={padding.t + H/2 - inHeight} 
              width={barWidth/2 - 4} 
              height={inHeight} 
              fill={colors[i]} 
              opacity={0.7}
            />
            {/* Out bars (negative) */}
            <rect 
              x={x + barWidth/2 + 2} 
              y={padding.t + H/2} 
              width={barWidth/2 - 4} 
              height={outHeight} 
              fill={colors[i]} 
              opacity={0.4}
            />
            {/* Labels */}
            <text 
              x={x + barWidth/2} 
              y={height - 8} 
              textAnchor="middle" 
              className="fill-slate-400 text-[10px]"
            >
              {segment}
            </text>
            {/* Values */}
            <text 
              x={x + 2} 
              y={padding.t + H/2 - inHeight - 4} 
              className="fill-slate-300 text-[9px]"
            >
              {inValue}
            </text>
            <text 
              x={x + barWidth/2 + 2} 
              y={padding.t + H/2 + outHeight + 12} 
              className="fill-slate-300 text-[9px]"
            >
              {outValue}
            </text>
          </g>
        );
      })}
      
      {/* Legend */}
      <g transform={`translate(${padding.l}, ${padding.t + H + 20})`}>
        <rect x={0} y={0} width={8} height={8} fill="#ff3ea5" opacity={0.7} />
        <text x={12} y={6} className="fill-slate-300 text-[10px]">In</text>
        <rect x={40} y={0} width={8} height={8} fill="#ff3ea5" opacity={0.4} />
        <text x={52} y={6} className="fill-slate-300 text-[10px]">Out</text>
      </g>
    </svg>
  );
}

// --- Badge Component ---
function Badge({ children, tone="slate" }) {
  const tones = {
    green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    red: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    amber: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    slate: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  };
  return (
    <span className={classNames("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1", tones[tone])}>{children}</span>
  );
}

// --- Risk assessment helper ---
function concentrationRisk(supplyConcentration) {
  if (!supplyConcentration) return { label: "Unknown concentration", tone: "slate" };
  
  const p10 = supplyConcentration.top10 || 0;
  if (p10 >= 90) return { label: "Extreme concentration", tone: "red" };
  if (p10 >= 70) return { label: "High concentration", tone: "red" };
  if (p10 >= 50) return { label: "Moderate concentration", tone: "amber" };
  return { label: "Well distributed", tone: "green" };
}

// --- Top Holders Table ---
function TopHoldersTable({ holders }) {
  if (!holders || !Array.isArray(holders) || holders.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No holder data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/60">
            <th className="text-left py-2 text-slate-400 font-medium">Rank</th>
            <th className="text-left py-2 text-slate-400 font-medium">Address</th>
            <th className="text-right py-2 text-slate-400 font-medium">Balance</th>
            <th className="text-right py-2 text-slate-400 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {holders.slice(0, 10).map((holder, index) => {
            const address = holder.address || holder.contractAddress || 'Unknown';
            const shortAddress = address && address.length > 14 
              ? `${address.slice(0, 8)}...${address.slice(-6)}`
              : address || 'N/A';
            
            return (
              <tr key={address || index} className="border-b border-slate-800/40">
                <td className="py-2 text-slate-300">#{holder.rank || index + 1}</td>
                <td className="py-2 text-slate-300 font-mono text-xs">
                  {shortAddress}
                </td>
                <td className="py-2 text-right text-slate-300">{holder.balanceFormatted || 'N/A'}</td>
                <td className="py-2 text-right text-slate-300">{holder.percentageFormatted || 'N/A'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Segment Flow Table ---
function SegmentFlowTable({ flowData }) {
  if (!flowData?.holderFlow) {
    return (
      <div className="text-center py-8 text-slate-400">
        No flow data available
      </div>
    );
  }

  const segments = [
    { key: 'whales', emoji: '🐋', name: 'Whales' },
    { key: 'sharks', emoji: '🦈', name: 'Sharks' },
    { key: 'dolphins', emoji: '🐬', name: 'Dolphins' },
    { key: 'fish', emoji: '🐟', name: 'Fish' },
    { key: 'octopus', emoji: '🐙', name: 'Octopus' },
    { key: 'crabs', emoji: '🦀', name: 'Crabs' },
    { key: 'shrimps', emoji: '🦐', name: 'Shrimps' }
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/60">
            <th className="text-left py-2 text-slate-400 font-medium">Segment</th>
            <th className="text-right py-2 text-slate-400 font-medium">In</th>
            <th className="text-right py-2 text-slate-400 font-medium">Out</th>
            <th className="text-right py-2 text-slate-400 font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => {
            const inValue = flowData.holderFlow.in[segment.key]?.reduce((a, b) => a + b, 0) || 0;
            const outValue = flowData.holderFlow.out[segment.key]?.reduce((a, b) => a + b, 0) || 0;
            const net = inValue - outValue;
            
            return (
              <tr key={segment.key} className="border-b border-slate-800/40">
                <td className="py-2 text-slate-300 flex items-center gap-2">
                  <span className="text-lg">{segment.emoji}</span>
                  <span className="capitalize">{segment.name}</span>
                </td>
                <td className="py-2 text-right text-slate-300">{fmt.format(inValue)}</td>
                <td className="py-2 text-right text-slate-300">{fmt.format(outValue)}</td>
                <td className={`py-2 text-right font-medium ${
                  net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-300'
                }`}>
                  {net > 0 ? '+' : ''}{fmt.format(net)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Main Modal Component ---
export default function HoldersInsightsModal({ token, onClose = () => {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch holder insights data
  useEffect(() => {
    if (!token?.contractAddress && !token?.contract) {
      setError('No token contract address available');
      setLoading(false);
      return;
    }

    const fetchHolderInsights = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const contract = token.contractAddress || token.contract;
        const supply = token.supply || token.totalSupply || token.jupiterData?.totalSupply;
        
        console.log('🔍 Fetching holder insights for:', contract);
        
        const API_BASE = process.env.REACT_APP_API_URL || 'https://api.degen-oracle.com';
        const url = `${API_BASE}/api/tokens/${contract}/holders/insights${supply ? `?supply=${supply}` : ''}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success && result.data) {
          console.log('✅ Holder insights loaded:', result.data);
          setData(result.data);
        } else {
          throw new Error(result.error || 'Failed to fetch holder insights');
        }
      } catch (err) {
        console.error('❌ Failed to fetch holder insights:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHolderInsights();
  }, [token]);

  // Process data for charts
  const processedData = useMemo(() => {
    if (!data) return null;

    // Holder changes series for area chart - use historical flow data if available
    let changeSeries = [];
    if (data.holderFlowData?.netChanges) {
      // Use historical timeseries data for smoother chart
      changeSeries = data.holderFlowData.netChanges.slice(0, 7).reverse(); // Last 7 data points
    } else if (data.holderChanges) {
      // Fallback to timeframe data
      changeSeries = ["30d","7d","3d","24h","6h","1h","5min"].map(k => {
        const change = data.holderChanges[k]?.change;
        return (typeof change === 'number' && !isNaN(change)) ? change : 0;
      });
    }

    // Supply concentration points for curve - use data from Moralis
    const supplyPoints = data.holderStats?.supplyConcentration ? [
      { n: 5, p: data.holderStats.supplyConcentration.top5 || 0 },
      { n: 10, p: data.holderStats.supplyConcentration.top10 || 0 },
      { n: 25, p: data.holderStats.supplyConcentration.top25 || 0 },
      { n: 50, p: data.holderStats.supplyConcentration.top50 || 0 },
      { n: 100, p: data.holderStats.supplyConcentration.top100 || 0 }
    ].filter(p => p.p > 0) : [];

    // Acquisition colors
    const acqColors = ["#A78BFA", "#60A5FA", "#34D399"]; // purple, blue, green

    // Holder segment colors for pie chart
    const segmentColors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff"];

    // Risk assessment
    const risk = concentrationRisk(data.holderStats?.supplyConcentration);

    return {
      changeSeries,
      supplyPoints,
      acqColors,
      segmentColors,
      risk
    };
  }, [data]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl rounded-2xl bg-[#0b0f17] ring-1 ring-slate-700/60 shadow-2xl p-8">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
            <span className="text-slate-300">Loading holder insights...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl rounded-2xl bg-[#0b0f17] ring-1 ring-slate-700/60 shadow-2xl p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={20} />
              Holder Insights Error
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="text-slate-300 mb-4">
            Failed to load holder insights: {error}
          </div>
          <button 
            onClick={onClose} 
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!data || !processedData) {
    return null;
  }

  // Generate acquisition legend
  const acqLegend = data.holdersByAcquisition ? 
    Object.entries(data.holdersByAcquisition).map(([k,v],i)=> (
      <div key={k} className="flex items-center gap-2 text-sm text-slate-300">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: processedData.acqColors[i%processedData.acqColors.length]}} />
        <span className="capitalize">{k}</span>
        <span className="text-slate-400">{fmt.format(v)} ({pct(100*v/(data.currentHolders || 1))})</span>
      </div>
    )) : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl rounded-2xl bg-[#0b0f17] ring-1 ring-slate-700/60 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Users size={20} />
              Holder Insights
            </h2>
            <Badge tone={processedData.risk.tone}>{processedData.risk.label}</Badge>
            {data.holderStats?.supplyConcentration && (
              <Badge>Top10 hold {pct(data.holderStats.supplyConcentration.top10)}</Badge>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-12 gap-5 max-h-[80vh] overflow-y-auto">
          {/* KPIs */}
          <div className="col-span-12 grid grid-cols-4 gap-4">
            <div className="rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-400 text-xs">Total holders</div>
              <div className="text-2xl font-semibold text-white">{fmt.format(data.currentHolders || 0)}</div>
            </div>
            <div className="rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-400 text-xs">24h net change</div>
              <div className={classNames(
                "text-2xl font-semibold flex items-center gap-1",
                data.holderChanges?.["24h"]?.change >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {data.holderChanges?.["24h"]?.change >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                {fmt.format(data.holderChanges?.["24h"]?.change || 0)}
              </div>
              <div className="text-slate-400 text-xs">
                {pct(Math.abs((data.holderChanges?.["24h"]?.changePercent || 0) * 100))} of holders
              </div>
            </div>
            <div className="rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-400 text-xs">7d change</div>
              <div className={classNames(
                "text-2xl font-semibold",
                data.holderChanges?.["7d"]?.change >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {fmt.format(data.holderChanges?.["7d"]?.change || 0)}
              </div>
            </div>
            <div className="rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-400 text-xs">30d change</div>
              <div className={classNames(
                "text-2xl font-semibold",
                data.holderChanges?.["30d"]?.change >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {fmt.format(data.holderChanges?.["30d"]?.change || 0)}
              </div>
            </div>
          </div>

          {/* Holder Segments Pie Chart */}
          {data.holderStats?.holderDistribution && (
            <div className="col-span-12 lg:col-span-4 rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-300 font-medium mb-4">Holder Segments Distribution</div>
              <div className="flex items-center justify-center">
                <HolderSegmentPie data={data.holderStats.holderDistribution} colors={processedData.segmentColors} />
              </div>
            </div>
          )}

          {/* Acquisition donut + legend */}
          {data.holdersByAcquisition && (
            <div className="col-span-12 lg:col-span-8 rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-center">
                <Donut data={data.holdersByAcquisition} colors={processedData.acqColors} />
              </div>
              <div className="flex flex-col gap-2 justify-center">{acqLegend}</div>
            </div>
          )}

          {/* Top Holders Table */}
          {data.topHolders?.holders && (
            <div className="col-span-12 lg:col-span-6 rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-300 font-medium mb-4">Top 10 Holders</div>
              <TopHoldersTable holders={data.topHolders.holders} />
            </div>
          )}

          {/* Segment Flow Table */}
          {data.holderFlowData && (
            <div className="col-span-12 lg:col-span-6 rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-300 font-medium mb-4">Segment Flow (In vs Out)</div>
              <SegmentFlowTable flowData={data.holderFlowData} />
            </div>
          )}

          {/* Supply concentration curve */}
          {processedData.supplyPoints.length > 0 && (
            <div className="col-span-12 lg:col-span-6 rounded-xl bg-slate-800/40 ring-1 ring-slate-700/60 p-4">
              <div className="text-slate-300 font-medium mb-2">Supply Concentration Curve</div>
              <ConcentrationChart points={processedData.supplyPoints} width={540} />
              <div className="mt-2 text-xs text-slate-400">
                X: top N holders • Y: % of total supply held
              </div>
            </div>
          )}

        </div>

        <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-700/60 pt-4">
          <div className="text-[11px] text-slate-400">
            💡 Tip: High concentration + declining holders → watch for distribution risk or whale movements
          </div>
          <button 
            onClick={onClose} 
            className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
