import HybridDatabaseService from './hybridDatabaseService.js';
import fs from 'fs/promises';
import path from 'path';

async function checkDatabase() {
  try {
    const db = new HybridDatabaseService();
    console.log('🔍 Database Analysis:');
    console.log('Base directory:', db.baseDir);
    console.log('Cache directory:', db.cacheDir);
    console.log('Users directory:', db.usersDir);
    console.log('Global directory:', db.globalDir);
    
    // Check if directories exist
    try {
      const cacheFiles = await fs.readdir(db.cacheDir);
      console.log('\n📁 Cache files:', cacheFiles);
      
      // Check tokens-cache.json specifically
      const tokensCachePath = path.join(db.cacheDir, 'tokens-cache.json');
      try {
        const tokensData = await fs.readFile(tokensCachePath, 'utf8');
        const tokens = JSON.parse(tokensData);
        console.log('\n📊 Token count:', tokens.length);
        console.log('📊 Sample tokens:', tokens.slice(0, 3).map(t => ({ symbol: t.symbol, name: t.name })));
      } catch (error) {
        console.log('❌ Error reading tokens-cache.json:', error.message);
      }
      
    } catch (error) {
      console.log('❌ Error reading cache directory:', error.message);
    }
    
    // Check if DATA_DIR environment variable is set
    console.log('\n🌍 Environment variables:');
    console.log('DATA_DIR:', process.env.DATA_DIR || 'NOT SET');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDatabase();
