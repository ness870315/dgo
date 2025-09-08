class LeaderboardService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async getLeaderboard() {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/leaderboard?sessionId=${encodeURIComponent(sessionId || '')}`);
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

  async getUserProfile(userId) {
    const res = await fetch(`${this.API_BASE}/api/kol/${encodeURIComponent(userId)}/profile`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async getUserStats(userId) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/kol/${encodeURIComponent(userId)}/stats?sessionId=${encodeURIComponent(sessionId || '')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async getUserCalls(userId) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/kol/${encodeURIComponent(userId)}/calls?sessionId=${encodeURIComponent(sessionId || '')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async follow(userId) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/kol/${encodeURIComponent(userId)}/follow`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async unfollow(userId) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/kol/${encodeURIComponent(userId)}/follow?sessionId=${encodeURIComponent(sessionId || '')}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async getMonthlyWinners(month, limit = 3) {
    const sessionId = localStorage.getItem('sessionId');
    const params = new URLSearchParams({ sessionId: sessionId || '' });
    if (month) params.set('month', month);
    if (limit) params.set('limit', String(limit));
    const res = await fetch(`${this.API_BASE}/api/leaderboard/winners?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
}

const leaderboardService = new LeaderboardService();
export default leaderboardService;
