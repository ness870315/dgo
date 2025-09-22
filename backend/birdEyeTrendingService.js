import axios from 'axios';

class BirdEyeTrendingService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.BIRDEYE_API_KEY || 'bb3dfe3ae4554c3bb6fdd4a90da899fe';
    this.baseUrl = 'https://public-api.birdeye.so/defi/token_trending';
    this.defaultParams = {
      sort_by: 'volume24hUSD',
      sort_type: 'desc',
      offset: 0,
      limit: 20,
      ui_amount_mode: 'scaled'
    };
    // Exclude base tokens/stables per request
    this.exclusionSymbols = new Set(['JUP', 'WSOL', 'JLP', 'JupSOL']);
  }

  async fetchTrending(params = {}) {
    const query = { ...this.defaultParams, ...params };

    try {
      const response = await axios.get(this.baseUrl, {
        params: query,
        headers: {
          accept: 'application/json',
          'x-chain': 'solana',
          'X-API-KEY': this.apiKey
        },
        timeout: 15000
      });

      const body = response?.data;
      const rawData = body?.data !== undefined ? body.data : body;
      let items = [];
      if (Array.isArray(rawData)) {
        items = rawData;
      } else if (Array.isArray(rawData?.items)) {
        items = rawData.items;
      } else if (Array.isArray(body?.items)) {
        items = body.items;
      } else if (Array.isArray(body)) {
        items = body;
      } else if (Array.isArray(rawData?.tokens)) {
        items = rawData.tokens;
      }

      console.log(`[BirdEyeTrending] HTTP ${response.status} • items=${items.length} • keys=${Object.keys(body || {}).join(',')}`);
      if (items.length === 0) {
        console.log('[BirdEyeTrending] Debug body snippet:', JSON.stringify(body)?.slice(0, 400));
      }

      // Map and filter
      const mapped = items
        .map(item => this.mapBirdEyeItemToToken(item))
        .filter(token => token && token.contractAddress)
        .filter(token => !this.exclusionSymbols.has((token.symbol || '').toUpperCase()));

      return mapped;
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data || error?.message;
      console.error(`[BirdEyeTrending] Error (${status || 'no-status'}):`, msg);
      return [];
    }
  }

  mapBirdEyeItemToToken(item) {
    if (!item) return null;
    const symbol = (item.symbol || item.baseSymbol || '').toUpperCase();
    const name = item.name || item.baseName || symbol || 'Unknown';
    const contractAddress = item.address || item.mint || item.baseAddress || item.baseMint || '';
    const price = item.usdPrice || item.price || item.priceUsd || 0;
    const marketCap = item.mcap || item.marketCap || item.fdv || 0;
    const volume24h = item.volume24hUSD || item.v24hUSD || item.v24h || 0;

    return {
      symbol,
      name,
      contractAddress,
      currentPrice: price,
      price,
      marketCap,
      volume24h,
      source: 'birdeye',
      stage: 'birdeye_trending',
      birdEyeRaw: item
    };
  }
}

export default BirdEyeTrendingService;


