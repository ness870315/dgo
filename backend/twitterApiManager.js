import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TwitterApiManager {
  constructor() {
    this.dataFile = path.join(__dirname, 'cache', 'twitter-api-usage.json');
    this.monthlyLimit = 15000; // 15K per month
    this.dailyLimit = 500;     // 500 per day (conservative)
    this.hourlyLimit = 50;     // 50 per hour (conservative)
    
    // Initialize usage data
    this.usage = {
      monthly: 0,
      daily: 0,
      hourly: 0,
      monthStart: new Date().toISOString().substring(0, 7), // YYYY-MM
      dayStart: new Date().toISOString().substring(0, 10),  // YYYY-MM-DD
      hourStart: new Date().toISOString().substring(0, 13)  // YYYY-MM-DDTHH
    };
    
    this.loadUsageData();
    console.log('🐦 TwitterApiManager initialized with 15K/month limit');
  }

  async loadUsageData() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      this.usage = { ...this.usage, ...JSON.parse(data) };
      console.log(`📊 Loaded Twitter API usage: ${this.usage.monthly}/${this.monthlyLimit} monthly`);
    } catch (error) {
      console.log('📊 No existing Twitter API usage data, starting fresh');
      await this.saveUsageData();
    }
  }

  async saveUsageData() {
    try {
      await fs.writeFile(this.dataFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      console.error('❌ Failed to save Twitter API usage data:', error.message);
    }
  }

  async canRefreshToken(token) {
    await this.resetCountersIfNeeded();
    
    // Check limits
    if (this.usage.monthly >= this.monthlyLimit) {
      return { 
        allowed: false, 
        tier: 'BLOCKED', 
        reason: `Monthly limit reached (${this.usage.monthly}/${this.monthlyLimit})` 
      };
    }
    
    if (this.usage.daily >= this.dailyLimit) {
      return { 
        allowed: false, 
        tier: 'BLOCKED', 
        reason: `Daily limit reached (${this.usage.daily}/${this.dailyLimit})` 
      };
    }
    
    if (this.usage.hourly >= this.hourlyLimit) {
      return { 
        allowed: false, 
        tier: 'BLOCKED', 
        reason: `Hourly limit reached (${this.usage.hourly}/${this.hourlyLimit})` 
      };
    }

    // Determine tier based on usage
    const monthlyPercent = (this.usage.monthly / this.monthlyLimit) * 100;
    let tier = 'LOW';
    if (monthlyPercent > 80) tier = 'CRITICAL';
    else if (monthlyPercent > 60) tier = 'HIGH';
    else if (monthlyPercent > 30) tier = 'MEDIUM';

    return { 
      allowed: true, 
      tier, 
      reason: `${this.usage.monthly}/${this.monthlyLimit} monthly (${monthlyPercent.toFixed(1)}%)` 
    };
  }

  async recordApiCall(token, callsUsed = 1) {
    await this.resetCountersIfNeeded();
    
    this.usage.monthly += callsUsed;
    this.usage.daily += callsUsed;
    this.usage.hourly += callsUsed;
    
    await this.saveUsageData();
    
    console.log(`📊 Twitter API usage: ${this.usage.monthly}/${this.monthlyLimit} monthly (+${callsUsed})`);
  }

  async resetCountersIfNeeded() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const currentDay = now.toISOString().substring(0, 10);
    const currentHour = now.toISOString().substring(0, 13);

    let changed = false;

    // Reset monthly counter
    if (this.usage.monthStart !== currentMonth) {
      console.log(`🔄 Monthly Twitter API counter reset: ${this.usage.monthly} → 0`);
      this.usage.monthly = 0;
      this.usage.monthStart = currentMonth;
      changed = true;
    }

    // Reset daily counter
    if (this.usage.dayStart !== currentDay) {
      console.log(`🔄 Daily Twitter API counter reset: ${this.usage.daily} → 0`);
      this.usage.daily = 0;
      this.usage.dayStart = currentDay;
      changed = true;
    }

    // Reset hourly counter
    if (this.usage.hourStart !== currentHour) {
      this.usage.hourly = 0;
      this.usage.hourStart = currentHour;
      changed = true;
    }

    if (changed) {
      await this.saveUsageData();
    }
  }

  async resetMonthlyCounter() {
    console.log(`🔄 MANUAL RESET: Monthly Twitter API counter: ${this.usage.monthly} → 0`);
    this.usage.monthly = 0;
    this.usage.monthStart = new Date().toISOString().substring(0, 7);
    await this.saveUsageData();
    return { success: true, message: 'Monthly counter reset to 0' };
  }

  async getUsageStats() {
    await this.resetCountersIfNeeded();
    return {
      monthly: this.usage.monthly,
      monthlyLimit: this.monthlyLimit,
      monthlyPercent: ((this.usage.monthly / this.monthlyLimit) * 100).toFixed(1),
      daily: this.usage.daily,
      dailyLimit: this.dailyLimit,
      hourly: this.usage.hourly,
      hourlyLimit: this.hourlyLimit,
      monthStart: this.usage.monthStart,
      dayStart: this.usage.dayStart,
      hourStart: this.usage.hourStart
    };
  }
}

export default TwitterApiManager;
