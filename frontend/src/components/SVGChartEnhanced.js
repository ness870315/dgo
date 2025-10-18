import React, { useEffect, useMemo, useRef, useState } from "react";
import chartService from "../services/chartService";

// ------- Enhanced helpers with aggregation support
const TF_SEC = { '1MIN':60,'5MIN':300,'15MIN':900,'1H':3600,'4H':14400,'1D':86400,'1W':604800,'1M':2592000,'ALL':14400 };

const WINDOW_BY_TF = {
  '1MIN': 100,   // 4h window (Helius API limit)
  '5MIN': 96,    // 8h window  
  '15MIN': 48,   // 12 hours window
  '1H': 168,     // 7 days window
  '4H': 90,      // 15 days window
  '1D': 90,      // 90 days window
  '1W': 156,     // ~3 years
  '1M': 120,     // ~10 years
  'ALL': 500     // All time since token creation
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
  const decimals = format?.decimals || 6;
  
  // Handle very small numbers
  if (v < 0.000001) {
    return v.toExponential(2);
  }
  
  // Handle different price ranges with appropriate decimals
  if (v >= 1000) {
    return v.toFixed(2);
  } else if (v >= 1) {
    return v.toFixed(Math.min(decimals, 6));
  } else if (v >= 0.01) {
    return v.toFixed(Math.min(decimals, 8));
  } else {
    return v.toFixed(Math.min(decimals, 9));
  }
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

// Enhanced X-axis time formatting - properly adapted for each timeframe
function formatTimeLabel(timeframe, useLocal = false) {
  return (timestamp) => {
    const date = new Date(timestamp * 1000);
    const formatter = useLocal ? 
      (fmt) => new Intl.DateTimeFormat('en-US', fmt) :
      (fmt) => new Intl.DateTimeFormat('en-US', { ...fmt, timeZone: 'UTC' });

    // Adaptive formatting based on timeframe - optimized for readability
    switch (timeframe) {
      case '1MIN':
        // 1MIN: Show HH:mm only (4 hours of data, same day)
        return formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      
      case '5MIN':
        // 5MIN: Show HH:mm only (8 hours of data, likely same day)
        return formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      
      case '15MIN':
        // 15MIN: Show HH:mm only for cleaner look (12 hours of data)
        return formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      
      case '1H':
        // 1H: Show MMM DD for daily marks (7 days of data)
        return formatter({ month: 'short', day: 'numeric' }).format(date);
      
      case '4H':
        // 4H: Show MMM DD (15 days of data)
        return formatter({ month: 'short', day: 'numeric' }).format(date);
      
      case '1D':
        // 1D: Show MMM DD (90 days of data)
        return formatter({ month: 'short', day: 'numeric' }).format(date);
      
      case 'ALL':
        // ALL: Show MMM YYYY for long-term view (months/years since inception)
        return formatter({ month: 'short', year: 'numeric' }).format(date);
      
      default:
        return formatter({ month: 'short', day: 'numeric' }).format(date);
    }
  };
}

// Enhanced tick generation with timeframe-appropriate intervals
function generateTimeTicks(tMin, tMax, timeframe, containerWidth) {
  const span = tMax - tMin;
  let ticks = [];
  
  // Calculate appropriate tick intervals based on timeframe
  let tickInterval;
  let targetTicks;
  
  switch (timeframe) {
    case '1MIN':
      // 4 hours of data: show every hour for better time coverage
      tickInterval = 60 * 60; // 1 hour in seconds
      targetTicks = Math.max(3, Math.min(5, Math.floor(containerWidth / 120)));
      break;
      
    case '5MIN':
      // 8 hours of data: show every 2 hours for better readability
      tickInterval = 2 * 60 * 60; // 2 hours in seconds
      targetTicks = Math.max(3, Math.min(5, Math.floor(containerWidth / 120)));
      break;
      
    case '15MIN':
      // 12 hours of data: show every 4 hours for cleaner look
      tickInterval = 4 * 60 * 60; // 4 hours in seconds
      targetTicks = Math.max(2, Math.min(4, Math.floor(containerWidth / 160)));
      break;
      
    case '1H':
      // 7 days of data: show every day
      tickInterval = 24 * 60 * 60; // 1 day in seconds
      targetTicks = Math.max(4, Math.min(8, Math.floor(containerWidth / 100)));
      break;
      
    case '4H':
      // 15 days of data: show every 3 days
      tickInterval = 3 * 24 * 60 * 60; // 3 days in seconds
      targetTicks = Math.max(3, Math.min(6, Math.floor(containerWidth / 120)));
      break;
      
    case '1D':
      // 90 days of data: show every 2 weeks
      tickInterval = 14 * 24 * 60 * 60; // 2 weeks in seconds
      targetTicks = Math.max(4, Math.min(7, Math.floor(containerWidth / 100)));
      break;
      
    case 'ALL':
      // All time data: show every few months based on span
      const spanMonths = span / (30 * 24 * 60 * 60); // Approximate months
      if (spanMonths > 24) {
        tickInterval = 6 * 30 * 24 * 60 * 60; // 6 months
      } else if (spanMonths > 12) {
        tickInterval = 3 * 30 * 24 * 60 * 60; // 3 months
      } else {
        tickInterval = 30 * 24 * 60 * 60; // 1 month
      }
      targetTicks = Math.max(4, Math.min(8, Math.floor(containerWidth / 100)));
      break;
      
    default:
      // Fallback to simple division
      targetTicks = Math.max(3, Math.min(5, Math.floor(containerWidth / 120)));
      tickInterval = span / targetTicks;
  }
  
  // Generate ticks based on interval or target count
  if (tickInterval && timeframe !== 'default') {
    // Use meaningful intervals for specific timeframes
    const startTick = Math.ceil(tMin / tickInterval) * tickInterval;
    for (let tick = startTick; tick <= tMax && ticks.length < targetTicks; tick += tickInterval) {
      if (tick >= tMin) {
        ticks.push(tick);
      }
    }
    
    // Ensure we have at least start and end ticks
    if (ticks.length === 0 || ticks[0] > tMin + span * 0.1) {
      ticks.unshift(tMin);
    }
    if (ticks[ticks.length - 1] < tMax - span * 0.1) {
      ticks.push(tMax);
    }
    
    // Ensure minimum spacing between ticks to prevent overlapping labels
    const minSpacing = containerWidth / 8; // Minimum 8 labels across the width
    const filteredTicks = [];
    for (let i = 0; i < ticks.length; i++) {
      if (i === 0 || (ticks[i] - ticks[i-1]) * (containerWidth / span) >= minSpacing) {
        filteredTicks.push(ticks[i]);
      }
    }
    ticks = filteredTicks;
  } else {
    // Fallback to simple division
    const step = span / targetTicks;
    for (let i = 0; i <= targetTicks; i++) {
      ticks.push(tMin + i * step);
    }
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
  timeframe = '5MIN', 
  displayMode = 'price', 
  circulatingSupply = 0,
  timezone = 'UTC',
  token = null,
  onChartDataChange = null
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [rawData, setRawData] = useState([]);
  const [err, setErr] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [priceDirection, setPriceDirection] = useState('neutral'); // 'up', 'down', 'neutral'
  const [lastPrice, setLastPrice] = useState(null);
  
  // Removed dynamic loading states (no longer needed)
  
  // Removed all zoom/drag states

  // Notify parent component when chart data changes
  useEffect(() => {
    if (rawData && rawData.length > 0 && onChartDataChange) {
      onChartDataChange(rawData);
    }
  }, [rawData, onChartDataChange]);

  // Responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const newWidth = wrapRef.current?.clientWidth || 800;
      setWidth(newWidth);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Removed all zoom/drag event listeners

  // Enhanced data fetching with aggregation fallback
  useEffect(() => {
    let alive = true;
    
    const fetchWithFallback = async () => {
      setIsLoading(true);
      try {
        setErr(null);
        if (!contract) return;

        // Main chart data fetching (price/OHLCV data)

        // Handle 'ALL' timeframe with Jupiter createdAt
        let res, data;
        if (timeframe === 'ALL' && token?.jupiterData?.createdAt) {
          console.log(`📅 ALL timeframe: Using Jupiter createdAt ${token.jupiterData.createdAt}`);
          // Convert createdAt to timestamp and use 4H intervals for all-time view
          const createdAtTimestamp = new Date(token.jupiterData.createdAt).getTime() / 1000;
          const now = Date.now() / 1000;
          const daysSinceCreation = (now - createdAtTimestamp) / (24 * 60 * 60);
          
          console.log(`📊 Token age: ${daysSinceCreation.toFixed(1)} days since creation`);
          
          // Use 4H timeframe for all-time view (good balance of detail vs performance)
          res = await chartService.getPriceChartWithTimeRange(contract, '4H', createdAtTimestamp, now);
          data = Array.isArray(res?.data) ? res.data : [];
          
          console.log(`📈 ALL timeframe: Got ${data.length} data points from creation to now`);
        } else {
          // Use Professional Chart Architecture
          console.log(`📊 Using Professional Chart Architecture for ${timeframe}`);
          res = await chartService.getPriceChart(contract, timeframe);
          data = Array.isArray(res?.data) ? res.data : [];
          
          console.log(`📈 Professional Architecture: Got ${data.length} candles`);
        }

        if (!alive) return;
        console.log(`🔍 [DEBUG] Raw data received:`, data.length, 'points');
        console.log(`🔍 [DEBUG] Sample data point:`, data[0]);
        setRawData(data);
        
        // Data loaded successfully
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load chart data");
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    fetchWithFallback();
    return () => { alive = false; };
  }, [contract, timeframe, token]); // Removed displayMode - no need to refetch data

  // Separate effect for Jupiter data fetching (only when switching to market cap mode)
  useEffect(() => {
    const fetchJupiterData = async () => {
      // Only fetch Jupiter data if we're in market cap mode and don't have it yet
      if (displayMode === 'mcap' && !token?.jupiterData && contract) {
        try {
          console.log(`🪐 Fetching Jupiter data for market cap calculation...`);
          const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
          const jupiterRes = await fetch(`${API_BASE}/api/jupiter/raw/${encodeURIComponent(contract)}`);
          if (jupiterRes.ok) {
            const jupiterData = await jupiterRes.json();
            console.log(`🪐 Jupiter data fetched:`, jupiterData);
            // Update token object with Jupiter data if available
            if (token && jupiterData?.raw) {
              token.jupiterData = jupiterData.raw;
            }
          }
        } catch (jupiterError) {
          console.log(`⚠️ Failed to fetch Jupiter data:`, jupiterError.message);
        }
      }
    };

    fetchJupiterData();
  }, [displayMode, contract, token?.jupiterData]); // Only runs when switching to mcap mode

  // Removed dynamic loading function (no longer needed without pan)

  // Process data: normalize, window, and transform
  const processedData = useMemo(() => {
    console.log(`🔍 [DEBUG] Processing data:`, rawData.length, 'raw points');
    if (!rawData.length) return [];
    
    const normalized = normalizeOHLC(rawData, timeframe);
    console.log(`🔍 [DEBUG] Normalized:`, normalized.length, 'points');
    const windowed = sliceWindow(normalized, timeframe);
    console.log(`🔍 [DEBUG] Windowed:`, windowed.length, 'points');
    
    // Transform to market cap if needed
    if (displayMode === 'mcap') {
      // Try multiple sources for circulating supply (Jupiter API first)
      const supply = circulatingSupply || 
                    token?.jupiterData?.circSupply || 
                    token?.jupiterData?.circulatingSupply ||
                    token?.supply || 
                    token?.totalSupply ||
                    token?.jupiterData?.totalSupply ||
                    1000000000; // Default 1B supply for memecoins if no data
      
      console.log(`📊 Market cap mode: Using supply ${supply.toLocaleString()}`);
      console.log(`📊 Supply sources:`, {
        circulatingSupply,
        jupiterCircSupply: token?.jupiterData?.circSupply,
        jupiterCirculatingSupply: token?.jupiterData?.circulatingSupply,
        tokenSupply: token?.supply,
        tokenTotalSupply: token?.totalSupply,
        jupiterTotalSupply: token?.jupiterData?.totalSupply
      });
      
      return windowed.map(d => ({
        ...d,
        open: d.open * supply,
        high: d.high * supply,
        low: d.low * supply,
        close: d.close * supply
      }));
    }
    
    return windowed;
  }, [rawData, timeframe, displayMode, circulatingSupply, token]);

  // Track price direction changes
  useEffect(() => {
    console.log(`🔍 [DEBUG] Price direction effect:`, processedData.length, 'processed points');
    if (processedData.length > 0) {
      const currentPrice = processedData[processedData.length - 1].close;
      console.log(`🔍 [DEBUG] Current price:`, currentPrice, 'Last price:', lastPrice);
      
      if (lastPrice !== null) {
        if (currentPrice > lastPrice) {
          setPriceDirection('up');
        } else if (currentPrice < lastPrice) {
          setPriceDirection('down');
        } else {
          setPriceDirection('neutral');
        }
      }
      
      setLastPrice(currentPrice);
    }
  }, [processedData, lastPrice]);

  // Enhanced scaling and formatting
  const { x, y, yTicks, xTicks, priceFormat, yFormatter, height, padding, plotW, plotH, tMin, tMax, yDomainMin, yDomainMax } = useMemo(() => {
    if (!processedData.length) return { 
      x: () => 0, 
      y: () => 0, 
      yTicks: [], 
      xTicks: [], 
      priceFormat: { decimals: 6 }, 
      yFormatter: (v) => v,
      height: 400,
      padding: { left: 60, right: 16, top: 12, bottom: 40 },
      plotW: 100,
      plotH: 100,
      tMin: 0,
      tMax: 1,
      yDomainMin: 0,
      yDomainMax: 1
    };

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
    
    // Responsive dimensions - optimized for 14-inch screens
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isSmallLaptop = width >= 1024 && width < 1366; // 14-inch laptops
    const isDesktop = width >= 1366 && width < 1440;
    const height = isMobile ? 250 : isTablet ? 300 : isSmallLaptop ? 280 : isDesktop ? 350 : 400;
    const padding = { 
      left: isMobile ? 50 : 60, 
      right: 16, 
      top: 12, 
      bottom: isMobile ? 30 : 40 
    };
    
    const plotW = Math.max(10, width - padding.left - padding.right);
    const plotH = Math.max(10, height - padding.top - padding.bottom);
    
    // Simple scaling functions (no zoom)
    const xScale = (t) => padding.left + ((t - tMin) / (tMax - tMin)) * plotW;
    const yScale = (price) => padding.top + ((yDomainMax - price) / (yDomainMax - yDomainMin)) * plotH;
    
    // Generate ticks
    const yTickValues = generateYTicks(yDomainMin, yDomainMax, 5);
    const xTickValues = generateTimeTicks(tMin, tMax, timeframe, plotW);
    
    // Y-axis formatter
    const formatter = displayMode === 'mcap' ? 
      (v) => fmtMcap(v) : 
      (v) => fmtPrice(v, format);
    
    console.log(`📊 Y-axis formatter: ${displayMode} mode, sample format:`, formatter(closes[closes.length - 1] || 1));
    
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

  // Simple mouse interaction for crosshair only
  const handleMouseMove = (event) => {
    if (!processedData.length) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Find closest data point for crosshair
    const timeAtMouse = ((mouseX - padding.left) / plotW) * (tMax - tMin) + tMin;
    
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
    ` L ${x(processedData[processedData.length - 1].time)} ${height - padding.bottom}` +
    ` L ${x(processedData[0].time)} ${height - padding.bottom} Z`;

  const gradientId = `gradient-${contract}-${timeframe}`;
  const timeFormatter = formatTimeLabel(timeframe, timezone === 'local');

  return (
    <div ref={wrapRef} className="w-full relative">
      
      
      
      <svg 
        width={width} 
        height={height} 
        className="bg-gray-900 rounded-lg border border-gray-700"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair' }}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,46,161,0.35)" />
            <stop offset="100%" stopColor="rgba(255,46,161,0.05)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map(tick => (
          <line
            key={tick}
            x1={padding.left}
            y1={y(tick)}
            x2={width - padding.right}
            y2={y(tick)}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}
        
        {xTicks.map(tick => (
          <line
            key={tick}
            x1={x(tick)}
            y1={padding.top}
            x2={x(tick)}
            y2={height - padding.bottom}
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

        {/* Enhanced Real-time Blinking Dot */}
        {processedData.length > 0 && (() => {
          // Use current price change from token data instead of chart timeframe change
          const priceChange = token?.jupiterData?.stats24h?.priceChange || 
                             token?.priceChange24h || 
                             token?.stats24h?.priceChange || 0;
          
          // Get latest data point for positioning the dot
          const latestData = processedData[processedData.length - 1];
          
          // Determine blink speed based on change magnitude
          const getBlinkSpeed = (change) => {
            const absChange = Math.abs(change);
            if (absChange >= 5) return 'blink-fast';      // 5%+ = fast blink
            if (absChange >= 1) return 'blink-medium';    // 1-5% = medium blink
            return 'blink-slow';                          // <1% = slow blink
          };
          
          // Determine dot size based on change magnitude
          const getDotSize = (change) => {
            const absChange = Math.abs(change);
            if (absChange >= 5) return { outer: 10, main: 6, inner: 3 };      // Large change = bigger dot
            if (absChange >= 1) return { outer: 8, main: 5, inner: 2.5 };     // Medium change = medium dot
            return { outer: 6, main: 4, inner: 2 };                           // Small change = normal dot
          };
          
          const blinkSpeed = getBlinkSpeed(priceChange);
          const dotSize = getDotSize(priceChange);
          const isSignificantChange = Math.abs(priceChange) >= 0.1; // Show details for changes >= 0.1%
          
          return (
            <g>
              {/* Outer glow circle with dynamic size */}
              <circle
                cx={x(latestData.time)}
                cy={y(latestData.close)}
                r={dotSize.outer}
                fill={
                  priceDirection === 'up' ? 'rgba(34, 197, 94, 0.3)' : // Green for up
                  priceDirection === 'down' ? 'rgba(239, 68, 68, 0.3)' : // Red for down
                  'rgba(255, 46, 161, 0.3)' // Pink for neutral
                }
                className={`realtime-glow ${blinkSpeed}`}
              />
              
              {/* Main blinking point with dynamic size */}
              <circle
                cx={x(latestData.time)}
                cy={y(latestData.close)}
                r={dotSize.main}
                fill={
                  priceDirection === 'up' ? '#22c55e' : // Green for up
                  priceDirection === 'down' ? '#ef4444' : // Red for down
                  '#ff2ea1' // Pink for neutral
                }
                className={`realtime-dot ${blinkSpeed}`}
                stroke="white"
                strokeWidth="1"
              />
              
              {/* Inner highlight with dynamic size */}
              <circle
                cx={x(latestData.time)}
                cy={y(latestData.close)}
                r={dotSize.inner}
                fill="white"
                className={`realtime-dot-inner ${blinkSpeed}`}
              />
              
              {/* Direction indicator arrow with dynamic size */}
              {priceDirection !== 'neutral' && (
                <text
                  x={x(latestData.time)}
                  y={y(latestData.close) - 15}
                  fill={
                    priceDirection === 'up' ? '#22c55e' : '#ef4444'
                  }
                  fontSize={Math.abs(priceChange) >= 5 ? "14" : "12"}
                  textAnchor="middle"
                  fontFamily="system-ui,sans-serif"
                  fontWeight="bold"
                  className={`realtime-arrow ${blinkSpeed}`}
                >
                  {priceDirection === 'up' ? '▲' : '▼'}
                </text>
              )}
              
              {/* Price change percentage display */}
              {isSignificantChange && (
                <text
                  x={x(latestData.time)}
                  y={y(latestData.close) - 30}
                  fill={
                    priceDirection === 'up' ? '#22c55e' : 
                    priceDirection === 'down' ? '#ef4444' : 
                    '#ff2ea1'
                  }
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="system-ui,sans-serif"
                  fontWeight="bold"
                  className={`realtime-change ${blinkSpeed}`}
                >
                  {priceDirection === 'up' ? '+' : ''}{priceChange.toFixed(2)}%
                </text>
              )}
              
              {/* Real-time timestamp indicator */}
              <text
                x={x(latestData.time)}
                y={y(latestData.close) + 20}
                fill="rgba(255,255,255,0.6)"
                fontSize="8"
                textAnchor="middle"
                fontFamily="system-ui,sans-serif"
                className="realtime-timestamp"
              >
                LIVE
              </text>
            </g>
          );
        })()}

        {/* Y-axis labels */}
        {yTicks.map(tick => (
          <text
            key={tick}
            x={padding.left - 8}
            y={y(tick) + 4}
            fill="rgba(255,255,255,0.7)"
            fontSize="11"
            textAnchor="end"
            fontFamily="system-ui,sans-serif"
          >
            {yFormatter(tick)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map(tick => (
          <text
            key={tick}
            x={x(tick)}
            y={height - padding.bottom + 15}
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
              y1={padding.top}
              x2={mousePos.x}
              y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            
            {/* Horizontal crosshair */}
            <line
              x1={padding.left}
              y1={mousePos.y}
              x2={width - padding.right}
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
              {(() => {
                const tooltipWidth = 140;
                const tooltipHeight = 50;
                const tooltipOffset = 10;
                
                // Check if tooltip would go off-screen to the right
                const wouldGoOffScreen = mousePos.x + tooltipOffset + tooltipWidth > width - padding.right;
                
                // Position tooltip to the left if it would go off-screen
                const tooltipX = wouldGoOffScreen 
                  ? mousePos.x - tooltipOffset - tooltipWidth 
                  : mousePos.x + tooltipOffset;
                
                const textX = tooltipX + 5;
                
                return (
                  <>
                    <rect
                      x={tooltipX}
                      y={mousePos.y - 30}
                      width={tooltipWidth}
                      height={tooltipHeight}
                      fill="rgba(0,0,0,0.8)"
                      rx="4"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="1"
                    />
                    <text
                      x={textX}
                      y={mousePos.y - 15}
                      fill="white"
                      fontSize="11"
                      fontFamily="system-ui,sans-serif"
                    >
                      {timeFormatter(mousePos.time)}
                    </text>
                    <text
                      x={textX}
                      y={mousePos.y - 2}
                      fill="white"
                      fontSize="11"
                      fontFamily="system-ui,sans-serif"
                      fontWeight="bold"
                    >
                      {yFormatter(mousePos.price)}
                    </text>
                  </>
                );
              })()}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

// Main SVGChart wrapper component
export default function SVGChart({ token, onClose, onChartDataChange, onTimeframeChange }) {
  const [timeframe, setTimeframe] = useState('5MIN');
  const [displayMode, setDisplayMode] = useState('price');
  const [timezone, setTimezone] = useState('UTC');

  const contract = token?.contractAddress || token?.contract || token?.mint || token?.address;

  // Notify parent when timeframe changes
  useEffect(() => {
    if (onTimeframeChange) {
      onTimeframeChange(timeframe);
    }
  }, [timeframe, onTimeframeChange]);

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
            {['1MIN', '5MIN', '15MIN', '1H', '4H', '1D', 'ALL'].map(tf => (
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
        circulatingSupply={token?.circulatingSupply}
        timezone={timezone}
        token={token}
        onChartDataChange={onChartDataChange}
      />
    </div>
  );
}
