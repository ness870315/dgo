import React, { useEffect, useMemo, useState, useCallback } from 'react';
import kolCallsService from '../services/kolCallsService';
import priorityService from '../services/priorityService';
import DetailDrawer from './DetailDrawer';
import chartService from '../services/chartService';

function formatUSD(n) {
  const v = typeof n === 'number' ? n : Number(n || 0);
  if (!isFinite(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}

function formatPct(p) {
  const v = typeof p === 'number' ? p : Number(p || 0);
  if (!isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(2) + '%';
}

function computeDerived(row) {
  const called = Number(row.calledMc || row.calledMC || 0);
  const current = Number(row.currentMC || row.currentMc || called);
  const x = called > 0 ? current / called : 0;
  const pnl = called > 0 ? ((current - called) / called) * 100 : 0;
  const ath = Number(row.athMC || 0);
  const athX = called > 0 ? (ath / called) : 0;
  const mdd = typeof row.maxDrawdownPct === 'number' ? row.maxDrawdownPct : 0;
  return { x, pnl, athX, mdd };
}

function TableHeader({ label, sortKey, sort, setSort }) {
  const is = sort.key === sortKey;
  const arrow = is ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th
      onClick={() => setSort({ key: sortKey, dir: is ? (sort.dir === 'asc' ? 'desc' : 'asc') : 'desc' })}
      className="px-3 py-2 text-left text-xs font-medium text-gray-300 select-none cursor-pointer"
    >
      <span className="inline-flex items-center gap-1">{label}<span className="text-gray-500">{arrow}</span></span>
    </th>
  );
}

// Mini trend chart component for table cells
function MiniTrendChart({ call }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadChartData = async () => {
      // Handle different date field names
      const contractAddress = call?.contractAddress || call?.token?.contractAddress;
      const calledAt = call?.calledAt || call?.calledTs || call?.timestamp;
      
      // Debug logging
      if (call?.token?.symbol === 'WIZI') {
        console.log('🔍 MiniTrendChart debug for WIZI:', {
          contractAddress,
          calledAt,
          calledMC: call?.calledMc || call?.calledMC,
          currentMC: call?.currentMC || call?.currentMc,
          fullCall: call
        });
      }
      
      if (!contractAddress || !calledAt) {
        setLoading(false);
        return;
      }
      
      try {
        // Add timeout to chart fetch - use fallback if it takes too long
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Chart fetch timeout')), 2000)
        );
        
        const response = await Promise.race([
          chartService.getMcapChart(contractAddress, calledAt),
          timeoutPromise
        ]);
        
        if (response.success && response.data?.snapshots && response.data.snapshots.length > 0) {
          setChartData(response.data.snapshots);
          if (call?.token?.symbol === 'WIZI' || call?.token?.symbol === 'BAGWORK') {
            console.log(`✅ Historical chart loaded for ${call?.token?.symbol}: ${response.data.snapshots.length} points`);
          }
        } else {
          // No data available
          setChartData(null);
          if (call?.token?.symbol === 'WIZI' || call?.token?.symbol === 'BAGWORK') {
            console.log(`⚠️ No historical data for ${call?.token?.symbol}, will use fallback`);
          }
        }
      } catch (error) {
        // Error loading chart (timeout or error)
        setChartData(null);
        if (call?.token?.symbol === 'WIZI' || call?.token?.symbol === 'BAGWORK') {
          console.log(`❌ Chart fetch failed for ${call?.token?.symbol}: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadChartData();
  }, [call?.contractAddress, call?.token?.contractAddress, call?.calledAt, call?.calledTs, call?.timestamp]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center w-20 h-8">
        <div className="text-gray-600 text-xs">...</div>
      </div>
    );
  }
  
  // If no historical data, create a simple 2-point chart from call data
  if (!chartData || chartData.length < 2) {
    const calledMC = call?.calledMc || call?.calledMC || 0;
    const currentMC = call?.currentMC || call?.currentMc || 0;
    
    // Debug logging for fallback chart
    if (call?.token?.symbol === 'WIZI' || call?.token?.symbol === 'BAGWORK') {
      console.log(`📊 Fallback chart for ${call?.token?.symbol}:`, {
        calledMC,
        currentMC,
        willRender: calledMC > 0 && currentMC > 0
      });
    }
    
    if (calledMC > 0 && currentMC > 0) {
      // Create simple 2-point chart
      const series = [calledMC, currentMC];
      const firstValue = series[0];
      const lastValue = series[1];
      const isUptrend = lastValue >= firstValue;
      
      const w = 80;
      const h = 32;
      const padding = { top: 4, right: 2, bottom: 4, left: 2 };
      const chartHeight = h - padding.top - padding.bottom;
      const chartWidth = w - padding.left - padding.right;
      
      const min = Math.min(...series);
      const max = Math.max(...series);
      const range = max - min;
      const effectiveRange = range > 0 ? range : max * 0.05;
      
      const norm = series.map(v => (v - min) / effectiveRange);
      
      const path = `M${padding.left},${padding.top + chartHeight - (norm[0] * chartHeight)} L${padding.left + chartWidth},${padding.top + chartHeight - (norm[1] * chartHeight)}`;
      
      const color = isUptrend ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
      const fillColor = isUptrend ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      
      return (
        <svg width={w} height={h} className="inline-block">
          <path
            d={`${path} L ${padding.left + chartWidth},${h - padding.bottom} L ${padding.left},${h - padding.bottom} Z`}
            fill={fillColor}
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      );
    }
    
    return (
      <div className="flex items-center justify-center w-20 h-8">
        <div className="text-gray-600 text-xs">—</div>
      </div>
    );
  }
  
  // Extract market cap values from historical snapshots
  const series = chartData.map(s => s.marketCap || 0).filter(v => v > 0);
  
  if (call?.token?.symbol === 'WIZI' || call?.token?.symbol === 'BAGWORK') {
    console.log(`📈 Processing historical chart for ${call?.token?.symbol}:`, {
      totalPoints: chartData.length,
      validPoints: series.length,
      firstMC: series[0],
      lastMC: series[series.length - 1],
      min: Math.min(...series),
      max: Math.max(...series)
    });
  }
  
  if (series.length < 2) {
    return (
      <div className="flex items-center justify-center w-20 h-8">
        <div className="text-gray-600 text-xs">—</div>
      </div>
    );
  }
  
  const firstValue = series[0];
  const lastValue = series[series.length - 1];
  const isUptrend = lastValue >= firstValue;
  
  // Create SVG path with better scaling
  const w = 80;
  const h = 32;
  const padding = { top: 4, right: 2, bottom: 4, left: 2 };
  const chartHeight = h - padding.top - padding.bottom;
  const chartWidth = w - padding.left - padding.right;
  
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  
  // If range is very small (flat chart), amplify it for visibility
  const effectiveRange = range > 0 ? range : max * 0.01; // Use 1% of max if flat
  
  // Normalize with the effective range and add padding to prevent edge clipping
  const norm = series.map(v => {
    if (effectiveRange === 0) return 0.5; // Center line if completely flat
    return (v - min) / effectiveRange;
  });
  
  const step = chartWidth / (series.length - 1);
  const path = norm
    .map((v, i) => {
      const x = padding.left + i * step;
      const y = padding.top + chartHeight - (v * chartHeight);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  
  const color = isUptrend ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'; // green-500 or red-500
  const fillColor = isUptrend ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  
  return (
    <svg width={w} height={h} className="inline-block">
      {/* Area fill */}
      <path
        d={`${path} L ${padding.left + chartWidth},${h - padding.bottom} L ${padding.left},${h - padding.bottom} Z`}
        fill={fillColor}
      />
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KolCallsModal({ open, onClose, onOpenToken, asInline = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [timeframe, setTimeframe] = useState('all');
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState({ key: 'x', dir: 'desc' });
  const [selectedCall, setSelectedCall] = useState(null);

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

  const load = useCallback(async () => {
    console.log('🔄 KolCallsModal: load() called');
    setLoading(true);
    setError('');
    try {
      const callsRes = await kolCallsService.getCalls();
      const calls = Array.isArray(callsRes.calls) ? callsRes.calls : [];
      console.log('📊 KolCallsModal: Loaded calls:', calls.length);
      
      // Debug milestone posts
      const callsWithMilestones = calls.filter(c => c.milestonePosts && c.milestonePosts.length > 0);
      if (callsWithMilestones.length > 0) {
        console.log('🎯 KolCallsModal: Found calls with milestone posts:', 
          callsWithMilestones.map(c => ({
            id: c.id,
            symbol: c.token?.symbol,
            milestoneCount: c.milestonePosts.length,
            milestones: c.milestonePosts.map(p => `${p.milestone}x`)
          }))
        );
      }

      const mapped = calls.map(c => {
        const calledAtRaw = c.calledAt || c.calledTs || c.createdAt;
        const calledTs = new Date(calledAtRaw || Date.now()).getTime();
        return {
          id: c.id,
          token: {
            symbol: c.token?.symbol || 'UNKNOWN',
            name: c.token?.name || 'Unknown',
            contractAddress: c.token?.contractAddress || ''
          },
          name: c.token?.name || c.token?.symbol || 'Unknown',
          calledTs,
          calledAt: calledAtRaw, // Keep original calledAt for DetailDrawer
          calledMc: Number(c.calledMc || c.calledMC || 0), // Use lowercase 'c' to match DetailDrawer
          calledMC: Number(c.calledMc || c.calledMC || 0), // Keep both for compatibility
          currentMC: Number(c.currentMC || c.calledMc || c.calledMC || 0),
          contractAddress: c.token?.contractAddress || '',
          athMC: c.athMC,
          athTimestamp: c.athTimestamp,
          maxDrawdownPct: c.maxDrawdownPct,
          peakMC: c.peakMC,
          holderCount: c.holderCount,
          liquidity: c.liquidity, // Pass through liquidity if available
          lastUpdated: c.lastUpdated,
          // Add missing fields for DetailDrawer
          thesis: c.thesis,
          twitterPostId: c.twitterPostId,
          twitterEnabled: c.twitterEnabled,
          tone: c.tone,
          milestones: c.milestones || [],
          milestonePosts: c.milestonePosts || [] // Fix: map milestonePosts from backend
        };
      });

      setRows(mapped);
      
      // Boost priority for all tokens in KOL calls for better real-time updates
      mapped.forEach(call => {
        if (call.contractAddress) {
          priorityService.boostTokenOnView(call.contractAddress, call.token.symbol);
        }
      });
      
    } catch (e) {
      setError('Failed to load KOL calls');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Refresh after a call is added elsewhere (e.g., TokenDetails)
  useEffect(() => {
    const handler = () => { 
      console.log('🔄 KolCallsModal: Received kol-call-added event', { open, asInline });
      if (open || asInline) {
        console.log('🔄 KolCallsModal: Refreshing calls list');
        load(); 
      }
    };
    window.addEventListener('kol-call-added', handler);
    return () => window.removeEventListener('kol-call-added', handler);
  }, [open, asInline, load]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let windowMs = Infinity;
    if (timeframe === '24h') windowMs = 24 * 60 * 60 * 1000;
    else if (timeframe === '7d') windowMs = 7 * 24 * 60 * 60 * 1000;
    else if (timeframe === '30d') windowMs = 30 * 24 * 60 * 60 * 1000;
    const qq = q.trim().toLowerCase();
    return rows.filter(r => {
      const text = (r.token.symbol + ' ' + r.token.name).toLowerCase();
      const timeOk = timeframe === 'all' ? true : (now - r.calledTs) <= windowMs;
      return text.includes(qq) && timeOk;
    });
  }, [rows, q, timeframe]);

  const sorted = useMemo(() => {
    const d = [...filtered];
    const key = sort.key;
    d.sort((a, b) => {
      const da = computeDerived(a);
      const db = computeDerived(b);
      let av = 0, bv = 0;
      if (key === 'token') { av = a.token.localeCompare(b.token); bv = 0; return sort.dir === 'asc' ? av : -av; }
      if (key === 'calledMC') { av = a.calledMC; bv = b.calledMC; }
      else if (key === 'currentMC') { av = a.currentMC; bv = b.currentMC; }
      else if (key === 'x') { av = da.x; bv = db.x; }
      else if (key === 'pnl') { av = da.pnl; bv = db.pnl; }
      else if (key === 'athx') { av = da.athX; bv = db.athX; }
      else if (key === 'mdd') { av = da.mdd; bv = db.mdd; }
      else { av = 0; bv = 0; }
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return d;
  }, [filtered, sort]);

  function exportCSV() {
    const rowsCsv = [
      ['Token', 'Name', 'CalledAt', 'CalledMC', 'CurrentMC', 'X', 'PnL%', 'ATHx', 'MDD%'],
      ...sorted.map(r => {
        const d = computeDerived(r);
        return [
          r.token.symbol,
          r.token.name,
          new Date(r.calledTs).toISOString(),
          r.calledMC,
          r.currentMC,
          d.x.toFixed(4),
          d.pnl.toFixed(4),
          d.athX.toFixed(4),
          d.mdd.toFixed(4)
        ];
      })
    ];
    const csv = rowsCsv.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kol-calls-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open && !asInline) return null;

  const Container = ({ children }) => (
    asInline ? (
      <div className="bg-dark-card border border-gray-700 rounded-lg p-4">
        {children}
      </div>
    ) : (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {children}
        </div>
      </div>
    )
  );

  return (
    <Container>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Your Calls</h2>
            <p className="text-xs text-gray-400">Track performance of every token you called.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Export CSV</button>
            {!asInline && (
              <button onClick={onClose} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Close</button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by token…"
            className="flex-1 bg-dark-bg border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-400"
          />
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="bg-dark-bg border border-gray-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="all">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading…</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : (
          <div className="overflow-auto border border-gray-700 rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <TableHeader label="Token" sortKey="token" sort={sort} setSort={setSort} />
                  <TableHeader label="Called MC" sortKey="calledMC" sort={sort} setSort={setSort} />
                  <TableHeader label="Current MC" sortKey="currentMC" sort={sort} setSort={setSort} />
                  <TableHeader label="X" sortKey="x" sort={sort} setSort={setSort} />
                  <TableHeader label="PnL %" sortKey="pnl" sort={sort} setSort={setSort} />
                  <TableHeader label="ATH×" sortKey="athx" sort={sort} setSort={setSort} />
                  <TableHeader label="MDD %" sortKey="mdd" sort={sort} setSort={setSort} />
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-300">Trend</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const d = computeDerived(r);
                  const xClass = d.x >= 1 ? 'text-green-400' : 'text-red-400';
                  const pnlClass = d.pnl >= 0 ? 'text-green-400' : 'text-red-400';
                  const athClass = d.athX >= 1 ? 'text-green-300' : 'text-gray-300';
                  const mddClass = d.mdd < 0 ? 'text-red-400' : 'text-gray-300';
                  return (
                    <tr 
                      key={r.id} 
                      className="hover:bg-gray-800 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedCall(r);
                        // Boost priority when DetailDrawer is opened for more real-time updates
                        if (r.contractAddress) {
                          priorityService.boostTokenOnView(r.contractAddress, r.token.symbol);
                        }
                      }}
                    >
                      <td className="px-3 py-2 text-white">{r.token.symbol} <span className="text-gray-400">· {r.token.name}</span></td>
                      <td className="px-3 py-2 text-gray-200">{formatUSD(r.calledMC)}</td>
                      <td className="px-3 py-2 text-gray-200">{formatUSD(r.currentMC)}</td>
                      <td className={`px-3 py-2 font-semibold ${xClass}`}>{d.x.toFixed(2)}×</td>
                      <td className={`px-3 py-2 ${pnlClass}`}>{formatPct(d.pnl)}</td>
                      <td className={`px-3 py-2 ${athClass}`}>{d.athX ? d.athX.toFixed(2) + '×' : '—'}</td>
                      <td className={`px-3 py-2 ${mddClass}`}>{isFinite(d.mdd) ? d.mdd.toFixed(2) + '%' : '—'}</td>
                      <td className="px-3 py-2">
                        <MiniTrendChart call={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Detail Drawer */}
        <DetailDrawer 
          call={selectedCall} 
          onClose={() => setSelectedCall(null)}
          onRefresh={load}
        />
    </Container>
  );
}


