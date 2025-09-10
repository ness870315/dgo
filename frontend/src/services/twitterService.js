class TwitterService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  // Get auth headers
  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // Get Twitter posting status
  async getTwitterPostingStatus() {
    try {
      const sessionId = localStorage.getItem('sessionId');
      console.log('Getting Twitter posting status:', { sessionId: !!sessionId });
      
      const response = await fetch(`${this.API_BASE}/api/user/twitter-posting?sessionId=${encodeURIComponent(sessionId || '')}`, {
        headers: this.getAuthHeaders()
      });

      console.log('Twitter posting status response:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Twitter posting status error:', errorText);
        throw new Error(`Failed to fetch Twitter posting status: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Twitter posting status result:', result);
      return result.twitterPostingEnabled || false;
    } catch (error) {
      console.error('Error fetching Twitter posting status:', error);
      return false;
    }
  }

  // Set Twitter posting preference
  async setTwitterPostingEnabled(enabled) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      console.log('Setting Twitter posting preference:', { enabled, sessionId: !!sessionId });
      
      const response = await fetch(`${this.API_BASE}/api/user/twitter-posting`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId, enabled })
      });

      console.log('Twitter posting response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Twitter posting error response:', errorText);
        throw new Error(`Failed to update Twitter posting preference: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Twitter posting success:', result);
      return result.success;
    } catch (error) {
      console.error('Error setting Twitter posting preference:', error);
      throw error;
    }
  }

  // Share a call manually
  async shareCall(callId) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${this.API_BASE}/api/user/kol-calls/${callId}/share`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to share call');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error sharing call:', error);
      throw error;
    }
  }
}

const twitterService = new TwitterService();
export default twitterService;