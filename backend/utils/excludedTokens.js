/**
 * Centralized Exclusion List for Stablecoins, LSTs, and Major Tokens
 * 
 * Single source of truth used by:
 * - gRPCTrendingService
 * - EnhancedBackend
 * - DexScreenerStyleMonitor
 * - TrendingTokensAIAnalysisService
 * - Any service that needs to filter out non-meme tokens
 */

// Stablecoins
export const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',  // USDS
  '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG',  // USX
  'DAIeZdVsGFsyUV1cayFRtddjqN95FLCJzQ2hXaRxbk8',  // DAI
  'TUSD3cN9kNpqGxmqfQjjKmLnXvHLfPJMVJTSBLMJJz',  // TUSD
  'FRAXBPxGEsseGEauMw1eR4rWmS7XqxNL3UJJPxPNKwfq',  // FRAX
  'PYUSDyFDdYjTdYvJuZvqkXqbhQJPUhGwxLAKPRBYhkQ',  // PYUSD
]);

// Liquid Staking Tokens (LSTs)
export const LST_TOKENS = new Set([
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',   // mSOL (Marinade)
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',   // bSOL (BlazeStake)
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A',  // hSOL (Helius)
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // Bonk (actually bonkSOL)
  'BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85',  // BNSOL (Binance Staked SOL)
  'vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7', // vSOL (Socean)
  'st8QujHLPsX3d6HG9uQg9kJ91jFxUgruwsb1hyYXSNd',  // stSOL (Lido)
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL (Lido)
  'LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp',  // LST (Liquid Staking Token)
  'picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX',  // picoSOL
  'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL',  // pSOL
  'BBsoLmSQmyMXL8qPc3LnDFxjBHNDmxb3vbLGYqU4YnXs', // BBsol (Blaze)
]);

// Major wrapped tokens
export const WRAPPED_TOKENS = new Set([
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'WETH9xN9VXqVxJ4Yy9VKqKqHvVqQqZqZqZqZqZqZqZ', // WETH (example)
  'WBTC9xN9VXqVxJ4Yy9VKqKqHvVqQqZqZqZqZqZqZqZ', // WBTC (example)
]);

// Known scam/rug tokens
export const SCAM_TOKENS = new Set([
  'EX8AQmPLGAKuJ1HGaDCu5ZwyPQK1xn8Y9REMN8soyvEs', // TeslaAI (scam)
  'BAZ2uNKcANstKoqSzzbMd89eDVhLRKdFdQAZsPdwUQ4Q', // Scam token
  'EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR', // TRUMPET (scam)
]);

// Banned symbols (case-insensitive)
export const BANNED_SYMBOLS = new Set([
  'WETH', 'WBTC', 'ETH', 'BTC', 'SOL', 
  'USDC', 'USDT', 'DAI', 'TUSD', 'FRAX', 'PYUSD',
  'USDS', 'USX',
  'MSOL', 'BSOL', 'JITOSOL', 'HSOL', 'BNSOL', 'VSOL', 'STSOL', 'PICOSOL', 'PSOL', 'BBSOL',
  'WBNB', 'WBCH', 'WAVAX'
]);

// Banned name fragments (case-insensitive)
export const BANNED_NAME_FRAGMENTS = [
  'STABLE',
  'STABLECOIN', 
  'WRAPPED ETH', 
  'WRAPPED BTC',
  'LIQUID STAKING',
  'STAKED SOL',
  'STAKED SOLANA'
];

/**
 * Combined set of all excluded contract addresses
 */
export const ALL_EXCLUDED_ADDRESSES = new Set([
  ...STABLECOINS,
  ...LST_TOKENS,
  ...WRAPPED_TOKENS,
  ...SCAM_TOKENS
]);

/**
 * Check if a token should be excluded
 * @param {Object} token - Token object with contractAddress, symbol, name
 * @returns {boolean} - True if token should be excluded
 */
export function isExcludedToken(token) {
  try {
    const contractAddress = token?.contractAddress || token?.mint || token?.id || '';
    const symbolRaw = token?.symbol || token?.jupiterData?.symbol || '';
    const nameRaw = token?.name || token?.jupiterData?.name || '';
    
    const symbol = symbolRaw.toString().trim().toUpperCase();
    const name = nameRaw.toString().trim().toUpperCase();
    
    // Check contract address
    if (ALL_EXCLUDED_ADDRESSES.has(contractAddress)) {
      return true;
    }
    
    // Check symbol
    if (BANNED_SYMBOLS.has(symbol)) {
      return true;
    }
    
    // Check name fragments
    const searchText = `${symbol} ${name}`;
    if (BANNED_NAME_FRAGMENTS.some(fragment => searchText.includes(fragment))) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking excluded token:', error.message);
    return false;
  }
}

/**
 * Filter out excluded tokens from an array
 * @param {Array} tokens - Array of token objects
 * @returns {Array} - Filtered array without excluded tokens
 */
export function filterExcludedTokens(tokens) {
  return tokens.filter(token => !isExcludedToken(token));
}

/**
 * Get exclusion reason for a token (for debugging)
 * @param {Object} token - Token object
 * @returns {string|null} - Reason for exclusion or null if not excluded
 */
export function getExclusionReason(token) {
  try {
    const contractAddress = token?.contractAddress || token?.mint || token?.id || '';
    const symbolRaw = token?.symbol || token?.jupiterData?.symbol || '';
    const nameRaw = token?.name || token?.jupiterData?.name || '';
    
    const symbol = symbolRaw.toString().trim().toUpperCase();
    const name = nameRaw.toString().trim().toUpperCase();
    
    // Check each category
    if (STABLECOINS.has(contractAddress)) return 'Stablecoin';
    if (LST_TOKENS.has(contractAddress)) return 'Liquid Staking Token';
    if (WRAPPED_TOKENS.has(contractAddress)) return 'Wrapped Token';
    if (SCAM_TOKENS.has(contractAddress)) return 'Known Scam';
    if (BANNED_SYMBOLS.has(symbol)) return `Banned Symbol: ${symbol}`;
    
    const searchText = `${symbol} ${name}`;
    const matchedFragment = BANNED_NAME_FRAGMENTS.find(fragment => searchText.includes(fragment));
    if (matchedFragment) return `Banned Name Fragment: ${matchedFragment}`;
    
    return null;
  } catch (error) {
    return null;
  }
}

export default {
  STABLECOINS,
  LST_TOKENS,
  WRAPPED_TOKENS,
  SCAM_TOKENS,
  BANNED_SYMBOLS,
  BANNED_NAME_FRAGMENTS,
  ALL_EXCLUDED_ADDRESSES,
  isExcludedToken,
  filterExcludedTokens,
  getExclusionReason
};

