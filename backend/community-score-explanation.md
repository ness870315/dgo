# 📊 Community Score Calculation - Complete Guide

## 🎯 Overview

The Community Score is calculated using **multiple algorithms** depending on where it's used in the system. There are **3 main calculation methods**:

1. **🔥 Enhanced Social Data Service** - Most comprehensive (0-10 scale)
2. **🚀 Enhanced Backend Service** - Includes social links bonus (0-10 scale)  
3. **⚡ Token Processor** - Simplified version (0-10 scale)

---

## 🔥 **Method 1: Enhanced Social Data Service** (Primary)

**Location:** `backend/enhancedSocialDataService.js`
**Used for:** Real-time Twitter data processing
**Scale:** 0-10 points

### 📊 **Scoring Breakdown:**

#### **1. Mentions Scoring (5% weight) - Up to 0.5 points** ⬇️ REDUCED
```javascript
if (mentions > 100)  → +0.5 points
if (mentions > 50)   → +0.4 points  
if (mentions > 20)   → +0.3 points
if (mentions > 10)   → +0.2 points
if (mentions > 5)    → +0.1 points
```

#### **2. Engagement Scoring (30% weight) - Up to 3.0 points** ⬆️ INCREASED
```javascript
engagementRate = (likes + retweets + replies) / mentions

if (engagementRate > 10) → +3.0 points
if (engagementRate > 5)  → +2.4 points
if (engagementRate > 2)  → +1.8 points  
if (engagementRate > 1)  → +1.2 points
if (engagementRate > 0.5) → +0.6 points
```

#### **3. Follower Base Scoring (5% weight) - Up to 0.5 points** ⬇️ REDUCED
```javascript
if (followers > 10,000) → +0.5 points
if (followers > 5,000)  → +0.375 points
if (followers > 1,000)  → +0.25 points
if (followers > 500)    → +0.125 points
```

#### **4. Recent Activity Scoring (50% weight) - Up to 5.0 points** ⬆️ MAJOR INCREASE
```javascript
recentMentions = number of recent tweets collected

if (recentMentions > 20) → +5.0 points
if (recentMentions > 10) → +3.75 points
if (recentMentions > 5)  → +2.5 points
if (recentMentions > 2)  → +1.25 points
```

#### **5. Quality Indicators (10% weight) - Up to 1.0 points**
```javascript
hasOfficialAccount = username exists ? 1.0 : 0
hasRecentActivity = mentions > 0 ? 1.0 : 0
score += (hasOfficialAccount + hasRecentActivity) * 0.5
```

### 🎯 **Final Calculation:**
- **Base Score:** 5.0 points
- **Maximum Score:** 9.9 points (capped)
- **Minimum Score:** 0.0 points

---

## 🚀 **Method 2: Enhanced Backend Service** (With Social Bonus)

**Location:** `backend/enhancedBackend.js`
**Used for:** Final token display with social links
**Scale:** 0-10 points

### 📊 **Scoring Breakdown:**

#### **1. Mentions Score - Up to 3 points**
```javascript
if (mentions > 100) → +3 points
if (mentions > 50)  → +2 points
if (mentions > 10)  → +1 point
```

#### **2. Engagement Score - Up to 3 points**
```javascript
totalEngagement = likes + retweets + replies

if (engagement > 200) → +3 points
if (engagement > 100) → +2 points
if (engagement > 20)  → +1 point
```

#### **3. Recent Activity Score - Up to 2 points**
```javascript
if (recentMentions > 10) → +2 points
if (recentMentions > 5)  → +1 point
```

#### **4. Follower Score - Up to 2 points**
```javascript
if (followers > 10,000) → +2 points
if (followers > 1,000)  → +1 point
```

#### **5. 🆕 Social Links Bonus - Up to 3 points**
```javascript
socialCount = number of valid social links (Twitter, Discord, Instagram, TikTok, Website)

if (socialCount >= 5) → +3 points (All socials)
if (socialCount >= 3) → +2 points (Most socials)
if (socialCount >= 2) → +1 point  (Some socials)
```

### 🎯 **Final Calculation:**
- **Base Score:** 0 points
- **Maximum Score:** 10 points (capped)
- **Social Bonus:** NEW feature that rewards tokens with more social presence

---

## ⚡ **Method 3: Token Processor** (Simplified)

**Location:** `backend/enhancedTokenProcessor.js`
**Used for:** Background processing
**Scale:** 0-10 points

### 📊 **Simplified Scoring:**

#### **Mentions (25% weight)**
```javascript
if (mentions >= 100) → +2.5 points
if (mentions >= 50)  → +2.0 points
if (mentions >= 20)  → +1.5 points
if (mentions >= 10)  → +1.0 points
if (mentions >= 5)   → +0.5 points
```

#### **Engagement Rate (25% weight)**
```javascript
engagementRate = totalEngagement / mentions
// Similar scaling to Method 1
```

#### **Other factors:** Followers, activity, quality indicators

---

## 🎯 **Real-World Examples**

### **🔥 High Score Token (8.5/10)**
```
Mentions: 150        → +2.5 points
Engagement Rate: 8.2 → +2.0 points  
Followers: 15,000    → +2.0 points
Recent Activity: 25  → +2.0 points
Quality: Official    → +1.0 points
Social Links: 4      → +2.0 points
Base Score: 5.0      → +5.0 points
TOTAL: 8.5/10
```

### **📊 Medium Score Token (6.2/10)**
```
Mentions: 25         → +1.5 points
Engagement Rate: 3.1 → +1.5 points
Followers: 2,500     → +1.0 points  
Recent Activity: 8   → +1.0 points
Quality: No official → +0.5 points
Social Links: 2      → +1.0 points
Base Score: 5.0      → +5.0 points
TOTAL: 6.2/10
```

### **⚠️ Low Score Token (2.0/10)**
```
Mentions: 3          → +0.5 points
Engagement Rate: 0.8 → +0.5 points
Followers: 200       → +0.0 points
Recent Activity: 1   → +0.0 points  
Quality: No data     → +0.0 points
Social Links: 0      → +0.0 points
Base Score: 0.0      → +0.0 points
TOTAL: 2.0/10
```

---

## 🎯 **Key Factors for High Scores**

### **✅ What Increases Score:**
- **High mention volume** (100+ mentions)
- **Strong engagement** (likes, retweets, replies)
- **Large follower base** (10,000+ followers)
- **Recent activity** (20+ recent mentions)
- **Official Twitter account** verified
- **Multiple social links** (5 platforms = max bonus)

### **❌ What Decreases Score:**
- **Low mention volume** (< 5 mentions)
- **Poor engagement** (< 0.5 engagement rate)
- **No followers** or small following
- **No recent activity**
- **No official accounts**
- **Missing social links**

---

## 🚀 **Recent Improvements**

### **🆕 Social Links Bonus (NEW)**
- **Up to +3 points** for having multiple social platforms
- **Rewards comprehensive social presence**
- **Encourages users to add social links via "Update Token" feature**

### **🔍 Improved Relevance Filtering**
- **Filters out non-crypto content** (art, politics, pets)
- **Only counts genuine crypto-relevant mentions**
- **Higher quality = better scores**

### **⚡ Real-time Processing**
- **Paid tokens processed instantly**
- **Immediate score calculation**
- **Live Twitter data integration**

---

## 📊 **Score Distribution**

- **9.0-10.0:** Elite tokens (top 5%)
- **7.0-8.9:** Strong community (top 20%)  
- **5.0-6.9:** Average community (middle 50%)
- **3.0-4.9:** Weak community (bottom 25%)
- **0.0-2.9:** Very weak/no community (bottom 5%)

**The Community Score is a comprehensive metric that reflects genuine community engagement and social presence!** 🎯
