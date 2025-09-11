#!/usr/bin/env node

/**
 * DROPBOX CONNECTION TEST
 * Test Dropbox API connection and upload functionality
 */

import DropboxUploader from './dropboxUploader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function testDropboxConnection() {
  console.log('🔍 TESTING DROPBOX CONNECTION');
  console.log('=' .repeat(60));
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`   ENABLE_DROPBOX_UPLOAD: ${process.env.ENABLE_DROPBOX_UPLOAD || 'NOT SET'}`);
  console.log(`   DROPBOX_TOKEN: ${process.env.DROPBOX_TOKEN ? 'SET (masked)' : 'NOT SET'}`);
  console.log(`   DROPBOX_FOLDER: ${process.env.DROPBOX_FOLDER || 'NOT SET'}`);
  console.log('');
  
  if (!process.env.DROPBOX_TOKEN) {
    console.error('❌ DROPBOX_TOKEN not set!');
    return;
  }
  
  if (String(process.env.ENABLE_DROPBOX_UPLOAD || '') !== '1') {
    console.error('❌ ENABLE_DROPBOX_UPLOAD is not set to "1"!');
    return;
  }
  
  try {
    // Test 1: Create a small test file
    console.log('📝 Creating test file...');
    const testContent = `Dropbox connection test - ${new Date().toISOString()}`;
    const testFilePath = path.join(os.tmpdir(), 'dropbox-test.txt');
    await fs.promises.writeFile(testFilePath, testContent);
    console.log(`   ✅ Test file created: ${testFilePath}`);
    
    // Test 2: Initialize Dropbox uploader
    console.log('🔗 Initializing Dropbox uploader...');
    const uploader = new DropboxUploader(process.env.DROPBOX_TOKEN);
    console.log('   ✅ Dropbox uploader initialized');
    
    // Test 3: Test upload
    const targetFolder = (process.env.DROPBOX_FOLDER || '/dgo-backups').replace(/\\/g, '/');
    const testDropboxPath = `${targetFolder}/connection-test-${Date.now()}.txt`;
    console.log(`⬆️  Testing upload to: ${testDropboxPath}`);
    
    const result = await uploader.uploadFile(testFilePath, testDropboxPath);
    console.log('   ✅ Upload successful!');
    console.log(`   📊 Result:`, result);
    
    // Test 4: Cleanup
    console.log('🧹 Cleaning up test file...');
    await fs.promises.unlink(testFilePath);
    console.log('   ✅ Test file cleaned up');
    
    console.log('');
    console.log('🎉 DROPBOX CONNECTION TEST PASSED!');
    console.log('   The Dropbox integration is working correctly.');
    console.log('   If backups are still not uploading, check the backup service logs for specific errors.');
    
  } catch (error) {
    console.error('');
    console.error('❌ DROPBOX CONNECTION TEST FAILED!');
    console.error('   Error details:');
    console.error(`   Type: ${error.constructor.name}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.response) {
      console.error('   HTTP Response:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      console.error(`   Data:`, error.response.data);
    }
    
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    
    console.error('');
    console.error('🔧 Possible solutions:');
    console.error('   1. Check if DROPBOX_TOKEN is valid and not expired');
    console.error('   2. Verify the Dropbox app has write permissions');
    console.error('   3. Check if the target folder exists in Dropbox');
    console.error('   4. Verify network connectivity to Dropbox API');
    console.error('   5. Check Dropbox API rate limits');
  }
}

// Run the test
testDropboxConnection().catch(console.error);
