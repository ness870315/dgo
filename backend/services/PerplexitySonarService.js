import fetch from 'node-fetch';

/**
 * Perplexity Sonar Service - Grounded LLM with real-time search
 * Uses Perplexity's sonar-pro model for fact-based, cited responses
 * Documentation: https://docs.perplexity.ai/getting-started/quickstart
 */
class PerplexitySonarService {
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.baseUrl = 'https://api.perplexity.ai';
    this.defaultModel = 'sonar-pro'; // Default: Fast, no reasoning overhead
    this.reasoningModel = 'sonar-pro'; // Updated: sonar-reasoning deprecated, use sonar-pro instead
    this.isInitialized = false;

    if (!this.apiKey) {
      console.warn('⚠️ [PERPLEXITY] API key not found. Service will not be available.');
    } else {
      this.isInitialized = true;
      console.log('✅ [PERPLEXITY] Sonar Service initialized');
      console.log('  - Default model:', this.defaultModel, '(fast, no reasoning)');
      console.log('  - Reasoning model:', this.reasoningModel, '(for creative content)');
    }
  }

  /**
   * Search and generate a grounded response with citations
   * @param {string} query - The user's question/query
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Response with content, citations, and search results
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ [PERPLEXITY] Service not initialized');
      return null;
    }

    try {
      console.log(`🔍 [PERPLEXITY] Searching: "${query.substring(0, 80)}..."`);

      const requestBody = {
        model: options.model || this.defaultModel,
        messages: [
          {
            role: 'system',
            content: options.systemPrompt || 'You are a helpful AI assistant that provides accurate, factual information with citations.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: options.maxTokens || 800,
        temperature: options.temperature || 0.7,
        search_domain_filter: options.searchDomainFilter || [], // Optional: filter to specific domains
        return_images: options.returnImages || false,
        return_related_questions: options.returnRelatedQuestions || false,
        search_recency_filter: options.searchRecencyFilter || 'month' // Options: 'day', 'week', 'month', 'year'
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Extract the response
      let content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];
      const searchResults = data.search_results || [];
      const usage = data.usage || {};
      const modelUsed = requestBody.model;

      // Note: sonar-reasoning model is deprecated, so we no longer need to strip reasoning tags
      // sonar-pro doesn't include <think> tags

      console.log(`✅ [PERPLEXITY] Response generated (${usage.total_tokens || 0} tokens, model: ${modelUsed})`);
      console.log(`📚 [PERPLEXITY] Citations: ${citations.length}, Search results: ${searchResults.length}`);

      return {
        content,
        citations,
        searchResults,
        usage,
        model: data.model
      };

    } catch (error) {
      console.error('❌ [PERPLEXITY] Search error:', error.message);
      return null;
    }
  }

  /**
   * Get a crypto-specific search response
   * @param {string} query - Crypto-related query
   * @param {Object} customOptions - Override default options
   * @returns {Promise<Object>} - Perplexity response
   */
  async searchCrypto(query, customOptions = {}) {
    return await this.search(query, {
      model: this.defaultModel, // Use sonar-pro for fast, direct answers
      systemPrompt: 'You are a crypto market analyst. Provide factual, data-driven insights about cryptocurrency markets, tokens, and blockchain news. Be concise and avoid citations in the answer text.',
      searchRecencyFilter: 'week', // Focus on recent crypto news
      maxTokens: 800,
      ...customOptions // Allow caller to override (e.g., use reasoningModel for jokes)
    });
  }

  /**
   * Search with reasoning (for creative content like jokes)
   * @param {string} query - Query for creative/reasoning response
   * @param {Object} customOptions - Override default options
   * @returns {Promise<Object>} - Perplexity response with reasoning
   */
  async searchWithReasoning(query, customOptions = {}) {
    return await this.search(query, {
      model: this.reasoningModel, // Use sonar-pro (sonar-reasoning deprecated)
      systemPrompt: 'You are a witty crypto degen. Use the search results to create engaging, factual content. Do not include citations in your answer.',
      searchRecencyFilter: 'day', // Focus on today's news for freshness
      maxTokens: 1500, // Higher limit for creative content
      ...customOptions
    });
  }

  /**
   * Format Perplexity response for Twitter (concise)
   * @param {Object} perplexityResponse - Full Perplexity response
   * @param {number} maxLength - Max character length
   * @returns {string} - Formatted summary
   */
  formatForTwitter(perplexityResponse, maxLength = 500) {
    if (!perplexityResponse || !perplexityResponse.content) {
      return '';
    }

    let summary = perplexityResponse.content;

    // Remove markdown formatting for cleaner text
    summary = summary
      .replace(/\*\*/g, '') // Remove bold
      .replace(/\*/g, '')   // Remove italics
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links
      .replace(/^#+\s/gm, '') // Remove headers
      .trim();

    // Truncate if needed
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength - 3) + '...';
    }

    return summary;
  }

  /**
   * Extract key facts from Perplexity response
   * @param {Object} perplexityResponse - Full Perplexity response
   * @returns {Array} - Array of key facts/insights
   */
  extractKeyFacts(perplexityResponse) {
    if (!perplexityResponse || !perplexityResponse.content) {
      return [];
    }

    const content = perplexityResponse.content;
    const facts = [];

    // Extract bullet points
    const bulletPattern = /^[-*•]\s+(.+)$/gm;
    let match;
    while ((match = bulletPattern.exec(content)) !== null) {
      facts.push(match[1].trim());
    }

    // If no bullets, extract sentences with key indicators
    if (facts.length === 0) {
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.forEach(sentence => {
        if (/\d+%|\$\d+|increased|decreased|announced|launched|reported/i.test(sentence)) {
          facts.push(sentence.trim());
        }
      });
    }

    return facts.slice(0, 5); // Top 5 facts
  }

  /**
   * Strip reasoning tags from deprecated sonar-reasoning model responses
   * Note: This method is kept for backward compatibility but is no longer used
   * since sonar-reasoning is deprecated and replaced with sonar-pro
   * @param {string} content - Raw Perplexity response
   * @returns {string} - Clean answer without reasoning
   */
  stripReasoningTags(content) {
    if (!content) return '';

    let cleaned = content;

    // Check if response contains <think> tags
    if (content.includes('<think>')) {
      // Find the closing </think> tag
      const thinkEndIndex = content.indexOf('</think>');
      
      if (thinkEndIndex !== -1) {
        // Found closing tag - take everything AFTER </think>
        cleaned = content.substring(thinkEndIndex + '</think>'.length).trim();
        console.log(`✂️ [PERPLEXITY] Stripped <think> block - answer starts at char ${thinkEndIndex + 8}`);
      } else {
        // No closing tag - the entire response is reasoning, no answer yet
        console.warn('⚠️ [PERPLEXITY] No </think> closing tag found - response is incomplete or malformed');
        return '';
      }
    }

    // If nothing useful after stripping, return empty
    if (!cleaned || cleaned.length < 5) {
      console.warn('⚠️ [PERPLEXITY] Answer too short or empty after stripping');
      return '';
    }

    console.log(`✅ [PERPLEXITY] Clean answer extracted (${cleaned.length} chars): ${cleaned.substring(0, 150)}...`);
    
    return cleaned;
  }
}

export default PerplexitySonarService;

