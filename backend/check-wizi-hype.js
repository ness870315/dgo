#!/usr/bin/env node

/**
 * CHECK WIZI HYPE CHART DATA
 * Investigate the mismatch between chart labels and actual scores
 */

import fs from 'fs/promises';
import path from 'path';

async function checkWiziHypeData() {
  console.log('🔍 WIZI HYPE CHART INVESTIGATION');
  console.log('=' .repeat(60));
  
  try {
    // Check production API for WIZI data
    console.log('🌐 PRODUCTION API DATA:');
    const prodResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const prodTokens = await prodResponse.json();
    
    const wizi = prodTokens.find(t => t.symbol === 'WIZI');
    if (wizi) {
      console.log(`✅ Found WIZI in production:`);
      console.log(`   Symbol: ${wizi.symbol}`);
      console.log(`   Name: ${wizi.name}`);
      console.log(`   Contract: ${wizi.contractAddress}`);
      console.log(`   Current Score: ${wizi.overallScore || wizi.score || 'N/A'}`);
      console.log(`   Community Score: ${wizi.communityHealthScore || 'N/A'}`);
      console.log(`   Last Updated: ${wizi.lastUpdated || 'N/A'}`);
      
      // Check what label should be based on current score
      const currentScore = wizi.overallScore || wizi.score || 0;
      const expectedLabel = currentScore >= 8 ? 'Viral' : 
                           currentScore >= 5 ? 'Trending' : 
                           currentScore >= 3 ? 'Building' : 'Sleeping';
      console.log(`   Expected Label: ${expectedLabel} (score: ${currentScore})`);
    } else {
      console.log('❌ WIZI not found in production tokens');
    }
    
    // Check hype chart data for WIZI
    console.log('\n📊 HYPE CHART DATA:');
    const hypeDir = './data/global/hype';
    
    try {
      const files = await fs.readdir(hypeDir);
      const wiziHypeFile = files.find(f => f.includes('wizi') || f.includes('WIZI'));
      
      if (wiziHypeFile) {
        console.log(`✅ Found hype file: ${wiziHypeFile}`);
        const hypeData = JSON.parse(await fs.readFile(path.join(hypeDir, wiziHypeFile), 'utf8'));
        
        console.log(`   Total snapshots: ${hypeData.length}`);
        
        if (hypeData.length > 0) {
          // Show last few snapshots
          const recent = hypeData.slice(-5);
          console.log('\n   Recent snapshots:');
          recent.forEach((snapshot, i) => {
            const date = new Date(snapshot.timestamp).toLocaleString();
            const score = snapshot.score || 0;
            const label = snapshot.label || 'Unknown';
            const expectedLabel = score >= 8 ? 'Viral' : 
                                 score >= 6 ? 'Trending' : 
                                 score >= 4 ? 'Building' : 'Sleeping';
            
            console.log(`     ${i + 1}. ${date}`);
            console.log(`        Score: ${score.toFixed(2)} | Label: ${label} | Expected: ${expectedLabel}`);
            console.log(`        Mentions: ${snapshot.mentions || 0} | Engagement: ${snapshot.engagement || 0}`);
            
            if (label !== expectedLabel) {
              console.log(`        ⚠️  MISMATCH: Label "${label}" doesn't match expected "${expectedLabel}"`);
            }
          });
          
          // Check for any mismatches in all data
          const mismatches = hypeData.filter(snapshot => {
            const score = snapshot.score || 0;
            const expectedLabel = score >= 8 ? 'Viral' : 
                                 score >= 6 ? 'Trending' : 
                                 score >= 4 ? 'Building' : 'Sleeping';
            return snapshot.label !== expectedLabel;
          });
          
          if (mismatches.length > 0) {
            console.log(`\n⚠️  Found ${mismatches.length} label mismatches in historical data`);
          } else {
            console.log('\n✅ All historical labels match expected values');
          }
        }
      } else {
        console.log('❌ No hype data file found for WIZI');
      }
    } catch (error) {
      console.log(`❌ Error reading hype data: ${error.message}`);
    }
    
    // Check the label calculation logic
    console.log('\n🧮 LABEL CALCULATION LOGIC:');
    console.log('Current logic: score >= 8 ? "Viral" : score >= 6 ? "Trending" : score >= 4 ? "Building" : "Sleeping"');
    console.log('\nTest cases:');
    const testScores = [0, 2.9, 3.0, 4.9, 5.0, 7.9, 8.0, 10.0];
    testScores.forEach(score => {
      const label = score >= 8 ? 'Viral' : 
                   score >= 6 ? 'Trending' : 
                   score >= 4 ? 'Building' : 'Sleeping';
      console.log(`   Score ${score.toFixed(1)} → ${label}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWiziHypeData().catch(console.error);
