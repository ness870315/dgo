import pkg from 'rettiwt-api';

/**
 * DEBUG RETTIWT PACKAGE EXPORTS
 * See what's actually available in the rettiwt-api package
 */
async function debugRettiwtExports() {
  console.log('🔍 DEBUGGING: Rettiwt Package Exports');
  console.log('=' .repeat(50));

  console.log('📦 Default import (pkg):');
  console.log('Type:', typeof pkg);
  console.log('Keys:', Object.keys(pkg));
  console.log('');

  // Check each export
  Object.keys(pkg).forEach(key => {
    const value = pkg[key];
    console.log(`🔧 ${key}:`);
    console.log(`   Type: ${typeof value}`);
    console.log(`   Constructor: ${typeof value === 'function' ? 'YES' : 'NO'}`);
    
    if (typeof value === 'function') {
      try {
        console.log(`   Name: ${value.name}`);
        console.log(`   Length: ${value.length} parameters`);
      } catch (e) {
        console.log(`   Error getting function info: ${e.message}`);
      }
    }
    
    if (typeof value === 'object' && value !== null) {
      console.log(`   Object keys: ${Object.keys(value)}`);
    }
    console.log('');
  });

  // Try different import methods
  console.log('🔄 Testing different import approaches:');
  
  try {
    const { Rettiwt } = pkg;
    console.log('✅ Rettiwt destructured successfully');
    console.log(`   Type: ${typeof Rettiwt}`);
  } catch (error) {
    console.log('❌ Failed to destructure Rettiwt:', error.message);
  }

  try {
    const { TweetSearchOptions } = pkg;
    console.log('✅ TweetSearchOptions destructured successfully');
    console.log(`   Type: ${typeof TweetSearchOptions}`);
  } catch (error) {
    console.log('❌ Failed to destructure TweetSearchOptions:', error.message);
  }

  try {
    const { TweetFilter } = pkg;
    console.log('✅ TweetFilter destructured successfully');
    console.log(`   Type: ${typeof TweetFilter}`);
  } catch (error) {
    console.log('❌ Failed to destructure TweetFilter:', error.message);
  }

  // Check if it's a default export issue
  console.log('\n🔍 Checking default export structure:');
  if (pkg.default) {
    console.log('Has default export');
    console.log('Default keys:', Object.keys(pkg.default));
  } else {
    console.log('No default export');
  }

  // Try alternative import patterns
  console.log('\n🧪 Testing alternative patterns:');
  
  // Pattern 1: Check if classes are nested
  if (pkg.Rettiwt) {
    console.log('✅ pkg.Rettiwt exists');
    
    // Check if TweetSearchOptions is a property of Rettiwt
    if (pkg.Rettiwt.TweetSearchOptions) {
      console.log('✅ Found TweetSearchOptions as Rettiwt.TweetSearchOptions');
    }
  }

  // Pattern 2: Check for different naming
  const possibleNames = [
    'TweetSearchOptions',
    'tweetSearchOptions', 
    'TweetSearchOption',
    'SearchOptions',
    'TwitterSearchOptions',
    'TweetOptions'
  ];

  possibleNames.forEach(name => {
    if (pkg[name]) {
      console.log(`✅ Found ${name} in package`);
      console.log(`   Type: ${typeof pkg[name]}`);
    }
  });

  console.log('\n💡 Use this information to fix the import in our code');
}

debugRettiwtExports().catch(error => {
  console.error('❌ Debug failed:', error);
});




