import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const API_BASE = 'https://solana-gateway.moralis.io';
const NETWORK = 'mainnet';

// Test token addresses
const TEST_TOKENS = [
  '5zCETicUCJqJ5Z3wbfFPZqtSpHPYqnggs1wX7ZRpump', // Recent token from your logs
  'So11111111111111111111111111111111111111112',   // WSOL (should have data)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'    // USDC (should have data)
];

async function testHistoricalHolderCount(tokenAddress) {
  console.log(`\n🔍 Testing historical holder count for: ${tokenAddress}`);
  
  try {
    // Calculate date range (last 24 hours)
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
    
    console.log(`📅 Date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    
    const url = `${API_BASE}/token/${NETWORK}/holders/${tokenAddress}/historical`;
    
    console.log(`🌐 Request URL: ${url}`);
    console.log(`🔑 Using API Key: ${MORALIS_API_KEY ? 'Yes' : 'No'}`);
    
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': MORALIS_API_KEY,
        'Content-Type': 'application/json'
      },
      params: {
        from_date: fromDate.toISOString(),
        to_date: toDate.toISOString(),
        timeframe: '1hr'
      }
    });
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Data points: ${response.data?.result?.length || 0}`);
    
    if (response.data?.result && response.data.result.length > 0) {
      const firstPoint = response.data.result[0];
      const lastPoint = response.data.result[response.data.result.length - 1];
      
      console.log(`📈 First data point:`, {
        timestamp: firstPoint.timestamp,
        total_holders: firstPoint.total_holders,
        date: new Date(firstPoint.timestamp).toISOString()
      });
      
      console.log(`📈 Last data point:`, {
        timestamp: lastPoint.timestamp,
        total_holders: lastPoint.total_holders,
        date: new Date(lastPoint.timestamp).toISOString()
      });
      
      // Calculate holder change
      const holderChange = lastPoint.total_holders - firstPoint.total_holders;
      console.log(`📊 24h Holder Change: ${holderChange > 0 ? '+' : ''}${holderChange}`);
    } else {
      console.log(`⚠️ No historical data available`);
    }
    
    return {
      success: true,
      dataPoints: response.data?.result?.length || 0,
      data: response.data?.result
    };
    
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    
    if (error.response) {
      console.error(`📄 Response Status: ${error.response.status}`);
      console.error(`📄 Response Data:`, error.response.data);
    }
    
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

async function testCurrentHolderCount(tokenAddress) {
  console.log(`\n👥 Testing current holder count for: ${tokenAddress}`);
  
  try {
    const url = `${API_BASE}/token/${NETWORK}/holders/${tokenAddress}`;
    
    console.log(`🌐 Request URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': MORALIS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`👥 Total Holders: ${response.data?.total_holders || 'N/A'}`);
    console.log(`📊 Response:`, response.data);
    
    return {
      success: true,
      totalHolders: response.data?.total_holders
    };
    
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    
    if (error.response) {
      console.error(`📄 Response Status: ${error.response.status}`);
      console.error(`📄 Response Data:`, error.response.data);
    }
    
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

async function testHolderTimeseriesService() {
  console.log(`\n🧪 Testing HolderTimeseriesService directly...`);
  
  try {
    const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
    const timeseriesService = new HolderTimeseriesService();
    
    const testToken = TEST_TOKENS[0];
    console.log(`🔍 Testing with token: ${testToken}`);
    
    // Test holder change analysis
    console.log(`\n📊 Testing getHolderChangeAnalysis...`);
    const changeAnalysis = await timeseriesService.getHolderChangeAnalysis(testToken);
    
    if (changeAnalysis.success) {
      console.log(`✅ Change Analysis Success`);
      console.log(`👥 Current Holders: ${changeAnalysis.currentHolders}`);
      console.log(`📈 Holder Changes:`, Object.entries(changeAnalysis.holderChanges).map(([tf, data]) => ({
        timeframe: tf,
        change: data.change,
        changePercent: data.changePercent ? `${(data.changePercent * 100).toFixed(2)}%` : 'N/A'
      })));
    } else {
      console.log(`❌ Change Analysis Failed:`, changeAnalysis.error);
    }
    
    // Test holder flow
    console.log(`\n🌊 Testing getHolderFlow...`);
    const holderFlow = await timeseriesService.getHolderFlow(testToken, 7);
    
    if (holderFlow.success) {
      console.log(`✅ Holder Flow Success`);
      console.log(`📊 Total Change (7d): ${holderFlow.totalChange}`);
      console.log(`📈 Avg Daily Change: ${holderFlow.avgDailyChange.toFixed(2)}`);
      console.log(`📊 Trend: ${holderFlow.trend}`);
      console.log(`📊 Volatility: ${holderFlow.volatility.toFixed(2)}`);
    } else {
      console.log(`❌ Holder Flow Failed:`, holderFlow.error);
    }
    
  } catch (error) {
    console.error(`❌ Service Test Error:`, error.message);
  }
}

async function main() {
  console.log('🚀 Testing Moralis Historical Holder Count API\n');
  console.log(`🔑 Moralis API Key: ${MORALIS_API_KEY ? 'Configured' : 'Missing'}`);
  
  if (!MORALIS_API_KEY) {
    console.error('❌ MORALIS_API_KEY not found in environment variables');
    process.exit(1);
  }
  
  // Test each token
  for (const token of TEST_TOKENS) {
    console.log(`\n${'='.repeat(80)}`);
    
    // Test current holder count first
    await testCurrentHolderCount(token);
    
    // Test historical holder count
    await testHistoricalHolderCount(token);
    
    console.log(`${'='.repeat(80)}`);
  }
  
  // Test the service directly
  await testHolderTimeseriesService();
  
  console.log('\n✅ Testing completed!');
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
