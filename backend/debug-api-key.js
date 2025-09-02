import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * DEBUG API KEY AND AUTHENTICATION
 * Check if our API key has proper permissions and authentication
 */
async function debugApiKey() {
  console.log('🔍 DEBUGGING: API Key Authentication & Permissions');
  console.log('=' .repeat(60));

  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  console.log(`🔑 API Key Length: ${apiKey.length} characters`);
  console.log(`🔑 API Key Preview: ${apiKey.substring(0, 30)}...`);
  
  // Decode the API key to see what's inside
  try {
    const decoded = Buffer.from(apiKey, 'base64').toString('utf-8');
    console.log(`🔓 Decoded API Key: ${decoded.substring(0, 100)}...`);
    
    // Check if it contains authentication tokens
    if (decoded.includes('auth_token')) {
      console.log('✅ Contains auth_token');
    }
    if (decoded.includes('ct0')) {
      console.log('✅ Contains ct0 token');  
    }
    if (decoded.includes('twid')) {
      console.log('✅ Contains Twitter ID');
    }
    
  } catch (error) {
    console.log('❌ Could not decode API key:', error.message);
  }

  console.log('\n🔍 Testing API Authentication...');
  
  try {
    // Initialize Rettiwt with different configurations
    const configs = [
      {
        name: 'Standard Config',
        config: { apiKey: apiKey, delay: 2000, maxRetries: 2 }
      },
      {
        name: 'No Delay Config', 
        config: { apiKey: apiKey, delay: 0, maxRetries: 1 }
      },
      {
        name: 'High Retry Config',
        config: { apiKey: apiKey, delay: 3000, maxRetries: 5 }
      }
    ];

    for (const testConfig of configs) {
      console.log(`\n📡 Testing: ${testConfig.name}`);
      console.log(`⚙️ Config: ${JSON.stringify(testConfig.config)}`);
      
      try {
        const twitterApi = new Rettiwt(testConfig.config);
        console.log('✅ Rettiwt instance created successfully');
        
        // Try a simple hashtag search (we know this works)
        const hashtagResult = await twitterApi.tweet.search({ hashtags: ['bitcoin'] }, 1);
        
        if (hashtagResult && hashtagResult.list && hashtagResult.list.length > 0) {
          console.log('✅ Hashtag search works');
          
          // Now try a query search with the same API instance
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between calls
          
          const queryResult = await twitterApi.tweet.search({ query: 'bitcoin' }, 1);
          
          if (queryResult && queryResult.list && queryResult.list.length > 0) {
            console.log('✅ Query search works!');
            console.log('🎯 FOUND THE WORKING CONFIGURATION!');
            return testConfig;
          } else {
            console.log('❌ Query search failed with this config');
            if (queryResult?.error) {
              console.log(`   Error: ${queryResult.error}`);
            }
          }
          
        } else {
          console.log('❌ Even hashtag search failed with this config');
        }
        
      } catch (error) {
        console.log(`❌ Configuration failed: ${error.message}`);
        if (error.response?.status) {
          console.log(`   HTTP Status: ${error.response.status}`);
        }
      }
      
      // Wait between config tests
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message);
  }

  console.log('\n🔍 Testing Different Query Formats...');
  
  // Test if it's a query formatting issue
  const twitterApi = new Rettiwt({ apiKey: apiKey, delay: 2000, maxRetries: 2 });
  
  const queryFormats = [
    'bitcoin',
    '"bitcoin"',
    'bitcoin crypto',
    'bitcoin OR crypto',
    'bitcoin AND crypto',
    '(bitcoin)',
    'bitcoin lang:en',
    'bitcoin -RT'  // Exclude retweets
  ];

  for (const query of queryFormats) {
    console.log(`\n🔍 Testing query format: "${query}"`);
    
    try {
      const result = await twitterApi.tweet.search({ query: query }, 1);
      
      if (result && result.list && result.list.length > 0) {
        console.log(`✅ SUCCESS with format: "${query}"`);
        const tweet = result.list[0].toJSON();
        console.log(`   Sample: "${(tweet.fullText || tweet.text || '').substring(0, 50)}..."`);
      } else {
        console.log(`❌ No results for: "${query}"`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log(`❌ Error with "${query}": ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 API KEY DEBUG COMPLETE');
  console.log('💡 Check the results above to identify the issue');
}

debugApiKey().catch(error => {
  console.error('❌ API key debug failed:', error);
});




