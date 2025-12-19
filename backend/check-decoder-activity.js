/**
 * Quick script to check if decoders are being used in production
 * Checks logs and provides troubleshooting steps
 */

import axios from 'axios';

const API_BASE = 'https://api.degen-oracle.com';

async function checkDecoderActivity() {
    console.log('🔍 Checking Decoder Activity in Production\n');
    console.log('='.repeat(80));
    
    try {
        // 1. Check decoder stats
        console.log('\n1️⃣ Decoder Statistics:');
        console.log('-'.repeat(80));
        const statsResponse = await axios.get(`${API_BASE}/api/decoders/stats`);
        const stats = statsResponse.data.data;
        
        console.log(`   Raydium AMM Decoder:`);
        console.log(`      Usage:           ${stats.raydiumAMM.usage || 0}`);
        console.log(`      Cache Size:      ${stats.raydiumAMM.cacheSize || 0}`);
        console.log(`      Total Decodes:   ${stats.raydiumAMM.totalDecodes || 0}`);
        console.log(`   Raydium CPMM Decoder:`);
        console.log(`      Usage:           ${stats.raydiumCPMM.usage || 0}`);
        console.log(`      Cache Size:      ${stats.raydiumCPMM.cacheSize || 0}`);
        console.log(`      Total Decodes:   ${stats.raydiumCPMM.totalDecodes || 0}`);
        console.log(`   Status:            ${stats.decoderActive.amm && stats.decoderActive.cpmm ? '✅ Both Active' : '⚠️ Some Inactive'}`);
        
        // 2. Check real-time stats (to see if swaps are being detected)
        console.log('\n2️⃣ Real-Time Monitoring Stats:');
        console.log('-'.repeat(80));
        try {
            const realtimeResponse = await axios.get(`${API_BASE}/api/grpc/status`);
            const grpcStatus = realtimeResponse.data.grpc;
            
            if (grpcStatus?.enhancedHybridPriceService) {
                const rtStats = grpcStatus.enhancedHybridPriceService;
                console.log(`   Total Tokens Monitored: ${rtStats.totalTokens || 0}`);
                console.log(`   Total Swaps Detected:   ${rtStats.totalSwaps || 0}`);
                console.log(`   Active Streams:         ${rtStats.activeStreams?.length || 0}`);
                
                if (rtStats.totalSwaps === 0) {
                    console.log(`\n   ⚠️  WARNING: No swaps detected! This could mean:`);
                    console.log(`      - Backend just restarted (wait a few minutes)`);
                    console.log(`      - No swaps happening for monitored tokens`);
                    console.log(`      - gRPC stream not receiving transactions`);
                } else if (stats.totalDecoderUses === 0) {
                    console.log(`\n   ⚠️  WARNING: Swaps detected (${rtStats.totalSwaps}) but decoders not used!`);
                    console.log(`      This could mean:`);
                    console.log(`      - Swaps are not from Raydium AMM/CPMM programs`);
                    console.log(`      - Program ID detection is failing`);
                    console.log(`      - Swaps are being filtered out (non-AMM)`);
                } else {
                    console.log(`\n   ✅ Swaps are being detected AND decoders are being used!`);
                }
            } else {
                console.log(`   ⚠️  EnhancedHybridPriceService not initialized`);
            }
        } catch (error) {
            console.log(`   ❌ Could not fetch real-time stats: ${error.message}`);
        }
        
        // 3. Recommendations
        console.log('\n3️⃣ Troubleshooting Steps:');
        console.log('-'.repeat(80));
        
        if (stats.totalDecoderUses === 0) {
            console.log(`   📋 If decoders show 0 usage:`);
            console.log(`      1. Check backend logs for: "🔧 [processSwapForToken] Using... decoder"`);
            console.log(`      2. Wait 5-10 minutes for swaps to process`);
            console.log(`      3. Verify tokens being monitored have Raydium pools`);
            console.log(`      4. Check if swaps are from AMM programs (Raydium/Orca/Meteora)`);
            console.log(`      5. Look for periodic stats logs: "📊 [DECODER STATS]" (every 5 min)`);
            console.log(`\n   📋 Check backend logs for:`);
            console.log(`      - "🔄 [processSwapForToken] Called for token..." (swaps detected)`);
            console.log(`      - "🔧 [processSwapForToken] Using AMM decoder..." (decoder used)`);
            console.log(`      - "🔧 [processSwapForToken] Using CPMM decoder..." (decoder used)`);
            console.log(`      - "📊 [DECODER STATS]" (periodic stats)`);
        } else {
            console.log(`   ✅ Decoders are being used! Usage: ${stats.totalDecoderUses}`);
            console.log(`   📊 Check the periodic stats logs every 5 minutes for details`);
        }
        
        // 4. Expected behavior
        console.log('\n4️⃣ Expected Behavior After 10 Minutes:');
        console.log('-'.repeat(80));
        console.log(`   - Decoder usage should be > 0 (if monitoring Raydium tokens)`);
        console.log(`   - Cache size should grow as pools are discovered`);
        console.log(`   - Periodic stats logs should appear every 5 minutes`);
        console.log(`   - Backend logs should show "🔧 Using... decoder" messages`);
        
    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
}

checkDecoderActivity().catch(console.error);



