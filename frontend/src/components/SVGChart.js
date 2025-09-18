import React, { useMemo, useRef, useState, useEffect } from "react";
import chartService from '../services/chartService';

// ---- 1) Utils ---------------------------------------------------------------
const pad = (min, max, pct=0.05) => {
  const span = max - min || 1;
  return [min - span*pct, max + span*pct];
};

const bisect = (arr, x, getX) => {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (getX(arr[mid]) < x) lo = mid + 1; else hi = mid;
  }
  return lo;
};

// Largest-Triangle-Three-Buckets downsampler (tiny, good quality)
function lttb(points, threshold, getX, getY) {
  const n = points.length;
  if (threshold >= n || threshold === 0) return points;
  const sampled = [points[0]];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const range = points.slice(rangeStart, rangeEnd);

    // avg for next bucket
    let avgX = 0, avgY = 0;
    for (const p of range) { avgX += getX(p); avgY += getY(p); }
    avgX /= range.length || 1; avgY /= range.length || 1;

    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    let maxArea = -1, maxAreaPoint = null, nextA = rangeOffs;

    for (let j = rangeOffs; j < rangeTo; j++) {
      const ax = getX(points[a]), ay = getY(points[a]);
      const bx = getX(points[j]), by = getY(points[j]);
      const area = Math.abs((ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay));
      if (area > maxArea) { maxArea = area; maxAreaPoint = points[j]; nextA = j; }
    }
    sampled.push(maxAreaPoint || points[nextA]);
    a = nextA;
  }
  sampled.push(points[n - 1]);
  return sampled;
}

// Simple formatter
const fmtUSD = (v) =>
  (v >= 1 ? v.toFixed(4) : v >= 0.01 ? v.toFixed(6) : v.toPrecision(6));

// ---- 2) Optimized SVG Chart Component -----------------------------------------------------------
function SvgAreaChart({
  data = [],
  height = 400,
  stroke = "#ec4899",
  fillFrom = "rgba(236, 72, 153, 0.35)",
  fillTo = "rgba(236, 72, 153, 0.05)",
  maxPoints = 600,
  showGrid = true,
  className = ""
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);

  // Responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrapRef.current) setWidth(wrapRef.current.clientWidth || 800);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ---- Normalize & downsample
  const points = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const rows = data
      .filter(d => Number.isFinite(d?.time) && Number.isFinite(d?.close))
      .map(d => ({ t: (d.time > 1e12 ? Math.floor(d.time/1000) : d.time), y: +d.close }))
      .sort((a,b) => a.t - b.t);

    // Deduplicate timestamps
    const uniq = [];
    for (let i=0;i<rows.length;i++) {
      if (i === 0 || rows[i].t !== rows[i-1].t) uniq.push(rows[i]);
      else uniq[uniq.length-1] = rows[i]; // keep last in bucket
    }

    return uniq.length > maxPoints
      ? lttb(uniq, maxPoints, p=>p.t, p=>p.y)
      : uniq;
  }, [data, maxPoints]);

  // ---- Scales
  const [minT, maxT, minYRaw, maxYRaw] = useMemo(() => {
    if (!points.length) return [0, 1, 0, 1];
    let minT = points[0].t, maxT = points[points.length-1].t;
    let minY = +Infinity, maxY = -Infinity;
    for (const p of points) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    const [lo, hi] = pad(minY, maxY, 0.06);
    return [minT, maxT, lo, hi];
  }, [points]);

  const x = (t) => {
    const span = maxT - minT || 1;
    return ((t - minT) / span) * (width - 32) + 16; // 16px left/right padding
  };
  const y = (v) => {
    const span = maxYRaw - minYRaw || 1;
    return height - 24 - ((v - minYRaw) / span) * (height - 48); // 24px top/bot padding
  };

  // ---- Paths
  const { linePath, areaPath } = useMemo(() => {
    if (!points.length) return { linePath: "", areaPath: "" };
    let d = `M ${x(points[0].t)} ${y(points[0].y)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${x(points[i].t)} ${y(points[i].y)}`;
    }
    const baseY = y(minYRaw);
    const area = `${d} L ${x(points[points.length-1].t)} ${baseY} L ${x(points[0].t)} ${baseY} Z`;
    return { linePath: d, areaPath: area };
  }, [points, width, height, minYRaw, x, y]);

  // ---- Tooltip / crosshair
  const [hover, setHover] = useState(null); // { i, px }
  const onMove = (e) => {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    // invert x -> time
    const t = minT + ((px - 16) / Math.max(1, (width - 32))) * (maxT - minT);
    const i = Math.min(points.length - 1, Math.max(0, bisect(points, t, p=>p.t)));
    setHover({ i, px: x(points[i].t) });
  };

  return (
    <div ref={wrapRef} className={className} style={{width: "100%"}}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="gFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillFrom}/>
            <stop offset="100%" stopColor={fillTo}/>
          </linearGradient>
        </defs>

        {/* grid (optional) */}
        {showGrid && (
          <>
            {[0.25,0.5,0.75].map((r,idx)=>(
              <line key={idx} x1="0" x2={width} y1={height*r} y2={height*r}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            ))}
          </>
        )}

        {/* area + line */}
        <path d={areaPath} fill="url(#gFill)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>

        {/* crosshair + tooltip */}
        {hover && points[hover.i] && (
          <>
            <line x1={hover.px} x2={hover.px} y1="8" y2={height-8}
                  stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4"/>
            <circle cx={hover.px} cy={y(points[hover.i].y)} r="3.5" fill={stroke} />
            {/* tooltip bubble */}
            <g transform={`translate(${Math.min(width-220, Math.max(8, hover.px-110))}, 12)`}>
              <rect width="210" height="56" rx="8" fill="rgba(15,23,42,0.95)" stroke="rgba(148,163,184,0.35)"/>
              <text x="12" y="24" fill="#e2e8f0" fontSize="12" fontFamily="system-ui, sans-serif">
                {new Date(points[hover.i].t*1000).toLocaleString()}
              </text>
              <text x="12" y="44" fill="#94a3b8" fontSize="14" fontFamily="system-ui, sans-serif">
                {fmtUSD(points[hover.i].y)} $
              </text>
            </g>
          </>
        )}

        {/* interactive overlay */}
        <rect x="0" y="0" width={width} height={height}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={()=>setHover(null)}
        />
      </svg>
    </div>
  );
}

// ---- 3) Main SVGChart Component -----------------------------------------------------------
const SVGChart = ({ token, onClose }) => {
  const [timeframe, setTimeframe] = useState('1D');
  const [displayMode, setDisplayMode] = useState('price');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Timeframe options
  const timeframes = [
    { id: '1MIN', label: '1m' },
    { id: '5MIN', label: '5m' },
    { id: '15MIN', label: '15m' },
    { id: '1H', label: '1h' },
    { id: '4H', label: '4h' },
    { id: '1D', label: '1D' },
    { id: '1W', label: '1W' },
    { id: '1M', label: '1M' }
  ];

  // Load chart data
  useEffect(() => {
    if (!token?.contractAddress && !token?.contract) {
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      try {
        const contract = token.contractAddress || token.contract || token.mint || token.address;
        const response = await chartService.getPriceChartRD(contract, timeframe);
        setChartData(response);
      } catch (error) {
        console.error('Failed to load chart data:', error);
        setChartData(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, timeframe]);

  // Process data for the optimized chart
  const processedData = useMemo(() => {
    if (!chartData?.data?.length) return [];

    const candles = chartData.data.map(d => ({
      time: Math.floor(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume) || 0
    }));

    // Apply market cap transform if needed
    if (displayMode === 'mcap' && token?.circulatingSupply) {
      candles.forEach(candle => {
        candle.close = candle.close * token.circulatingSupply;
        candle.open = candle.open * token.circulatingSupply;
        candle.high = candle.high * token.circulatingSupply;
        candle.low = candle.low * token.circulatingSupply;
      });
    }

    return candles;
  }, [chartData, displayMode, token]);

  // Format price for display
  const formatPrice = (price) => {
    if (!price || typeof price !== 'number' || isNaN(price)) {
      return '$0.00';
    }
    
    if (displayMode === 'mcap') {
      if (price >= 1e9) return `$${(price / 1e9).toFixed(1)}B`;
      if (price >= 1e6) return `$${(price / 1e6).toFixed(1)}M`;
      if (price >= 1e3) return `$${(price / 1e3).toFixed(1)}K`;
      return `$${price.toFixed(0)}`;
    } else {
      if (price < 0.01) return `$${price.toFixed(6)}`;
      if (price < 1) return `$${price.toFixed(4)}`;
      if (price < 100) return `$${price.toFixed(2)}`;
      return `$${price.toFixed(2)}`;
    }
  };

  const currentPrice = processedData.length > 0 ? processedData[processedData.length - 1].close : 0;
  const minPrice = processedData.length > 0 ? Math.min(...processedData.map(d => d.close)) : 0;
  const maxPrice = processedData.length > 0 ? Math.max(...processedData.map(d => d.close)) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-900 rounded-lg">
        <div className="text-white">Loading chart data...</div>
      </div>
    );
  }

  if (!processedData.length) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-900 rounded-lg">
        <div className="text-white text-center">
          <div className="text-lg mb-2">No chart data available</div>
          <div className="text-sm text-gray-400">
            {token?.symbol || 'Token'} - {timeframe}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-semibold">
            {token?.symbol || 'Token'} {displayMode === 'mcap' ? 'Market Cap' : 'Price'}
          </h3>
          <div className="text-white text-sm">
            {formatPrice(currentPrice)}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center mb-4">
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
        </div>
      </div>

      {/* Optimized SVG Chart */}
      <div className="bg-gray-800 rounded p-2">
        <SvgAreaChart 
          data={processedData} 
          height={400}
          stroke="#ec4899"
          fillFrom="rgba(236, 72, 153, 0.35)"
          fillTo="rgba(236, 72, 153, 0.05)"
          maxPoints={600}
          showGrid={true}
        />
      </div>

      {/* Price range info */}
      <div className="flex justify-between text-sm text-gray-400 mt-2">
        <div>Min: {formatPrice(minPrice)}</div>
        <div>Max: {formatPrice(maxPrice)}</div>
        <div>Range: {formatPrice(maxPrice - minPrice)}</div>
      </div>
    </div>
  );
};

export default SVGChart;
