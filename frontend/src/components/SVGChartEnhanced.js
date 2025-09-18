import React, { useEffect, useMemo, useRef, useState } from "react";
import chartService from "../services/chartService";

// ------- Enhanced helpers with aggregation support
const TF_SEC = { '1MIN':60,'5MIN':300,'15MIN':900,'1H':3600,'4H':14400,'1D':86400,'1W':604800,'1M':2592000 };

const WINDOW_BY_TF = {
  '1MIN': 240,   // 4h window
  '5MIN': 96,    // 8h window  
  '15MIN': 96,   // 1 day window
  '1H': 168,     // 7 days window
  '4H': 90,      // 15 days window
  '1D': 90,      // 90 days window
  '1W': 156,     // ~3 years
  '1M': 120      // ~10 years
};

// Aggregation fallback ladder
const FALLBACK_TF = {
  '15MIN': ['5MIN', '1MIN'],
  '1H': ['15MIN', '5MIN', '1MIN'],
  '4H': ['1H', '15MIN', '5MIN'],
  '1D': ['4H', '1H', '15MIN']
};

// Dynamic Y-axis formatting
function pickPriceFormat(last) {
  if (last >= 1)   return { decimals: 6, unit: '' };
  if (last >= 0.01) return { decimals: 8, unit: '' };
  return { decimals: 9, unit: '' };
}

function niceDomain(min, max, pad = 0.08) {
  if (min === max) { min *= 0.999; max *= 1.001; }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

// Market cap formatting
const fmtMcap = (n) => new Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:2}).format(n);

// Enhanced price formatting
function fmtPrice(v, format) {
  if (!Number.isFinite(v)) return 'N/A';
  return v.toFixed(format.decimals);
}

// OHLCV Aggregation for fallback
function aggregateOhlc(rows, targetTf) {
  const target = TF_SEC[targetTf];
  if (!target) return rows;
  
  const byBucket = new Map();

  for (const r of rows) {
    if (!Number.isFinite(r.time)) continue;
    const t0 = Math.floor(r.time / target) * target;
    let a = byBucket.get(t0);
    if (!a) {
      a = { time: t0, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 };
      byBucket.set(t0, a);
    } else {
      a.high = Math.max(a.high, r.high);
      a.low  = Math.min(a.low,  r.low);
      a.close = r.close;
      a.volume = (a.volume ?? 0) + (r.volume ?? 0);
    }
  }

  return [...byBucket.values()].sort((a,b)=>a.time-b.time);
}

// Normalize OHLC data with proper bucketing and deduplication
function normalizeOHLC(rows, tf) {
  const step = TF_SEC[tf] ?? 60;
  const toSecBucket = (t) => {
    const s = t > 1e12 ? t / 1000 : t;
    return Math.floor(Math.floor(s) / step) * step;
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

// Slice to window size
function sliceWindow(candles, tf) {
  const maxBars = WINDOW_BY_TF[tf] ?? 120;
  return candles.slice(-maxBars);
}

// Enhanced X-axis time formatting
function formatTimeLabel(timeframe, useLocal = false) {
  return (timestamp) => {
    const date = new Date(timestamp * 1000);
    const formatter = useLocal ? 
      (fmt) => new Intl.DateTimeFormat('en-US', fmt) :
      (fmt) => new Intl.DateTimeFormat('en-US', { ...fmt, timeZone: 'UTC' });

    // Adaptive formatting based on timeframe
    switch (timeframe) {
      case '1MIN':
      case '5MIN':
        // Show HH:mm for minute charts
        return formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      
      case '15MIN':
      case '1H':
      case '4H':
        // Show Day + HH:mm for hourly charts
        const dayFormat = formatter({ month: 'short', day: 'numeric' }).format(date);
        const timeFormat = formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
        return `${dayFormat} ${timeFormat}`;
      
      case '1D':
      case '1W':
      default:
        // Show MMM DD for daily+ charts
        return formatter({ month: 'short', day: 'numeric' }).format(date);
    }
  };
}

// Enhanced tick generation with adaptive spacing
function generateTimeTicks(tMin, tMax, timeframe, containerWidth) {
  const span = tMax - tMin;
  
  // Adaptive tick count based on timeframe and container width
  let targetTicks;
  switch (timeframe) {
    case '1MIN':
    case '5MIN':
      targetTicks = Math.max(3, Math.min(8, Math.floor(containerWidth / 80)));
      break;
    case '15MIN':
    case '1H':
      targetTicks = Math.max(3, Math.min(6, Math.floor(containerWidth / 100)));
      break;
    default:
      targetTicks = Math.max(3, Math.min(5, Math.floor(containerWidth / 120)));
  }

  const step = span / targetTicks;
  const ticks = [];
  
  for (let i = 0; i <= targetTicks; i++) {
    ticks.push(tMin + i * step);
  }
  
  return ticks;
}

// Enhanced Y-axis tick generation
function generateYTicks(yMin, yMax, count = 5) {
  const span = yMax - yMin;
  const rawStep = span / (count - 1);
  
  // Nice step calculation
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  
  let niceStep;
  if (normalized <= 1) niceStep = 1;
  else if (normalized <= 2) niceStep = 2;
  else if (normalized <= 5) niceStep = 5;
  else niceStep = 10;
  
  const step = niceStep * magnitude;
  const start = Math.floor(yMin / step) * step;
  
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const tick = start + i * step;
    if (tick >= yMin - step * 0.1 && tick <= yMax + step * 0.1) {
      ticks.push(tick);
    }
  }
  
  return ticks;
}

// Enhanced SVG Chart Component
function SvgOHLCVArea({ 
  contract, 
  timeframe = '15MIN', 
  displayMode = 'price', 
  circulatingSupply = 0,
  timezone = 'UTC'
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [rawData, setRawData] = useState([]);
  const [err, setErr] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const newWidth = wrapRef.current?.clientWidth || 800;
      setWidth(newWidth);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Enhanced data fetching with aggregation fallback
  useEffect(() => {
    let alive = true;
    
    const fetchWithFallback = async () => {
      setIsLoading(true);
      try {
        setErr(null);
        if (!contract) return;

        // Try primary timeframe first
        let res = await chartService.getPriceChartRD(contract, timeframe);
        let data = Array.isArray(res?.data) ? res.data : [];
        
        // If insufficient data and we have fallback options, try aggregation
        if (data.length < 50 && FALLBACK_TF[timeframe]) {
          console.log(`⚠️ Insufficient ${timeframe} data (${data.length} points), trying aggregation fallback...`);
          
          for (const fallbackTf of FALLBACK_TF[timeframe]) {
            try {
              const fallbackRes = await chartService.getPriceChartRD(contract, fallbackTf);
              const fallbackData = Array.isArray(fallbackRes?.data) ? fallbackRes.data : [];
              
              if (fallbackData.length > data.length) {
                console.log(`✅ Using ${fallbackTf} data (${fallbackData.length} points) aggregated to ${timeframe}`);
                data = aggregateOhlc(fallbackData, timeframe);
                break;
              }
            } catch (fallbackError) {
              console.log(`⚠️ Fallback ${fallbackTf} failed:`, fallbackError.message);
            }
          }
        }

        if (!alive) return;
        setRawData(data);
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load chart data");
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    fetchWithFallback();
    return () => { alive = false; };
  }, [contract, timeframe]);

  // Process data: normalize, window, and transform
  const processedData = useMemo(() => {
    if (!rawData.length) return [];
    
    const normalized = normalizeOHLC(rawData, timeframe);
    const windowed = sliceWindow(normalized, timeframe);
    
    // Transform to market cap if needed
    if (displayMode === 'mcap' && circulatingSupply > 0) {
      return windowed.map(d => ({
        ...d,
        open: d.open * circulatingSupply,
        high: d.high * circulatingSupply,
        low: d.low * circulatingSupply,
        close: d.close * circulatingSupply
      }));
    }
    
    return windowed;
  }, [rawData, timeframe, displayMode, circulatingSupply]);

  // Enhanced scaling and formatting
  const { x, y, yTicks, xTicks, priceFormat, yFormatter } = useMemo(() => {
    if (!processedData.length) return { x: () => 0, y: () => 0, yTicks: [], xTicks: [], priceFormat: { decimals: 6 }, yFormatter: (v) => v };

    const times = processedData.map(d => d.time);
    const closes = processedData.map(d => d.close);
    
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const yMin = Math.min(...closes);
    const yMax = Math.max(...closes);
    
    // Enhanced Y-axis formatting
    const lastPrice = closes[closes.length - 1] || 1;
    const format = pickPriceFormat(lastPrice);
    const [yDomainMin, yDomainMax] = niceDomain(yMin, yMax, 0.05);
    
    // Responsive dimensions
    const isMobile = width < 768;
    const height = isMobile ? 300 : 400;
    const padding = { 
      left: isMobile ? 50 : 60, 
      right: 16, 
      top: 12, 
      bottom: isMobile ? 30 : 40 
    };
    
    const plotW = Math.max(10, width - padding.left - padding.right);
    const plotH = Math.max(10, height - padding.top - padding.bottom);
    
    // Scaling functions
    const xScale = (t) => padding.left + ((t - tMin) / (tMax - tMin)) * plotW;
    const yScale = (price) => padding.top + ((yDomainMax - price) / (yDomainMax - yDomainMin)) * plotH;
    
    // Generate ticks
    const yTickValues = generateYTicks(yDomainMin, yDomainMax, 5);
    const xTickValues = generateTimeTicks(tMin, tMax, timeframe, plotW);
    
    // Y-axis formatter
    const formatter = displayMode === 'mcap' ? fmtMcap : (v) => fmtPrice(v, format);
    
    return {
      x: xScale,
      y: yScale,
      yTicks: yTickValues,
      xTicks: xTickValues,
      priceFormat: format,
      yFormatter: formatter,
      height,
      padding,
      plotW,
      plotH,
      tMin,
      tMax,
      yDomainMin,
      yDomainMax
    };
  }, [processedData, width, displayMode, timeframe]);

  // Mouse interaction handlers
  const handleMouseMove = (event) => {
    if (!processedData.length) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Find closest data point
    const timeAtMouse = ((mouseX - y.padding.left) / y.plotW) * (y.tMax - y.tMin) + y.tMin;
    
    let closestPoint = processedData[0];
    let minDistance = Math.abs(closestPoint.time - timeAtMouse);
    
    for (const point of processedData) {
      const distance = Math.abs(point.time - timeAtMouse);
      if (distance < minDistance) {
        minDistance = distance;
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

  // Render
  if (err) {
    return (
      <div ref={wrapRef} className="w-full h-96 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-center">
          <div className="text-red-400 mb-2">⚠️ Chart Error</div>
          <div className="text-gray-400 text-sm">{err}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div ref={wrapRef} className="w-full h-96 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-center">
          <div className="text-blue-400 mb-2">📊 Loading Chart...</div>
          <div className="text-gray-400 text-sm">Fetching {timeframe} data</div>
        </div>
      </div>
    );
  }

  if (!processedData.length) {
    return (
      <div ref={wrapRef} className="w-full h-96 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-center">
          <div className="text-gray-400 mb-2">📈 No Data Available</div>
          <div className="text-gray-500 text-sm">No chart data for this timeframe</div>
        </div>
      </div>
    );
  }

  // Generate path data
  const linePath = processedData.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${y(d.close)}`
  ).join(' ');

  const areaPath = linePath + 
    ` L ${x(processedData[processedData.length - 1].time)} ${y.height - y.padding.bottom}` +
    ` L ${x(processedData[0].time)} ${y.height - y.padding.bottom} Z`;

  const gradientId = `gradient-${contract}-${timeframe}`;
  const timeFormatter = formatTimeLabel(timeframe, timezone === 'local');

  return (
    <div ref={wrapRef} className="w-full">
      <svg 
        width={width} 
        height={y.height} 
        className="bg-gray-900 rounded-lg border border-gray-700"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,46,161,0.35)" />
            <stop offset="100%" stopColor="rgba(255,46,161,0.05)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {y.yTicks.map(tick => (
          <line
            key={tick}
            x1={y.padding.left}
            y1={y(tick)}
            x2={width - y.padding.right}
            y2={y(tick)}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}
        
        {y.xTicks.map(tick => (
          <line
            key={tick}
            x1={x(tick)}
            y1={y.padding.top}
            x2={x(tick)}
            y2={y.height - y.padding.bottom}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
        />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#ff2ea1"
          strokeWidth="2"
        />

        {/* Y-axis labels */}
        {y.yTicks.map(tick => (
          <text
            key={tick}
            x={y.padding.left - 8}
            y={y(tick) + 4}
            fill="rgba(255,255,255,0.7)"
            fontSize="11"
            textAnchor="end"
            fontFamily="system-ui,sans-serif"
          >
            {y.yFormatter(tick)}
          </text>
        ))}

        {/* X-axis labels */}
        {y.xTicks.map(tick => (
          <text
            key={tick}
            x={x(tick)}
            y={y.height - y.padding.bottom + 15}
            fill="rgba(255,255,255,0.7)"
            fontSize="10"
            textAnchor="middle"
            fontFamily="system-ui,sans-serif"
          >
            {timeFormatter(tick)}
          </text>
        ))}

        {/* Crosshair and tooltip */}
        {mousePos && (
          <>
            {/* Vertical crosshair */}
            <line
              x1={mousePos.x}
              y1={y.padding.top}
              x2={mousePos.x}
              y2={y.height - y.padding.bottom}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            
            {/* Horizontal crosshair */}
            <line
              x1={y.padding.left}
              y1={mousePos.y}
              x2={width - y.padding.right}
              y2={mousePos.y}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            
            {/* Data point circle */}
            <circle
              cx={x(mousePos.time)}
              cy={y(mousePos.price)}
              r="4"
              fill="#ff2ea1"
              stroke="white"
              strokeWidth="2"
            />
            
            {/* Tooltip */}
            <g>
              <rect
                x={mousePos.x + 10}
                y={mousePos.y - 30}
                width="140"
                height="50"
                fill="rgba(0,0,0,0.8)"
                rx="4"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 15}
                fill="white"
                fontSize="11"
                fontFamily="system-ui,sans-serif"
              >
                {timeFormatter(mousePos.time)}
              </text>
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 2}
                fill="white"
                fontSize="11"
                fontFamily="system-ui,sans-serif"
                fontWeight="bold"
              >
                {y.yFormatter(mousePos.price)}
              </text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

// Main SVGChart wrapper component
export default function SVGChart({ token, onClose }) {
  const [timeframe, setTimeframe] = useState('15MIN');
  const [displayMode, setDisplayMode] = useState('price');
  const [timezone, setTimezone] = useState('UTC');

  const contract = token?.contractAddress || token?.contract || token?.mint || token?.address;

  if (!token) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-center">
          <div className="text-gray-400 mb-2">📊 No Token Selected</div>
          <div className="text-gray-500 text-sm">Please select a token to view chart</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Enhanced Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-800 rounded-lg">
        {/* Timeframe Controls */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Timeframe:</span>
          <div className="flex bg-gray-700 rounded-lg p-1">
            {['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  timeframe === tf 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Display Mode */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Mode:</span>
          <div className="flex bg-gray-700 rounded-lg p-1">
            {[
              { key: 'price', label: 'Price' },
              { key: 'mcap', label: 'Market Cap' }
            ].map(mode => (
              <button
                key={mode.key}
                onClick={() => setDisplayMode(mode.key)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  displayMode === mode.key 
                    ? 'bg-green-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Time:</span>
          <div className="flex bg-gray-700 rounded-lg p-1">
            {[
              { key: 'UTC', label: 'UTC' },
              { key: 'local', label: 'Local' }
            ].map(tz => (
              <button
                key={tz.key}
                onClick={() => setTimezone(tz.key)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  timezone === tz.key 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {tz.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Enhanced Chart */}
      <SvgOHLCVArea 
        contract={contract}
        timeframe={timeframe}
        displayMode={displayMode}
        circulatingSupply={token.circulatingSupply}
        timezone={timezone}
      />
    </div>
  );
}
