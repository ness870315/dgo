// Cleanup script to remove unused backend files
import fs from 'fs';
import path from 'path';

function cleanupUnusedFiles() {
  console.log('🧹 Starting backend cleanup...\n');

  // Files to KEEP (actively used)
  const keepFiles = new Set([
    'enhanced-index.js',        // Main entry point ✅
    'enhancedBackend.js',       // Main backend class ✅
    'enhancedTokenProcessor.js', // Token processing ✅
    'jupiterApiService.js',     // Jupiter API service ✅
    'enhancedJupiterService.js', // Enhanced Jupiter service ✅
    'enhancedSocialDataService.js', // Social data service ✅
    'enhancedScoringAlgorithm.js', // Scoring algorithm ✅
    'healthMonitor.js',         // Health monitoring ✅
    'apiAnalytics.js',          // API analytics ✅
    'package.json',             // Package configuration ✅
    'package-lock.json',        // Dependencies lock ✅
    'cache/',                   // Cache directory ✅
    'services/',                // Services directory ✅
    'health-dashboard.html',    // Useful dashboard ✅
    'api-analytics-dashboard.html', // Useful dashboard ✅
    'fuel-token-dashboard.html', // Useful dashboard ✅
    'fuel-token-effects.css',   // Dashboard styles ✅
    'ENHANCED_ARCHITECTURE_README.md', // Important docs ✅
    'JUPITER_API_README.md'     // Important docs ✅
  ]);

  // Get all files in backend directory
  const allFiles = fs.readdirSync('.').filter(file => {
    // Skip node_modules and common exclusions
    return !file.startsWith('.') &&
           file !== 'node_modules';
  });

  console.log(`📊 Found ${allFiles.length} files total\n`);

  let deletedCount = 0;
  let keptCount = 0;

  // Process each file
  allFiles.forEach(file => {
    const filePath = path.join('.', file);

    try {
      const stat = fs.statSync(filePath);

      // Keep directories that are needed
      if (stat.isDirectory() && keepFiles.has(file + '/')) {
        console.log(`✅ KEEP DIR: ${file}/`);
        keptCount++;
        return;
      }

      // Keep specific files
      if (keepFiles.has(file)) {
        console.log(`✅ KEEP: ${file}`);
        keptCount++;
        return;
      }

      // Delete everything else
      if (stat.isDirectory()) {
        // For directories, check if empty first
        const dirContents = fs.readdirSync(filePath);
        if (dirContents.length === 0) {
          fs.rmdirSync(filePath);
          console.log(`🗑️ DELETED EMPTY DIR: ${file}/`);
          deletedCount++;
        } else {
          console.log(`⚠️ SKIP NON-EMPTY DIR: ${file}/ (${dirContents.length} files)`);
        }
      } else {
        fs.unlinkSync(filePath);
        console.log(`🗑️ DELETED: ${file}`);
        deletedCount++;
      }

    } catch (error) {
      console.log(`❌ Error processing ${file}:`, error.message);
    }
  });

  console.log(`\n✅ CLEANUP COMPLETE:`);
  console.log(`🗑️ Files deleted: ${deletedCount}`);
  console.log(`✅ Files kept: ${keptCount}`);
  console.log(`📊 Total files remaining: ${keptCount}`);

  console.log(`\n🎯 BACKEND IS NOW CLEAN!`);
  console.log(`✅ Only essential files remain`);
  console.log(`🚀 Ready for production use`);
}

cleanupUnusedFiles();







