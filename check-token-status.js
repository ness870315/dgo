import axios from 'axios';

const TOKEN_ADDRESS = 'HAw8QdzzRS3gmLao48E3YGqBqRKXGEktu73rQQxEpump';

async function checkTokenStatus() {
  console.log('🔍 Checking token status for:', TOKEN_ADDRESS);
  console.log('='.repeat(80));
  
  try {
    // 1. Check Jupiter API
    console.log('\n📊 Checking Jupiter API...');
    const jupiterResponse = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${TOKEN_ADDRESS}`, {
      timeout: 10000
    });
    
    if (jupiterResponse.data && Array.isArray(jupiterResponse.data) && jupiterResponse.data.length > 0) {
      const token = jupiterResponse.data[0];
      console.log('✅ Found in Jupiter API:');
      console.log('  Name:', token.name);
      console.log('  Symbol:', token.symbol);
      console.log('  bondingCurve:', token.bondingCurve);
      console.log('  graduatedPool:', token.graduatedPool);
      console.log('  graduatedAt:', token.graduatedAt);
      console.log('  launchpad:', token.launchpad);
      console.log('  mcap:', token.mcap);
      console.log('  usdPrice:', token.usdPrice);
      console.log('  stats5m:', JSON.stringify(token.stats5m, null, 2));
      
      // Determine what should happen
      const hasBondingCurve = token.bondingCurve !== undefined && token.bondingCurve !== null;
      const bondingCurveValue = parseFloat(token.bondingCurve) || 0;
      const isFullyGraduated = bondingCurveValue >= 100;
      
      console.log('\n🎯 Migration Logic:');
      console.log('  Has bondingCurve:', hasBondingCurve);
      console.log('  bondingCurve value:', bondingCurveValue);
      console.log('  Is fully graduated (>=100):', isFullyGraduated);
      
      if (hasBondingCurve && !isFullyGraduated) {
        console.log('\n✅ ACTION: Should be KEPT in pre-bonding cache');
      } else if (isFullyGraduated) {
        console.log('\n🎓 ACTION: Should be MIGRATED to main token cache');
      } else {
        console.log('\n❌ ACTION: Should be REMOVED (no bonding curve)');
      }
    } else {
      console.log('❌ Not found in Jupiter API');
    }
    
    // 2. Check backend pre-bonding cache
    console.log('\n📦 Checking backend pre-bonding cache...');
    try {
      const preBondingResponse = await axios.get('https://api.degen-oracle.com/api/tokens/bonding?limit=500', {
        timeout: 10000
      });
      
      if (preBondingResponse.data && Array.isArray(preBondingResponse.data)) {
        const tokenInCache = preBondingResponse.data.find(t => 
          (t.contractAddress || t.tokenAddress) === TOKEN_ADDRESS
        );
        
        if (tokenInCache) {
          console.log('✅ Found in pre-bonding cache:');
          console.log('  Symbol:', tokenInCache.symbol);
          console.log('  Name:', tokenInCache.name);
          console.log('  bondingCurve:', tokenInCache.bondingCurve);
          console.log('  bondingCurveProgress:', tokenInCache.bondingCurveProgress);
          console.log('  lastValidated:', tokenInCache.lastValidated);
        } else {
          console.log('❌ NOT found in pre-bonding cache');
        }
      }
    } catch (error) {
      console.log('❌ Error checking pre-bonding cache:', error.message);
    }
    
    // 3. Check main token cache
    console.log('\n💎 Checking main token cache...');
    try {
      const mainCacheResponse = await axios.get('https://api.degen-oracle.com/api/tokens', {
        timeout: 10000
      });
      
      if (mainCacheResponse.data && Array.isArray(mainCacheResponse.data)) {
        const tokenInMainCache = mainCacheResponse.data.find(t => 
          t.contractAddress === TOKEN_ADDRESS
        );
        
        if (tokenInMainCache) {
          console.log('✅ Found in main token cache:');
          console.log('  Symbol:', tokenInMainCache.symbol);
          console.log('  Name:', tokenInMainCache.name);
          console.log('  Price:', tokenInMainCache.price);
          console.log('  Market Cap:', tokenInMainCache.marketCap);
        } else {
          console.log('❌ NOT found in main token cache');
        }
      }
    } catch (error) {
      console.log('❌ Error checking main cache:', error.message);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTokenStatus();

