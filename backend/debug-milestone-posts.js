import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugMilestonePosts() {
  console.log('🔍 Debugging Milestone Posts...');
  
  const db = new HybridDatabaseService();
  
  // Get user directories directly
  const usersDir = '/var/data/dgo/users';
  const fs = await import('fs');
  
  let userDirs = [];
  try {
    userDirs = fs.readdirSync(usersDir).filter(dir => dir.startsWith('user-'));
  } catch (error) {
    console.error('❌ Error reading users directory:', error.message);
    return;
  }
  
  console.log(`📊 Found ${userDirs.length} user directories`);
  
  let totalCalls = 0;
  let callsWithMilestones = 0;
  let totalMilestonePosts = 0;
  
  for (const userDir of userDirs) {
    const userId = userDir.replace('user-', '');
    try {
      console.log(`\n👤 Processing user ${userId}...`);
      const calls = await db.getKolCalls(userId);
      totalCalls += calls.length;
      
      const userCallsWithMilestones = calls.filter(c => c.milestonePosts && c.milestonePosts.length > 0);
      callsWithMilestones += userCallsWithMilestones.length;
      
      if (userCallsWithMilestones.length > 0) {
        console.log(`\n👤 User ${userId}:`);
        console.log(`   Total calls: ${calls.length}`);
        console.log(`   Calls with milestones: ${userCallsWithMilestones.length}`);
        
        userCallsWithMilestones.forEach(call => {
          console.log(`   📞 Call ${call.id} (${call.token?.symbol || 'Unknown'}):`);
          console.log(`      Current: ${call.currentMultiplier || 0}x`);
          console.log(`      ATH: ${call.athMultiplier || 0}x`);
          console.log(`      Milestone posts: ${call.milestonePosts.length}`);
          call.milestonePosts.forEach(post => {
            console.log(`         - ${post.milestone}x posted at ${post.postedAt}`);
          });
          totalMilestonePosts += call.milestonePosts.length;
        });
      }
      
      // Check specific call IDs from the error
      const specificCallIds = [
        '677e2321-6c4b-467b-ba81-d254e3c2f413',
        '401e595e-a94e-454f-bce6-381e9c1d4a0d',
        '4fad211c-e21e-4660-8203-6cf5bfbcd920'
      ];
      
      const specificCalls = calls.filter(c => specificCallIds.includes(c.id));
      if (specificCalls.length > 0) {
        console.log(`\n🎯 Found specific call IDs for user ${userId}:`);
        specificCalls.forEach(call => {
          console.log(`   📞 Call ${call.id}:`);
          console.log(`      Symbol: ${call.token?.symbol || 'Unknown'}`);
          console.log(`      Current: ${call.currentMultiplier || 0}x`);
          console.log(`      ATH: ${call.athMultiplier || 0}x`);
          console.log(`      Milestone posts: ${call.milestonePosts ? call.milestonePosts.length : 'undefined'}`);
          console.log(`      Milestone posts data:`, call.milestonePosts);
          console.log(`      Called at: ${call.calledAt}`);
          console.log(`      Last updated: ${call.lastUpdated || 'Never'}`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Error processing user ${userId}:`, error.message);
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total calls: ${totalCalls}`);
  console.log(`   Calls with milestones: ${callsWithMilestones}`);
  console.log(`   Total milestone posts: ${totalMilestonePosts}`);
  console.log(`   Percentage with milestones: ${totalCalls > 0 ? ((callsWithMilestones / totalCalls) * 100).toFixed(2) : 0}%`);
}

debugMilestonePosts().catch(console.error);
