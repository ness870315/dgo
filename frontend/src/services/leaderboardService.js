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
}

const leaderboardService = new LeaderboardService();
export default leaderboardService;
