#!/usr/bin/env node

/**
 * Test Script for isSus Filter in Jupiter Discovery Service
 * 
 * This script tests that tokens with audit.isSus = true are properly filtered out
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN || 'test-token';

async function testIsSusFilter() {
    console.log('🧪 Testing isSus Filter in Jupiter Discovery Service\n');

    // Test data with various scenarios
    const testTokens = [
        {
            // Valid token - should be imported
            symbol: 'GOODTOKEN',
            name: 'Good Token',
            contractAddress: '11111111111111111111111111111111111111111',
            graduatedAt: '2024-01-01T00:00:00Z',
            price: 0.001,
            mcap: 1000000,
            audit: {
                isSus: false,
                score: 85
            }
        },
        {
            // Suspicious token - should be filtered out
            symbol: 'BADTOKEN',
            name: 'Bad Token',
            contractAddress: '22222222222222222222222222222222222222222',
            graduatedAt: '2024-01-01T00:00:00Z',
            price: 0.001,
            mcap: 1000000,
            audit: {
                isSus: true,
                score: 25
            }
        },
        {
            // Token without audit field - should be imported
            symbol: 'NOAUDIT',
            name: 'No Audit Token',
            contractAddress: '33333333333333333333333333333333333333333',
            graduatedAt: '2024-01-01T00:00:00Z',
            price: 0.001,
            mcap: 1000000
        },
        {
            // Token with audit but no isSus field - should be imported
            symbol: 'PARTIALAUDIT',
            name: 'Partial Audit Token',
            contractAddress: '44444444444444444444444444444444444444444',
            graduatedAt: '2024-01-01T00:00:00Z',
            price: 0.001,
            mcap: 1000000,
            audit: {
                score: 75
            }
        }
    ];

    try {
        console.log('📤 Sending test tokens to discovery import endpoint...');
        
        const response = await axios.post(`${API_BASE}/api/internal/discovery/import`, {
            source: 'test-issus-filter',
            category: 'test',
            interval: '1m',
            tokens: testTokens
        }, {
            headers: {
                'X-Internal-Token': INTERNAL_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            const stats = response.data.stats;
            console.log('✅ Import completed successfully!');
            console.log(`📊 Results:`);
            console.log(`   Total tokens sent: ${stats.total}`);
            console.log(`   Inserted: ${stats.inserted}`);
            console.log(`   Updated: ${stats.updated}`);
            console.log(`   Boosted: ${stats.boosted}`);
            console.log(`   Skipped: ${stats.skipped}`);
            
            // Expected results:
            // - GOODTOKEN: should be inserted/updated (isSus = false)
            // - BADTOKEN: should be skipped (isSus = true)
            // - NOAUDIT: should be inserted/updated (no audit field)
            // - PARTIALAUDIT: should be inserted/updated (no isSus field)
            
            console.log('\n🔍 Expected behavior:');
            console.log('   ✅ GOODTOKEN: imported (isSus = false)');
            console.log('   🚫 BADTOKEN: skipped (isSus = true)');
            console.log('   ✅ NOAUDIT: imported (no audit field)');
            console.log('   ✅ PARTIALAUDIT: imported (no isSus field)');
            
            if (stats.skipped === 1) {
                console.log('\n🎉 isSus filter is working correctly!');
                console.log('   Exactly 1 token was skipped (BADTOKEN with isSus=true)');
            } else {
                console.log(`\n⚠️ Unexpected results: ${stats.skipped} tokens skipped (expected 1)`);
            }
            
        } else {
            console.error('❌ Import failed:', response.data.error);
        }

    } catch (error) {
        if (error.response) {
            console.error('❌ API Error:', error.response.status, error.response.data);
        } else {
            console.error('❌ Network Error:', error.message);
        }
        
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Make sure the backend is running');
        console.log('   2. Check INTERNAL_TOKEN environment variable');
        console.log('   3. Verify the API endpoint is accessible');
    }
}

// Run the test
testIsSusFilter().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});
