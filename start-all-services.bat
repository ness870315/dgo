@echo off
echo 🚀 Starting ALL DeGen Oracle Services...
echo.

echo 🛡️ Starting Enhanced Backend (Port 4000)...
start "Enhanced Backend" cmd /k "cd backend && node start-all-services.js"

echo ⏳ Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo ⚛️ Starting React Frontend (Port 3000)...
start "React Frontend" cmd /k "cd frontend && npm start"

echo.
echo 🎉 All services are starting!
echo.
echo 🌐 Access Points:
echo    🛡️ Enhanced Backend API: http://localhost:4000
echo    📊 Health Dashboard: http://localhost:4000/health-dashboard.html
echo    📈 API Analytics: http://localhost:4000/api-analytics-dashboard.html
echo    ⚛️ React Frontend: http://localhost:3000
echo.
echo 🧪 Test Endpoints:
echo    🎯 Enhanced Scoring: http://localhost:4000/api/test/enhanced-scoring
echo    💰 Paid Token Status: http://localhost:4000/api/tokens/paid-status
echo.
echo 💡 Features:
echo    🛡️ Bulletproof Paid Token Persistence
echo    🔥 Fueled Token Persistence
echo    🎯 Enhanced Trading-Focused Scoring
echo    🐦 Real-time Twitter Metrics
echo    🪐 Jupiter API Integration
echo.
echo 📱 Monitoring via Health Dashboard and API Analytics
echo.
pause








