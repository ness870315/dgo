import HybridDatabaseService from './hybridDatabaseService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanupExpiredFuel() {
  console.log('🧹 Starting cleanup of expired fuel flags...');
  
  try {
    // Load tokens cache
    const tokensCachePath = path.join(process.env.DATA_DIR || '/var/data/dgo', 'cache', 'tokens-cache.json');
    const tokens = JSON.parse(await fs.readFile(tokensCachePath, 'utf8'));
    
    console.log(`📊 Loaded ${tokens.length} tokens from cache`);
    
    let cleanedCount = 0;
    let expiredFuelTokens = [];
    
    for (const token of tokens) {
      let needsUpdate = false;
      const updates = {};
      
      // Check if token has fuel flags but expired fuel
      if (token.isPaid || token.isFueled) {
        const now = Date.now();
        let hasActiveFuel = false;
        
        // Check fuel expiry time
        if (token.fuelExpiry) {
          const expiryTime = new Date(token.fuelExpiry).getTime();
          if (expiryTime > now) {
            hasActiveFuel = true;
          }
        }
        
        // Check fuel applications (newer format)
        if (!hasActiveFuel && token.fuelApplications && Array.isArray(token.fuelApplications)) {
          const activeApplications = token.fuelApplications.filter(app => {
            const expiryTime = new Date(app.expiresAt).getTime();
            return expiryTime > now;
          });
          hasActiveFuel = activeApplications.length > 0;
        }
        
        // If no active fuel but still flagged, clean it up
        if (!hasActiveFuel) {
          console.log(`🧹 Cleaning expired fuel for ${token.symbol} (${token.contractAddress?.substring(0, 8)}...)`);
          
          // Remove fuel flags
          if (token.isPaid) {
            updates.isPaid = false;
            needsUpdate = true;
          }
          if (token.isFueled) {
            updates.isFueled = false;
            needsUpdate = true;
          }
          
          // Remove fuel-related fields
          if (token.fuelExpiry) {
            updates.fuelExpiry = undefined;
            needsUpdate = true;
          }
          if (token.fuelApplications) {
            updates.fuelApplications = undefined;
            needsUpdate = true;
          }
          if (token.fuelType) {
            updates.fuelType = undefined;
            needsUpdate = true;
          }
          if (token.boostMultiplier) {
            updates.boostMultiplier = undefined;
            needsUpdate = true;
          }
          
          expiredFuelTokens.push({
            symbol: token.symbol,
            contractAddress: token.contractAddress,
            originalScore: token.overallScore || token.score,
            hadFuelExpiry: !!token.fuelExpiry,
            hadFuelApplications: !!token.fuelApplications
          });
          
          cleanedCount++;
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        Object.assign(token, updates);
      }
    }
    
    // Save updated tokens cache
    if (cleanedCount > 0) {
      await fs.writeFile(tokensCachePath, JSON.stringify(tokens, null, 2));
      console.log(`✅ Updated tokens cache with ${cleanedCount} cleaned tokens`);
    }
    
    // Also check fueled-tokens.json file
    const fueledTokensPath = path.join(process.env.DATA_DIR || '/var/data/dgo', 'fueled-tokens.json');
    try {
      const fueledTokens = JSON.parse(await fs.readFile(fueledTokensPath, 'utf8'));
      const now = Date.now();
      
      const activeFueledTokens = fueledTokens.filter(token => {
        if (token.fuelApplications && Array.isArray(token.fuelApplications)) {
          const activeApplications = token.fuelApplications.filter(app => {
            const expiryTime = new Date(app.expiresAt).getTime();
            return expiryTime > now;
          });
          return activeApplications.length > 0;
        } else if (token.fuelExpiry) {
          const expiryTime = new Date(token.fuelExpiry).getTime();
          return expiryTime > now;
        }
        return false; // Remove tokens without proper expiry info
      });
      
      if (activeFueledTokens.length !== fueledTokens.length) {
        await fs.writeFile(fueledTokensPath, JSON.stringify(activeFueledTokens, null, 2));
        console.log(`✅ Cleaned fueled-tokens.json: ${fueledTokens.length} → ${activeFueledTokens.length} active tokens`);
      }
    } catch (error) {
      console.log(`⚠️ Could not clean fueled-tokens.json: ${error.message}`);
    }
    
    // Summary
    console.log(`\n📊 CLEANUP SUMMARY:`);
    console.log(`   Tokens processed: ${tokens.length}`);
    console.log(`   Tokens cleaned: ${cleanedCount}`);
    console.log(`   Expired fuel tokens found: ${expiredFuelTokens.length}`);
    
    if (expiredFuelTokens.length > 0) {
      console.log(`\n🧹 EXPIRED FUEL TOKENS CLEANED:`);
      expiredFuelTokens.forEach(token => {
        console.log(`   • ${token.symbol} (${token.contractAddress?.substring(0, 8)}...) - Score: ${token.originalScore?.toFixed(2)}`);
      });
    }
    
    console.log(`\n✅ Cleanup completed successfully!`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

cleanupExpiredFuel().catch(console.error);
