import axios from 'axios';

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
const INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '600000', 10); // 10 minutes default
const RUN_ON_START = (process.env.DISCOVERY_RUN_ON_START || 'true') === 'true';

const FORCE_LITE_API = (process.env.FORCE_LITE_API || 'true') === 'true';
const JUP_BASE = process.env.JUP_BASE || (FORCE_LITE_API ? 'https://lite-api.jup.ag/tokens/v2' : (JUPITER_API_KEY ? 'https://api.jup.ag/tokens/v2' : 'https://lite-api.jup.ag/tokens/v2'));
const SEARCHES = [
  { key: 'JupTrending5m', category: 'toptrending', interval: '5m' },
  { key: 'JupOrganic5m', category: 'toporganicscore', interval: '5m' },
  { key: 'JupTraded5m', category: 'toptraded', interval: '5m' }
];

const STABLE_SYMBOLS = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
const DISCOVERY_LIMIT = parseInt(process.env.DISCOVERY_LIMIT || '90', 10);
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
      if (attempt === 1) {
        console.warn(`⏸️ ${res.status} on first attempt for ${category}/${interval}. Cooling down 15 minutes...`);
        await sleep(15 * 60 * 1000);
        throw new Error(`HTTP ${res.status}`);
      }
      if (attempt <= 2) {
        const backoff = 10000 * attempt + Math.floor(Math.random() * 5000); // 10s base + jitter
        console.warn(`⏳ ${res.status} from Jupiter for ${category}/${interval}. Retrying in ${backoff}ms (attempt ${attempt}/2)`);
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
    if (e.message.includes('HTTP 429') || e.message.includes('HTTP 503') || e.message.includes('HTTP 502')) {
      // Already cooled down or retried above
      throw e;
    }
    if (attempt <= 2) {
      const backoff = 10000 * attempt + Math.floor(Math.random() * 5000);
      console.warn(`⏳ Error fetching ${category}/${interval}: ${e.message}. Retrying in ${backoff}ms (attempt ${attempt}/2)`);
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
    contractAddress: t.id || t.contractAddress || t.address || t.mint || null,
    price: t.usdPrice ?? t.price ?? t.uiPrice ?? t.currentPrice ?? t.priceUsd ?? null,
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
    
    // 🚀 FILTER: Only include tokens with launchpad present
    if (!t.launchpad) {
      console.log(`🚫 Filtering out ${n.symbol} (${n.contractAddress?.substring(0, 8)}) - no launchpad`);
      continue;
    }
    
    // 🎓 FILTER: Only include tokens that have graduated (graduatedAt present)
    if (!n.graduatedAt) {
      console.log(`🚫 Filtering out ${n.symbol} (${n.contractAddress?.substring(0, 8)}) - not graduated`);
      continue;
    }
    
    // 🌱 FILTER: Only include tokens with organic score > 0
    const organicScore = t.organicScore ?? t.organic_score ?? t.organicScoreValue ?? 0;
    console.log(`🔍 Debug ${n.symbol}: organicScore=${t.organicScore}, organic_score=${t.organic_score}, organicScoreValue=${t.organicScoreValue}, final=${organicScore}`);
    
    if (!organicScore || organicScore <= 0) {
      console.log(`🚫 Filtering out ${n.symbol} (${n.contractAddress?.substring(0, 8)}) - no organic score (${organicScore})`);
      continue;
    }
    
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

  // Track specific tokens we're looking for
  const targetTokens = [
    'HyvavV2Cs387fCEHv6CELe7RZ1NnHT8ADSsBZwS3XTML',
    '9SkYDKwdYDF4cRCgKVivBne8u8RoAV9RycsrL69D1s2X',
    'B1NYxvHT9XM11zLRKWykUApLev2a5Uo6sT8ykFKSzDd3',
    '4QTAvmonFdYBsC797WWkQLPr67pfBGy4ia3arnt9SEd1',
    'EMZGT8niJdNcNrSFHXExUrGKvAuVQ2KWi1oyrY4XMnH6'
  ];

  // aggressive jitter 30-90s to avoid backend collisions
  const jitter = 30000 + Math.floor(Math.random() * 60000);
  await sleep(jitter);

  for (let i = 0; i < SEARCHES.length; i++) {
    const s = SEARCHES[i];
    try {
      console.log(`🔍 [${s.key}] Fetching ${s.category}/${s.interval}...`);
      const raw = await fetchJupiterCategory(s.category, s.interval);
      const fetched = Array.isArray(raw) ? raw.length : 0;
      totalFetched += fetched;
      
      // Check if any target tokens are in the raw data
      const foundTargets = raw.filter(t => {
        const addr = t.id || t.contractAddress || t.address || t.mint;
        return targetTokens.includes(addr);
      });
      
      if (foundTargets.length > 0) {
        console.log(`🎯 [${s.key}] FOUND TARGET TOKENS in raw data:`, foundTargets.map(t => ({
          symbol: t.symbol,
          address: t.id || t.contractAddress || t.address || t.mint,
          launchpad: t.launchpad,
          graduatedAt: t.graduatedAt || t.graduated_at,
          organicScore: t.organicScore || t.organic_score || t.organicScoreValue
        })));
      }
      
      const filtered = filterCandidates(raw);
      const candidates = filtered.length;
      totalCandidates += candidates;
      
      // Check if any target tokens made it through filtering
      const filteredTargets = filtered.filter(t => targetTokens.includes(t.contractAddress));
      if (filteredTargets.length > 0) {
        console.log(`🚨 [${s.key}] TARGET TOKENS PASSED FILTERS:`, filteredTargets.map(t => ({
          symbol: t.symbol,
          address: t.contractAddress,
          launchpad: 'N/A (filtered)',
          graduatedAt: t.graduatedAt,
          organicScore: 'N/A (filtered)'
        })));
      }
      
      const deduped = dedupeByAddress(filtered);
      
      // Check if any target tokens made it to final import
      const finalTargets = deduped.filter(t => targetTokens.includes(t.contractAddress));
      if (finalTargets.length > 0) {
        console.log(`🚀 [${s.key}] TARGET TOKENS BEING IMPORTED:`, finalTargets.map(t => ({
          symbol: t.symbol,
          address: t.contractAddress,
          source: 'jup-discovery',
          category: s.category,
          interval: s.interval
        })));
      }
      
      const result = await importToBackend({ source: 'jup-discovery', category: s.category, interval: s.interval, tokens: deduped });
      if (result?.success) {
        const imported = (result.stats?.inserted || 0) + (result.stats?.updated || 0);
        const boosted = (result.stats?.boosted || 0);
        totalImported += imported;
        totalBoosted += boosted;
        console.log(`✅ Imported ${imported} (updated ${result.stats?.updated || 0}), boosted ${boosted} for ${s.key}`);
      } else {
        console.warn(`⚠️ Import failed for ${s.key}:`, result?.error || 'unknown');
      }
    } catch (e) {
      console.error(`❌ Discovery error for ${s.key}:`, e.message);
    }

    // Wait 5 minutes between categories, except after the last one
    if (i < SEARCHES.length - 1) {
      console.log('⏳ Waiting 5 minutes before next category...');
      await sleep(5 * 60 * 1000);
    }
  }

  console.log(`🎯 Discovery cycle completed in ${((Date.now() - startedAt.getTime())/1000).toFixed(1)}s: fetched=${totalFetched}, candidates=${totalCandidates}, imported=${totalImported}, boosted=${totalBoosted}`);
  console.log('⏳ Sleeping 10 minutes before next cycle...');
  await sleep(10 * 60 * 1000);
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


