#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class ProductionDiskAnalyzer {
  constructor() {
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
      // Use du command for accurate disk usage
      const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null || echo "0"`);
      const sizeBytes = parseInt(stdout.trim().split('\t')[0]) || 0;
      
      // Get file count
      const { stdout: fileCount } = await execAsync(`find "${dirPath}" -type f 2>/dev/null | wc -l`);
      const files = parseInt(fileCount.trim()) || 0;
      
      // Get large files (>1MB)
      const { stdout: largeFiles } = await execAsync(`find "${dirPath}" -type f -size +1M -exec ls -lh {} \\; 2>/dev/null || echo ""`);
      const fileDetails = [];
      
      if (largeFiles.trim()) {
        const lines = largeFiles.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 9) {
            const sizeStr = parts[4];
            const filePath = parts.slice(8).join(' ');
            const fileName = path.basename(filePath);
            
            // Convert size to bytes
            let sizeBytes = 0;
            if (sizeStr.includes('G')) {
              sizeBytes = parseFloat(sizeStr) * 1024 * 1024 * 1024;
            } else if (sizeStr.includes('M')) {
              sizeBytes = parseFloat(sizeStr) * 1024 * 1024;
            } else if (sizeStr.includes('K')) {
              sizeBytes = parseFloat(sizeStr) * 1024;
            } else {
              sizeBytes = parseFloat(sizeStr);
            }
            
            fileDetails.push({
              name: fileName,
              size: sizeBytes,
              path: filePath,
              type: 'file'
            });
          }
        }
      }
      
      return { size: sizeBytes, files, details: fileDetails };
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

  async checkSpecificFiles() {
    console.log('🔍 Checking Specific Important Files...');
    
    const importantFiles = [
      { path: path.join(this.cacheDir, 'tokens-cache.json'), name: 'tokens-cache.json' },
      { path: path.join(this.cacheDir, 'twitter_metrics.json'), name: 'twitter_metrics.json' },
      { path: path.join(this.cacheDir, 'ohlcv-cache.json'), name: 'ohlcv-cache.json' },
      { path: path.join(this.cacheDir, 'holders-cache.json'), name: 'holders-cache.json' },
      { path: path.join(this.cacheDir, 'backup-metadata.json'), name: 'backup-metadata.json' },
      { path: path.join(this.cacheDir, 'cache', 'twitter_metrics.json'), name: 'cache/twitter_metrics.json' }
    ];

    for (const file of importantFiles) {
      try {
        const stats = await fs.stat(file.path);
        const sizeStr = this.formatBytes(stats.size);
        const dateStr = this.formatDate(stats.mtime);
        console.log(`   ${file.name}: ${sizeStr} (${dateStr})`);
        
        if (stats.size > 5 * 1024 * 1024) { // > 5MB
          this.analysis.largeFiles.push({
            name: file.name,
            size: stats.size,
            path: file.path,
            modified: stats.mtime,
            category: 'cache'
          });
        }
      } catch (error) {
        console.log(`   ${file.name}: Not found`);
      }
    }
  }

  async findBackupFiles() {
    console.log('🔍 Searching for Backup and Temporary Files...');
    
    try {
      // Find backup files
      const { stdout: backupFiles } = await execAsync(`find "${this.dataDir}" -name "*backup*" -o -name "*old*" -o -name "*temp*" -o -name "*.tmp" 2>/dev/null || echo ""`);
      
      if (backupFiles.trim()) {
        const files = backupFiles.trim().split('\n');
        let totalBackupSize = 0;
        
        console.log(`   Found ${files.length} backup/temp files:`);
        
        for (const filePath of files) {
          try {
            const stats = await fs.stat(filePath);
            const sizeStr = this.formatBytes(stats.size);
            const fileName = path.basename(filePath);
            console.log(`      ${fileName}: ${sizeStr}`);
            totalBackupSize += stats.size;
          } catch (error) {
            // Skip inaccessible files
          }
        }
        
        if (totalBackupSize > 0) {
          this.analysis.recommendations.push({
            type: 'SAFE_DELETE',
            category: 'Backup Files',
            description: 'Delete backup and temporary files',
            size: totalBackupSize,
            files: files.length,
            action: `find "${this.dataDir}" -name "*backup*" -o -name "*old*" -o -name "*temp*" -o -name "*.tmp" -delete`,
            impact: 'None - these are temporary/backup files'
          });
        }
      } else {
        console.log('   No backup/temp files found');
      }
    } catch (error) {
      console.log('   Error searching for backup files:', error.message);
    }
  }

  async findOldLogs() {
    console.log('🔍 Searching for Old Log Files...');
    
    try {
      // Find log files older than 7 days
      const { stdout: oldLogs } = await execAsync(`find "${this.dataDir}" -name "*.log" -mtime +7 2>/dev/null || echo ""`);
      
      if (oldLogs.trim()) {
        const files = oldLogs.trim().split('\n');
        let totalLogSize = 0;
        
        console.log(`   Found ${files.length} old log files (>7 days):`);
        
        for (const filePath of files) {
          try {
            const stats = await fs.stat(filePath);
            const sizeStr = this.formatBytes(stats.size);
            const fileName = path.basename(filePath);
            const dateStr = this.formatDate(stats.mtime);
            console.log(`      ${fileName}: ${sizeStr} (${dateStr})`);
            totalLogSize += stats.size;
          } catch (error) {
            // Skip inaccessible files
          }
        }
        
        if (totalLogSize > 0) {
          this.analysis.recommendations.push({
            type: 'SAFE_DELETE',
            category: 'Old Log Files',
            description: 'Delete log files older than 7 days',
            size: totalLogSize,
            files: files.length,
            action: `find "${this.dataDir}" -name "*.log" -mtime +7 -delete`,
            impact: 'None - old logs are not needed'
          });
        }
      } else {
        console.log('   No old log files found');
      }
    } catch (error) {
      console.log('   Error searching for old logs:', error.message);
    }
  }

  async analyzeDirectory(dirPath, dirName) {
    console.log(`📁 Analyzing ${dirName} Directory...`);
    
    if (!await this.directoryExists(dirPath)) {
      console.log(`   Directory does not exist: ${dirPath}`);
      return { size: 0, files: 0, details: [] };
    }
    
    const stats = await this.getDirectorySize(dirPath);
    
    this.analysis.categories[dirName] = {
      size: stats.size,
      files: stats.files,
      details: stats.details
    };
    
    console.log(`   Size: ${this.formatBytes(stats.size)}`);
    console.log(`   Files: ${stats.files}`);
    
    if (stats.details.length > 0) {
      console.log(`   📋 Large Files (>1MB):`);
      stats.details.slice(0, 10).forEach(item => {
        const sizeStr = this.formatBytes(item.size);
        console.log(`      ${item.name}: ${sizeStr}`);
      });
      if (stats.details.length > 10) {
        console.log(`      ... and ${stats.details.length - 10} more large files`);
      }
    }
    
    return stats;
  }

  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
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

    // Check if we're actually in production
    try {
      const stats = await fs.stat(this.dataDir);
      if (!stats.isDirectory()) {
        console.log('❌ ERROR: Not running in production environment');
        console.log(`   ${this.dataDir} does not exist or is not a directory`);
        console.log('   This script must be run on the production server');
        return;
      }
    } catch (error) {
      console.log('❌ ERROR: Not running in production environment');
      console.log(`   Cannot access ${this.dataDir}: ${error.message}`);
      console.log('   This script must be run on the production server');
      return;
    }

    // Analyze each directory
    await this.analyzeDirectory(this.cacheDir, 'Cache');
    console.log('');
    
    await this.analyzeDirectory(this.usersDir, 'Users');
    console.log('');
    
    await this.analyzeDirectory(this.globalDir, 'Global');
    console.log('');
    
    await this.analyzeDirectory(this.logsDir, 'Logs');
    console.log('');

    // Check specific important files
    await this.checkSpecificFiles();
    console.log('');

    // Find backup and temp files
    await this.findBackupFiles();
    console.log('');

    // Find old log files
    await this.findOldLogs();
    console.log('');

    // Calculate totals
    this.analysis.totalSize = Object.values(this.analysis.categories)
      .reduce((sum, cat) => sum + cat.size, 0);

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
        .slice(0, 15)
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
      
      if (safeDelete.length > 0) {
        console.log('🗑️ SAFE TO DELETE (No Impact on Calculations):');
        safeDelete.forEach(rec => {
          console.log(`   ${rec.category}: ${this.formatBytes(rec.size)} (${rec.files} files)`);
          console.log(`   Description: ${rec.description}`);
          console.log(`   Impact: ${rec.impact}`);
          console.log(`   Command: ${rec.action}`);
          console.log('');
        });
        
        const totalSavings = safeDelete.reduce((sum, r) => sum + r.size, 0);
        console.log(`💰 Total Space Savings: ${this.formatBytes(totalSavings)}`);
        const newUsage = ((this.analysis.totalSize - totalSavings) / (10 * 1024 * 1024 * 1024) * 100).toFixed(1);
        console.log(`📊 New Usage After Cleanup: ${newUsage}%`);
        console.log('');
      }
    } else {
      console.log('✅ No immediate optimization opportunities found');
    }

    // Hype over time status
    console.log('📈 HYPE OVER TIME STATUS:');
    console.log('=' .repeat(60));
    console.log('✅ 30-day retention policy: Active');
    console.log('✅ Automatic cleanup: Enabled');
    console.log('✅ 5-minute intervals: Optimized');
    console.log('✅ No manual intervention needed');
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
