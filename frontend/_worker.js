// Cloudflare Workers with Assets - Custom routing for fuel sharing
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle /fuel/:fuelType/:symbol routes
    const fuelMatch = url.pathname.match(/^\/fuel\/([^/]+)\/([^/]+)\/?$/);
    
    if (fuelMatch) {
      const fuelType = fuelMatch[1];
      const symbol = fuelMatch[2];
      const imageUrl = `https://api.degen-oracle.com/api/fuel-image/${fuelType}/${symbol}`;
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 ${symbol} ${fuelType} Fuel - Degen Oracle</title>
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://degen-oracle.com/fuel/${fuelType}/${symbol}">
    <meta property="og:title" content="🔥 ${symbol} ${fuelType} Fuel - Degen Oracle">
    <meta property="og:description" content="Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle! The degen army is assembling! 🚀">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:alt" content="${symbol} ${fuelType} Fuel Image">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@dgnoracle">
    <meta name="twitter:creator" content="@dgnoracle">
    <meta name="twitter:url" content="https://degen-oracle.com/fuel/${fuelType}/${symbol}">
    <meta name="twitter:title" content="🔥 ${symbol} ${fuelType} Fuel - Degen Oracle">
    <meta name="twitter:description" content="Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle! The degen army is assembling! 🚀">
    <meta name="twitter:image" content="${imageUrl}">
    <meta name="twitter:image:alt" content="${symbol} ${fuelType} Fuel Image">
    <meta name="twitter:domain" content="degen-oracle.com">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            color: #333;
        }
        .fuel-image {
            max-width: 100%;
            height: auto;
            border-radius: 15px;
            margin: 20px 0;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 18px;
            margin-bottom: 30px;
        }
        .cta-button {
            background: linear-gradient(45deg, #ff6b6b, #ffa500);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 18px;
            font-weight: bold;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔥 ${symbol} ${fuelType} Fuel</h1>
        <p class="subtitle">Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle!</p>
        <img src="${imageUrl}" alt="${symbol} ${fuelType} Fuel" class="fuel-image" onerror="this.style.display='none'">
        <p>The degen army is assembling! 🚀</p>
        <a href="https://degen-oracle.com" class="cta-button">Join the Oracle</a>
    </div>
    
    <script>
        // Redirect users to main site after a short delay
        setTimeout(function() {
            window.location.href = 'https://degen-oracle.com';
        }, 2000);
    </script>
</body>
</html>`;

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Handle SPA routing - serve index.html for all non-asset routes
    if (url.pathname.startsWith('/static/') || url.pathname.includes('.')) {
      // Serve static assets normally
      return env.ASSETS.fetch(request);
    } else {
      // For all other routes (including /staking), serve the main index.html
      // This allows React Router to handle client-side routing
      try {
        const indexUrl = new URL('/', url.origin);
        const indexRequest = new Request(indexUrl.toString());
        return await env.ASSETS.fetch(indexRequest);
      } catch (error) {
        // Fallback: serve the original request
        return env.ASSETS.fetch(request);
      }
    }
  }
};

