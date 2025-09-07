import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Rettiwt-API
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use CJS require to ensure proper class exports under Node 18
const { Rettiwt, RettiwtConfig, SortBy, SortOrder } = require('rettiwt-api');

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
    if (typeof RettiwtConfig === 'function') {
      const config = new RettiwtConfig({ apiKey: RETTIWT_API_KEY || undefined });
      rettiwt = new Rettiwt(config);
    } else {
      // Fallback: some builds expose constructors that accept plain objects
      rettiwt = new Rettiwt({ apiKey: RETTIWT_API_KEY || undefined });
    }
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

    const filter = {
      words: q && !String(q).startsWith('#') ? [String(q)] : [],
      hashtags: q && String(q).startsWith('#') ? [String(q).slice(1)] : []
    };

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

    const filter = { hashtags: [q.slice(1)] };
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


