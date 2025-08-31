# ngrok Troubleshooting & Alternatives

## 🐛 **ngrok Issues**

If ngrok isn't working, here are solutions:

### **Option 1: Setup ngrok Account (Recommended)**

1. **Sign up**: Visit [ngrok.com](https://ngrok.com) and create a free account
2. **Get auth token**: Copy your auth token from the dashboard
3. **Authenticate**: Run `ngrok config add-authtoken YOUR_TOKEN`
4. **Start tunnel**: `ngrok http 3000`

### **Option 2: Use localtunnel (Alternative)**

Install and use localtunnel instead:
```bash
# Install localtunnel
npm install -g localtunnel

# Create tunnel
lt --port 3000

# You'll get a URL like: https://abc123.loca.lt
```

### **Option 3: Use Cloudflare Tunnel (Free)**

```bash
# Install cloudflared
# Windows: Download from https://github.com/cloudflare/cloudflared/releases

# Create tunnel
cloudflared tunnel --url http://localhost:3000
```

### **Option 4: Manual ngrok Setup**

1. **Download ngrok**: [ngrok.com/download](https://ngrok.com/download)
2. **Extract to folder**: e.g., `C:\ngrok\`
3. **Add to PATH**: Add ngrok folder to Windows PATH
4. **Open new terminal**: Restart terminal
5. **Run**: `ngrok http 3000`

## 🚀 **Quick Test with localtunnel**

Let's try localtunnel as it's simpler:

```bash
# Install
npm install -g localtunnel

# Start tunnel (in new terminal)
lt --port 3000

# You'll see output like:
# your url is: https://abc123.loca.lt
```

## 🔧 **For Twitter OAuth Testing**

Once you have ANY public URL (ngrok, localtunnel, etc.):

1. **Copy the https URL** (e.g., `https://abc123.loca.lt`)
2. **Update Twitter App**:
   - Website URL: `https://abc123.loca.lt`
   - Callback URI: `https://abc123.loca.lt` (not the /auth/callback - backend handles this)
3. **Update your .env**:
   ```
   FRONTEND_URL=https://abc123.loca.lt
   ```
4. **Test**: Visit the public URL in browser
5. **Try Twitter OAuth**: Click "Login with X"

## 💡 **Current Status**

✅ **Demo Authentication**: Works perfectly
✅ **Watchlist**: Fully functional
✅ **All Features**: Ready

🔄 **Next**: Get any public URL for Twitter OAuth testing



