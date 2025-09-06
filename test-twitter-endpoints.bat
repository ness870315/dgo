@echo off
REM Twitter Endpoints Test Script (Batch)
REM Tests the Twitter search endpoints to troubleshoot functionality

echo 🚀 Twitter Endpoints Test Suite
echo ================================

set BASE_URL=https://api.degen-oracle.com

echo.
echo 🧪 Testing Main Backend Health...
echo URL: %BASE_URL%/health
curl -s "%BASE_URL%/health" | findstr /v "^{" >nul 2>&1 && echo ✅ Backend is responding || echo ❌ Backend not responding

echo.
echo 🧪 Testing Twitter Search - Bitcoin...
echo URL: %BASE_URL%/api/twitter/search?q=bitcoin^&count=3
curl -s "%BASE_URL%/api/twitter/search?q=bitcoin&count=3" | jq .success 2>nul && echo ✅ Search endpoint working || echo ❌ Search endpoint failed

echo.
echo 🧪 Testing Twitter Search - Crypto...
echo URL: %BASE_URL%/api/twitter/search?q=crypto^&count=2
curl -s "%BASE_URL%/api/twitter/search?q=crypto&count=2" | jq .success 2>nul && echo ✅ Search endpoint working || echo ❌ Search endpoint failed

echo.
echo 🧪 Testing Twitter User Tweets...
echo URL: %BASE_URL%/api/twitter/user/elonmusk/tweets?count=2
curl -s "%BASE_URL%/api/twitter/user/elonmusk/tweets?count=2" | jq .success 2>nul && echo ✅ User tweets endpoint working || echo ❌ User tweets endpoint failed

echo.
echo 🧪 Testing Twitter Mentions...
echo URL: %BASE_URL%/api/twitter/mentions/bitcoin?count=2
curl -s "%BASE_URL%/api/twitter/mentions/bitcoin?count=2" | jq .success 2>nul && echo ✅ Mentions endpoint working || echo ❌ Mentions endpoint failed

echo.
echo 🎯 Test Suite Complete!
echo ========================
