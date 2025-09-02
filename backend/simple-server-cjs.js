const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration for production
const corsOptions = {
  origin: [
    'https://dgo-20l.pages.dev',
    'https://degen-oracle.com',
    'https://www.degen-oracle.com',
    'http://localhost:3000', // for development
    'http://localhost:4000'  // for development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(require('cors')(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', require('cors')(corsOptions));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Simple health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get tokens endpoint
app.get('/api/tokens', async (req, res) => {
  try {
    const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');

    try {
      const data = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(data);

      // Filter only completed tokens
      const completedTokens = tokens.filter(t => t.stage === 'completed');

      console.log(`✅ Returning ${completedTokens.length} tokens`);
      res.json(completedTokens);

    } catch (cacheError) {
      console.log('⚠️ No cache file found');
      res.json([]);
    }

  } catch (error) {
    console.error('❌ Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// Update socials endpoint (mock)
app.post('/api/tokens/update-socials', async (req, res) => {
  try {
    const { symbol, socials } = req.body;

    console.log('📱 Updating socials for:', symbol, socials);

    // Mock response
    res.json({
      success: true,
      message: `Social links updated for ${symbol}`,
      communityScoreImpact: {
        description: 'Social links updated successfully'
      }
    });

  } catch (error) {
    console.error('❌ Error updating socials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update social links'
    });
  }
});

// Get socials endpoint (mock)
app.get('/api/tokens/:symbol/socials', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Mock response
    res.json({
      success: true,
      socials: {
        twitter: '',
        discord: '',
        instagram: '',
        tiktok: '',
        website: ''
      }
    });

  } catch (error) {
    console.error('❌ Error getting socials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get social links'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API: http://localhost:${PORT}/api/tokens`);
});
