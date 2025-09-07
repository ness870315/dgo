import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Rettiwt-API
import RettiwtApiPkg from 'rettiwt-api';
const { Rettiwt, RettiwtConfig, SearchFilter, SortBy, SortOrder } = RettiwtApiPkg;

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const PORT = process.env.PORT || 8001; // distinct from twitter-service default

// Config: API key optional; can operate in guest mode, but key improves reliability
const RETTIWT_API_KEY = process.env.RETTIWT_API_KEY || process.env.RETTIWT_KEY || '';

let rettiwt;
function initRettiwt() {
  try {
    const config = new RettiwtConfig({ apiKey: RETTIWT_API_KEY || undefined });
    rettiwt = new Rettiwt(config);
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize Rettiwt:', err?.message || err);
    return false;
  }
}

const ok = initRettiwt();

app.get('/health', (req, res) => {
  res.json({
    ok,
    service: 'retwiit-service',
    version: '0.1.0',
    mode: RETTIWT_API_KEY ? 'user' : 'guest'
  });
});

// Minimal endpoints used by backend for testing
// 1) Search tweets by hashtag or query term
app.get('/api/search', async (req, res) => {
  try {
    const { q = '', limit = '20' } = req.query;
    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));

    const filter = new SearchFilter({
      words: q ? [String(q)] : [],
      hashtags: q && String(q).startsWith('#') ? [String(q).slice(1)] : []
    });

    const tweets = await rettiwt.tweet.search(filter, {
      limit: lim,
      sortBy: SortBy.TOP,
      sortOrder: SortOrder.DESC
    });

    // Ensure serializable
    const data = Array.isArray(tweets) ? tweets.map(t => (typeof t?.toJSON === 'function' ? t.toJSON() : t)) : [];
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 2) Get user details by username
app.get('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await rettiwt.user.detailsByUsername(username);
    const data = typeof user?.toJSON === 'function' ? user.toJSON() : user;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 3) Simple mentions helper: search by symbol -> returns count only
app.get('/api/mentions', async (req, res) => {
  try {
    const { symbol = '' } = req.query;
    const q = symbol ? `#${String(symbol).toUpperCase()}` : '';
    if (!q) return res.json({ success: true, count: 0, data: [] });

    const filter = new SearchFilter({ hashtags: [q.slice(1)] });
    const tweets = await rettiwt.tweet.search(filter, { limit: 20, sortBy: SortBy.LATEST, sortOrder: SortOrder.DESC });
    const data = Array.isArray(tweets) ? tweets.map(t => (typeof t?.toJSON === 'function' ? t.toJSON() : t)) : [];
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 retwiit-service listening on port ${PORT} (mode=${RETTIWT_API_KEY ? 'user' : 'guest'})`);
});


