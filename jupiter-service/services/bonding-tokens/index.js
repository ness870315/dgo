import dotenv from 'dotenv';
import BondingTokensAPI from './BondingTokensAPI.js';

// Load environment variables
dotenv.config();

/**
 * Bonding Tokens Service - Main Entry Point
 * 
 * This service monitors pre-bonded tokens on Pump.fun and tracks their graduation status.
 * It provides REST API endpoints for other services to consume bonding token data.
 */

console.log('🚀 Starting Bonding Tokens Service...');
console.log('=' .repeat(50));

// Check required environment variables
const requiredEnvVars = ['MORALIS_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingEnvVars.forEach(envVar => {
        console.error(`   - ${envVar}`);
    });
    console.error('\nPlease set these environment variables and restart the service.');
    process.exit(1);
}

console.log('✅ Environment variables configured');
console.log(`   - MORALIS_API_KEY: ${process.env.MORALIS_API_KEY ? 'Set' : 'Not set'}`);

// Initialize and start the API
const bondingTokensAPI = new BondingTokensAPI();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    bondingTokensAPI.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    bondingTokensAPI.stop();
    process.exit(0);
});

// Start the service
bondingTokensAPI.start();
