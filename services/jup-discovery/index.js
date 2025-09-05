import axios from 'axios';

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
const INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '1800000', 10); // 30 minutes default
const RUN_ON_START = (process.env.DISCOVERY_RUN_ON_START || 'true') === 'true';

const FORCE_LITE_API = (process.env.FORCE_LITE_API || 'true') === 'true';
const JUP_BASE = process.env.JUP_BASE || (FORCE_LITE_API ? 'https://lite-api.jup.ag/tokens/v2' : (JUPITER_API_KEY ? 'https://api.jup.ag/tokens/v2' : 'https://lite-api.jup.ag/tokens/v2'));
const SEARCHES = [
  { key: 'JupTrending5m', category: 'toptrending', interval: '5m' },
  { key: 'JupOrganic5m', category: 'toporganicscore', interval: '5m' },
  { key: 'JupTraded5m', category: 'toptraded', interval: '5m' }
];

const STABLE_SYMBOLS = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
const DISCOVERY_LIMIT = parseInt(process.env.DISCOVERY_LIMIT || '100', 10);
let roundRobinIndex = 0;

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function fetchJupiterCategory(category, interval, attempt = 1) {
  const url = `${JUP_BASE}/${encodeURIComponent(category)}/${encodeURIComponent(interval)}`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Origin': 'https://jup.ag',
        'Referer': 'https://jup.ag/',
        ...(JUPITER_API_KEY ? { 'Authorization': `Bearer ${JUPITER_API_KEY}` } : {})
      },
      params: { limit: DISCOVERY_LIMIT },
      timeout: 20000,
      validateStatus: s => s >= 200 && s < 500
    });
    if (res.status === 429 || res.status === 503 || res.status === 502) {
      if (attempt <= 5) {
        const backoff = 5000 * attempt + Math.floor(Math.random() * 3000); // 5s base + jitter
        console.warn(`⏳ ${res.status} from Jupiter for ${category}/${interval}. Retrying in ${backoff}ms (attempt ${attempt}/5)`);
        await sleep(backoff);
        return fetchJupiterCategory(category, interval, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = Array.isArray(res.data) ? res.data : (res.data?.tokens || []);
    return data;
  } catch (e) {
    if (attempt <= 5) {
      const backoff = 5000 * attempt + Math.floor(Math.random() * 3000); // 5s base + jitter
      console.warn(`⏳ Error fetching ${category}/${interval}: ${e.message}. Retrying in ${backoff}ms (attempt ${attempt}/5)`);
      await sleep(backoff);
      return fetchJupiterCategory(category, interval, attempt + 1);
    }
    throw e;
  }
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
    graduatedAt: t.graduatedAt || t.graduated_at || null
  };
}

function filterCandidates(list) {
  const out = [];
  for (const t of list) {
    const n = normalizeToken(t);
    if (!n.contractAddress || n.contractAddress.length < 10) continue;
    if (!n.symbol || STABLE_SYMBOLS.has(n.symbol)) continue;
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
  const s = SEARCHES[roundRobinIndex];
  roundRobinIndex = (roundRobinIndex + 1) % SEARCHES.length;
  let fetched = 0;
  let candidates = 0;
  let imported = 0;
  let boosted = 0;
  // aggressive jitter 5-15s to avoid backend collisions
  const jitter = 5000 + Math.floor(Math.random() * 10000);
  await sleep(jitter);
  try {
    const raw = await fetchJupiterCategory(s.category, s.interval);
    fetched = Array.isArray(raw) ? raw.length : 0;
    const filtered = filterCandidates(raw);
    candidates = filtered.length;
    const deduped = dedupeByAddress(filtered);
    const result = await importToBackend({ source: 'jup-discovery', category: s.category, interval: s.interval, tokens: deduped });
    if (result?.success) {
      imported = (result.stats?.inserted || 0) + (result.stats?.updated || 0);
      boosted = (result.stats?.boosted || 0);
      console.log(`✅ Imported ${result.stats?.inserted || 0} new, updated ${result.stats?.updated || 0}, boosted ${result.stats?.boosted || 0} for ${s.key}`);
    } else {
      console.warn(`⚠️ Import failed for ${s.key}:`, result?.error || 'unknown');
    }
  } catch (e) {
    console.error(`❌ Discovery error for ${s.key}:`, e.message);
  }
  console.log(`🎯 Discovery run (${s.key}) in ${((Date.now() - startedAt.getTime())/1000).toFixed(1)}s: fetched=${fetched}, candidates=${candidates}, imported=${imported}, boosted=${boosted}`);
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


