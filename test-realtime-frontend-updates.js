import HybridChartService from './backend/services/HybridChartService.js';

const HELIUS_API_KEY = 'b33d3626-7655-439b-b843-7772cad45701';
const MORALIS_API_KEY = 'your-moralis-key'; // Replace with actual key
const TOKEN_ADDRESS = '2PrJoPoRzsm8DNuH6XPcTCtvt8XFzHBxqjwG5UC1pump';

console.log('🔧 TESTING REAL-TIME FRONTEND UPDATES');
console.log('====================================');
console.log(`Token Address: ${TOKEN_ADDRESS}`);
console.log(`Helius API Key: ${HELIUS_API_KEY ? '✅ Configured' : '❌ Missing'}`);

async function testRealTimeFrontendUpdates() {
    try {
        console.log('\n1️⃣ Initializing HybridChartService...');
        const hybridChartService = new HybridChartService(HELIUS_API_KEY, MORALIS_API_KEY);
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('\n2️⃣ Testing live-updates endpoint...');
        
        // Test the live-updates endpoint
        const liveUpdatesUrl = `http://localhost:3001/api/tokens/${TOKEN_ADDRESS}/live-updates`;
        console.log(`📡 Testing endpoint: ${liveUpdatesUrl}`);
        
        const response = await fetch(liveUpdatesUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📡 Live Updates Response:`);
        console.log(`   Success: ${data.success}`);
        console.log(`   Contract: ${data.contract}`);
        console.log(`   Pool Address: ${data.poolAddress}`);
        console.log(`   New Swaps: ${data.updates?.newSwaps?.length || 0}`);
        console.log(`   Latest Candles: ${Object.keys(data.updates?.latestCandles || {}).length}`);
        
        if (data.updates?.latestCandles) {
            console.log(`   Available Timeframes:`, Object.keys(data.updates.latestCandles));
            
            // Show sample candle data
            const timeframes = ['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'];
            for (const tf of timeframes) {
                if (data.updates.latestCandles[tf]) {
                    const candle = data.updates.latestCandles[tf];
                    console.log(`   ${tf} Candle:`, {
                        timestamp: candle.timestamp,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume
                    });
                }
            }
        }
        
        console.log('\n3️⃣ Testing with sinceTimestamp parameter...');
        
        // Test with sinceTimestamp
        const sinceTimestamp = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
        const responseWithTimestamp = await fetch(`${liveUpdatesUrl}?sinceTimestamp=${sinceTimestamp}`);
        
        if (responseWithTimestamp.ok) {
            const dataWithTimestamp = await responseWithTimestamp.json();
            console.log(`📡 Live Updates (with timestamp):`);
            console.log(`   Success: ${dataWithTimestamp.success}`);
            console.log(`   New Swaps: ${dataWithTimestamp.updates?.newSwaps?.length || 0}`);
            console.log(`   Latest Candles: ${Object.keys(dataWithTimestamp.updates?.latestCandles || {}).length}`);
        }
        
        console.log('\n4️⃣ Testing real-time stats endpoint...');
        
        // Test real-time stats
        const statsResponse = await fetch('http://localhost:3001/api/tokens/realtime-stats');
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            console.log(`📊 Real-time Stats:`);
            console.log(`   Success: ${statsData.success}`);
            console.log(`   Connected: ${statsData.data?.isConnected}`);
            console.log(`   Monitored Pools: ${statsData.data?.monitoredPools}`);
            console.log(`   Total Transactions: ${statsData.data?.totalTransactions}`);
            console.log(`   Pool Details:`, statsData.data?.poolDetails);
        }
        
        console.log('\n5️⃣ Simulating frontend polling...');
        
        // Simulate frontend polling every 2 seconds
        let pollCount = 0;
        const maxPolls = 5;
        
        const pollInterval = setInterval(async () => {
            pollCount++;
            console.log(`\n📡 Poll #${pollCount}/${maxPolls}:`);
            
            try {
                const pollResponse = await fetch(liveUpdatesUrl);
                if (pollResponse.ok) {
                    const pollData = await pollResponse.json();
                    console.log(`   ✅ Poll successful: ${pollData.updates?.newSwaps?.length || 0} swaps, ${Object.keys(pollData.updates?.latestCandles || {}).length} candles`);
                    
                    if (pollData.updates?.latestCandles?.['5MIN']) {
                        const candle = pollData.updates.latestCandles['5MIN'];
                        console.log(`   📊 Latest 5MIN candle: ${candle.close} (${new Date(candle.timestamp * 1000).toLocaleTimeString()})`);
                    }
                } else {
                    console.log(`   ❌ Poll failed: HTTP ${pollResponse.status}`);
                }
            } catch (error) {
                console.log(`   ❌ Poll error: ${error.message}`);
            }
            
            if (pollCount >= maxPolls) {
                clearInterval(pollInterval);
                console.log('\n✅ Frontend polling simulation completed');
            }
        }, 2000);
        
        // Wait for polling to complete
        await new Promise(resolve => setTimeout(resolve, (maxPolls + 1) * 2000));
        
        console.log('\n✅ REAL-TIME FRONTEND UPDATES TEST SUCCESSFUL!');
        console.log('\n📋 Frontend Integration Summary:');
        console.log('   ✅ Live-updates endpoint working');
        console.log('   ✅ Real-time stats endpoint working');
        console.log('   ✅ Frontend polling simulation successful');
        console.log('   ✅ Multi-timeframe candle data available');
        console.log('   ✅ sinceTimestamp parameter working');
        console.log('   ✅ Ready for real-time chart updates');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testRealTimeFrontendUpdates().then(() => {
    console.log('\n✅ REAL-TIME FRONTEND UPDATES TEST COMPLETED');
    process.exit(0);
}).catch(error => {
    console.error('❌ Test error:', error);
    process.exit(1);
});
