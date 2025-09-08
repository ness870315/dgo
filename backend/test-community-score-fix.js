#!/usr/bin/env node

/**
 * Test script for the improved community scoring algorithm
 * Tests the CRYING token case that had inflated scores
 */

// Mock the improved calculateCommunityHealthScore function
function calculateCommunityHealthScore(twitterData, socialLinks = null, jupiterData = null) {
  if (!twitterData) return 0;

  let score = 2.0; // Lowered base score - tokens must earn their community score
  const maxScore = 10;

  // 1. Mentions score (55% weight) - PRIMARY importance for community buzz
  const mentions = twitterData.mentions || 0;
  if (mentions > 100) score += 2.75;
  else if (mentions > 50) score += 2.2;
  else if (mentions > 20) score += 1.65;
  else if (mentions > 10) score += 1.1;
  else if (mentions > 5) score += 0.55;

  // 2. Engagement score (35% weight) - Quality of community interaction
  const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
  const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
  if (engagementRate > 10) score += 1.75;
  else if (engagementRate > 5) score += 1.4;
  else if (engagementRate > 2) score += 1.05;
  else if (engagementRate > 1) score += 0.7;
  else if (engagementRate > 0.5) score += 0.35;

  // 3. Follower score (5% weight) - Minor importance
  const followers = twitterData.followers || 0;
  if (followers > 10000) score += 0.25;
  else if (followers > 5000) score += 0.1875;
  else if (followers > 1000) score += 0.125;
  else if (followers > 500) score += 0.0625;

  // 4. Quality indicators (5% weight) - Basic legitimacy checks
  const hasOfficialAccount = twitterData.username ? 1.0 : 0;
  const hasRecentActivity = mentions > 0 ? 1.0 : 0;
  score += (hasOfficialAccount + hasRecentActivity) * 0.25;

  // 5. Social links bonus (BONUS points)
  if (socialLinks) {
    const socialCount = Object.values(socialLinks).filter(link => link && link !== 'not_found').length;
    if (socialCount >= 5) score += 1.0;      // All socials = +1.0 bonus
    else if (socialCount >= 3) score += 0.75; // Most socials = +0.75 bonus  
    else if (socialCount >= 2) score += 0.5; // Some socials = +0.5 bonus
  }

  // 6. Organic Score Penalties (NEW!) - Prevent inflated scores from suspicious activity
  if (jupiterData && jupiterData.organicScore !== undefined) {
    const organicScore = jupiterData.organicScore;
    
    // Severe penalties for low organic scores
    if (organicScore === 0) {
      score -= 2.0; // Major penalty for zero organic score (likely bots)
    } else if (organicScore < 20) {
      score -= 1.5; // High penalty for very low organic score
    } else if (organicScore < 40) {
      score -= 1.0; // Medium penalty for low organic score
    } else if (organicScore < 60) {
      score -= 0.5; // Small penalty for below-average organic score
    }
    // No penalty for organic scores >= 60
  }

  // 7. Low Volume High Engagement Penalty (NEW!) - Detect artificial engagement
  if (mentions > 0 && mentions <= 5) {
    const avgEngagementPerMention = totalEngagement / mentions;
    
    // If very few mentions but extremely high engagement per mention, it's suspicious
    if (avgEngagementPerMention > 15 && mentions <= 2) {
      score -= 1.5; // Major penalty for likely artificial engagement
    } else if (avgEngagementPerMention > 10 && mentions <= 3) {
      score -= 1.0; // Medium penalty for suspicious engagement patterns
    } else if (avgEngagementPerMention > 8 && mentions <= 5) {
      score -= 0.5; // Small penalty for potentially inflated engagement
    }
  }

  // 8. Minimum Activity Threshold (NEW!) - Require basic activity for decent scores
  if (mentions < 5) {
    score = Math.min(score, 4.0); // Cap score at 4.0 for tokens with <5 mentions
  }
  if (mentions < 2) {
    score = Math.min(score, 2.5); // Cap score at 2.5 for tokens with <2 mentions
  }

  return Math.max(0, Math.min(score, maxScore)); // Ensure score is between 0 and 10
}

// Test cases
console.log('🧪 Testing Community Score Algorithm Improvements\n');

// CRYING token case (the problematic one)
const cryingTwitterData = {
  mentions: 2,
  likes: 16,      // 3 + 13 from the two tweets
  retweets: 2,    // 0 + 2 from the two tweets  
  replies: 5,     // 2 + 3 from the two tweets
  followers: 0,
  username: null
};

const cryingJupiterData = {
  organicScore: 0,
  organicScoreLabel: 'low'
};

console.log('📊 CRYING Token Test:');
console.log('Twitter Data:', cryingTwitterData);
console.log('Jupiter Data:', cryingJupiterData);

const oldScore = 5.0 + 1.75 + 0.25; // Old calculation: base + engagement + activity
const newScore = calculateCommunityHealthScore(cryingTwitterData, null, cryingJupiterData);

console.log(`Old Score: ${oldScore.toFixed(2)}`);
console.log(`New Score: ${newScore.toFixed(2)}`);
console.log(`Improvement: ${oldScore > newScore ? '✅ FIXED' : '❌ Still High'}\n`);

// Test other scenarios
console.log('🔬 Additional Test Cases:\n');

// High organic score, good engagement
const goodTokenData = {
  mentions: 50,
  likes: 200,
  retweets: 50,
  replies: 30,
  followers: 5000,
  username: 'official_token'
};

const goodJupiterData = {
  organicScore: 85,
  organicScoreLabel: 'high'
};

console.log('📈 Good Token (50 mentions, 85 organic score):');
console.log(`Score: ${calculateCommunityHealthScore(goodTokenData, null, goodJupiterData).toFixed(2)}`);

// Low organic score, many mentions
const suspiciousTokenData = {
  mentions: 100,
  likes: 500,
  retweets: 100,
  replies: 50,
  followers: 1000,
  username: 'token_official'
};

const suspiciousJupiterData = {
  organicScore: 15,
  organicScoreLabel: 'low'
};

console.log('🚨 Suspicious Token (100 mentions, 15 organic score):');
console.log(`Score: ${calculateCommunityHealthScore(suspiciousTokenData, null, suspiciousJupiterData).toFixed(2)}`);

// Very low activity
const deadTokenData = {
  mentions: 1,
  likes: 2,
  retweets: 0,
  replies: 1,
  followers: 100,
  username: null
};

const deadJupiterData = {
  organicScore: 5,
  organicScoreLabel: 'very low'
};

console.log('💀 Dead Token (1 mention, 5 organic score):');
console.log(`Score: ${calculateCommunityHealthScore(deadTokenData, null, deadJupiterData).toFixed(2)}`);

console.log('\n✅ Community Score Algorithm Test Complete!');
