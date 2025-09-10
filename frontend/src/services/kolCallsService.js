class KolCallsService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async addCall(token) {
    const sessionId = localStorage.getItem('sessionId');
    console.log('🌐 kolCallsService: Making API call to add call', {
      sessionId: !!sessionId,
      token: token?.token?.symbol,
      thesis: token?.thesis?.substring(0, 50) + '...',
      twitterEnabled: token?.twitterEnabled,
      tone: token?.tone
    });
    
    const res = await fetch(`${this.API_BASE}/api/user/kol-calls/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, token })
    });
    
    console.log('🌐 kolCallsService: API response status:', res.status);
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('🌐 kolCallsService: API error response:', text);
      let payload = {};
      try { payload = JSON.parse(text); } catch (_) {}
      const err = new Error(payload?.message || `HTTP ${res.status}`);
      // attach code for client logic
      // @ts-ignore
      err.code = payload?.error || null;
      throw err;
    }
    
    const result = await res.json();
    console.log('🌐 kolCallsService: API success response:', result);
    return result;
  }

  async getCalls() {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/user/kol-calls?sessionId=${encodeURIComponent(sessionId || '')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async deleteCall(id) {
    const sessionId = localStorage.getItem('sessionId');
    const res = await fetch(`${this.API_BASE}/api/user/kol-calls/${encodeURIComponent(id)}?sessionId=${encodeURIComponent(sessionId || '')}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
}

const kolCallsService = new KolCallsService();
export default kolCallsService;


