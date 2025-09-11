class HypeService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async getHype(contractAddress, range = '7d') {
    if (!contractAddress) return { contract: '', range, data: [] };
    const sessionId = localStorage.getItem('sessionId');
    // Add cache-busting parameter to ensure fresh data
    const cacheBuster = Date.now();
    const url = `${this.API_BASE}/api/tokens/${encodeURIComponent(contractAddress)}/hype?range=${encodeURIComponent(range)}&sessionId=${encodeURIComponent(sessionId || '')}&_t=${cacheBuster}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let payload = {};
      try { payload = JSON.parse(text); } catch (_) {}
      const err = new Error(payload?.message || `HTTP ${res.status}`);
      // @ts-ignore
      err.code = payload?.error || null;
      throw err;
    }
    return await res.json();
  }
}

const hypeService = new HypeService();
export default hypeService;


