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
   * Validate payment completion (webhook handler)
   */
  async validatePayment(paymentId, paymentData) {
    try {
      console.log('✅ Validating payment:', paymentId);

      // For now, accept all payments (in production, verify with Helio API)
      const validationResult = {
        isValid: true,
        paymentId: paymentId,
        amount: paymentData.amount || this.prices.tokenListing,
        currency: paymentData.currency || 'USD',
        status: 'completed',
        metadata: paymentData.metadata || {},
        validatedAt: new Date().toISOString()
      };

      console.log('💳 Payment validation successful:', validationResult);
      return validationResult;

    } catch (error) {
      console.error('❌ Payment validation failed:', error);
      return {
        isValid: false,
        error: error.message,
        paymentId: paymentId
      };
    }
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




