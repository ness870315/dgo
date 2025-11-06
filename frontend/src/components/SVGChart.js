import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import chartService from "../services/chartService";

// ------- helpers
const TF_SEC = { '1MIN':60,'5MIN':300,'15MIN':900,'1H':3600,'4H':14400,'1D':86400,'1W':604800,'1M':2592000 };

const WINDOW_BY_TF = {
  '1MIN': 180,   // ~3h
  '5MIN': 144,   // ~12h
  '15MIN': 96,   // ~1 day
  '1H': 240,     // ~10 days
  '4H': 180,     // ~30 days
  '1D': 120,     // ~4 months
  'ALL': Infinity // Show all available data
};

// Normalize OHLC data with proper bucketing and deduplication
function normalizeOHLC(rows, tf) {
  const step = TF_SEC[tf] ?? 60;
  const toSecBucket = (t) => {
    const s = t > 1e12 ? t / 1000 : t;             // ms → s if needed
    return Math.floor(Math.floor(s) / step) * step; // bucket to tf
  };

  const pick = (...xs) => xs.find(v => v != null);
  const toNum = (v) => (v == null ? NaN : Number(v));

  const byBucket = new Map();

  for (const d of rows ?? []) {
    const t = toSecBucket(pick(d.time, d.t, d.timestamp));
    const o = toNum(pick(d.open, d.o, d.value));
    const h = toNum(pick(d.high, d.h, d.value));
    const l = toNum(pick(d.low,  d.l, d.value));
    const c = toNum(pick(d.close,d.c, d.value));
    const v = Number(pick(d.volume, d.v)) || 0;
    if (![t,o,h,l,c].every(Number.isFinite)) continue;

    // keep the last sample per bucket (so backfill pages don't fight)
    const prev = byBucket.get(t);
    if (!prev || (d.time ?? d.t ?? d.timestamp) > (prev._srcTime ?? 0)) {
      byBucket.set(t, { time: t, open:o, high:h, low:l, close:c, volume:v, _srcTime: (d.time ?? d.t ?? d.timestamp) });
    }
  }

  const out = [...byBucket.values()]
    .sort((a,b) => a.time - b.time)
    .map(({_srcTime, ...x}) => x);

  return out;
}

// Window the data to last N bars per timeframe
function sliceWindow(candles, tf) {
  if (!candles || !Array.isArray(candles)) {
    return [];
  }
  const n = WINDOW_BY_TF[tf] ?? 300;
  return candles.slice(-n);
}

// Build SVG scales with correct X by time domain
function makeScales(points, w, h, pad = {l:56,r:24,t:16,b:40}) {
  if (!points || !Array.isArray(points) || points.length === 0) {
    return { x: () => 0, y: () => 0, pad, plotW: 0, plotH: 0, tMin: 0, tMax: 0, yMin: 0, yMax: 0 };
  }
  
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const tMin = points[0].time * 1000;
  const tMax = points.at(-1).time * 1000;
  const pMin = Math.min(...points.map(p => p.close));
  const pMax = Math.max(...points.map(p => p.close));
  const yMin = pMin - (pMax - pMin) * 0.08; // 8% headroom/footroom
  const yMax = pMax + (pMax - pMin) * 0.08;

  const x = (tMs) => pad.l + ((tMs - tMin) / Math.max(1, (tMax - tMin))) * plotW;
  const y = (v) => pad.t + (1 - (v - yMin) / Math.max(1e-12, (yMax - yMin))) * plotH;

  return { x, y, pad, plotW, plotH, tMin, tMax, yMin, yMax };
}

// Nice Y-axis ticks
function niceTicksY(data, count=6) {
  const mn = Math.min(...data.map(d=>d.close));
  const mx = Math.max(...data.map(d=>d.close));
  const span = mx - mn || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const start = Math.floor(mn / step) * step;
  const end   = Math.ceil(mx / step) * step;
  const out = [];
  for (let v=start; v<=end+1e-12; v+=step) out.push(v);
  return out;
}

// Nice X-axis time ticks
function niceTicksTime(tMin, tMax, tf, count=6) {
  const stepSec = TF_SEC[tf] ?? 60;
  const stepMs = stepSec * 1000;
  const start = Math.floor(tMin / stepMs) * stepMs;
  const out = [];
  const approx = Math.max(1, Math.round((tMax - tMin) / (count * stepMs)));
  for (let i=0, t=start; t<=tMax && i<1000; i++, t+= approx*stepMs) out.push(t);
  return out;
}

// Formatting functions
const fmtPrice = (v) => v >= 1 ? v.toFixed(6) : v >= 0.01 ? v.toFixed(8) : v.toFixed(9);
const fmtMcap = (v) => v >= 1e9 ? (v/1e9).toFixed(2)+'B' : v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(2)+'K' : String(Math.round(v));

function formatTickTime(tMs, tf, useUTC) {
  const d = new Date(tMs);
  const opts = tf==='1MIN'||tf==='5MIN'||tf==='15MIN'||tf==='1H' ? { hour:'2-digit', minute:'2-digit' } :
              tf==='4H'||tf==='1D' ? { month:'short', day:'2-digit', hour:'2-digit' } :
              { month:'short', day:'2-digit' };
  return (useUTC ? new Intl.DateTimeFormat('en-US', {...opts, timeZone:'UTC'}) 
                 : new Intl.DateTimeFormat('en-US', opts)).format(d);
}

const SvgOHLCVArea = React.memo(function SvgOHLCVArea({
  contract,                      // token address
  timeframe = "1MIN",
  displayMode = "price",         // "price" | "mcap"
  circulatingSupply = null,      // required for mcap mode
  timezone = "UTC",             // "UTC" | "local"
  stroke = "#ec4899",  // Pink line
  fillFrom = "rgba(236, 72, 153, 0.35)",  // Pink gradient top
  fillTo   = "rgba(236, 72, 153, 0.05)",  // Pink gradient bottom (transparent)
  height = 280,
  maxPoints = 1000,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [rawData, setRawData] = useState([]);
  const [err, setErr] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const fetchingRef = useRef(false);
  const aliveRef = useRef(true);

  // responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(wrapRef.current?.clientWidth || 800));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // fetch from ChartService
  const fetchData = useCallback(async () => {
    const aliveRef = { current: true };
    (async () => {
      try {
        setErr(null);
        if (!contract) return;
        
        // Prevent infinite loops by checking if already fetching
        if (fetchingRef.current) {
          return;
        }
        
        fetchingRef.current = true;
        const res = await chartService.getPriceChartRD(contract, timeframe);
        const data = Array.isArray(res?.data) ? res.data : [];
        
        // Check if component is still alive
        if (!aliveRef.current) {
          return;
        }
        
        // Validate and clean data before setting
        const validatedData = data.filter(point => {
          const timeValue = point.time || point.timestamp;
          const isValid = point && 
            typeof timeValue === 'number' && 
            typeof point.close === 'number' && 
            !isNaN(point.close) && 
            point.close > 0 &&
            !isNaN(timeValue);
          return isValid;
        }).map(point => {
          if (point.timestamp && !point.time) {
            return { ...point, time: point.timestamp };
          }
          return point;
        });
        
        // Set validated data
        if (!aliveRef.current) {
          return;
        }
        
        setRawData(validatedData);
        fetchingRef.current = false;
      } catch (e) {
        fetchingRef.current = false;
        if (aliveRef.current) {
          console.error(`❌ [SvgOHLCVArea] Error fetching chart data for ${contract}:`, e);
          setErr(e.message || "Failed to load chart data");
        }
      }
           })();
           // Don't set aliveRef.current = false here - let the component handle cleanup
           return () => {
             fetchingRef.current = false;
           };
  }, [contract, timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debug: Track rawData changes
  useEffect(() => {
    // Track rawData changes silently
  }, [rawData, contract]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      aliveRef.current = false;
    };
  }, [contract]);

  // Process data: normalize, window, and transform
  const processedData = useMemo(() => {
    if (!rawData.length) {
      return [];
    }
    
    try {
      // Normalize OHLC data with proper bucketing
      let normalized;
      try {
        normalized = normalizeOHLC(rawData, timeframe);
      } catch (normalizeError) {
        console.error(`❌ [SvgOHLCVArea] Error in normalizeOHLC:`, normalizeError);
        throw normalizeError;
      }
      
      // Window to last N bars per timeframe
      let windowed;
      try {
        windowed = sliceWindow(normalized, timeframe);
      } catch (windowError) {
        console.error(`❌ [SvgOHLCVArea] Error in sliceWindow:`, windowError);
        throw windowError;
      }
      
      // Transform to market cap if needed
      if (displayMode === 'mcap' && circulatingSupply) {
        const supply = Number(circulatingSupply) || 0;
        const transformed = windowed.map(c => ({ ...c, close: c.close * supply }));
        return transformed;
      }
      
      return windowed;
    } catch (error) {
      console.error(`❌ [SvgOHLCVArea] Error processing data for ${contract}:`, error);
      return [];
    }
  }, [rawData, timeframe, displayMode, circulatingSupply]);

  // Build scales and paths
  const { x, y, pad, plotW, plotH, tMin, tMax, yMin, yMax } = useMemo(() => {
    if (!processedData.length) {
      return { x: () => 0, y: () => 0, pad: {}, plotW: 0, plotH: 0, tMin: 0, tMax: 0, yMin: 0, yMax: 0 };
    }
    try {
      const scales = makeScales(processedData, width, height);
      return scales;
    } catch (scaleError) {
      console.error(`❌ [SvgOHLCVArea] Error building scales:`, scaleError);
      return { x: () => 0, y: () => 0, pad: {}, plotW: 0, plotH: 0, tMin: 0, tMax: 0, yMin: 0, yMax: 0 };
    }
  }, [processedData, width, height]);

  // Build SVG path
  const path = useMemo(() => {
    if (!processedData.length) {
      return '';
    }
    return processedData.map((p, i) => `${i?'L':'M'} ${x(p.time*1000)} ${y(p.close)}`).join(' ');
  }, [processedData, x, y]);

  // Build area path (closed)
  const areaPath = useMemo(() => {
    if (!processedData.length) return '';
    const minClose = Math.min(...processedData.map(d => d.close));
    return `${path} L ${x(tMax)} ${y(minClose)} L ${x(tMin)} ${y(minClose)} Z`;
  }, [path, x, y, tMin, tMax, processedData]);

  // Y-axis ticks
  const yTicks = useMemo(() => niceTicksY(processedData, 6), [processedData]);
  
  // X-axis ticks
  const xTicks = useMemo(() => niceTicksTime(tMin, tMax, timeframe, 6), [tMin, tMax, timeframe]);

  // Formatting
  const fmtY = displayMode === "mcap" ? fmtMcap : fmtPrice;
  const useUTC = timezone === 'UTC';

  // unique gradient id per instance
  const gid = useMemo(() => `grad-${Math.random().toString(36).slice(2)}`, []);

  // Mouse event handlers for crosshair
  const handleMouseMove = (e) => {
    if (!processedData.length) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse X to time
    const timeAtMouse = tMin + ((mouseX - pad.l) / plotW) * (tMax - tMin);
    
    // Find closest data point
    let closestPoint = processedData[0];
    let minDist = Math.abs(processedData[0].time * 1000 - timeAtMouse);
    
    for (const point of processedData) {
      const dist = Math.abs(point.time * 1000 - timeAtMouse);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }
    
    setMousePos({
      x: mouseX,
      y: mouseY,
      time: closestPoint.time,
      price: closestPoint.close
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  if (!processedData.length) {
    return (
      <div ref={wrapRef} className="w-full">
        <div className="flex items-center justify-center h-64 text-gray-400">
          {err ? `Error: ${err}` : 'Loading chart data...'}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="w-full">
      <svg 
        width="100%" 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillFrom}/>
            <stop offset="100%" stopColor={fillTo}/>
          </linearGradient>
        </defs>

        {/* background panel */}
        <rect x="0" y="0" width={width} height={height} fill="#0b0f17" rx="10" />

        {/* plot area */}
        <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="#0b0f17" stroke="#2e3a4a"/>

        {/* Y-axis grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={pad.l} x2={pad.l+plotW} y1={y(tick)} y2={y(tick)} stroke="#334155" strokeDasharray="2,4" strokeWidth="0.5"/>
            <text x={pad.l-8} y={y(tick)} fill="#cbd5e1" fontSize="11" textAnchor="end" dominantBaseline="middle">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        {/* X-axis grid lines */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={pad.t} y2={pad.t+plotH} stroke="#334155" strokeDasharray="2,4" strokeWidth="0.5"/>
            <line x1={x(t)} x2={x(t)} y1={pad.t+plotH} y2={pad.t+plotH+6} stroke="#475569"/>
            <text x={x(t)} y={pad.t+plotH+18} fill="#cbd5e1" fontSize="11" textAnchor="middle">
              {formatTickTime(t, timeframe, useUTC)}
            </text>
          </g>
        ))}

        {/* area fill */}
        <path d={areaPath} fill={`url(#${gid})`} stroke="none"/>

        {/* line */}
        <path d={path} stroke={stroke} strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round"/>

        {/* Real-time indicator dot */}
        {processedData.length > 0 && (
          <circle
            cx={x(processedData[processedData.length - 1].time * 1000)}
            cy={y(processedData[processedData.length - 1].close)}
            r="4"
            fill={stroke}
            stroke="white"
            strokeWidth="2"
          >
            <animate
              attributeName="opacity"
              values="1;0.3;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Crosshair */}
        {mousePos && (
          <>
            {/* Vertical crosshair line */}
            <line
              x1={mousePos.x}
              y1={pad.t}
              x2={mousePos.x}
              y2={pad.t + plotH}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            {/* Horizontal crosshair line */}
            <line
              x1={pad.l}
              y1={mousePos.y}
              x2={pad.l + plotW}
              y2={mousePos.y}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            {/* Data point circle */}
            <circle
              cx={x(mousePos.time * 1000)}
              cy={y(mousePos.price)}
              r="4"
              fill={stroke}
              stroke="white"
              strokeWidth="2"
            />
            {/* Tooltip */}
            <g>
              {/* Tooltip background */}
              <rect
                x={mousePos.x + 10}
                y={mousePos.y - 30}
                width="120"
                height="50"
                fill="rgba(0,0,0,0.8)"
                rx="4"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
              {/* Time label */}
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 15}
                fill="white"
                fontSize="11"
                fontFamily="system-ui,sans-serif"
              >
                {formatTickTime(mousePos.time * 1000, timeframe, useUTC)}
              </text>
              {/* Price label */}
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 2}
                fill="white"
                fontSize="11"
                fontFamily="system-ui,sans-serif"
                fontWeight="bold"
              >
                {fmtY(mousePos.price)}
              </text>
            </g>
          </>
        )}
      </svg>

      {err && <div className="mt-2 text-sm text-red-400">Error: {err}</div>}
    </div>
  );
});

// ---- 3) Main SVGChart Component -----------------------------------------------------------
const SVGChart = ({ token, onClose }) => {
  
  const [timeframe, setTimeframe] = useState('5MIN'); // Default to 5 minutes
  const [displayMode, setDisplayMode] = useState('price');
  const [timezone, setTimezone] = useState('UTC'); // UTC or local

  // Timeframe options
  const timeframes = [
    { id: '1MIN', label: '1Min' },
    { id: '5MIN', label: '5Min' },
    { id: '15MIN', label: '15Min' },
    { id: '1H', label: '1H' },
    { id: '4H', label: '4H' },
    { id: '1D', label: '1D' },
    { id: 'ALL', label: 'ALL' }
  ];

  const contract = token?.contractAddress || token?.contract || token?.mint || token?.address;

  return (
    <div className={`bg-gray-900 rounded-lg h-full flex flex-col ${onClose ? 'p-4' : 'p-2'}`}>
      {/* Header - HIDDEN when onClose is null */}
      {onClose && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-white text-lg font-semibold">
              {token?.symbol || 'Token'} {displayMode === 'mcap' ? 'Market Cap' : 'Price'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls - Compact when no header */}
      <div className={`flex justify-between items-center flex-shrink-0 ${onClose ? 'mb-4' : 'mb-2'}`}>
        <div className="flex space-x-2">
          {timeframes.map(tf => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                timeframe === tf.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setDisplayMode('price')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              displayMode === 'price'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Price
          </button>
          <button
            onClick={() => setDisplayMode('mcap')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              displayMode === 'mcap'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Market Cap
          </button>
          <button
            onClick={() => setTimezone(timezone === 'UTC' ? 'local' : 'UTC')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              timezone === 'UTC'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {timezone === 'UTC' ? 'UTC' : 'Local'}
          </button>
        </div>
      </div>

      {/* Optimized SVG Chart with proper data processing */}
      <div className="flex-1 min-h-0">
        <SvgOHLCVArea
          contract={contract}
          timeframe={timeframe}
          displayMode={displayMode}
          circulatingSupply={token?.circulatingSupply}
          timezone={timezone}
          height={450}
          maxPoints={1000}
        />
      </div>
    </div>
  );
};

export default SVGChart;
