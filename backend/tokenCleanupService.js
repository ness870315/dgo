import fs from 'fs/promises';
import path from 'path';

class TokenCleanupService {
  constructor() {
    this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.cacheDir = path.join(this.dataDir, 'cache');
  }

  /**
   * Check if a token should be deleted based on performance criteria
   */
  shouldDeleteToken(token) {
    const marketCap = token.marketCap || 0;
    const volumeChange1h = token.volumeChange1h || 0;
    const volumeChange24h = token.volumeChange24h || 0;
    const volume1h = token.volume1h || 0;
    const volume24h = token.volume24h || 0;

    // 🗑️ CRITICAL DELETION CRITERIA
    
    // 1. Zero volume for 24+ hours
    if (volume24h === 0 && volume1h === 0) {
      return {
        shouldDelete: true,
        reason: 'Zero volume for 24+ hours',
        severity: 'CRITICAL'
      };
    }

    // 2. Massive volume drops with tiny market cap
    if (volumeChange24h <= -95 && marketCap < 10000) { // -95% volume, <$10K mcap
      return {
        shouldDelete: true,
        reason: `-95% volume drop with $${marketCap.toLocaleString()} market cap`,
        severity: 'CRITICAL'
      };
    }

    // 3. Extreme volume drops with small market cap
    if (volumeChange24h <= -90 && marketCap < 50000) { // -90% volume, <$50K mcap
      return {
        shouldDelete: true,
        reason: `-90% volume drop with $${marketCap.toLocaleString()} market cap`,
        severity: 'HIGH'
      };
    }

    // 4. Severe volume drops with micro market cap
    if (volumeChange24h <= -80 && marketCap < 100000) { // -80% volume, <$100K mcap
      return {
        shouldDelete: true,
        reason: `-80% volume drop with $${marketCap.toLocaleString()} market cap`,
        severity: 'MEDIUM'
      };
    }

    // 5. Multiple severe drops (both 1h and 24h)
    if (volumeChange1h <= -90 && volumeChange24h <= -90) {
      return {
        shouldDelete: true,
        reason: 'Severe volume drops in both 1h and 24h periods',
        severity: 'HIGH'
      };
    }

    return {
      shouldDelete: false,
      reason: 'Token meets minimum criteria',
      severity: 'NONE'
    };
  }

  /**
   * Analyze all tokens and identify candidates for deletion
   */
  async analyzeTokensForCleanup() {
    try {
      console.log('🔍 Analyzing tokens for cleanup...');
      
      const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
      
      // Check if file exists, if not try alternative paths
      let tokensData;
      try {
        tokensData = await fs.readFile(cachePath, 'utf8');
      } catch (fileError) {
        console.log(`⚠️ Primary cache not found: ${cachePath}`);
        
        // Try alternative paths
        const alternativePaths = [
          path.join(this.dataDir, 'cache', 'tokens-cache.json'),
          path.join(process.cwd(), 'backend', 'cache', 'tokens-cache.json'),
          path.join(process.cwd(), 'cache', 'tokens-cache.json')
        ];
        
        let found = false;
        for (const altPath of alternativePaths) {
          try {
            console.log(`🔍 Trying alternative path: ${altPath}`);
            tokensData = await fs.readFile(altPath, 'utf8');
            console.log(`✅ Found tokens cache at: ${altPath}`);
            found = true;
            break;
          } catch (altError) {
            console.log(`❌ Not found: ${altPath}`);
          }
        }
        
        if (!found) {
          throw new Error(`Tokens cache not found in any expected location. Checked: ${[cachePath, ...alternativePaths].join(', ')}`);
        }
      }
      
      const tokens = JSON.parse(tokensData);
      
      const analysis = {
        total: tokens.length,
        toDelete: [],
        warnings: [],
        stats: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        }
      };

      for (const token of tokens) {
        const deletionCheck = this.shouldDeleteToken(token);
        
        if (deletionCheck.shouldDelete) {
          analysis.toDelete.push({
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            marketCap: token.marketCap,
            volumeChange1h: token.volumeChange1h,
            volumeChange24h: token.volumeChange24h,
            overallScore: token.overallScore,
            reason: deletionCheck.reason,
            severity: deletionCheck.severity
          });
          
          analysis.stats[deletionCheck.severity.toLowerCase()]++;
        } else {
          // Check for warnings (not deletion but concerning)
          if (token.volumeChange24h <= -70 && token.marketCap < 100000) {
            analysis.warnings.push({
              symbol: token.symbol,
              reason: `Concerning: -${Math.abs(token.volumeChange24h)}% volume with $${token.marketCap?.toLocaleString()} mcap`,
              severity: 'WARNING'
            });
          }
        }
      }

      return analysis;
      
    } catch (error) {
      console.error('❌ Error analyzing tokens:', error.message);
      return null;
    }
  }

  /**
   * Delete tokens from the database
   */
  async deleteTokens(tokensToDelete) {
    try {
      console.log(`🗑️ Deleting ${tokensToDelete.length} tokens...`);
      
      const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
      const tokensData = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(tokensData);
      
      const contractsToDelete = new Set(tokensToDelete.map(t => t.contractAddress));
      const symbolsToDelete = new Set(tokensToDelete.map(t => t.symbol));
      
      const remainingTokens = tokens.filter(token => 
        !contractsToDelete.has(token.contractAddress) && 
        !symbolsToDelete.has(token.symbol)
      );
      
      await fs.writeFile(cachePath, JSON.stringify(remainingTokens, null, 2));
      
      console.log(`✅ Deleted ${tokensToDelete.length} tokens`);
      console.log(`📊 Remaining tokens: ${remainingTokens.length}`);
      
      return {
        deleted: tokensToDelete.length,
        remaining: remainingTokens.length,
        deletedTokens: tokensToDelete
      };
      
    } catch (error) {
      console.error('❌ Error deleting tokens:', error.message);
      return null;
    }
  }

  /**
   * Generate cleanup report
   */
  generateReport(analysis) {
    if (!analysis) return '❌ No analysis data available';
    
    let report = `\n${'='.repeat(80)}\n`;
    report += `🧹 TOKEN CLEANUP ANALYSIS REPORT\n`;
    report += `${'='.repeat(80)}\n`;
    report += `📊 Total Tokens Analyzed: ${analysis.total}\n`;
    report += `🗑️ Tokens to Delete: ${analysis.toDelete.length}\n`;
    report += `⚠️ Warnings: ${analysis.warnings.length}\n\n`;
    
    report += `📈 Severity Breakdown:\n`;
    report += `   🚨 Critical: ${analysis.stats.critical}\n`;
    report += `   🔴 High: ${analysis.stats.high}\n`;
    report += `   🟡 Medium: ${analysis.stats.medium}\n`;
    report += `   🟢 Low: ${analysis.stats.low}\n\n`;
    
    if (analysis.toDelete.length > 0) {
      report += `🗑️ TOKENS TO DELETE:\n`;
      report += `${'-'.repeat(80)}\n`;
      
      // Group by severity
      const bySeverity = {
        CRITICAL: analysis.toDelete.filter(t => t.severity === 'CRITICAL'),
        HIGH: analysis.toDelete.filter(t => t.severity === 'HIGH'),
        MEDIUM: analysis.toDelete.filter(t => t.severity === 'MEDIUM'),
        LOW: analysis.toDelete.filter(t => t.severity === 'LOW')
      };
      
      Object.entries(bySeverity).forEach(([severity, tokens]) => {
        if (tokens.length > 0) {
          report += `\n🚨 ${severity} (${tokens.length} tokens):\n`;
          tokens.forEach(token => {
            report += `   • ${token.symbol} (${token.name})\n`;
            report += `     Contract: ${token.contractAddress}\n`;
            report += `     Market Cap: $${token.marketCap?.toLocaleString()}\n`;
            report += `     Volume Change: ${token.volumeChange1h}% (1h), ${token.volumeChange24h}% (24h)\n`;
            report += `     Current Score: ${token.overallScore}\n`;
            report += `     Reason: ${token.reason}\n\n`;
          });
        }
      });
    }
    
    if (analysis.warnings.length > 0) {
      report += `⚠️ WARNINGS (Monitor but don't delete):\n`;
      report += `${'-'.repeat(80)}\n`;
      analysis.warnings.forEach(warning => {
        report += `   • ${warning.symbol}: ${warning.reason}\n`;
      });
    }
    
    report += `\n${'='.repeat(80)}\n`;
    report += `💡 RECOMMENDATIONS:\n`;
    report += `${'='.repeat(80)}\n`;
    report += `1. 🗑️ Delete CRITICAL and HIGH severity tokens immediately\n`;
    report += `2. 📊 Monitor MEDIUM severity tokens for 24-48 hours\n`;
    report += `3. ⚠️ Review WARNING tokens for potential issues\n`;
    report += `4. 🔄 Run cleanup analysis daily to catch new problematic tokens\n`;
    
    return report;
  }
}

export default TokenCleanupService;
