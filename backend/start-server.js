#!/usr/bin/env node

// CommonJS wrapper to handle ES module loading issues
const { createRequire } = require('module');
const { fileURLToPath } = require('url');
const { dirname, join } = require('path');

// Set the working directory to the backend folder
process.chdir(__dirname);

console.log('🚀 Starting Enhanced Backend Server (CommonJS wrapper)...');
console.log('📁 Working directory:', process.cwd());

// Try to load the ES module version
async function startServer() {
    try {
        console.log('📦 Loading ES module server...');
        
        // Use dynamic import to load the ES module
        const { default: enhancedBackend } = await import('./enhancedBackend.mjs');
        
        console.log('✅ ES module server loaded successfully');
        
    } catch (error) {
        console.error('❌ Failed to load ES module server:', error.message);
        console.error('Stack:', error.stack);
        
        // Fallback: try to load a CommonJS version
        console.log('🔄 Attempting CommonJS fallback...');
        try {
            const enhancedBackend = require('./enhancedBackend.js');
            console.log('✅ CommonJS fallback loaded successfully');
        } catch (fallbackError) {
            console.error('❌ CommonJS fallback also failed:', fallbackError.message);
            process.exit(1);
        }
    }
}

startServer().catch(error => {
    console.error('❌ Critical error:', error);
    process.exit(1);
});
