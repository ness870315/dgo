class KolCallsService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async addCall(token) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/user/kol-calls/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, token })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async getCalls() {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/user/kol-calls?sessionId=${encodeURIComponent(sessionId || '')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
}

const kolCallsService = new KolCallsService();
export default kolCallsService;


