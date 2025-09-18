import React, { useEffect, useMemo, useRef, useState } from "react";
import chartService from "../services/chartService";

// ------- helpers
const TF_SEC = { '1MIN':60,'5MIN':300,'15MIN':900,'1H':3600,'4H':14400,'1D':86400,'1W':604800,'1M':2592000 };

function chooseTimeStepSec(tf, pxWidth, targetPx = 100) {
  // how many ticks can we fit?
  const bars = Math.max(1, pxWidth / 6); // ~6px per bar rough
  const sec = TF_SEC[tf] || 60;
  
  // Adaptive target spacing based on timeframe for better readability
  let adaptiveTargetPx = targetPx;
  if (tf === '1MIN') {
    adaptiveTargetPx = 60; // Closer spacing for 1min charts
  } else if (tf === '5MIN') {
    adaptiveTargetPx = 80; // Medium spacing for 5min charts
  } else if (tf === '15MIN') {
    adaptiveTargetPx = 100; // Standard spacing for 15min charts
  } else if (tf === '1H' || tf === '4H') {
    adaptiveTargetPx = 120; // Wider spacing for hourly charts
  } else {
    adaptiveTargetPx = 150; // Even wider for daily+ charts
  }
  
  const approxTicks = Math.max(2, Math.round(pxWidth / adaptiveTargetPx));

  // candidate multiples of the base step
  const mults = [1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 960];
  // For higher TFs, allow day/week/month sized steps too:
  const extra = [24*3600, 7*24*3600, 30*24*3600];
  const candidates = [...mults.map(m=>m*sec), ...extra];

  // pick the first step that yields ≤ approxTicks labels
  return candidates.find(step => (bars * sec) / step <= approxTicks) || candidates[candidates.length-1];
}

function* timeTicks(tMin, tMax, stepSec) {
  if (!(tMax > tMin) || stepSec <= 0) return;
  const start = Math.ceil(tMin / stepSec) * stepSec;
  for (let t = start; t <= tMax + 1e-9; t += stepSec) yield t;
}

function timeLabelFormatter(tf, useLocal = false) {
  const opt = (o) => new Intl.DateTimeFormat(undefined, o);
  const Z = useLocal ? undefined : "UTC";

  // pick a formatter by timeframe with better readability
  if (tf === '1MIN') {
    // For 1min charts, show every 5-10 minutes to avoid clutter
    const f = opt({ hour:'2-digit', minute:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  if (tf === '5MIN') {
    // For 5min charts, show every 15-30 minutes
    const f = opt({ hour:'2-digit', minute:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  if (tf === '15MIN') {
    // For 15min charts, show every hour
    const f = opt({ hour:'2-digit', minute:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  if (tf === '1H' || tf === '4H') {
    const f = opt({ month:'short', day:'2-digit', hour:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  if (tf === '1D') {
    const f = opt({ month:'short', day:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  if (tf === '1W' || tf === '1M') {
    const f = opt({ month:'short', year:'2-digit', timeZone:Z });
    return (t)=> f.format(new Date(t*1000));
  }
  // fallback
  const f = opt({ month:'short', day:'2-digit', timeZone:Z });
  return (t)=> f.format(new Date(t*1000));
}

const niceTick = (min, max, count=6) => {
  // "nice number" ticks
  const span = Math.max(1e-18, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const incr = mult * step;
  const tmin = Math.floor(min / incr) * incr;
  const tmax = Math.ceil (max / incr) * incr;
  const ticks = [];
  for (let v = tmin; v <= tmax + 1e-12; v += incr) ticks.push(+v.toFixed(12));
  return ticks;
};
const fmtPrice = (v) => (v >= 1 ? v.toFixed(4) : v >= 0.01 ? v.toFixed(6) : v.toPrecision(6));
const fmtMcap  = (v) => {
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v/1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return (v/1e9 ).toFixed(2) + "B";
  if (abs >= 1e6)  return (v/1e6 ).toFixed(2) + "M";
  if (abs >= 1e3)  return (v/1e3 ).toFixed(2) + "K";
  return Math.round(v).toString();
};

function SvgOHLCVArea({
  contract,                      // token address
  timeframe = "1MIN",
  displayMode = "price",         // "price" | "mcap"
  circulatingSupply = null,      // required for mcap mode
  stroke = "#ff2fb9",
  fillFrom = "rgba(255,47,185,0.35)",
  fillTo   = "rgba(255,47,185,0.05)",
  height = 280,
  maxPoints = 1000,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);

  // responsive width
  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(wrapRef.current?.clientWidth || 800));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // fetch from your ChartService (RD limit)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        if (!contract) return;
        const res = await chartService.getPriceChartRD(contract, timeframe);
        const data = Array.isArray(res?.data) ? res.data : [];
        if (!alive) return;

        // normalize to {t, y}
        const norm = data
          .map(d => ({ t: d.time > 1e12 ? Math.floor(d.time/1000) : d.time,
                       y: +d.close }))
          .filter(p => Number.isFinite(p.t) && Number.isFinite(p.y))
          .sort((a,b) => a.t - b.t);

        setRows(norm.slice(-maxPoints)); // cap points
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load chart data");
      }
    })();
    return () => { alive = false; };
  }, [contract, timeframe, maxPoints]);

  // market cap transform
  const points = useMemo(() => {
    if (displayMode !== "mcap" || !circulatingSupply) return rows;
    const s = Number(circulatingSupply) || 0;
    return rows.map(p => ({ t: p.t, y: p.y * s }));
  }, [rows, displayMode, circulatingSupply]);

  // domains & scales
  const padding = { left: 56, right: 16, top: 12, bottom: 22 };
  const innerW = Math.max(10, width - padding.left - padding.right);
  const innerH = Math.max(10, height - padding.top - padding.bottom);

  const [tMin, tMax, yMin, yMax] = useMemo(() => {
    if (!points.length) return [0, 1, 0, 1];
    const t0 = points[0].t, t1 = points[points.length-1].t;
    let lo = +Infinity, hi = -Infinity;
    for (const p of points) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
    // small padding on Y
    const span = Math.max(1e-18, hi - lo);
    return [t0, t1, lo - span*0.06, hi + span*0.06];
  }, [points]);

  const x = (t) => padding.left + ((t - tMin) / Math.max(1, (tMax - tMin))) * innerW;
  const y = (v) => padding.top  + (1 - (v - yMin) / Math.max(1e-18, (yMax - yMin))) * innerH;

  // path building (fixes "no gradient visible" by ensuring a CLOSED area path)
  const { linePath, areaPath } = useMemo(() => {
    if (!points.length) return { linePath: "", areaPath: "" };
    let d = `M ${x(points[0].t)} ${y(points[0].y)}`;
    for (let i = 1; i < points.length; i++) d += ` L ${x(points[i].t)} ${y(points[i].y)}`;
    const baseY = y(yMin);
    const area = `${d} L ${x(points[points.length-1].t)} ${baseY} L ${x(points[0].t)} ${baseY} Z`;
    return { linePath: d, areaPath: area };
  }, [points, width, height, yMin]);

  // y-axis ticks
  const ticks = useMemo(() => niceTick(yMin, yMax, 6), [yMin, yMax]);
  const fmtY   = displayMode === "mcap" ? fmtMcap : fmtPrice;

  // unique gradient id per instance
  const gid = useMemo(() => `grad-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div ref={wrapRef} className="w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={fillFrom}/>
            <stop offset="100%" stopColor={fillTo}/>
          </linearGradient>
          <clipPath id={`${gid}-clip`}>
            <rect x={padding.left} y={padding.top} width={innerW} height={innerH} rx="6" />
          </clipPath>
        </defs>

        {/* background panel */}
        <rect x="0" y="0" width={width} height={height} fill="#0b0f17" rx="10" />

        {/* grid + y-axis */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left} x2={width - padding.right}
              y1={y(v)} y2={y(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
            />
            <text x={padding.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle"
                  fill="#93a4b8" fontSize="11" fontFamily="system-ui,sans-serif">
              {fmtY(v)}{displayMode === "price" ? "" : ""}
            </text>
          </g>
        ))}

        {/* axis line */}
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.12)" />

        {/* X axis grid + labels */}
        {(() => {
          const stepSec = chooseTimeStepSec(timeframe, innerW, 100);
          const fmtTime = timeLabelFormatter(timeframe, /*useLocal*/ false);
          const axisY = height - padding.bottom;

          return (
            <>
              {/* bottom axis line */}
              <line x1={padding.left} x2={width - padding.right} y1={axisY} y2={axisY}
                    stroke="rgba(255,255,255,0.12)" />

              {[...timeTicks(tMin, tMax, stepSec)].map((t, i) => {
                const px = x(t);
                // skip labels too close to edges
                if (px < padding.left + 20 || px > width - padding.right - 20) {
                  return (
                    <line key={`g${i}`} x1={px} x2={px} y1={padding.top} y2={axisY}
                          stroke="rgba(255,255,255,0.06)"/>
                  );
                }
                return (
                  <g key={i}>
                    {/* vertical grid line */}
                    <line x1={px} x2={px} y1={padding.top} y2={axisY}
                          stroke="rgba(255,255,255,0.06)"/>
                    {/* tick */}
                    <line x1={px} x2={px} y1={axisY} y2={axisY+5}
                          stroke="rgba(255,255,255,0.6)"/>
                    {/* label */}
                    <text x={px} y={axisY+16} textAnchor="middle"
                          fill="#93a4b8" fontSize="11" fontFamily="system-ui,sans-serif">
                      {fmtTime(t)}
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}

        {/* area + line (clipped to inner plot) */}
        <g clipPath={`url(#${gid}-clip)`}>
          <path d={areaPath} fill={`url(#${gid})`} />
          <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
        </g>
      </svg>

      {err && <div className="mt-2 text-sm text-red-400">Error: {err}</div>}
    </div>
  );
}

// ---- 3) Main SVGChart Component -----------------------------------------------------------
const SVGChart = ({ token, onClose }) => {
  const [timeframe, setTimeframe] = useState('15MIN'); // Default to 15 minutes
  const [displayMode, setDisplayMode] = useState('price');

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

  const contract = token?.contractAddress || token?.contract || token?.mint || token?.address;

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-semibold">
            {token?.symbol || 'Token'} {displayMode === 'mcap' ? 'Market Cap' : 'Price'}
          </h3>
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

      {/* Optimized SVG Chart with Y-axis */}
      <SvgOHLCVArea
        contract={contract}
        timeframe={timeframe}
        displayMode={displayMode}
        circulatingSupply={token?.circulatingSupply}
        height={400}
        maxPoints={1000}
      />
    </div>
  );
};

export default SVGChart;
