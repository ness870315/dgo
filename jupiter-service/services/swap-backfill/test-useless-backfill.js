import SwapBackfillWorker from './SwapBackfillWorker.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const USELESS_TOKEN = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';

async function testUselessBackfill() {
  try {
    console.log('🧪 [TEST] Starting USELESS backfill test...');
    console.log(`Token: ${USELESS_TOKEN}`);
    console.log('=' .repeat(80));

    // Initialize worker
    const worker = new SwapBackfillWorker();
    await worker.initialize();

    // Get current stats
    console.log('\n📊 Current stats before backfill:');
    const statsBefore = await worker.getStats(USELESS_TOKEN);
    console.log(JSON.stringify(statsBefore, null, 2));

    // Run backfill
    console.log('\n🔄 Running backfill...');
    const result = await worker.backfillToken(USELESS_TOKEN);

    console.log('\n📊 Backfill result:');
    console.log(JSON.stringify(result, null, 2));

    // Get stats after backfill
    console.log('\n📊 Stats after backfill:');
    const statsAfter = await worker.getStats(USELESS_TOKEN);
    console.log(JSON.stringify(statsAfter, null, 2));

    console.log('\n✅ [TEST] USELESS backfill test complete!');
    console.log(`   Added: ${result.swapsAdded || 0} swaps`);
    console.log(`   Total: ${statsAfter.totalSwaps} swaps`);

  } catch (error) {
    console.error('❌ [TEST] Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testUselessBackfill();
