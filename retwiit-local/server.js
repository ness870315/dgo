import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Rettiwt, RettiwtConfig } = require('rettiwt-api');

dotenv.config();

const PORT = process.env.PORT || 8001;
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

const key = process.env.RETTIWT_API_KEY || '';
const cfg = typeof RettiwtConfig === 'function' ? new RettiwtConfig({ apiKey: key || undefined }) : { apiKey: key || undefined };
const rt = new Rettiwt(cfg);

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: key ? 'user' : 'guest' });
});

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10) || 10, 20));
    const filter = { words: q && !q.startsWith('#') ? [q] : [], hashtags: q.startsWith('#') ? [q.slice(1)] : [] };
    const tweets = await rt.tweet.search(filter, { limit });
    const data = Array.isArray(tweets) ? tweets.map(t => (t?.toJSON ? t.toJSON() : t)) : [];
    res.json({ success: true, count: data.length, data });
  } catch (e) {
    // Handle common Twitter API errors gracefully
    if (e?.message?.includes('400') || e?.message?.includes('404') || e?.message?.includes('Not authorized')) {
      res.json({ success: true, count: 0, data: [], note: 'No results (API limitation)' });
    } else {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  }
});

app.get('/api/mentions', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.json({ success: true, count: 0, data: [] });
    const filter = { hashtags: [symbol] };
    const tweets = await rt.tweet.search(filter, { limit: 20 });
    const data = Array.isArray(tweets) ? tweets.map(t => (t?.toJSON ? t.toJSON() : t)) : [];
    res.json({ success: true, count: data.length, data });
  } catch (e) {
    // Handle common Twitter API errors gracefully
    if (e?.message?.includes('400') || e?.message?.includes('404') || e?.message?.includes('Not authorized')) {
      res.json({ success: true, count: 0, data: [], note: 'No results (API limitation)' });
    } else {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  }
});

app.listen(PORT, () => console.log(`retwiit-local on http://localhost:${PORT} (mode=${key ? 'user' : 'guest'})`));


