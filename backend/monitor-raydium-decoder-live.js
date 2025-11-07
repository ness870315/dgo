/**
 * Live monitoring script to verify Raydium decoder is working during swap detection
 * 
 * This script monitors live swaps and shows:
 * 1. When the decoder is called
 * 2. Which accounts are identified as pool vaults
 * 3. Which accounts are identified as user accounts
 * 4. Decoder accuracy metrics over time
 */

import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import { processTxForSwap } from './services/SwapDetectionHelpers.mjs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load gRPC
const GrpcWrapperModule = require('./services/GrpcWrapper.cjs');
const GrpcWrapper = GrpcWrapperModule.default || GrpcWrapperModule;

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// Monitor a known active Raydium AMM token
// Using SOL-USDC Raydium pool (very active, definitely Raydium AMM)
const MONITOR_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
const MONITOR_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'; // SOL-USDC Raydium AMM pool

async function monitorLiveSwaps() {
    console.log('🔧 Live Raydium Decoder Monitoring\n');
    console.log('=' .repeat(80));
    console.log(`📊 Monitoring token: ${MONITOR_TOKEN}`);
    console.log(`📊 Pool address: ${MONITOR_POOL}`);
    console.log('=' .repeat(80));
    
    // Initialize decoder
    const decoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    console.log('✅ Raydium decoder initialized\n');
    
    // Pre-cache the pool
    console.log('🔄 Pre-caching pool data...');
    await decoder.decodePoolState(MONITOR_POOL);
    console.log('✅ Pool data cached\n');
    
    // Initialize gRPC client
    console.log('🔌 Connecting to Constant K gRPC...');
    const grpcClient = new GrpcWrapper(
        CONSTANT_K_GRPC_ENDPOINT,
        CONSTANT_K_GRPC_TOKEN
    );
    
    await grpcClient.connect();
    console.log('✅ Connected to gRPC\n');
    
    // Track stats
    let swapCount = 0;
    let decoderUsedCount = 0;
    let vaultDetectedCount = 0;
    const startTime = Date.now();
    
    // Subscribe to token transactions
    const request = {
        accounts: {
            account_filter: [MONITOR_TOKEN]
        },
        transactions: {
            vote: false,
            failed: false,
            accountInclude: [MONITOR_TOKEN]
        },
        commitment: GrpcWrapperModule.CommitmentLevel?.CONFIRMED || 1
    };
    
    console.log('🎯 Starting live swap monitoring...');
    console.log('   Press Ctrl+C to stop\n');
    console.log('-'.repeat(80));
    
    const stream = await grpcClient.subscribe(request);
    
    stream.on('data', async (msg) => {
        if (msg.transaction?.transaction) {
            const tx = msg.transaction.transaction;
            const slot = msg.slot;
            
            // Check for token balance changes (potential swap)
            if (tx.meta?.preTokenBalances?.length > 0) {
                swapCount++;
                
                console.log(`\n🔄 SWAP #${swapCount} detected at slot ${slot}`);
                
                // Get metrics before processing
                const metricsBefore = decoder.getMetrics();
                
                // Process swap using the decoder
                const solPriceUSD = 200; // Mock price
                const tokenPriceCache = new Map();
                const midPriceUsd = 0.0001; // Mock mid price
                
                try {
                    const swapRecord = processTxForSwap(
                        tx,
                        MONITOR_TOKEN,
                        solPriceUSD,
                        tokenPriceCache,
                        midPriceUsd,
                        decoder,        // ✅ Raydium decoder
                        MONITOR_POOL    // ✅ Pool address
                    );
                    
                    // Get metrics after processing
                    const metricsAfter = decoder.getMetrics();
                    
                    // Check if decoder was used
                    const decoderUsed = metricsAfter.totalDecodes > metricsBefore.totalDecodes ||
                                       metricsAfter.cacheHits > metricsBefore.cacheHits;
                    
                    if (decoderUsed) {
                        decoderUsedCount++;
                        const cacheHit = metricsAfter.cacheHits > metricsBefore.cacheHits;
                        console.log(`   🔧 Decoder used: ${cacheHit ? 'CACHE HIT' : 'NEW DECODE'}`);
                    }
                    
                    if (swapRecord) {
                        console.log(`   ✅ Valid swap detected:`);
                        console.log(`      Type: ${swapRecord.type}`);
                        console.log(`      Token Amount: ${swapRecord.tokenAmount.toFixed(2)}`);
                        console.log(`      Base Amount: ${swapRecord.baseAmount.toFixed(6)}`);
                        console.log(`      Volume: $${swapRecord.volumeUsd.toFixed(2)}`);
                        console.log(`      Maker: ${swapRecord.maker.substring(0, 8)}...`);
                        
                        // Check if any vaults were detected
                        const poolData = decoder.poolCache.get(MONITOR_POOL);
                        if (poolData) {
                            console.log(`   🔍 Pool vaults known:`);
                            console.log(`      Base:  ${poolData.baseVault.substring(0, 8)}...`);
                            console.log(`      Quote: ${poolData.quoteVault.substring(0, 8)}...`);
                            vaultDetectedCount++;
                        }
                    } else {
                        console.log(`   ⚠️  Swap filtered out (dust/outlier/invalid)`);
                    }
                    
                } catch (error) {
                    console.error(`   ❌ Error processing swap: ${error.message}`);
                }
                
                // Show running metrics every 10 swaps
                if (swapCount % 10 === 0) {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                    const metrics = decoder.getMetrics();
                    
                    console.log('\n' + '='.repeat(80));
                    console.log('📊 RUNNING METRICS:');
                    console.log('='.repeat(80));
                    console.log(`   Swaps detected:         ${swapCount}`);
                    console.log(`   Decoder used:           ${decoderUsedCount} (${((decoderUsedCount/swapCount)*100).toFixed(1)}%)`);
                    console.log(`   Vaults detected:        ${vaultDetectedCount}`);
                    console.log(`   Decoder total calls:    ${metrics.totalDecodes}`);
                    console.log(`   Decoder cache hits:     ${metrics.cacheHits}`);
                    console.log(`   Decoder success rate:   ${metrics.successRate}`);
                    console.log(`   Cache size:             ${metrics.cacheSize} pools`);
                    console.log(`   Elapsed time:           ${elapsed}s`);
                    console.log('='.repeat(80) + '\n');
                }
            }
        }
    });
    
    stream.on('error', (error) => {
        console.error(`❌ Stream error: ${error.message}`);
    });
    
    stream.on('end', () => {
        console.log('\n🔚 Stream ended');
        showFinalMetrics();
    });
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n\n⏹️  Stopping monitoring...');
        stream.cancel();
        showFinalMetrics();
        process.exit(0);
    });
    
    function showFinalMetrics() {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const metrics = decoder.getMetrics();
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL METRICS:');
        console.log('='.repeat(80));
        console.log(`   Total swaps detected:       ${swapCount}`);
        console.log(`   Decoder used:               ${decoderUsedCount} (${swapCount > 0 ? ((decoderUsedCount/swapCount)*100).toFixed(1) : 0}%)`);
        console.log(`   Vaults detected:            ${vaultDetectedCount}`);
        console.log(`   Decoder total decodes:      ${metrics.totalDecodes}`);
        console.log(`   Decoder successful decodes: ${metrics.successfulDecodes}`);
        console.log(`   Decoder failed decodes:     ${metrics.failedDecodes}`);
        console.log(`   Decoder cache hits:         ${metrics.cacheHits}`);
        console.log(`   Decoder success rate:       ${metrics.successRate}`);
        console.log(`   Cache size:                 ${metrics.cacheSize} pools`);
        console.log(`   Total time:                 ${elapsed}s`);
        console.log('='.repeat(80));
        
        if (decoderUsedCount > 0) {
            console.log('\n✅ SUCCESS: Raydium decoder is working in live swap detection!');
        } else {
            console.log('\n⚠️  WARNING: Decoder was not used during monitoring');
            console.log('   This might be normal if the pool is not a Raydium AMM pool');
        }
    }
}

// Run the monitor
monitorLiveSwaps().catch(console.error);

