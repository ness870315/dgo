import axios from 'axios';

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
const INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '300000', 10); // 5 minutes
const RUN_ON_START = (process.env.DISCOVERY_RUN_ON_START || 'true') === 'true';

const JUP_BASE = 'https://lite-api.jup.ag/tokens/v2';
const SEARCHES = [
  { key: 'JupTrending5m', category: 'toptrending', interval: '5m' },
  { key: 'JupOrganic5m', category: 'toporganicscore', interval: '5m' },
  { key: 'JupTraded5m', category: 'toptraded', interval: '5m' }
];

const STABLE_SYMBOLS = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);

async function fetchJupiterCategory(category, interval) {
  const url = `${JUP_BASE}/${encodeURIComponent(category)}/${encodeURIComponent(interval)}`;
  const res = await axios.get(url, { headers: { Accept: 'application/json' }, timeout: 20000 });
  const data = Array.isArray(res.data) ? res.data : (res.data?.tokens || []);
  return data;
}

function normalizeToken(t) {
  return {
    symbol: (t.symbol || '').toUpperCase(),
    name: t.name || t.symbol || 'Unknown',
    contractAddress: t.contractAddress || t.address || t.mint || null,
    price: t.price ?? t.uiPrice ?? t.currentPrice ?? t.priceUsd ?? null,
    mcap: t.mcap ?? t.marketCap ?? null,
    liquidity: t.liquidity ?? t.liq ?? null,
    volume1h: t.volume1h ?? (t.volume && (t.volume['1h'] || t.volume.h1)) ?? null,
    trades1h: t.trades1h ?? (t.trades && (t.trades['1h'] || t.trades.h1)) ?? null,
    change1hPct: t.change1hPct ?? (t.priceChange && (t.priceChange['1h'] || t.priceChange.h1)) ?? null,
    holders: t.holders ?? t.holderCount ?? null,
    graduatedAt: t.graduatedAt || null
  };
}

function filterCandidates(list) {
  const out = [];
  for (const t of list) {
    const n = normalizeToken(t);
    if (!n.contractAddress || n.contractAddress.length < 10) continue;
    if (!n.symbol || STABLE_SYMBOLS.has(n.symbol)) continue;
    if (!n.graduatedAt) continue; // Filter non-graduated
    out.push({ ...n });
  }
  return out.slice(0, 100);
}

function dedupeByAddress(tokens) {
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const key = t.contractAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function importToBackend({ source, category, interval, tokens }) {
  if (!INTERNAL_TOKEN) {
    console.warn('⚠️ No INTERNAL_TOKEN set; skipping import');
    return { success: false, error: 'No token' };
  }
  const url = `${API_BASE}/api/internal/discovery/import`;
  const res = await axios.post(url, { source, category, interval, tokens }, {
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
    timeout: 20000
  });
  return res.data;
}

async function runOnce() {
  const startedAt = new Date();
  let totalFetched = 0;
  let totalCandidates = 0;
  let totalImported = 0;
  let totalBoosted = 0;
  for (const s of SEARCHES) {
    try {
      const raw = await fetchJupiterCategory(s.category, s.interval);
      totalFetched += Array.isArray(raw) ? raw.length : 0;
      const filtered = filterCandidates(raw);
      totalCandidates += filtered.length;
      const deduped = dedupeByAddress(filtered);
      const result = await importToBackend({ source: 'jup-discovery', category: s.category, interval: s.interval, tokens: deduped });
      if (result?.success) {
        totalImported += (result.stats?.inserted || 0) + (result.stats?.updated || 0);
        totalBoosted += (result.stats?.boosted || 0);
        console.log(`✅ Imported ${result.stats?.inserted || 0} new, updated ${result.stats?.updated || 0}, boosted ${result.stats?.boosted || 0} for ${s.key}`);
      } else {
        console.warn(`⚠️ Import failed for ${s.key}:`, result?.error || 'unknown');
      }
    } catch (e) {
      console.error(`❌ Discovery error for ${s.key}:`, e.message);
    }
  }
  console.log(`🎯 Discovery run completed in ${((Date.now() - startedAt.getTime())/1000).toFixed(1)}s: fetched=${totalFetched}, candidates=${totalCandidates}, imported=${totalImported}, boosted=${totalBoosted}`);
}

async function main() {
  console.log('🚀 Jupiter Discovery Service starting...');
  console.log('   API_BASE =', API_BASE);
  console.log('   INTERVAL_MS =', INTERVAL_MS);
  console.log('   RUN_ON_START =', RUN_ON_START);
  if (RUN_ON_START) {
    await runOnce();
  }
  setInterval(runOnce, INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


