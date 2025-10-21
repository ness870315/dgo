#!/bin/bash

# Production Deployment Script for Enhanced LST Data System
# This script deploys the enhanced LST data system to production

echo "🚀 DEPLOYING ENHANCED LST DATA SYSTEM TO PRODUCTION"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "twitter-service/main.py" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "✅ Project structure verified"

# Install dependencies
echo "📦 Installing dependencies..."
cd twitter-service
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Test the enhanced LST system
echo "🧪 Testing enhanced LST system..."
python3 -c "
import asyncio
from enhanced_lst_system import enhanced_lst_system

async def test_system():
    try:
        print('Testing enhanced LST data fetching...')
        lst_data = await enhanced_lst_system.get_enhanced_lst_data()
        print(f'✅ Successfully fetched {len(lst_data)} LSTs')
        
        print('Testing strategy generation...')
        strategy = await enhanced_lst_system.generate_enhanced_strategy('test_wallet', 'basic')
        print(f'✅ Successfully generated strategy: {strategy[\"name\"]}')
        print(f'   Expected Yield: {strategy[\"expectedYield\"]:.2f}%')
        print(f'   LSTs Analyzed: {strategy[\"metadata\"][\"totalLSTsAnalyzed\"]}')
        
        return True
    except Exception as e:
        print(f'❌ Test failed: {e}')
        return False

result = asyncio.run(test_system())
if not result:
    exit(1)
"

if [ $? -ne 0 ]; then
    echo "❌ Error: Enhanced LST system test failed"
    exit 1
fi

echo "✅ Enhanced LST system test passed"

# Start the production service
echo "🚀 Starting production service..."
echo "   Service: Enhanced Twitter Service with LST Data System"
echo "   Port: 8000"
echo "   Features:"
echo "   - Multi-source LST data (Sanctum Extra, Compass, GitHub)"
echo "   - Real-time APY/TVL data"
echo "   - Proper symbol mapping (INF vs infSOL)"
echo "   - Enhanced strategy generation"
echo "   - Production-ready caching and error handling"

# Start the service
python3 main.py

echo "🎉 Enhanced LST Data System deployed successfully!"
echo "   API Endpoint: http://localhost:8000/api/strategy/generate"
echo "   Documentation: http://localhost:8000/docs"
echo "   Health Check: http://localhost:8000/health"
