#!/usr/bin/env node

/**
 * Test script for Bonding Tokens Service
 * Tests all API endpoints and functionality
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = 'http://localhost:3004';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;

async function testBondingTokensService() {
    console.log('🧪 Testing Bonding Tokens Service');
    console.log('=' .repeat(50));
    
    if (!MORALIS_API_KEY) {
        console.error('❌ MORALIS_API_KEY not configured');
        console.error('Please set MORALIS_API_KEY in your .env file');
        return;
    }
    
    try {
        // Test 1: Health check
        console.log('\n🔍 Test 1: Health Check');
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health check passed:', healthResponse.data);
        
        // Test 2: Get bonding tokens
        console.log('\n🔍 Test 2: Get Bonding Tokens');
        const tokensResponse = await axios.get(`${BASE_URL}/api/bonding-tokens?limit=10`);
        console.log('✅ Bonding tokens fetched:', tokensResponse.data.count, 'tokens');
        
        if (tokensResponse.data.tokens.length > 0) {
            const sampleToken = tokensResponse.data.tokens[0];
            console.log(`   Sample: ${sampleToken.symbol} (${sampleToken.tokenAddress.substring(0, 8)}...) - ${sampleToken.bondingCurveProgress.toFixed(2)}%`);
            
            // Test 3: Get bonding status for specific token
            console.log('\n🔍 Test 3: Get Bonding Status');
            const statusResponse = await axios.get(`${BASE_URL}/api/bonding-tokens/${sampleToken.tokenAddress}/status`);
            console.log('✅ Bonding status:', statusResponse.data.data.bondingProgress.toFixed(2), '%');
            console.log('   Proximity:', statusResponse.data.data.graduationProximity);
            
            // Test 4: Get graduation alerts
            console.log('\n🔍 Test 4: Get Graduation Alerts');
            const alertsResponse = await axios.get(`${BASE_URL}/api/bonding-tokens/alerts?threshold=90`);
            console.log('✅ Graduation alerts:', alertsResponse.data.count, 'alerts');
            
            if (alertsResponse.data.alerts.length > 0) {
                console.log('   Sample alert:', alertsResponse.data.alerts[0].message);
            }
            
            // Test 5: Get tokens by proximity
            console.log('\n🔍 Test 5: Get Tokens by Proximity');
            const proximityResponse = await axios.get(`${BASE_URL}/api/bonding-tokens/by-proximity?proximityLevel=CLOSE_TO_GRADUATION`);
            console.log('✅ Tokens by proximity:', proximityResponse.data.count, 'tokens');
            
            // Test 6: Track pre-bonding tokens
            console.log('\n🔍 Test 6: Track Pre-Bonding Tokens');
            const trackResponse = await axios.post(`${BASE_URL}/api/bonding-tokens/track`);
            console.log('✅ Tracking completed:', trackResponse.data.count, 'tokens tracked');
            
            // Test 7: Get tracking statistics
            console.log('\n🔍 Test 7: Get Tracking Statistics');
            const statsResponse = await axios.get(`${BASE_URL}/api/bonding-tokens/stats`);
            console.log('✅ Tracking stats:', statsResponse.data.stats);
            
        } else {
            console.log('⚠️ No bonding tokens found, skipping individual token tests');
        }
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

// Run the test
testBondingTokensService().catch(console.error);
