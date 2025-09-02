// Analyze which backend files are actually being used
import fs from 'fs';
import path from 'path';

function analyzeBackendUsage() {
  console.log('🔍 Analyzing backend file usage...\n');

  // Files we're actively using (based on enhanced-index.js imports)
  const activeFiles = new Set([
    'enhanced-index.js',        // Main entry point
    'enhancedBackend.js',       // Main backend class
    'enhancedTokenProcessor.js', // Token processing
    'jupiterApiService.js',     // Jupiter API service
    'enhancedJupiterService.js', // Enhanced Jupiter service
    'enhancedSocialDataService.js', // Social data service
    'enhancedScoringAlgorithm.js', // Scoring algorithm
    'healthMonitor.js',         // Health monitoring
    'apiAnalytics.js',          // API analytics
    'package.json',             // Package configuration
    'package-lock.json',        // Dependencies lock
    'cache/',                   // Cache directory
    'services/'                 // Services directory
  ]);

  // Get all files in backend directory
  const allFiles = fs.readdirSync('.').filter(file => {
    // Skip node_modules and common exclusions
    return !file.startsWith('.') &&
           file !== 'node_modules' &&
           file !== 'package-lock.json' &&
           !file.endsWith('.log');
  });

  console.log(`📊 Total files in backend: ${allFiles.length}\n`);

  // Categorize files
  const categories = {
    active: [],
    test: [],
    old: [],
    docs: [],
    html: [],
    cache: [],
    unknown: []
  };

  allFiles.forEach(file => {
    const filePath = path.join('.', file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (activeFiles.has(file + '/')) {
        categories.active.push(file + '/');
      } else {
        categories.cache.push(file + '/');
      }
      return;
    }

    // Check if file is actively used
    if (activeFiles.has(file)) {
      categories.active.push(file);
      return;
    }

    // Categorize by pattern
    if (file.startsWith('test-') || file.startsWith('debug-') || file.startsWith('check-')) {
      categories.test.push(file);
    } else if (file.endsWith('.md') || file.endsWith('.MD')) {
      categories.docs.push(file);
    } else if (file.endsWith('.html') || file.endsWith('.css')) {
      categories.html.push(file);
    } else if (file.includes('cache') || file.endsWith('.json')) {
      categories.cache.push(file);
    } else {
      categories.old.push(file);
    }
  });

  console.log('📋 FILE CATEGORIES:\n');

  console.log(`✅ ACTIVE FILES (${categories.active.length}):`);
  categories.active.forEach(file => console.log(`  ${file}`));

  console.log(`\n🧪 TEST FILES (${categories.test.length}):`);
  categories.test.forEach(file => console.log(`  ${file}`));

  console.log(`\n📚 DOCS (${categories.docs.length}):`);
  categories.docs.forEach(file => console.log(`  ${file}`));

  console.log(`\n🌐 HTML/CSS (${categories.html.length}):`);
  categories.html.forEach(file => console.log(`  ${file}`));

  console.log(`\n💾 CACHE/JSON (${categories.cache.length}):`);
  categories.cache.forEach(file => console.log(`  ${file}`));

  console.log(`\n❓ POTENTIALLY UNUSED (${categories.old.length}):`);
  categories.old.forEach(file => console.log(`  ${file}`));

  const totalToDelete = categories.test.length + categories.docs.length + categories.html.length + categories.old.length;
  console.log(`\n🗑️ TOTAL FILES TO CLEAN UP: ${totalToDelete}`);
  console.log(`📊 FILES TO KEEP: ${categories.active.length + categories.cache.length}`);

  console.log('\n🔄 RECOMMENDATIONS:');
  console.log('✅ Keep: Active files and cache');
  console.log('🗑️ Delete: Test files, old files, unused docs');
  console.log('🤔 Review: HTML files (might be useful dashboards)');
}

analyzeBackendUsage();







