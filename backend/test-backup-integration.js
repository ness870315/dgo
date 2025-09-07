#!/usr/bin/env node

/**
 * Quick Test Script for Enhanced Backup Integration
 * 
 * This script tests that the enhanced backup system is properly integrated
 * and working with the main backend.
 */

import { createBackupIntegration } from './backupIntegration.js';
import HybridDatabaseService from './hybridDatabaseService.js';

async function testBackupIntegration() {
    console.log('🧪 Testing Enhanced Backup Integration...\n');

    try {
        // Test 1: Initialize HybridDatabaseService
        console.log('1️⃣ Testing HybridDatabaseService initialization...');
        const hybridDb = new HybridDatabaseService();
        console.log('✅ HybridDatabaseService initialized');
        console.log(`   Base directory: ${hybridDb.baseDir}`);
        console.log(`   Users directory: ${hybridDb.usersDir}`);
        console.log(`   Cache directory: ${hybridDb.cacheDir}\n`);

        // Test 2: Initialize Backup Integration
        console.log('2️⃣ Testing Backup Integration initialization...');
        const backupIntegration = await createBackupIntegration(hybridDb);
        console.log('✅ Backup Integration initialized');
        
        // Test 3: Get Status
        console.log('3️⃣ Testing backup status...');
        const status = await backupIntegration.getStatus();
        console.log('✅ Status retrieved successfully');
        console.log(`   Integration initialized: ${status.initialized}`);
        console.log(`   Backup service running: ${status.backup?.isRunning || false}`);
        console.log(`   Configuration: ${status.backup?.configuration?.snapshotsPerDay || 'N/A'} snapshots/day\n`);

        // Test 4: Create Test Snapshot
        console.log('4️⃣ Testing manual snapshot creation...');
        const snapshot = await backupIntegration.createContextualBackup('Integration test snapshot');
        console.log('✅ Test snapshot created successfully');
        console.log(`   Snapshot ID: ${snapshot.snapshotId}`);
        console.log(`   Files backed up: ${snapshot.stats.fileCount}`);
        console.log(`   Total size: ${snapshot.stats.totalSize} bytes`);
        console.log(`   Duration: ${snapshot.duration}ms\n`);

        // Test 5: List Snapshots
        console.log('5️⃣ Testing snapshot listing...');
        const snapshots = await backupIntegration.getBackupService().listSnapshots();
        console.log('✅ Snapshots listed successfully');
        console.log(`   Total snapshots: ${snapshots.length}`);
        if (snapshots.length > 0) {
            console.log(`   Latest snapshot: ${snapshots[0].id}`);
            console.log(`   Age: ${snapshots[0].age}\n`);
        }

        // Test 6: Health Check
        console.log('6️⃣ Testing health check...');
        const health = await backupIntegration.getBackupService().performHealthCheck();
        console.log('✅ Health check completed');
        console.log(`   Status: ${health.status}`);
        console.log(`   Issues: ${health.issues.length}\n`);

        // Test 7: Start Service
        console.log('7️⃣ Testing service start...');
        await backupIntegration.start();
        console.log('✅ Backup service started successfully\n');

        console.log('🎉 ALL TESTS PASSED! Enhanced Backup Integration is working correctly.\n');
        
        console.log('📋 Integration Summary:');
        console.log('   ✅ HybridDatabaseService integration');
        console.log('   ✅ Backup service initialization');
        console.log('   ✅ Snapshot creation and listing');
        console.log('   ✅ Health monitoring');
        console.log('   ✅ Service management');
        console.log('\n🚀 The enhanced backup system is ready for production use!');
        console.log('\n📱 Admin Panel: Access backup controls at /admin-dashboard.html');
        console.log('🔧 CLI Tools: Use backup-manager.js for command-line management');
        
        // Stop the service for clean exit
        await backupIntegration.stop();
        
    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        console.error('\n🔍 Troubleshooting:');
        console.error('   1. Check that DATA_DIR is accessible');
        console.error('   2. Verify file permissions');
        console.error('   3. Ensure sufficient disk space');
        console.error('   4. Check the error details above');
        process.exit(1);
    }
}

// Run the test
testBackupIntegration().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});
