#!/bin/bash

echo "🚀 XTrend Deployment Script"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Frontend deployment
echo -e "${GREEN}📦 Building frontend...${NC}"
cd frontend
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend build successful${NC}"
else
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
fi

# Backend deployment check
echo -e "${GREEN}🔧 Preparing backend for Railway...${NC}"
cd ../backend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Backend package.json not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Backend ready for deployment${NC}"

echo ""
echo -e "${YELLOW}🎯 NEXT STEPS:${NC}"
echo "1. Frontend: Upload ./frontend/build folder to Cloudflare Pages"
echo "2. Backend: Deploy to Railway using 'railway up' command"
echo "3. Update environment variables with your domain"
echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"




