#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DiskUsageAnalyzer {
  constructor() {
    this.dataDir = process.env.DATA_DIR || '/var/data/dgo';
    this.cacheDir = path.join(this.dataDir, 'cache');
    this.usersDir = path.join(this.dataDir, 'users');
    this.globalDir = path.join(this.dataDir, 'global');
    this.logsDir = path.join(this.dataDir, 'logs');
    
    this.analysis = {
      totalSize: 0,
      categories: {},
      recommendations: []
    };
  }

  async analyzeDirectory(dirPath, categoryName) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return { size: stats.size, files: 1, subdirs: 0 };
      }

      const items = await fs.readdir(dirPath);
      let totalSize = 0;
      let fileCount = 0;
      let subdirCount = 0;
      const fileDetails = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        try {
          const itemStats = await fs.stat(itemPath);
          
          if (itemStats.isDirectory()) {
            subdirCount++;
            const subStats = await this.analyzeDirectory(itemPath, `${categoryName}/${item}`);
            totalSize += subStats.size;
            fileCount += subStats.files;
            subdirCount += subStats.subdirs;
            
            // Add large subdirectories to details
            if (subStats.size > 1024 * 1024) { // > 1MB
              fileDetails.push({
                name: item,
                size: subStats.size,
                files: subStats.files,
                type: 'directory'
              });
            }
          } else {
            totalSize += itemStats.size;
            fileCount++;
            
            // Add large files to details
            if (itemStats.size > 100 * 1024) { // > 100KB
              fileDetails.push({
                name: item,
                size: itemStats.size,
                modified: itemStats.mtime,
                type: 'file'
              });
            }
          }
        } catch (error) {
          // Skip files we can't access
        }
      }

      return {
        size: totalSize,
        files: fileCount,
        subdirs: subdirCount,
        details: fileDetails.sort((a, b) => b.size - a.size)
      };
    } catch (error) {
      return { size: 0, files: 0, subdirs: 0, error: error.message };
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

  async analyze() {
    console.log('🔍 DISK USAGE ANALYSIS');
    console.log('=' .repeat(60));
    console.log(`📂 Data Directory: ${this.dataDir}`);
    console.log(`💾 Cache Directory: ${this.cacheDir}`);
    console.log(`👥 Users Directory: ${this.usersDir}`);
    console.log(`🌐 Global Directory: ${this.globalDir}`);
    console.log(`📝 Logs Directory: ${this.logsDir}`);
    console.log('');

    // Analyze each directory
    const directories = [
      { path: this.cacheDir, name: 'Cache' },
      { path: this.usersDir, name: 'Users' },
      { path: this.globalDir, name: 'Global' },
      { path: this.logsDir, name: 'Logs' }
    ];

    for (const dir of directories) {
      console.log(`📁 Analyzing ${dir.name} Directory...`);
      const stats = await this.analyzeDirectory(dir.path, dir.name);
      
      this.analysis.categories[dir.name] = {
        size: stats.size,
        files: stats.files,
        subdirs: stats.subdirs,
        details: stats.details || []
      };
      
      this.analysis.totalSize += stats.size;
      
      console.log(`   Size: ${this.formatBytes(stats.size)}`);
      console.log(`   Files: ${stats.files}`);
      console.log(`   Subdirectories: ${stats.subdirs}`);
      
      if (stats.details && stats.details.length > 0) {
        console.log(`   📋 Large Items:`);
        stats.details.slice(0, 10).forEach(item => {
          const sizeStr = this.formatBytes(item.size);
          const dateStr = item.modified ? ` (${this.formatDate(item.modified)})` : '';
          console.log(`      ${item.name}: ${sizeStr}${dateStr}`);
        });
        if (stats.details.length > 10) {
          console.log(`      ... and ${stats.details.length - 10} more items`);
        }
      }
      console.log('');
    }

    // Generate recommendations
    this.generateRecommendations();
    
    // Display summary
    this.displaySummary();
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Check cache directory
    const cacheStats = this.analysis.categories['Cache'];
    if (cacheStats) {
      // Check for old backup files
      const backupFiles = cacheStats.details.filter(item => 
        item.name.includes('backup') || item.name.includes('old') || item.name.includes('temp')
      );
      if (backupFiles.length > 0) {
        const backupSize = backupFiles.reduce((sum, file) => sum + file.size, 0);
        recommendations.push({
          type: 'SAFE_DELETE',
          category: 'Backup Files',
          description: `Delete old backup files in cache directory`,
          size: backupSize,
          files: backupFiles.length,
          action: `rm ${this.cacheDir}/*backup* ${this.cacheDir}/*old* ${this.cacheDir}/*temp*`
        });
      }

      // Check for large cache files
      const largeFiles = cacheStats.details.filter(item => item.size > 50 * 1024 * 1024); // > 50MB
      largeFiles.forEach(file => {
        if (file.name.includes('twitter_metrics') || file.name.includes('tokens-cache')) {
          recommendations.push({
            type: 'ANALYZE',
            category: 'Large Cache Files',
            description: `Analyze ${file.name} for optimization opportunities`,
            size: file.size,
            files: 1,
            action: `Check if ${file.name} can be compressed or cleaned`
          });
        }
      });
    }

    // Check logs directory
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
          description: `Delete log files older than 7 days`,
          size: oldLogsSize,
          files: oldLogs.length,
          action: `find ${this.logsDir} -name "*.log" -mtime +7 -delete`
        });
      }
    }

    // Check users directory for old activity logs
    const usersStats = this.analysis.categories['Users'];
    if (usersStats) {
      const activityFiles = usersStats.details.filter(item => 
        item.name.includes('activity.json') && item.size > 10 * 1024 // > 10KB
      );
      if (activityFiles.length > 0) {
        recommendations.push({
          type: 'ANALYZE',
          category: 'User Activity Logs',
          description: `Consider cleaning old user activity logs`,
          size: activityFiles.reduce((sum, file) => sum + file.size, 0),
          files: activityFiles.length,
          action: `Review user activity.json files for cleanup`
        });
      }
    }

    this.analysis.recommendations = recommendations;
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
      const percentage = ((stats.size / this.analysis.totalSize) * 100).toFixed(1);
      console.log(`   ${category}: ${this.formatBytes(stats.size)} (${percentage}%)`);
    });
    console.log('');

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
          console.log(`   Command: ${rec.action}`);
          console.log('');
        });
      }
      
      if (analyze.length > 0) {
        console.log('🔍 NEEDS ANALYSIS:');
        analyze.forEach(rec => {
          console.log(`   ${rec.category}: ${this.formatBytes(rec.size)} (${rec.files} files)`);
          console.log(`   Description: ${rec.description}`);
          console.log(`   Action: ${rec.action}`);
          console.log('');
        });
      }
      
      const totalSavings = this.analysis.recommendations
        .filter(r => r.type === 'SAFE_DELETE')
        .reduce((sum, r) => sum + r.size, 0);
      
      if (totalSavings > 0) {
        console.log(`💰 Potential Space Savings: ${this.formatBytes(totalSavings)}`);
        console.log(`📊 New Usage After Cleanup: ${((this.analysis.totalSize - totalSavings) / (10 * 1024 * 1024 * 1024) * 100).toFixed(1)}%`);
      }
    } else {
      console.log('✅ No immediate optimization opportunities found');
    }
  }
}

// Run the analysis
const analyzer = new DiskUsageAnalyzer();
analyzer.analyze().then(() => {
  console.log('🎉 Disk usage analysis completed!');
}).catch(error => {
  console.error('❌ Analysis failed:', error);
});
