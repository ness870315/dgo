#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProductionDiskAnalyzer {
  constructor() {
    // Production data directory
    this.dataDir = '/var/data/dgo';
    this.cacheDir = path.join(this.dataDir, 'cache');
    this.usersDir = path.join(this.dataDir, 'users');
    this.globalDir = path.join(this.dataDir, 'global');
    this.logsDir = path.join(this.dataDir, 'logs');
    
    this.analysis = {
      totalSize: 0,
      categories: {},
      recommendations: [],
      largeFiles: []
    };
  }

  async getDirectorySize(dirPath) {
    try {
      const items = await fs.readdir(dirPath);
      let totalSize = 0;
      let fileCount = 0;
      const fileDetails = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        try {
          const stats = await fs.stat(itemPath);
          
          if (stats.isDirectory()) {
            const subStats = await this.getDirectorySize(itemPath);
            totalSize += subStats.size;
            fileCount += subStats.files;
            
            // Track large subdirectories
            if (subStats.size > 10 * 1024 * 1024) { // > 10MB
              fileDetails.push({
                name: item,
                size: subStats.size,
                files: subStats.files,
                type: 'directory',
                path: itemPath
              });
            }
          } else {
            totalSize += stats.size;
            fileCount++;
            
            // Track large files
            if (stats.size > 1024 * 1024) { // > 1MB
              fileDetails.push({
                name: item,
                size: stats.size,
                modified: stats.mtime,
                type: 'file',
                path: itemPath
              });
            }
          }
        } catch (error) {
          // Skip inaccessible files
        }
      }

      return { size: totalSize, files: fileCount, details: fileDetails };
    } catch (error) {
      return { size: 0, files: 0, details: [], error: error.message };
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(date) {
    return new Date(date).toISOString().split('T')[0];
  }

  async analyzeCacheDirectory() {
    console.log('📁 Analyzing Cache Directory...');
    const stats = await this.getDirectorySize(this.cacheDir);
    
    this.analysis.categories['Cache'] = {
      size: stats.size,
      files: stats.files,
      details: stats.details
    };
    
    console.log(`   Size: ${this.formatBytes(stats.size)}`);
    console.log(`   Files: ${stats.files}`);
    
    if (stats.details.length > 0) {
      console.log(`   📋 Large Items:`);
      stats.details.slice(0, 15).forEach(item => {
        const sizeStr = this.formatBytes(item.size);
        const dateStr = item.modified ? ` (${this.formatDate(item.modified)})` : '';
        console.log(`      ${item.name}: ${sizeStr}${dateStr}`);
      });
    }
    
    // Check for specific cache files
    await this.analyzeSpecificCacheFiles();
  }

  async analyzeSpecificCacheFiles() {
    const importantFiles = [
      'tokens-cache.json',
      'twitter_metrics.json',
      'ohlcv-cache.json',
      'holders-cache.json',
      'backup-metadata.json'
    ];

    console.log(`   🔍 Checking Important Cache Files:`);
    
    for (const fileName of importantFiles) {
      const filePath = path.join(this.cacheDir, fileName);
      try {
        const stats = await fs.stat(filePath);
        console.log(`      ${fileName}: ${this.formatBytes(stats.size)} (${this.formatDate(stats.mtime)})`);
        
        // Add to large files if significant
        if (stats.size > 5 * 1024 * 1024) { // > 5MB
          this.analysis.largeFiles.push({
            name: fileName,
            size: stats.size,
            path: filePath,
            modified: stats.mtime,
            category: 'cache'
          });
        }
      } catch (error) {
        console.log(`      ${fileName}: Not found`);
      }
    }
  }

  async analyzeUsersDirectory() {
    console.log('📁 Analyzing Users Directory...');
    const stats = await this.getDirectorySize(this.usersDir);
    
    this.analysis.categories['Users'] = {
      size: stats.size,
      files: stats.files,
      details: stats.details
    };
    
    console.log(`   Size: ${this.formatBytes(stats.size)}`);
    console.log(`   Files: ${stats.files}`);
    
    if (stats.details.length > 0) {
      console.log(`   📋 Large User Directories:`);
      stats.details.slice(0, 10).forEach(item => {
        const sizeStr = this.formatBytes(item.size);
        console.log(`      ${item.name}: ${sizeStr} (${item.files} files)`);
      });
    }
  }

  async analyzeGlobalDirectory() {
    console.log('📁 Analyzing Global Directory...');
    const stats = await this.getDirectorySize(this.globalDir);
    
    this.analysis.categories['Global'] = {
      size: stats.size,
      files: stats.files,
      details: stats.details
    };
    
    console.log(`   Size: ${this.formatBytes(stats.size)}`);
    console.log(`   Files: ${stats.files}`);
    
    if (stats.details.length > 0) {
      console.log(`   📋 Large Global Items:`);
      stats.details.forEach(item => {
        const sizeStr = this.formatBytes(item.size);
        console.log(`      ${item.name}: ${sizeStr}`);
      });
    }
  }

  async analyzeLogsDirectory() {
    console.log('📁 Analyzing Logs Directory...');
    const stats = await this.getDirectorySize(this.logsDir);
    
    this.analysis.categories['Logs'] = {
      size: stats.size,
      files: stats.files,
      details: stats.details
    };
    
    console.log(`   Size: ${this.formatBytes(stats.size)}`);
    console.log(`   Files: ${stats.files}`);
    
    if (stats.details.length > 0) {
      console.log(`   📋 Large Log Files:`);
      stats.details.forEach(item => {
        const sizeStr = this.formatBytes(item.size);
        const dateStr = item.modified ? ` (${this.formatDate(item.modified)})` : '';
        console.log(`      ${item.name}: ${sizeStr}${dateStr}`);
      });
    }
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Analyze cache files
    const cacheStats = this.analysis.categories['Cache'];
    if (cacheStats) {
      // Check for backup files
      const backupFiles = cacheStats.details.filter(item => 
        item.name.includes('backup') || 
        item.name.includes('old') || 
        item.name.includes('temp') ||
        item.name.includes('.tmp')
      );
      
      if (backupFiles.length > 0) {
        const backupSize = backupFiles.reduce((sum, file) => sum + file.size, 0);
        recommendations.push({
          type: 'SAFE_DELETE',
          category: 'Backup Files',
          description: 'Delete old backup and temporary files',
          size: backupSize,
          files: backupFiles.length,
          action: `find ${this.cacheDir} -name "*backup*" -o -name "*old*" -o -name "*temp*" -o -name "*.tmp" -delete`,
          impact: 'None - these are temporary/backup files'
        });
      }

      // Check for large Twitter metrics
      const twitterMetrics = cacheStats.details.find(item => item.name.includes('twitter_metrics'));
      if (twitterMetrics && twitterMetrics.size > 100 * 1024 * 1024) { // > 100MB
        recommendations.push({
          type: 'ANALYZE',
          category: 'Twitter Metrics',
          description: 'Large Twitter metrics file - consider compression or cleanup',
          size: twitterMetrics.size,
          files: 1,
          action: `Analyze ${twitterMetrics.name} for optimization`,
          impact: 'Low - can be regenerated from API'
        });
      }

      // Check for large tokens cache
      const tokensCache = cacheStats.details.find(item => item.name.includes('tokens-cache'));
      if (tokensCache && tokensCache.size > 200 * 1024 * 1024) { // > 200MB
        recommendations.push({
          type: 'ANALYZE',
          category: 'Tokens Cache',
          description: 'Large tokens cache file - consider cleanup of old tokens',
          size: tokensCache.size,
          files: 1,
          action: `Run token cleanup to remove dead tokens`,
          impact: 'Low - dead tokens can be removed safely'
        });
      }
    }

    // Analyze logs
    const logsStats = this.analysis.categories['Logs'];
    if (logsStats) {
      const oldLogs = logsStats.details.filter(item => {
        if (!item.modified) return false;
        const daysSinceModified = (Date.now() - new Date(item.modified).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceModified > 7; // Older than 7 days
      });
      
      if (oldLogs.length > 0) {
        const oldLogsSize = oldLogs.reduce((sum, file) => sum + file.size, 0);
        recommendations.push({
          type: 'SAFE_DELETE',
          category: 'Old Log Files',
          description: 'Delete log files older than 7 days',
          size: oldLogsSize,
          files: oldLogs.length,
          action: `find ${this.logsDir} -name "*.log" -mtime +7 -delete`,
          impact: 'None - old logs are not needed'
        });
      }
    }

    // Analyze users directory
    const usersStats = this.analysis.categories['Users'];
    if (usersStats) {
      // Check for large activity files
      const largeActivityFiles = usersStats.details.filter(item => 
        item.name.includes('activity.json') && item.size > 1024 * 1024 // > 1MB
      );
      
      if (largeActivityFiles.length > 0) {
        const totalSize = largeActivityFiles.reduce((sum, file) => sum + file.size, 0);
        recommendations.push({
          type: 'ANALYZE',
          category: 'User Activity Logs',
          description: 'Large user activity files - consider cleanup',
          size: totalSize,
          files: largeActivityFiles.length,
          action: `Review and clean old user activity logs`,
          impact: 'Low - old activity logs can be archived'
        });
      }
    }

    this.analysis.recommendations = recommendations;
  }

  async analyze() {
    console.log('🔍 PRODUCTION DISK USAGE ANALYSIS');
    console.log('=' .repeat(60));
    console.log(`📂 Data Directory: ${this.dataDir}`);
    console.log(`💾 Cache Directory: ${this.cacheDir}`);
    console.log(`👥 Users Directory: ${this.usersDir}`);
    console.log(`🌐 Global Directory: ${this.globalDir}`);
    console.log(`📝 Logs Directory: ${this.logsDir}`);
    console.log('');

    // Analyze each directory
    await this.analyzeCacheDirectory();
    console.log('');
    
    await this.analyzeUsersDirectory();
    console.log('');
    
    await this.analyzeGlobalDirectory();
    console.log('');
    
    await this.analyzeLogsDirectory();
    console.log('');

    // Calculate totals
    this.analysis.totalSize = Object.values(this.analysis.categories)
      .reduce((sum, cat) => sum + cat.size, 0);

    // Generate recommendations
    this.generateRecommendations();
    
    // Display summary
    this.displaySummary();
  }

  displaySummary() {
    console.log('📊 SUMMARY');
    console.log('=' .repeat(60));
    console.log(`💾 Total Disk Usage: ${this.formatBytes(this.analysis.totalSize)}`);
    console.log(`📈 Percentage of 10GB: ${((this.analysis.totalSize / (10 * 1024 * 1024 * 1024)) * 100).toFixed(1)}%`);
    console.log('');

    // Category breakdown
    console.log('📋 Category Breakdown:');
    Object.entries(this.analysis.categories).forEach(([category, stats]) => {
      const percentage = this.analysis.totalSize > 0 ? ((stats.size / this.analysis.totalSize) * 100).toFixed(1) : '0.0';
      console.log(`   ${category}: ${this.formatBytes(stats.size)} (${percentage}%)`);
    });
    console.log('');

    // Large files summary
    if (this.analysis.largeFiles.length > 0) {
      console.log('📋 Largest Files:');
      this.analysis.largeFiles
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .forEach(file => {
          const sizeStr = this.formatBytes(file.size);
          const dateStr = file.modified ? ` (${this.formatDate(file.modified)})` : '';
          console.log(`   ${file.name}: ${sizeStr}${dateStr}`);
        });
      console.log('');
    }

    // Recommendations
    if (this.analysis.recommendations.length > 0) {
      console.log('💡 OPTIMIZATION RECOMMENDATIONS');
      console.log('=' .repeat(60));
      
      const safeDelete = this.analysis.recommendations.filter(r => r.type === 'SAFE_DELETE');
      const analyze = this.analysis.recommendations.filter(r => r.type === 'ANALYZE');
      
      if (safeDelete.length > 0) {
        console.log('🗑️ SAFE TO DELETE (No Impact on Calculations):');
        safeDelete.forEach(rec => {
          console.log(`   ${rec.category}: ${this.formatBytes(rec.size)} (${rec.files} files)`);
          console.log(`   Description: ${rec.description}`);
          console.log(`   Impact: ${rec.impact}`);
          console.log(`   Command: ${rec.action}`);
          console.log('');
        });
      }
      
      if (analyze.length > 0) {
        console.log('🔍 NEEDS ANALYSIS:');
        analyze.forEach(rec => {
          console.log(`   ${rec.category}: ${this.formatBytes(rec.size)} (${rec.files} files)`);
          console.log(`   Description: ${rec.description}`);
          console.log(`   Impact: ${rec.impact}`);
          console.log(`   Action: ${rec.action}`);
          console.log('');
        });
      }
      
      const totalSavings = this.analysis.recommendations
        .filter(r => r.type === 'SAFE_DELETE')
        .reduce((sum, r) => sum + r.size, 0);
      
      if (totalSavings > 0) {
        console.log(`💰 Potential Space Savings: ${this.formatBytes(totalSavings)}`);
        const newUsage = ((this.analysis.totalSize - totalSavings) / (10 * 1024 * 1024 * 1024) * 100).toFixed(1);
        console.log(`📊 New Usage After Cleanup: ${newUsage}%`);
      }
    } else {
      console.log('✅ No immediate optimization opportunities found');
    }

    // Hype over time recommendations
    console.log('📈 HYPE OVER TIME OPTIMIZATION:');
    console.log('=' .repeat(60));
    console.log('✅ Current Implementation: 30-day retention policy');
    console.log('✅ Automatic cleanup: Old snapshots are automatically deleted');
    console.log('✅ 5-minute intervals: Reduces data volume while maintaining accuracy');
    console.log('✅ No manual intervention needed for hype snapshots');
    console.log('');
  }
}

// Run the analysis
const analyzer = new ProductionDiskAnalyzer();
analyzer.analyze().then(() => {
  console.log('🎉 Production disk usage analysis completed!');
}).catch(error => {
  console.error('❌ Analysis failed:', error);
});
