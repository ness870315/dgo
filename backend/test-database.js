import ChartDatabase from './services/ChartDatabase.js';

const chartDb = new ChartDatabase();

try {
  const swaps = await chartDb.getRecentSwaps('98rxcGXHxfAQ39rgpN9qMGPLhgWfze1RmQ4PHprTvZFN', 100);
  console.log('Historical swaps found:', swaps.length);
  
  if (swaps.length > 0) {
    console.log('First swap:', JSON.stringify(swaps[0], null, 2));
  } else {
    console.log('No historical swaps found for PROBITY pool');
  }
} catch (error) {
  console.error('Error:', error.message);
}





