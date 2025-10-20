import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
const INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '21600000', 10); // 6 hours default
const BONDING_INTERVAL_MS = parseInt(process.env.BONDING_INTERVAL_MS || '1800000', 10); // 30 minutes default
const RUN_ON_START = (process.env.DISCOVERY_RUN_ON_START || 'true') === 'true';

const FORCE_LITE_API = (process.env.FORCE_LITE_API || 'true') === 'true';
const JUP_BASE = process.env.JUP_BASE || (FORCE_LITE_API ? 'https://lite-api.jup.ag/tokens/v2' : (JUPITER_API_KEY ? 'https://api.jup.ag/tokens/v2' : 'https://lite-api.jup.ag/tokens/v2'));
const SEARCHES = [
  { key: 'JupTrending6h', category: 'toptrending', interval: '6h' },
  { key: 'JupOrganic6h', category: 'toporganicscore', interval: '6h' },
  { key: 'JupTraded6h', category: 'toptraded', interval: '6h' }
];

const STABLE_SYMBOLS = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
const DISCOVERY_LIMIT = parseInt(process.env.DISCOVERY_LIMIT || '20', 10);
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
      continue;
    }
    
    // 🎓 FILTER: Only include tokens that have graduated (graduatedAt present)
    if (!n.graduatedAt) {
      continue;
    }
    
    // 🌱 FILTER: Only include tokens with organic score > 0
    const organicScore = t.organicScore ?? t.organic_score ?? t.organicScoreValue ?? 0;
    
    if (!organicScore || organicScore <= 0) {
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
    const key = (t.contractAddress || t.address || t.mint || '').toLowerCase();
    if (!key || key.length < 10) continue;
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

// ========================================
// BONDING TOKENS FUNCTIONS
// ========================================

async function fetchBondingTokens() {
  if (!MORALIS_API_KEY) {
    console.warn('⚠️ No MORALIS_API_KEY set; skipping bonding tokens fetch');
    return [];
  }
  
  try {
    console.log('🚨 [BondingTokens] Fetching bonding tokens from Moralis with pagination...');
    
    const allTokens = [];
    let cursor = null;
    let page = 1;
    const maxPages = 5; // Fetch 5 pages (500 tokens total)
    
    while (page <= maxPages) {
      console.log(`📄 [BondingTokens] Fetching page ${page}/${maxPages}...`);
      
      const params = { limit: 100 };
      if (cursor) {
        params.cursor = cursor;
      }
      
      const url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding';
      const response = await axios.get(url, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY
        },
        params,
        timeout: 30000
      });
      
      if (!response.data || !response.data.result) {
        console.log(`❌ [BondingTokens] Page ${page}: No data received`);
        break;
      }
      
      const tokens = response.data.result;
      const nextCursor = response.data.cursor;
      
      console.log(`✅ [BondingTokens] Page ${page}: Received ${tokens.length} tokens`);
      
      // Add tokens to our collection
      allTokens.push(...tokens);
      
      // Check if we have a next cursor
      if (!nextCursor) {
        console.log(`📄 [BondingTokens] No more pages available`);
        break;
      }
      
      cursor = nextCursor;
      page++;
      
      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ [BondingTokens] Fetched ${allTokens.length} bonding tokens from ${page - 1} pages`);
    
    // Deduplicate tokens
    const uniqueTokens = deduplicateTokens(allTokens);
    console.log(`🔄 [BondingTokens] Deduplication: ${allTokens.length} → ${uniqueTokens.length} unique tokens`);
    
    return uniqueTokens;
    
  } catch (error) {
    console.error('❌ [BondingTokens] Error fetching bonding tokens:', error.message);
    return [];
  }
}

function deduplicateTokens(tokens) {
  const seen = new Set();
  const uniqueTokens = [];
  for (const token of tokens) {
    if (!seen.has(token.tokenAddress)) {
      seen.add(token.tokenAddress);
      uniqueTokens.push(token);
    } else {
      console.log(`🔄 [BondingTokens] Duplicate token removed: ${token.symbol} (${token.tokenAddress.substring(0, 8)}...)`);
    }
  }
  return uniqueTokens;
}

async function saveBondingTokensToCache(tokens) {
  try {
    const dataDir = '/var/data';
    const cacheFile = path.join(dataDir, 'PreBonded-cache.json');
    
    // Ensure data directory exists
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Process tokens with graduation proximity
    const processedTokens = tokens.map(token => ({
      ...token,
      graduationProximity: calculateGraduationProximity(token.bondingCurveProgress)
    }));
    
    const cacheData = {
      timestamp: new Date().toISOString(),
      tokens: processedTokens,
      count: processedTokens.length
    };
    
    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`💾 [BondingTokens] Saved ${processedTokens.length} tokens to ${cacheFile}`);
    
    // Also send to backend
    await importBondingTokensToBackend(processedTokens);
    
    return true;
  } catch (error) {
    console.error('❌ [BondingTokens] Error saving cache:', error.message);
    return false;
  }
}

function calculateGraduationProximity(progress) {
  const progressNum = parseFloat(progress) || 0;
  
  if (progressNum >= 95) return 'IMMINENT_GRADUATION';
  if (progressNum >= 85) return 'VERY_CLOSE_TO_GRADUATION';
  if (progressNum >= 70) return 'CLOSE_TO_GRADUATION';
  if (progressNum >= 50) return 'APPROACHING_GRADUATION';
  return 'FAR_FROM_GRADUATION';
}

async function importBondingTokensToBackend(tokens) {
  if (!INTERNAL_TOKEN) {
    console.warn('⚠️ [BondingTokens] No INTERNAL_TOKEN set; skipping backend import');
    return { success: false, error: 'No token' };
  }
  
  try {
    const url = `${API_BASE}/api/internal/bonding-tokens/import`;
    const res = await axios.post(url, { tokens }, {
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      timeout: 20000
    });
    
    console.log(`✅ [BondingTokens] Imported ${tokens.length} tokens to backend`);
    return res.data;
  } catch (error) {
    console.error('❌ [BondingTokens] Error importing to backend:', error.message);
    return { success: false, error: error.message };
  }
}

async function checkForGraduatedTokens() {
  try {
    console.log('🎓 [Graduation] Checking for graduated tokens...');
    
    // Read current bonding tokens
    const cacheFile = '/var/data/PreBonded-cache.json';
    
    try {
      const cacheData = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      
      if (!cacheData.tokens || !Array.isArray(cacheData.tokens)) {
        console.log('🎓 [Graduation] No bonding tokens to check');
        return;
      }
      
      const graduatedTokens = [];
      const remainingTokens = [];
      
      // Check each token for graduation (100% progress)
      for (const token of cacheData.tokens) {
        const progress = parseFloat(token.bondingCurveProgress) || 0;
        
        if (progress >= 100) {
          // Token graduated - prepare for migration
          graduatedTokens.push({
            ...token,
            graduationDate: new Date().toISOString(),
            migratedFrom: 'bonding-curve',
            originalProgress: progress
          });
          console.log(`🎓 [Graduation] Token ${token.symbol} (${token.tokenAddress}) graduated at ${progress}%`);
        } else {
          remainingTokens.push(token);
        }
      }
      
      if (graduatedTokens.length > 0) {
        console.log(`🎓 [Graduation] Found ${graduatedTokens.length} graduated tokens`);
        
        // Migrate graduated tokens to main token cache
        const migratedTokens = await migrateGraduatedTokens(graduatedTokens);
        
        // Update bonding cache with remaining tokens
        await updateBondingCache(remainingTokens);
        
        // Notify backend to update its cache and send migrated token data
        await notifyBackendOfGraduations(graduatedTokens, migratedTokens);
        
        console.log(`✅ [Graduation] Migration completed: ${graduatedTokens.length} tokens graduated`);
      } else {
        console.log('🎓 [Graduation] No tokens ready for graduation');
      }
      
    } catch (fileError) {
      console.log('🎓 [Graduation] No bonding cache file found yet');
    }
    
  } catch (error) {
    console.error('❌ [Graduation] Error checking for graduated tokens:', error.message);
  }
}

async function migrateGraduatedTokens(graduatedTokens) {
  try {
    console.log(`🔄 [Migration] Migrating ${graduatedTokens.length} graduated tokens to main cache...`);
    
    // Read main token cache
    const tokenCacheFile = '/var/data/dgo/cache/tokens-cache.json';
    
    let tokenCacheData;
    try {
      tokenCacheData = JSON.parse(await fs.readFile(tokenCacheFile, 'utf8'));
    } catch (fileError) {
      // Create new cache if it doesn't exist
      tokenCacheData = {
        tokens: [],
        lastUpdated: new Date().toISOString(),
        migratedTokens: 0
      };
    }
    
    // Transform bonding token to normal token format
    const migratedTokens = graduatedTokens.map(token => ({
      contractAddress: token.tokenAddress,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      decimals: token.decimals,
      priceUsd: token.priceUsd,
      priceNative: token.priceNative,
      marketCap: token.fullyDilutedValuation,
      volume24h: token.liquidity,
      // Add graduation metadata
      graduationDate: token.graduationDate,
      migratedFrom: token.migratedFrom,
      originalProgress: token.originalProgress,
      // Add normal token fields
      score: 9.0, // High score for graduated tokens
      priceChange24h: 0,
      twitter: null,
      website: null,
      telegram: null,
      discord: null,
      // Add timestamp
      lastUpdated: new Date().toISOString()
    }));
    
    // Atomic write: Add migrated tokens to main cache
    const updatedTokenCache = {
      ...tokenCacheData,
      tokens: [...tokenCacheData.tokens, ...migratedTokens],
      lastUpdated: new Date().toISOString(),
      migratedTokens: (tokenCacheData.migratedTokens || 0) + migratedTokens.length
    };
    
    await fs.writeFile(tokenCacheFile, JSON.stringify(updatedTokenCache, null, 2));
    console.log(`✅ [Migration] Migrated ${migratedTokens.length} tokens to main cache`);
    
    return migratedTokens;
    
  } catch (error) {
    console.error('❌ [Migration] Error migrating graduated tokens:', error.message);
    return [];
  }
}

async function updateBondingCache(remainingTokens) {
  try {
    console.log(`🔄 [Bonding Cache] Updating with ${remainingTokens.length} remaining tokens...`);
    
    // Update Jupiter Service cache
    const cacheFile = '/var/data/PreBonded-cache.json';
    const updatedCache = {
      timestamp: new Date().toISOString(),
      tokens: remainingTokens,
      count: remainingTokens.length,
      graduatedCount: 0 // Reset counter
    };
    
    await fs.writeFile(cacheFile, JSON.stringify(updatedCache, null, 2));
    console.log(`✅ [Bonding Cache] Updated: ${remainingTokens.length} tokens remaining`);
    
  } catch (error) {
    console.error('❌ [Bonding Cache] Error updating bonding cache:', error.message);
  }
}

async function notifyBackendOfGraduations(graduatedTokens, migratedTokens = []) {
  if (!INTERNAL_TOKEN) {
    console.warn('⚠️ [Backend Notification] No INTERNAL_TOKEN set; skipping backend notification');
    return { success: false, error: 'No token' };
  }
  
  try {
    const url = `${API_BASE}/api/internal/bonding-tokens/graduated`;
    const response = await axios.post(url, { 
      graduatedTokens: graduatedTokens.map(t => t.tokenAddress),
      migratedTokens: migratedTokens // Send the migrated token data
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      timeout: 20000
    });
    
    console.log(`📡 [Backend Notification] Notified backend of ${graduatedTokens.length} graduated tokens with ${migratedTokens.length} migrated tokens`);
    return response.data;
  } catch (error) {
    console.error('❌ [Backend Notification] Error notifying backend:', error.message);
    return { success: false, error: error.message };
  }
}

async function runBondingTokensDiscovery() {
  try {
    console.log('🚨 [BondingTokens] Starting bonding tokens discovery...');
    
    const tokens = await fetchBondingTokens();
    if (tokens.length > 0) {
      await saveBondingTokensToCache(tokens);
      console.log(`✅ [BondingTokens] Discovery completed: ${tokens.length} tokens cached`);
    } else {
      console.log('⚠️ [BondingTokens] No tokens fetched');
    }
    
  } catch (error) {
    console.error('❌ [BondingTokens] Discovery failed:', error.message);
  }
}

async function runOnce() {
  const startedAt = new Date();
  let totalFetched = 0;
  let totalCandidates = 0;
  let totalImported = 0;
  let totalBoosted = 0;
  
  // Cross-category deduplication to prevent same token from multiple categories
  const globalSeenTokens = new Set();

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
      
      console.log(`📊 [${s.key}] Raw tokens fetched: ${fetched}`);
      
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
      console.log(`📊 [${s.key}] After deduplication: ${deduped.length} tokens`);
      
      // Cross-category deduplication: filter out tokens already seen in this run
      const crossCategoryFiltered = deduped.filter(t => {
        const key = (t.contractAddress || t.address || t.mint || '').toLowerCase();
        if (globalSeenTokens.has(key)) {
          console.log(`🔄 [${s.key}] Skipping duplicate token across categories: ${t.symbol} (${key})`);
          return false;
        }
        globalSeenTokens.add(key);
        return true;
      });
      
      console.log(`📊 [${s.key}] After cross-category deduplication: ${crossCategoryFiltered.length} tokens`);
      
      // Check if any target tokens made it to final import
      const finalTargets = crossCategoryFiltered.filter(t => targetTokens.includes(t.contractAddress));
      if (finalTargets.length > 0) {
        console.log(`🚀 [${s.key}] TARGET TOKENS BEING IMPORTED:`, finalTargets.map(t => ({
          symbol: t.symbol,
          address: t.contractAddress,
          source: 'jup-discovery',
          category: s.category,
          interval: s.interval
        })));
      }
      
      const result = await importToBackend({ source: 'jup-discovery', category: s.category, interval: s.interval, tokens: crossCategoryFiltered });
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

    // Wait 15 minutes between categories, except after the last one
    if (i < SEARCHES.length - 1) {
      console.log('⏳ Waiting 15 minutes before next category...');
      await sleep(15 * 60 * 1000);
    }
  }

  console.log(`🎯 Discovery cycle completed in ${((Date.now() - startedAt.getTime())/1000).toFixed(1)}s: fetched=${totalFetched}, candidates=${totalCandidates}, imported=${totalImported}, boosted=${totalBoosted}`);
  console.log('⏳ Sleeping 6 hours before next cycle...');
  await sleep(6 * 60 * 60 * 1000);
}

async function main() {
  console.log('🚀 Jupiter Discovery Service starting...');
  console.log('   API_BASE =', API_BASE);
  console.log('   INTERVAL_MS =', INTERVAL_MS);
  console.log('   BONDING_INTERVAL_MS =', BONDING_INTERVAL_MS);
  console.log('   RUN_ON_START =', RUN_ON_START);
  console.log('   MORALIS_API_KEY =', MORALIS_API_KEY ? 'SET' : 'NOT SET');
  
  if (RUN_ON_START) {
    // Run all discoveries independently
    runOnce().catch(error => {
      console.error('❌ [Jupiter Discovery] Failed:', error.message);
    });
    
    runBondingTokensDiscovery().catch(error => {
      console.error('❌ [Bonding Discovery] Failed:', error.message);
    });
    
    checkForGraduatedTokens().catch(error => {
      console.error('❌ [Graduation Check] Failed:', error.message);
    });
  }
  
  // Schedule Jupiter token discovery (every 6 hours)
  setInterval(runOnce, INTERVAL_MS);
  
  // Schedule bonding tokens discovery (every 30 minutes)
  setInterval(runBondingTokensDiscovery, BONDING_INTERVAL_MS);
  
  // Schedule graduation check (every 10 minutes)
  setInterval(checkForGraduatedTokens, 10 * 60 * 1000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


