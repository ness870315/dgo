import React, { useEffect, useMemo, useRef, useState } from "react";
import chartService from "../services/chartService";

// ------- Enhanced helpers with aggregation support
const TF_SEC = { '1MIN':60,'5MIN':300,'15MIN':900,'1H':3600,'4H':14400,'1D':86400,'1W':604800,'1M':2592000,'ALL':14400 };

const WINDOW_BY_TF = {
  '1MIN': 240,   // 4h window (matches backend RD: 240)
  '5MIN': 96,    // 8h window (matches backend RD: 96)  
  '15MIN': 48,   // 12 hours window (matches backend RD: 48)
  '1H': 168,     // 7 days window (matches backend RD: 168)
  '4H': 90,      // 15 days window (matches backend RD: 90)
  '1D': 90,      // 90 days window (matches backend RD: 90)
  '1W': 156,     // ~3 years
  '1M': 120,     // ~10 years
  'ALL': 500     // All time since token creation
};

// Aggregation fallback ladder
const FALLBACK_TF = {
  '15MIN': ['5MIN', '1MIN'],
  '1H': ['15MIN', '5MIN', '1MIN'],
  '4H': ['1H', '15MIN', '5MIN'],
  '1D': ['4H', '1H', '15MIN'],
  'ALL': ['1D', '4H', '1H']  // All time can fall back to daily data
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
      case 'ALL':
      default:
        // Show MMM DD for daily+ charts, MMM YY for all-time
        if (timeframe === 'ALL') {
          return formatter({ month: 'short', year: '2-digit' }).format(date);
        }
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
    case 'ALL':
      targetTicks = Math.max(4, Math.min(8, Math.floor(containerWidth / 100)));
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
  timeframe = '5MIN', 
  displayMode = 'price', 
  circulatingSupply = 0,
  timezone = 'UTC',
  token = null
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [rawData, setRawData] = useState([]);
  const [err, setErr] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Dynamic loading states
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [totalLoadedBars, setTotalLoadedBars] = useState(0);
  
  // Pan and zoom states
  const [panOffset, setPanOffset] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [viewWindow, setViewWindow] = useState({ start: 0, end: 1 });

  // Responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const newWidth = wrapRef.current?.clientWidth || 800;
      setWidth(newWidth);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Global mouse event listeners for better pan experience
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
    };

    const handleGlobalMouseMove = (event) => {
      if (isDragging && dragStart && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const deltaX = mouseX - dragStart.x;
        const currentPlotW = Math.max(10, width - 60 - 16); // padding.left - padding.right
        const panDelta = deltaX / currentPlotW;
        setPanOffset(prev => Math.max(-0.5, Math.min(0.5, prev + panDelta)));
        setDragStart({ x: mouseX, y: event.clientY - rect.top });
      }
    };

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('mousemove', handleGlobalMouseMove);
    }

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDragging, dragStart, width]);

  // Reset pan/zoom when timeframe changes
  useEffect(() => {
    setPanOffset(0);
    setZoomLevel(1);
    console.log(`🔄 Timeframe changed to ${timeframe}, resetting pan/zoom`);
  }, [timeframe]);

  // Enhanced data fetching with aggregation fallback
  useEffect(() => {
    let alive = true;
    
    const fetchWithFallback = async () => {
      setIsLoading(true);
      try {
        setErr(null);
        if (!contract) return;

        // If we don't have Jupiter data and we're in market cap mode, try to fetch it
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
          // Try primary timeframe first
          res = await chartService.getPriceChartRD(contract, timeframe);
          data = Array.isArray(res?.data) ? res.data : [];
        }
        
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
        setTotalLoadedBars(data.length);
        
        // Only reset pan/zoom on initial load or timeframe change
        if (rawData.length === 0) {
          setPanOffset(0);
          setZoomLevel(1);
          console.log(`🔄 Reset pan/zoom for new ${timeframe} data`);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load chart data");
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    fetchWithFallback();
    return () => { alive = false; };
  }, [contract, timeframe, displayMode, token]);

  // Dynamic loading function for more historical data
  const loadMoreHistoricalData = async () => {
    if (!contract || isLoadingMore || !hasMoreData || rawData.length === 0) return;
    
    setIsLoadingMore(true);
    console.log(`📈 Loading more ${timeframe} data...`);
    
    try {
      const oldestTime = rawData[0]?.time;
      if (!oldestTime) return;
      
      // Load more data before the oldest timestamp (use smaller chunks for dynamic loading)
      const chunkSize = Math.min(WINDOW_BY_TF[timeframe] || 100, 200); // Dynamic chunk size
      console.log(`🔄 Loading ${chunkSize} older bars for ${timeframe} (cache-optimized)`);
      const moreData = await chartService.loadOlderBars(contract, timeframe, oldestTime, 'RD', chunkSize);
      
      if (Array.isArray(moreData?.data) && moreData.data.length > 0) {
        console.log(`✅ Loaded ${moreData.data.length} more bars`);
        
        // Merge new data with existing (prepend older data)
        const mergedData = [...moreData.data, ...rawData];
        
        // Remove duplicates based on timestamp
        const uniqueData = mergedData.filter((item, index, arr) => 
          index === 0 || item.time !== arr[index - 1].time
        );
        
        setRawData(uniqueData);
        setTotalLoadedBars(uniqueData.length);
        
        // Keep current pan position to show historical data
        console.log(`📊 Keeping current pan position: ${panOffset.toFixed(3)} to show historical data`);
        
        // Check if we've reached the limit or no more data available
        if (moreData.data.length < 50) {
          setHasMoreData(false);
          console.log(`📊 Reached end of available data (${uniqueData.length} total bars)`);
        }
      } else {
        setHasMoreData(false);
        console.log(`📊 No more historical data available`);
      }
    } catch (error) {
      console.error('Failed to load more historical data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Process data: normalize, window, and transform
  const processedData = useMemo(() => {
    if (!rawData.length) return [];
    
    const normalized = normalizeOHLC(rawData, timeframe);
    const windowed = sliceWindow(normalized, timeframe);
    
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

  // Enhanced scaling and formatting
  const { x, y, yTicks, xTicks, priceFormat, yFormatter, height, padding, plotW, plotH, tMin, tMax, viewTMin, viewTMax, yDomainMin, yDomainMax } = useMemo(() => {
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
      viewTMin: 0,
      viewTMax: 1,
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
    
    // Apply pan and zoom to time domain
    const timeSpan = tMax - tMin;
    const zoomedTimeSpan = timeSpan / zoomLevel;
    const panAdjustment = panOffset * timeSpan;
    
    const viewTMin = tMin + panAdjustment + (timeSpan - zoomedTimeSpan) / 2;
    const viewTMax = viewTMin + zoomedTimeSpan;
    
    // Scaling functions with pan and zoom applied
    const xScale = (t) => padding.left + ((t - viewTMin) / (viewTMax - viewTMin)) * plotW;
    const yScale = (price) => padding.top + ((yDomainMax - price) / (yDomainMax - yDomainMin)) * plotH;
    
    // Generate ticks (use view window for X-axis)
    const yTickValues = generateYTicks(yDomainMin, yDomainMax, 5);
    const xTickValues = generateTimeTicks(viewTMin, viewTMax, timeframe, plotW);
    
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
      viewTMin,
      viewTMax,
      yDomainMin,
      yDomainMax
    };
  }, [processedData, width, displayMode, timeframe, panOffset, zoomLevel]);

  // Enhanced mouse interaction handlers with pan, zoom, and scroll detection
  const handleMouseMove = (event) => {
    if (!processedData.length) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Handle dragging for pan
    if (isDragging && dragStart) {
      const deltaX = mouseX - dragStart.x;
      const panDelta = deltaX / plotW;
      setPanOffset(prev => Math.max(-0.5, Math.min(0.5, prev + panDelta)));
      setDragStart({ x: mouseX, y: mouseY });
      
      // Check if we're panning to the left edge (need more historical data)
      if (panOffset < -0.3 && hasMoreData && !isLoadingMore) {
        console.log(`🔄 Pan threshold reached, loading more historical data...`);
        loadMoreHistoricalData();
      }
      return;
    }
    
    // Find closest data point for crosshair (use view window)
    const timeAtMouse = ((mouseX - padding.left) / plotW) * (viewTMax - viewTMin) + viewTMin;
    
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

  const handleMouseDown = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    setIsDragging(true);
    setDragStart({ x: mouseX, y: mouseY });
    event.preventDefault();
    event.stopPropagation();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsDragging(false);
    setDragStart(null);
  };

  const handleWheel = (event) => {
    // Prevent event from bubbling up to parent elements
    event.preventDefault();
    event.stopPropagation();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const isInPlotArea = mouseX >= padding.left && mouseX <= width - padding.right;
    
    if (!isInPlotArea) return;
    
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoomLevel = Math.max(0.1, Math.min(5, zoomLevel * zoomFactor));
    
    setZoomLevel(newZoomLevel);
    
    // If zooming out significantly and we have more data available, load it
    if (newZoomLevel < 0.5 && hasMoreData && !isLoadingMore) {
      console.log(`🔍 Zoom out detected (${newZoomLevel.toFixed(2)}x), loading more data...`);
      loadMoreHistoricalData();
    }
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
      {/* Loading indicators */}
      {isLoadingMore && (
        <div className="absolute top-2 left-2 z-10 bg-blue-500 text-white px-3 py-1 rounded-lg shadow-lg flex items-center space-x-2">
          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          <span className="text-sm">📈 Loading more history...</span>
        </div>
      )}
      
      {/* Progress indicator */}
      {totalLoadedBars > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-gray-800 text-gray-300 px-3 py-1 rounded-lg shadow-lg">
          <span className="text-xs">
            📊 {totalLoadedBars} bars loaded
            {hasMoreData && !isLoadingMore && (
              <span className="text-blue-400 ml-1">• More available</span>
            )}
          </span>
        </div>
      )}
      
      {/* Pan/Zoom instructions - positioned to avoid X-axis */}
      {!isLoadingMore && hasMoreData && (
        <div className="absolute top-12 left-2 z-10 bg-gray-800 bg-opacity-90 text-gray-300 px-3 py-1 rounded-lg shadow-lg text-xs border border-gray-600">
          🖱️ Drag to pan • Scroll to zoom • Auto-loads more data
        </div>
      )}
      
      <svg 
        width={width} 
        height={height} 
        className="bg-gray-900 rounded-lg border border-gray-700"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
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
                {yFormatter(mousePos.price)}
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
  const [timeframe, setTimeframe] = useState('1MIN');
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
      />
    </div>
  );
}
