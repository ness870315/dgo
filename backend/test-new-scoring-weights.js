#!/usr/bin/env node

/**
 * Test script for NEW Community Score weights
 * NEW WEIGHTS: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%
 */

// Mock the Enhanced Social Data Service scoring method
function calculateCommunityHealthScore(twitterData) {
  let score = 5.0; // Base score
  
  try {
    // 1. MENTIONS SCORING (5% weight) - Reduced from 25%
    const mentions = twitterData.mentions || 0;
    if (mentions > 100) score += 0.5;
    else if (mentions > 50) score += 0.4;
    else if (mentions > 20) score += 0.3;
    else if (mentions > 10) score += 0.2;
    else if (mentions > 5) score += 0.1;
    
    // 2. ENGAGEMENT SCORING (30% weight) - Increased from 25%
    const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
    const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
    
    if (engagementRate > 10) score += 3.0;
    else if (engagementRate > 5) score += 2.4;
    else if (engagementRate > 2) score += 1.8;
    else if (engagementRate > 1) score += 1.2;
    else if (engagementRate > 0.5) score += 0.6;
    
    // 3. FOLLOWER BASE SCORING (5% weight) - Reduced from 20%
    const followers = twitterData.followers || 0;
    if (followers > 10000) score += 0.5;
    else if (followers > 5000) score += 0.375;
    else if (followers > 1000) score += 0.25;
    else if (followers > 500) score += 0.125;
    
    // 4. RECENT ACTIVITY SCORING (50% weight) - Increased from 20%
    const recentMentions = twitterData.recentMentions?.length || 0;
    if (recentMentions > 20) score += 5.0;
    else if (recentMentions > 10) score += 3.75;
    else if (recentMentions > 5) score += 2.5;
    else if (recentMentions > 2) score += 1.25;
    
    // 5. QUALITY INDICATORS (10% weight) - Same as before
    const hasOfficialAccount = twitterData.username ? 1.0 : 0;
    const hasRecentActivity = mentions > 0 ? 1.0 : 0;
    score += (hasOfficialAccount + hasRecentActivity) * 0.5;
    
    // Ensure score is within 0-10 range
    score = Math.min(9.9, Math.max(0, score));
    
    return score;
    
  } catch (error) {
    console.error('❌ Error calculating community health score:', error.message);
    return 5.0; // Return base score on error
  }
}

// Test cases with different scenarios
const testCases = [
  {
    name: "🔥 TRENDING TOKEN (High Recent Activity)",
    data: {
      symbol: "TREND",
      mentions: 50,
      likes: 200,
      retweets: 100,
      replies: 50,
      followers: 5000,
      recentMentions: Array(25).fill({}), // 25 recent mentions
      username: "@trendtoken"
    }
  },
  {
    name: "📈 ENGAGING TOKEN (High Engagement Rate)",
    data: {
      symbol: "ENGAGE",
      mentions: 20,
      likes: 400,
      retweets: 200,
      replies: 100,
      followers: 2000,
      recentMentions: Array(8).fill({}), // 8 recent mentions
      username: "@engagetoken"
    }
  },
  {
    name: "🏛️ ESTABLISHED TOKEN (High Mentions, Low Activity)",
    data: {
      symbol: "OLD",
      mentions: 200,
      likes: 100,
      retweets: 50,
      replies: 25,
      followers: 15000,
      recentMentions: Array(3).fill({}), // Only 3 recent mentions
      username: "@oldtoken"
    }
  },
  {
    name: "💎 BALANCED TOKEN (Good All Around)",
    data: {
      symbol: "BALANCED",
      mentions: 75,
      likes: 300,
      retweets: 150,
      replies: 75,
      followers: 8000,
      recentMentions: Array(12).fill({}), // 12 recent mentions
      username: "@balancedtoken"
    }
  },
  {
    name: "🆕 NEW TOKEN (Low Everything)",
    data: {
      symbol: "NEW",
      mentions: 8,
      likes: 20,
      retweets: 10,
      replies: 5,
      followers: 300,
      recentMentions: Array(2).fill({}), // 2 recent mentions
      username: "@newtoken"
    }
  },
  {
    name: "👻 DEAD TOKEN (No Recent Activity)",
    data: {
      symbol: "DEAD",
      mentions: 100,
      likes: 50,
      retweets: 25,
      replies: 10,
      followers: 5000,
      recentMentions: [], // No recent mentions
      username: "@deadtoken"
    }
  }
];

console.log('🧪 TESTING NEW COMMUNITY SCORE WEIGHTS');
console.log('📊 NEW WEIGHTS: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%');
console.log('='.repeat(80));

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log('-'.repeat(50));
  
  const data = testCase.data;
  const score = calculateCommunityHealthScore(data);
  
  // Calculate individual components for breakdown
  const mentions = data.mentions || 0;
  const totalEngagement = (data.likes || 0) + (data.retweets || 0) + (data.replies || 0);
  const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
  const followers = data.followers || 0;
  const recentMentions = data.recentMentions?.length || 0;
  
  // Calculate component scores
  const mentionsScore = mentions > 100 ? 0.5 : mentions > 50 ? 0.4 : mentions > 20 ? 0.3 : mentions > 10 ? 0.2 : mentions > 5 ? 0.1 : 0;
  const engagementScore = engagementRate > 10 ? 3.0 : engagementRate > 5 ? 2.4 : engagementRate > 2 ? 1.8 : engagementRate > 1 ? 1.2 : engagementRate > 0.5 ? 0.6 : 0;
  const followersScore = followers > 10000 ? 0.5 : followers > 5000 ? 0.375 : followers > 1000 ? 0.25 : followers > 500 ? 0.125 : 0;
  const activityScore = recentMentions > 20 ? 5.0 : recentMentions > 10 ? 3.75 : recentMentions > 5 ? 2.5 : recentMentions > 2 ? 1.25 : 0;
  const qualityScore = (data.username ? 0.5 : 0) + (mentions > 0 ? 0.5 : 0);
  
  console.log(`📊 FINAL SCORE: ${score.toFixed(2)}/10`);
  console.log(`   📝 Mentions (5%): ${mentions} → +${mentionsScore.toFixed(2)}`);
  console.log(`   💬 Engagement (30%): ${engagementRate.toFixed(2)} rate → +${engagementScore.toFixed(2)}`);
  console.log(`   👥 Followers (5%): ${followers} → +${followersScore.toFixed(3)}`);
  console.log(`   🆕 Recent Activity (50%): ${recentMentions} → +${activityScore.toFixed(2)} ⭐`);
  console.log(`   ✅ Quality (10%): ${data.username ? 'Official' : 'No'} → +${qualityScore.toFixed(1)}`);
  console.log(`   🎯 Base Score: +5.0`);
});

console.log('\n' + '=' * 80);
console.log('🎯 KEY INSIGHTS FROM NEW WEIGHTS:');
console.log('✅ Recent Activity (50%) is now the DOMINANT factor');
console.log('✅ Engagement Rate (30%) rewards quality interactions');
console.log('✅ Historical Mentions (5%) have minimal impact');
console.log('✅ Follower Count (5%) has minimal impact');
console.log('✅ Trending tokens with recent buzz will score highest');
console.log('✅ Dead tokens with no recent activity will score lowest');
console.log('='.repeat(80));
