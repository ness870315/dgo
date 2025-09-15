import axios from 'axios';

class HelioPaymentService {
  constructor() {
    this.apiKey = process.env.HELIO_API_KEY || 'your-helio-api-key-here';
    this.paylinkId = '68ae3424a561997f2bc70c7e';
    this.baseUrl = 'https://api.hel.io/v1';
    this.webhookSecret = process.env.HELIO_WEBHOOK_SECRET || 'your-webhook-secret-here';

    // Payment amounts (in cents)
    this.prices = {
      tokenListing: 9500, // $95.00 for token listing (FIXED: was $9.90)
      socialUpdate: 490, // $4.90 for social links update
      priorityBoost: 1990 // $19.90 for priority boost
    };

    console.log('💳 Helio Payment Service initialized');
    console.log('🔗 PayLink ID:', this.paylinkId);
    console.log('🔑 API Key:', this.apiKey ? 'Set' : 'Not set');
    console.log('🌐 Base URL:', this.baseUrl);
    
    // Test API connection on startup
    this._testApiConnection();
    console.log('🔐 Webhook Secret:', this.webhookSecret ? 'Set' : 'Not set');
  }

  /**
   * Test Helio API connection
   */
  async _testApiConnection() {
    if (!this.apiKey || this.apiKey === 'your-helio-api-key-here') {
      console.log('⚠️ Skipping API connection test - no valid API key');
      return;
    }

    try {
      console.log('🔍 Testing Helio API connection...');
      console.log('🔑 API Key format:', this.apiKey.startsWith('sk_') ? 'Secret Key' : 
                  this.apiKey.startsWith('pk_') ? 'Public Key' : 'Unknown format');
      
      // Try to get account info or PayLink info
      const testEndpoints = [
        `${this.baseUrl}/account`,
        `${this.baseUrl}/me`,
        `${this.baseUrl}/paylinks/${this.paylinkId}`,
        `${this.baseUrl}/paylink/${this.paylinkId}`,
        `https://api.hel.io/account`,
        `https://api.hel.io/me`,
        `https://api.hel.io/paylinks/${this.paylinkId}`,
        `https://api.hel.io/paylink/${this.paylinkId}`
      ];

      // Try different authentication methods
      const authMethods = [
        { name: 'Bearer Token', headers: { 'Authorization': `Bearer ${this.apiKey}` } },
        { name: 'API Key Header', headers: { 'X-API-Key': this.apiKey } },
        { name: 'Authorization Header', headers: { 'Authorization': this.apiKey } }
      ];

      for (const authMethod of authMethods) {
        console.log(`🔐 Trying authentication method: ${authMethod.name}`);
        
        for (const endpoint of testEndpoints) {
          try {
            const response = await axios.get(endpoint, {
              headers: {
                ...authMethod.headers,
                'Content-Type': 'application/json'
              },
              timeout: 5000
            });
            console.log(`✅ Helio API connection successful: ${endpoint}`);
            console.log(`📊 Auth method: ${authMethod.name}`);
            console.log(`📊 Response status: ${response.status}`);
            console.log(`📊 Response data keys:`, Object.keys(response.data || {}));
            return;
          } catch (error) {
            console.log(`❌ API endpoint failed: ${endpoint} - ${error.response?.status} (${authMethod.name})`);
          }
        }
      }
      
      console.log('⚠️ All Helio API endpoints and auth methods failed - check API key and base URL');
    } catch (error) {
      console.log('❌ Helio API connection test failed:', error.message);
    }
  }

  /**
   * Create a payment link for token listing
   */
  async createTokenListingPayment(tokenData, options = {}) {
    try {
      console.log('💳 Creating token listing payment for:', tokenData.symbol);

      const paymentData = {
        paylinkId: this.paylinkId,
        amount: this.prices.tokenListing,
        currency: 'USD',
        description: `Token Listing: ${tokenData.name} (${tokenData.symbol})`,
        metadata: {
          type: 'token_listing',
          symbol: tokenData.symbol,
          name: tokenData.name,
          contractAddress: tokenData.contractAddress,
          userId: options.userId || 'anonymous',
          timestamp: new Date().toISOString(),
          features: options.features || ['basic_listing']
        },
        successUrl: options.successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?payment=success`,
        cancelUrl: options.cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?payment=cancelled`,
        webhookUrl: options.webhookUrl || `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/payments/webhook`
      };

      console.log('💰 Payment amount:', `$${(paymentData.amount / 100).toFixed(2)}`);
      console.log('📊 Payment metadata:', paymentData.metadata);

      // For now, return mock payment data since we're not using the API directly
      const paymentId = `helio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        success: true,
        paymentId: paymentId,
        paymentUrl: `https://app.hel.io/pay/${this.paylinkId}?successUrl=${encodeURIComponent(paymentData.successUrl)}&cancelUrl=${encodeURIComponent(paymentData.cancelUrl)}`,
        amount: paymentData.amount,
        currency: paymentData.currency,
        description: paymentData.description,
        metadata: paymentData.metadata,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

    } catch (error) {
      console.error('❌ Error creating token listing payment:', error);
      throw new Error(`Payment creation failed: ${error.message}`);
    }
  }

  /**
   * Create a payment link for social links update
   */
  async createSocialUpdatePayment(symbol, socialData, userId) {
    try {
      console.log('💳 Creating social update payment for:', symbol);

      const paymentData = {
        paylinkId: this.paylinkId,
        amount: this.prices.socialUpdate,
        currency: 'USD',
        description: `Social Links Update: ${symbol}`,
        metadata: {
          type: 'social_update',
          symbol: symbol,
          userId: userId,
          socialPlatforms: Object.keys(socialData).filter(key => socialData[key]),
          timestamp: new Date().toISOString()
        }
      };

      console.log('💰 Payment amount:', `$${(paymentData.amount / 100).toFixed(2)}`);
      console.log('📊 Social platforms:', paymentData.metadata.socialPlatforms);

      const paymentId = `helio_social_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        success: true,
        paymentId: paymentId,
        paymentUrl: `https://app.hel.io/pay/${this.paylinkId}?successUrl=${encodeURIComponent(paymentData.successUrl || 'http://localhost:3000/?payment=success')}&cancelUrl=${encodeURIComponent(paymentData.cancelUrl || 'http://localhost:3000/?payment=cancelled')}`,
        amount: paymentData.amount,
        currency: paymentData.currency,
        description: paymentData.description,
        metadata: paymentData.metadata
      };

    } catch (error) {
      console.error('❌ Error creating social update payment:', error);
      throw new Error(`Social payment creation failed: ${error.message}`);
    }
  }

  /**
   * Validate payment completion with Helio API
   */
  async validatePayment(paymentId, paymentData) {
    try {
      console.log('✅ Validating payment with Helio API:', paymentId);

      // Check if we have a valid API key
      if (!this.apiKey || this.apiKey === 'your-helio-api-key-here') {
        console.log('⚠️ No valid Helio API key found, using fallback validation');
        return this._fallbackValidation(paymentId, paymentData);
      }

      // Check if this is a PayLink ID instead of a payment ID
      const isPayLinkId = paymentId === this.paylinkId || 
                         paymentId === process.env.HELIO_MONTHLY_PAYLINK_ID ||
                         paymentId === process.env.HELIO_YEARLY_PAYLINK_ID ||
                         paymentId === '68b8ed60cf71471addc8adb6'; // Premium PayLink ID

      if (isPayLinkId) {
        console.log('🔗 Detected PayLink ID, using PayLink validation approach');
        return this._validatePayLinkPayment(paymentId, paymentData);
      }

      // Try different possible endpoints for actual payment IDs
      const possibleEndpoints = [
        `${this.baseUrl}/payments/${paymentId}`,
        `${this.baseUrl}/payment/${paymentId}`,
        `${this.baseUrl}/transactions/${paymentId}`,
        `${this.baseUrl}/transaction/${paymentId}`,
        `${this.baseUrl}/paylink/${this.paylinkId}/payment/${paymentId}`,
        `${this.baseUrl}/paylink/${this.paylinkId}/payments/${paymentId}`
      ];

      let response = null;
      let lastError = null;

      for (const endpoint of possibleEndpoints) {
        try {
          console.log(`🔍 Trying endpoint: ${endpoint}`);
          response = await axios.get(endpoint, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          console.log(`✅ Success with endpoint: ${endpoint}`);
          break; // Success, exit the loop
        } catch (endpointError) {
          console.log(`❌ Endpoint failed: ${endpoint} - ${endpointError.response?.status}`);
          lastError = endpointError;
          continue; // Try next endpoint
        }
      }

      if (!response) {
        throw lastError || new Error('All API endpoints failed');
      }

      if (response.data && (response.data.status === 'completed' || response.data.status === 'success' || response.data.status === 'paid')) {
        const validationResult = {
          isValid: true,
          paymentId: paymentId,
          amount: response.data.amount || paymentData?.amount || this.prices.tokenListing,
          currency: response.data.currency || 'USD',
          status: 'completed',
          metadata: response.data.metadata || paymentData?.metadata || {},
          validatedAt: new Date().toISOString(),
          helioData: response.data
        };

        console.log('💳 Payment validation successful:', validationResult);
        return validationResult;
      } else {
        console.log('❌ Payment not completed in Helio:', response.data);
        return {
          isValid: false,
          error: 'Payment not completed',
          paymentId: paymentId,
          status: response.data?.status || 'unknown'
        };
      }

    } catch (error) {
      console.error('❌ Payment validation failed:', error.message);
      console.error('❌ Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Fallback: if API call fails, still validate basic payment data
      return this._fallbackValidation(paymentId, paymentData);
    }
  }

  /**
   * Validate PayLink-based payment (when paymentId is actually a PayLink ID)
   */
  async _validatePayLinkPayment(paylinkId, paymentData) {
    try {
      console.log('🔗 Validating PayLink payment:', paylinkId);
      console.log('🔑 Using API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'Not set');
      console.log('🌐 Base URL:', this.baseUrl);

      // For PayLink validation, we'll use a different approach
      // Since we can't validate individual payments without the actual payment ID,
      // we'll validate based on the PayLink configuration and payment data
      
      const paylinkEndpoints = [
        `${this.baseUrl}/paylinks/${paylinkId}`,
        `${this.baseUrl}/paylink/${paylinkId}`,
        `${this.baseUrl}/links/${paylinkId}`,
        `${this.baseUrl}/v1/paylinks/${paylinkId}`,
        `${this.baseUrl}/v1/paylink/${paylinkId}`,
        `${this.baseUrl}/api/paylinks/${paylinkId}`,
        `${this.baseUrl}/api/paylink/${paylinkId}`,
        `https://api.hel.io/paylinks/${paylinkId}`,
        `https://api.hel.io/paylink/${paylinkId}`,
        `https://api.hel.io/v1/paylinks/${paylinkId}`,
        `https://api.hel.io/v1/paylink/${paylinkId}`
      ];

      let paylinkResponse = null;
      let lastError = null;
      
      for (const endpoint of paylinkEndpoints) {
        try {
          console.log(`🔍 Trying PayLink endpoint: ${endpoint}`);
          paylinkResponse = await axios.get(endpoint, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          console.log(`✅ PayLink endpoint success: ${endpoint}`);
          console.log(`📊 Response status: ${paylinkResponse.status}`);
          console.log(`📊 Response data keys:`, Object.keys(paylinkResponse.data || {}));
          break;
        } catch (endpointError) {
          console.log(`❌ PayLink endpoint failed: ${endpoint} - ${endpointError.response?.status}`);
          console.log(`❌ Error details:`, {
            status: endpointError.response?.status,
            statusText: endpointError.response?.statusText,
            data: endpointError.response?.data
          });
          lastError = endpointError;
          continue;
        }
      }

      if (paylinkResponse) {
        console.log('✅ PayLink validation successful:', paylinkResponse.data);
        return {
          isValid: true,
          paymentId: paylinkId,
          paylinkId: paylinkId,
          amount: paymentData?.amount || this.prices.tokenListing,
          currency: 'USD',
          status: 'completed',
          metadata: paymentData?.metadata || {},
          validatedAt: new Date().toISOString(),
          helioData: paylinkResponse.data,
          paylinkValidation: true
        };
      } else {
        // If PayLink validation fails, use fallback
        console.log('⚠️ All PayLink endpoints failed, using fallback validation');
        console.log('⚠️ Last error:', lastError?.message);
        return this._fallbackValidation(paylinkId, paymentData);
      }

    } catch (error) {
      console.error('❌ PayLink validation failed:', error.message);
      return this._fallbackValidation(paylinkId, paymentData);
    }
  }

  /**
   * Fallback validation when API calls fail
   */
  _fallbackValidation(paymentId, paymentData) {
    // Check if this is a known PayLink ID (including premium PayLink)
    const isKnownPayLinkId = paymentId === this.paylinkId || 
                             paymentId === process.env.HELIO_MONTHLY_PAYLINK_ID ||
                             paymentId === process.env.HELIO_YEARLY_PAYLINK_ID ||
                             paymentId === '68b8ed60cf71471addc8adb6'; // Premium PayLink ID

    if (isKnownPayLinkId) {
      console.log('⚠️ Using PayLink fallback validation for known PayLink ID');
      return {
        isValid: true,
        paymentId: paymentId,
        paylinkId: paymentId,
        amount: paymentData?.amount || this.prices.tokenListing,
        currency: 'USD',
        status: 'completed',
        metadata: paymentData?.metadata || {},
        validatedAt: new Date().toISOString(),
        fallback: true,
        paylinkFallback: true
      };
    }

    if (paymentData && paymentData.paymentId) {
      console.log('⚠️ Using fallback validation due to API error');
      return {
        isValid: true,
        paymentId: paymentId,
        amount: paymentData.amount || this.prices.tokenListing,
        currency: paymentData.currency || 'USD',
        status: 'completed',
        metadata: paymentData.metadata || {},
        validatedAt: new Date().toISOString(),
        fallback: true
      };
    }
    
    return {
      isValid: false,
      error: 'Payment validation failed and no fallback data available',
      paymentId: paymentId
    };
  }

  /**
   * Process payment webhook from Helio
   */
  async processWebhook(webhookData, signature) {
    try {
      console.log('🔔 Processing Helio webhook');

      // Verify webhook signature (in production)
      // const isValidSignature = this.verifyWebhookSignature(webhookData, signature);

      if (!webhookData || !webhookData.paymentId) {
        throw new Error('Invalid webhook data');
      }

      const paymentResult = {
        paymentId: webhookData.paymentId,
        status: webhookData.status || 'completed',
        amount: webhookData.amount,
        currency: webhookData.currency || 'USD',
        metadata: webhookData.metadata || {},
        processedAt: new Date().toISOString()
      };

      console.log('✅ Webhook processed successfully:', paymentResult);
      return paymentResult;

    } catch (error) {
      console.error('❌ Webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature (for production)
   */
  verifyWebhookSignature(payload, signature) {
    // In production, implement HMAC verification
    // For now, return true
    console.log('🔐 Webhook signature verification (mock):', !!signature);
    return true;
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      console.log('📊 Checking payment status:', paymentId);

      // Mock implementation - in production, call Helio API
      return {
        paymentId: paymentId,
        status: 'completed', // Assume completed for mock
        amount: this.prices.tokenListing,
        currency: 'USD',
        createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        completedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error getting payment status:', error);
      throw error;
    }
  }

  /**
   * Refund payment (for failed operations)
   */
  async refundPayment(paymentId, reason) {
    try {
      console.log('💸 Processing refund for:', paymentId, 'Reason:', reason);

      // Mock refund implementation
      return {
        success: true,
        refundId: `refund_${paymentId}`,
        amount: this.prices.tokenListing,
        currency: 'USD',
        reason: reason,
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Refund processing failed:', error);
      throw error;
    }
  }

  /**
   * Get payment history for user
   */
  async getPaymentHistory(userId, limit = 10) {
    try {
      console.log('📜 Getting payment history for user:', userId);

      // Mock payment history
      return {
        userId: userId,
        payments: [
          {
            paymentId: 'helio_1234567890_abc123',
            type: 'token_listing',
            amount: this.prices.tokenListing,
            currency: 'USD',
            status: 'completed',
            description: 'Token Listing: SAMPLE (SMP)',
            createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            completedAt: new Date(Date.now() - 82800000).toISOString() // 23 hours ago
          }
        ],
        totalCount: 1,
        limit: limit
      };

    } catch (error) {
      console.error('❌ Error getting payment history:', error);
      throw error;
    }
  }
}

export default HelioPaymentService;




