/**
 * Prompt Security Guard - Protection against malicious prompt injections
 * Prevents users from breaking the AI system with malicious prompts
 */

class PromptSecurityGuard {
  constructor() {
    // Dangerous patterns that could break the AI system
    this.dangerousPatterns = [
      // Direct system override attempts
      /ignore\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|prompts?|rules?)/i,
      /forget\s+(?:everything|all\s+instructions?|your\s+role)/i,
      /you\s+are\s+now\s+(?:a\s+)?(?:different|new|another)/i,
      /act\s+as\s+(?:if\s+you\s+are|a\s+different)/i,
      /pretend\s+(?:to\s+be|you\s+are)/i,
      /roleplay\s+as/i,
      /new\s+instructions?:/i,
      /system\s+override/i,
      /admin\s+mode/i,
      /developer\s+mode/i,
      /debug\s+mode/i,
      
      // Prompt injection markers
      /---\s*(?:end|stop)\s+(?:instructions?|prompt|system)/i,
      /\[(?:system|admin|root|dev)\]/i,
      /```\s*(?:system|prompt|instructions?)/i,
      /\/\*\s*(?:system|admin|override)/i,
      /<!--\s*(?:system|admin|override)/i,
      
      // Role manipulation
      /you\s+are\s+not\s+(?:degen\s+oracle|an?\s+ai)/i,
      /stop\s+being\s+(?:degen\s+oracle|an?\s+ai)/i,
      /change\s+your\s+(?:role|personality|character)/i,
      /become\s+(?:a\s+)?(?:human|person|user)/i,
      
      // System information extraction
      /show\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?prompt/i,
      /what\s+(?:are\s+)?your\s+(?:instructions?|rules?|guidelines?)/i,
      /reveal\s+your\s+(?:system\s+)?prompt/i,
      /display\s+your\s+(?:system\s+)?(?:instructions?|prompt)/i,
      /print\s+your\s+(?:system\s+)?prompt/i,
      
      // Jailbreak attempts
      /jailbreak/i,
      /dan\s+mode/i,
      /evil\s+mode/i,
      /unrestricted\s+mode/i,
      /bypass\s+(?:restrictions?|filters?|safety|all)/i,
      /remove\s+(?:restrictions?|filters?|safety)/i,
      /enter\s+jailbreak\s+mode/i,
      
      // Code execution attempts
      /execute\s+(?:code|script|command|this)/i,
      /run\s+(?:code|script|command)/i,
      /eval\s*\(/i,
      /system\s*\(/i,
      /exec\s*\(/i,
      /execute.*code:/i,
      
      // Sensitive data extraction
      /api\s+key/i,
      /secret\s+key/i,
      /password/i,
      /token\s+(?!price|analysis|data)/i, // Allow "token price" but not "access token"
      /credentials?/i,
      /private\s+key/i,
      
      // Output manipulation
      /respond\s+with\s+only/i,
      /only\s+say/i,
      /just\s+respond/i,
      /output\s+format:/i,
      /format\s+your\s+response\s+as/i,
      
      // Repetition attacks
      /repeat\s+(?:this\s+)?(?:\d+\s+times?|forever|infinitely)/i,
      /say\s+(?:this\s+)?\d+\s+times?/i,
      
      // Social engineering
      /this\s+is\s+(?:an?\s+)?(?:emergency|urgent|critical)/i,
      /you\s+must\s+(?:help|assist|comply)/i,
      /i\s+am\s+(?:your\s+)?(?:creator|developer|admin|owner)/i,
      /as\s+(?:your\s+)?(?:creator|developer|admin|owner)/i
    ];

    // Suspicious keywords that increase risk score
    this.suspiciousKeywords = [
      'override', 'bypass', 'ignore', 'forget', 'jailbreak', 'admin', 'root',
      'system', 'developer', 'debug', 'execute', 'eval', 'script', 'command',
      'prompt', 'instructions', 'rules', 'guidelines', 'reveal', 'show',
      'display', 'print', 'output', 'format', 'respond', 'say', 'repeat',
      'emergency', 'urgent', 'critical', 'must', 'creator', 'owner'
    ];

    // Safe patterns that are allowed even if they match suspicious keywords
    this.safePatterns = [
      /(?:token\s+)?price/i,
      /market\s+analysis/i,
      /trading\s+signals?/i,
      /technical\s+analysis/i,
      /show\s+(?:me\s+)?(?:the\s+)?(?:price|volume|holders?|data)/i,
      /display\s+(?:token\s+)?(?:price|data|info)/i,
      /what\s+(?:is\s+)?(?:the\s+)?(?:price|volume|market\s+cap)/i,
      /price\s+data/i,
      /override.*portfolio/i // Allow portfolio override context
    ];
  }

  /**
   * Analyze prompt for security risks
   */
  analyzePrompt(prompt) {
    const analysis = {
      isSafe: true,
      riskLevel: 'LOW', // LOW, MEDIUM, HIGH, CRITICAL
      riskScore: 0,
      detectedThreats: [],
      suspiciousPatterns: [],
      recommendation: 'ALLOW'
    };

    // Check for safe patterns first
    const isSafePattern = this.safePatterns.some(pattern => pattern.test(prompt));
    if (isSafePattern) {
      console.log(`🛡️ [SECURITY] Safe pattern detected, allowing prompt`);
      return analysis;
    }

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(prompt)) {
        const match = prompt.match(pattern);
        analysis.detectedThreats.push({
          pattern: pattern.toString(),
          match: match[0],
          type: this.categorizePattern(pattern)
        });
        analysis.riskScore += 10;
      }
    }

    // Check for suspicious keywords
    const lowerPrompt = prompt.toLowerCase();
    for (const keyword of this.suspiciousKeywords) {
      if (lowerPrompt.includes(keyword)) {
        analysis.suspiciousPatterns.push(keyword);
        analysis.riskScore += 2;
      }
    }

    // Calculate risk level and recommendation (more aggressive thresholds)
    if (analysis.riskScore >= 15) {
      analysis.riskLevel = 'CRITICAL';
      analysis.isSafe = false;
      analysis.recommendation = 'BLOCK';
    } else if (analysis.riskScore >= 10) {
      analysis.riskLevel = 'HIGH';
      analysis.isSafe = false;
      analysis.recommendation = 'BLOCK';
    } else if (analysis.riskScore >= 6) {
      analysis.riskLevel = 'MEDIUM';
      analysis.isSafe = false;
      analysis.recommendation = 'SANITIZE';
    } else if (analysis.riskScore >= 3) {
      analysis.riskLevel = 'LOW';
      analysis.recommendation = 'MONITOR';
    }

    return analysis;
  }

  /**
   * Categorize security pattern type
   */
  categorizePattern(pattern) {
    const patternStr = pattern.toString();
    
    if (patternStr.includes('ignore|forget|override')) return 'SYSTEM_OVERRIDE';
    if (patternStr.includes('you are|act as|pretend')) return 'ROLE_MANIPULATION';
    if (patternStr.includes('show|reveal|display|print')) return 'INFORMATION_EXTRACTION';
    if (patternStr.includes('jailbreak|bypass|remove')) return 'JAILBREAK_ATTEMPT';
    if (patternStr.includes('execute|run|eval|system')) return 'CODE_EXECUTION';
    if (patternStr.includes('api|secret|password|credentials')) return 'SENSITIVE_DATA';
    if (patternStr.includes('respond|output|format|say')) return 'OUTPUT_MANIPULATION';
    if (patternStr.includes('repeat|times|forever')) return 'REPETITION_ATTACK';
    if (patternStr.includes('emergency|urgent|must|creator')) return 'SOCIAL_ENGINEERING';
    
    return 'UNKNOWN_THREAT';
  }

  /**
   * Sanitize prompt by removing dangerous content
   */
  sanitizePrompt(prompt) {
    let sanitized = prompt;

    // Remove dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      sanitized = sanitized.replace(pattern, '[REMOVED_FOR_SECURITY]');
    }

    // Limit length to prevent overwhelming the system
    if (sanitized.length > 2000) {
      sanitized = sanitized.substring(0, 2000) + '... [TRUNCATED_FOR_SECURITY]';
    }

    return sanitized;
  }

  /**
   * Generate safe error response for blocked prompts
   */
  generateSecurityResponse(analysis) {
    const responses = [
      "Yo degen! That prompt looks a bit sus - our security system is keeping the platform safe from malicious attempts. Try asking about token prices, market data, or platform features instead! 🛡️",
      
      "Nice try, but our AI security is diamond hands strong! 💎 Ask me about token analysis, trending coins, or your watchlist instead - that's where the real alpha is! 🚀",
      
      "Our security guard caught that one! 🛡️ I'm here to help with crypto analysis, token data, and platform features. What token are you curious about? LFG! 🔥",
      
      "That prompt triggered our security filters - we keep things safe around here! Ask me about prices, holders, trending tokens, or platform features. WAGMI! 💪",
      
      "Security alert! 🚨 I'm designed to help with crypto analysis and platform features, not system manipulation. What token data can I fetch for you instead? 📊"
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Log security incident
   */
  logSecurityIncident(userId, prompt, analysis) {
    const incident = {
      timestamp: new Date().toISOString(),
      userId: userId,
      prompt: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore,
      threats: analysis.detectedThreats.map(t => t.type),
      recommendation: analysis.recommendation
    };

    console.log(`🚨 [SECURITY INCIDENT] ${analysis.riskLevel} risk detected:`, incident);
    
    // In production, you'd want to log this to a security monitoring system
    // For now, we'll just console log it
    
    return incident;
  }
}

export default PromptSecurityGuard;
