class HypeService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async getHype(contractAddress, range = '7d') {
    if (!contractAddress) return { contract: '', range, data: [] };
    const url = `${this.API_BASE}/api/tokens/${encodeURIComponent(contractAddress)}/hype?range=${encodeURIComponent(range)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
}

const hypeService = new HypeService();
export default hypeService;


