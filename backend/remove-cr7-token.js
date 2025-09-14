#!/usr/bin/env node

/**
 * One-time script to remove CR7 token from production database
 * Token: DXF3LhU2CWo2VS36Ma6JdoCt41xb22b98RgNJD2gu6Px
 * Issues: $284 liquidity, 0 organic score, +352% pump
 */

import fs from 'fs/promises';
import path from 'path';

async function removeCR7Token() {
  console.log('🗑️ Removing CR7 token from production database...');
  
  const contractAddress = 'DXF3LhU2CWo2VS36Ma6JdoCt41xb22b98RgNJD2gu6Px';
  
  try {
    // Try different cache locations
    const cachePaths = [
      '/var/data/dgo/cache/tokens-cache.json',
      'cache/tokens-cache.json',
      'data/cache/tokens-cache.json'
    ];
    
    let tokens = [];
    let foundPath = null;
    
    for (const cachePath of cachePaths) {
      try {
        if (await fs.access(cachePath).then(() => true).catch(() => false)) {
          const data = await fs.readFile(cachePath, 'utf8');
          tokens = JSON.parse(data);
          foundPath = cachePath;
          console.log('📁 Found tokens cache at:', cachePath);
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (tokens.length === 0) {
      console.log('❌ No tokens cache found');
      return;
    }
    
    console.log('📊 Total tokens before removal:', tokens.length);
    
    // Find and remove CR7 token
    const initialCount = tokens.length;
    const filteredTokens = tokens.filter(token => {
      const isCR7 = token.contractAddress === contractAddress || 
                   token.jupiterData?.contractAddress === contractAddress;
      
      if (isCR7) {
        console.log('🚨 Found CR7 token to remove:');
        console.log('  Symbol:', token.symbol);
        console.log('  Name:', token.name);
        console.log('  Contract:', token.contractAddress);
        console.log('  Liquidity:', token.jupiterData?.liquidity);
        console.log('  Organic Score:', token.jupiterData?.organicScore);
        console.log('  Price Change:', token.jupiterData?.stats24h?.priceChange);
      }
      
      return !isCR7;
    });
    
    const removedCount = initialCount - filteredTokens.length;
    
    if (removedCount === 0) {
      console.log('✅ CR7 token not found in database (already removed)');
      return;
    }
    
    // Save filtered tokens back to cache
    await fs.writeFile(foundPath, JSON.stringify(filteredTokens, null, 2));
    
    console.log(`✅ Successfully removed ${removedCount} CR7 token(s)`);
    console.log(`📊 Tokens before: ${initialCount}, after: ${filteredTokens.length}`);
    console.log('🎯 CR7 token has been removed from production database!');
    
  } catch (error) {
    console.error('❌ Error removing CR7 token:', error.message);
    process.exit(1);
  }
}

// Run the removal
removeCR7Token().catch(console.error);
