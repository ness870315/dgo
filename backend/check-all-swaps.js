import ChartDatabase from './services/ChartDatabase.js';

const chartDb = new ChartDatabase();

try {
  await chartDb.ensureLoaded();
  console.log('Total swaps in database:', chartDb.data.swaps.size);
  console.log('Total pools in database:', chartDb.sharedData.pools.size);
  
  if (chartDb.data.swaps.size > 0) {
    console.log('Available pool addresses:');
    const poolAddresses = new Set();
    for (const [key, swap] of chartDb.data.swaps.entries()) {
      if (swap.poolAddress) {
        poolAddresses.add(swap.poolAddress);
      }
    }
    console.log(Array.from(poolAddresses));
  }
} catch (error) {
  console.error('Error:', error.message);
}
