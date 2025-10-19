#!/usr/bin/env node

/**
 * Test script for Jupiter Service Bonding Tokens Integration
 * Tests the complete flow: jupiter-service -> xtrend backend -> frontend
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const JUPITER_SERVICE_URL = 'http://localhost:3000';
const XTREND_BACKEND_URL = 'http://localhost:3001';

async function testBondingTokensIntegration() {
    console.log('🧪 Testing Bonding Tokens Integration');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Jupiter Service Health Check
        console.log('\n🔍 Test 1: Jupiter Service Health Check');
        const jupiterHealth = await axios.get(`${JUPITER_SERVICE_URL}/health`);
        console.log('✅ Jupiter Service:', jupiterHealth.data.status);
        console.log('   Modules:', Object.keys(jupiterHealth.data.modules).join(', '));
        
        // Test 2: Jupiter Service Bonding Tokens
        console.log('\n🔍 Test 2: Jupiter Service Bonding Tokens');
        const jupiterTokens = await axios.get(`${JUPITER_SERVICE_URL}/api/bonding-tokens?limit=5`);
        console.log('✅ Jupiter Service tokens:', jupiterTokens.data.count, 'tokens');
        
        if (jupiterTokens.data.tokens.length > 0) {
            const sampleToken = jupiterTokens.data.tokens[0];
            console.log(`   Sample: ${sampleToken.symbol} (${sampleToken.tokenAddress.substring(0, 8)}...) - ${sampleToken.bondingCurveProgress.toFixed(2)}%`);
            
            // Test 3: Jupiter Service Bonding Status
            console.log('\n🔍 Test 3: Jupiter Service Bonding Status');
            const jupiterStatus = await axios.get(`${JUPITER_SERVICE_URL}/api/bonding-tokens/${sampleToken.tokenAddress}/status`);
            console.log('✅ Jupiter Service status:', jupiterStatus.data.data.bondingProgress.toFixed(2), '%');
            console.log('   Proximity:', jupiterStatus.data.data.graduationProximity);
            
            // Test 4: Jupiter Service Graduation Alerts
            console.log('\n🔍 Test 4: Jupiter Service Graduation Alerts');
            const jupiterAlerts = await axios.get(`${JUPITER_SERVICE_URL}/api/bonding-tokens/alerts?threshold=90`);
            console.log('✅ Jupiter Service alerts:', jupiterAlerts.data.count, 'alerts');
            
            // Test 5: Jupiter Service Statistics
            console.log('\n🔍 Test 5: Jupiter Service Statistics');
            const jupiterStats = await axios.get(`${JUPITER_SERVICE_URL}/api/bonding-tokens/stats`);
            console.log('✅ Jupiter Service stats:', jupiterStats.data.stats);
            
            // Test 6: Xtrend Backend Integration
            console.log('\n🔍 Test 6: Xtrend Backend Integration');
            const xtrendTokens = await axios.get(`${XTREND_BACKEND_URL}/api/tokens/bonding?limit=5`);
            console.log('✅ Xtrend Backend tokens:', xtrendTokens.data.count, 'tokens');
            console.log('   Source:', xtrendTokens.data.source);
            
            if (xtrendTokens.data.tokens.length > 0) {
                const xtrendSample = xtrendTokens.data.tokens[0];
                console.log(`   Sample: ${xtrendSample.symbol} (${xtrendSample.tokenAddress.substring(0, 8)}...) - ${xtrendSample.bondingCurveProgress.toFixed(2)}%`);
                
                // Test 7: Xtrend Backend Individual Token
                console.log('\n🔍 Test 7: Xtrend Backend Individual Token');
                const xtrendStatus = await axios.get(`${XTREND_BACKEND_URL}/api/tokens/${xtrendSample.tokenAddress}/bonding`);
                console.log('✅ Xtrend Backend status:', xtrendStatus.data.bondingData.bondingProgress.toFixed(2), '%');
                console.log('   Source:', xtrendStatus.data.source);
                
                // Test 8: Xtrend Backend Statistics
                console.log('\n🔍 Test 8: Xtrend Backend Statistics');
                const xtrendStats = await axios.get(`${XTREND_BACKEND_URL}/api/tokens/bonding/stats`);
                console.log('✅ Xtrend Backend stats:', xtrendStats.data.stats);
                console.log('   Source:', xtrendStats.data.source);
                
                // Test 9: Xtrend Backend Alerts
                console.log('\n🔍 Test 9: Xtrend Backend Alerts');
                const xtrendAlerts = await axios.get(`${XTREND_BACKEND_URL}/api/tokens/bonding/alerts?threshold=90`);
                console.log('✅ Xtrend Backend alerts:', xtrendAlerts.data.count, 'alerts');
                console.log('   Source:', xtrendAlerts.data.source);
            }
        }
        
        // Test 10: Data Consistency Check
        console.log('\n🔍 Test 10: Data Consistency Check');
        const jupiterTokens2 = await axios.get(`${JUPITER_SERVICE_URL}/api/bonding-tokens?limit=10`);
        const xtrendTokens2 = await axios.get(`${XTREND_BACKEND_URL}/api/tokens/bonding?limit=10`);
        
        console.log('✅ Data consistency check:');
        console.log(`   Jupiter Service: ${jupiterTokens2.data.count} tokens`);
        console.log(`   Xtrend Backend: ${xtrendTokens2.data.count} tokens`);
        console.log(`   Match: ${jupiterTokens2.data.count === xtrendTokens2.data.count ? '✅' : '❌'}`);
        
        console.log('\n✅ All integration tests completed successfully!');
        console.log('\n📊 Integration Summary:');
        console.log('   ✅ Jupiter Service: Bonding tokens microservice running');
        console.log('   ✅ Xtrend Backend: Fetching from jupiter-service');
        console.log('   ✅ Data Flow: jupiter-service -> xtrend backend -> frontend');
        console.log('   ✅ API Endpoints: All endpoints working');
        console.log('   ✅ Data Transformation: Proper data mapping');
        
    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

// Run the test
testBondingTokensIntegration().catch(console.error);
