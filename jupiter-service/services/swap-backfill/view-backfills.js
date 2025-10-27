import SwapBackfillWorker from './SwapBackfillWorker.js';

const USELESS_TOKEN = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';

async function viewBackfills() {
  const worker = new SwapBackfillWorker();
  
  try {
    console.log('🔍 Viewing backfill data...\n');
    
    // Initialize worker
    await worker.initialize();
    
    // Get stats for USELESS token
    console.log(`📊 Stats for USELESS (${USELESS_TOKEN.substring(0, 8)}...):`);
    const stats = await worker.getStats(USELESS_TOKEN);
    console.log(JSON.stringify(stats, null, 2));
    
    // Get actual swap data
    console.log(`\n🔍 Recent swaps for USELESS:`);
    const swaps = await worker.chartDatabase.getSwapsForToken(USELESS_TOKEN);
    
    console.log(`Total swaps: ${swaps.length}`);
    
    if (swaps.length > 0) {
      console.log(`\nFirst 5 swaps:`);
      swaps.slice(0, 5).forEach((swap, i) => {
        console.log(`\n${i + 1}. ${swap.type} - ${swap.tokenAmount} tokens`);
        console.log(`   Price: ${swap.price} SOL ($${(swap.price * 200).toFixed(4)})`);
        console.log(`   Volume: $${swap.volumeUsd.toFixed(2)}`);
        console.log(`   Timestamp: ${new Date(swap.timestamp * 1000).toISOString()}`);
        console.log(`   Source: ${swap.source}`);
        console.log(`   Signature: ${swap.signature?.substring(0, 20)}...`);
      });
      
      if (swaps.length > 5) {
        console.log(`\nLast 5 swaps:`);
        swaps.slice(-5).forEach((swap, i) => {
          console.log(`\n${swaps.length - 4 + i}. ${swap.type} - ${swap.tokenAmount} tokens`);
          console.log(`   Price: ${swap.price} SOL`);
          console.log(`   Volume: $${swap.volumeUsd.toFixed(2)}`);
          console.log(`   Timestamp: ${new Date(swap.timestamp * 1000).toISOString()}`);
          console.log(`   Source: ${swap.source}`);
        });
      }
      
      // Show backfill sources
      const sourceCounts = swaps.reduce((acc, swap) => {
        acc[swap.source] = (acc[swap.source] || 0) + 1;
        return acc;
      }, {});
      
      console.log(`\n📊 Swap sources:`);
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`   ${source}: ${count} swaps`);
      });
    } else {
      console.log('❌ No swaps found yet');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

viewBackfills();
