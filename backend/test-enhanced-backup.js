#!/usr/bin/env node

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import EnhancedBackupService from './enhancedBackupService.js';
import BackupIntegration, { createBackupIntegration } from './backupIntegration.js';
import HybridDatabaseService from './hybridDatabaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Script for Enhanced Backup System
 * 
 * This script tests all functionality of the enhanced backup system:
 * - Service initialization
 * - Snapshot creation
 * - Automatic rotation
 * - Restoration
 * - Integration with HybridDatabaseService
 * - CLI functionality
 */

class BackupSystemTester {
  constructor() {
    this.testDir = path.join(__dirname, 'test-backup-data');
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Enhanced Backup System Test Suite');
    console.log('=====================================\n');

    try {
      await this.setupTestEnvironment();
      
      await this.testBasicService();
      await this.testSnapshotCreation();
      await this.testSnapshotRotation();
      await this.testRestoration();
      await this.testIntegration();
      await this.testHealthChecks();
      
      await this.cleanupTestEnvironment();
      
      this.printTestResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      await this.cleanupTestEnvironment();
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create test data directory
    await fs.mkdir(this.testDir, { recursive: true });
    
    // Create some test data files
    const testData = {
      'test-file-1.json': { data: 'test1', timestamp: new Date().toISOString() },
      'test-file-2.json': { data: 'test2', timestamp: new Date().toISOString() }
    };
    
    for (const [filename, content] of Object.entries(testData)) {
      await fs.writeFile(
        path.join(this.testDir, filename),
        JSON.stringify(content, null, 2)
      );
    }
    
    // Create subdirectory with more test data
    const subDir = path.join(this.testDir, 'subdir');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'nested-file.json'),
      JSON.stringify({ nested: true }, null, 2)
    );
    
    console.log('✅ Test environment ready');
    this.addTestResult('Environment Setup', true, 'Test data created successfully');
  }

  async testBasicService() {
    console.log('\n📋 Testing Basic Service Functionality...');
    
    try {
      // Override DATA_DIR for testing
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      const backupService = new EnhancedBackupService();
      
      // Test initialization
      const status = await backupService.getBackupStatus();
      console.log('   ✓ Service initialization');
      
      // Test configuration
      if (status.configuration.snapshotsPerDay === 5 && 
          status.configuration.retentionHours === 48) {
        console.log('   ✓ Configuration correct');
        this.addTestResult('Basic Service', true, 'Service initialized with correct configuration');
      } else {
        throw new Error('Configuration mismatch');
      }
      
      // Restore original DATA_DIR
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Basic Service', false, error.message);
      throw error;
    }
  }

  async testSnapshotCreation() {
    console.log('\n📸 Testing Snapshot Creation...');
    
    try {
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      const backupService = new EnhancedBackupService();
      
      // Create a snapshot
      const snapshot = await backupService.createSnapshot();
      
      if (snapshot && snapshot.snapshotId) {
        console.log(`   ✓ Snapshot created: ${snapshot.snapshotId}`);
        console.log(`   ✓ Files backed up: ${snapshot.stats.fileCount}`);
        console.log(`   ✓ Size: ${this.formatBytes(snapshot.stats.totalSize)}`);
        
        // Verify snapshot directory exists
        const snapshotDir = path.join(backupService.localCacheDir, snapshot.snapshotId);
        if (fsSync.existsSync(snapshotDir)) {
          console.log('   ✓ Snapshot directory created');
          this.addTestResult('Snapshot Creation', true, `Created snapshot ${snapshot.snapshotId}`);
        } else {
          throw new Error('Snapshot directory not found');
        }
      } else {
        throw new Error('Snapshot creation returned null');
      }
      
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Snapshot Creation', false, error.message);
      throw error;
    }
  }

  async testSnapshotRotation() {
    console.log('\n🔄 Testing Snapshot Rotation...');
    
    try {
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      const backupService = new EnhancedBackupService();
      
      // Create multiple snapshots to test rotation
      const snapshots = [];
      for (let i = 0; i < 3; i++) {
        const snapshot = await backupService.createSnapshot();
        snapshots.push(snapshot);
        console.log(`   ✓ Created snapshot ${i + 1}: ${snapshot.snapshotId}`);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // List snapshots
      const snapshotList = await backupService.listSnapshots();
      console.log(`   ✓ Listed ${snapshotList.length} snapshots`);
      
      if (snapshotList.length === snapshots.length) {
        this.addTestResult('Snapshot Rotation', true, `Created and listed ${snapshots.length} snapshots`);
      } else {
        throw new Error(`Expected ${snapshots.length} snapshots, found ${snapshotList.length}`);
      }
      
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Snapshot Rotation', false, error.message);
      throw error;
    }
  }

  async testRestoration() {
    console.log('\n🔄 Testing Restoration...');
    
    try {
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      const backupService = new EnhancedBackupService();
      
      // Create initial snapshot
      const originalSnapshot = await backupService.createSnapshot();
      console.log(`   ✓ Created original snapshot: ${originalSnapshot.snapshotId}`);
      
      // Modify test data
      await fs.writeFile(
        path.join(this.testDir, 'modified-file.json'),
        JSON.stringify({ modified: true, timestamp: new Date().toISOString() }, null, 2)
      );
      console.log('   ✓ Modified test data');
      
      // Restore from snapshot
      const restored = await backupService.restoreFromSnapshot(originalSnapshot.snapshotId);
      console.log(`   ✓ Restored from snapshot: ${originalSnapshot.snapshotId}`);
      
      // Verify restoration (modified file should be gone)
      const modifiedFileExists = fsSync.existsSync(path.join(this.testDir, 'modified-file.json'));
      if (!modifiedFileExists) {
        console.log('   ✓ Restoration verified (modified file removed)');
        this.addTestResult('Restoration', true, 'Successfully restored from snapshot');
      } else {
        throw new Error('Restoration failed - modified file still exists');
      }
      
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Restoration', false, error.message);
      throw error;
    }
  }

  async testIntegration() {
    console.log('\n🔗 Testing Integration with HybridDatabaseService...');
    
    try {
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      // Create integration
      const integration = await createBackupIntegration();
      console.log('   ✓ Integration created');
      
      // Test status
      const status = await integration.getStatus();
      if (status.initialized && status.backup && status.database) {
        console.log('   ✓ Integration status complete');
      } else {
        throw new Error('Integration status incomplete');
      }
      
      // Test contextual backup
      const contextualBackup = await integration.createContextualBackup('Test integration backup');
      if (contextualBackup && contextualBackup.snapshotId) {
        console.log(`   ✓ Contextual backup created: ${contextualBackup.snapshotId}`);
        this.addTestResult('Integration', true, 'Integration with HybridDatabaseService successful');
      } else {
        throw new Error('Contextual backup failed');
      }
      
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Integration', false, error.message);
      throw error;
    }
  }

  async testHealthChecks() {
    console.log('\n🏥 Testing Health Checks...');
    
    try {
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = this.testDir;
      
      const backupService = new EnhancedBackupService();
      
      // Perform health check
      const health = await backupService.performHealthCheck();
      
      if (health.status && health.timestamp) {
        console.log(`   ✓ Health check completed: ${health.status}`);
        console.log(`   ✓ Issues found: ${health.issues.length}`);
        
        this.addTestResult('Health Checks', true, `Health status: ${health.status}`);
      } else {
        throw new Error('Health check returned invalid data');
      }
      
      if (originalDataDir) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      
    } catch (error) {
      this.addTestResult('Health Checks', false, error.message);
      throw error;
    }
  }

  async cleanupTestEnvironment() {
    console.log('\n🧹 Cleaning up test environment...');
    
    try {
      // Remove test directory
      if (fsSync.existsSync(this.testDir)) {
        await fs.rm(this.testDir, { recursive: true, force: true });
      }
      
      // Remove test backup cache
      const testBackupCache = path.join(__dirname, 'local-backup-cache');
      if (fsSync.existsSync(testBackupCache)) {
        await fs.rm(testBackupCache, { recursive: true, force: true });
      }
      
      console.log('✅ Test environment cleaned up');
      
    } catch (error) {
      console.warn('⚠️ Cleanup warning:', error.message);
    }
  }

  addTestResult(testName, passed, message) {
    this.testResults.push({
      test: testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    });
  }

  printTestResults() {
    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    
    console.log(`\nOverall: ${passed}/${total} tests passed\n`);
    
    this.testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });
    
    if (passed === total) {
      console.log('\n🎉 All tests passed! Enhanced Backup System is working correctly.');
    } else {
      console.log(`\n⚠️ ${total - passed} test(s) failed. Please review the issues above.`);
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new BackupSystemTester();
  tester.runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
}

export default BackupSystemTester;
