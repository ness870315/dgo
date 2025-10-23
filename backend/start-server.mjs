#!/usr/bin/env node

// This is a wrapper script to ensure proper ES module loading
// for the gRPC library and other dependencies

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set the working directory to the backend folder
process.chdir(__dirname);

// Now import and start the main server
try {
  console.log('🚀 Starting Enhanced Backend Server...');
  console.log('📁 Working directory:', process.cwd());
  
  // Dynamic import to ensure proper module resolution
  const { default: startServer } = await import('./enhancedBackend.mjs');
  
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
