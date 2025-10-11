import fetch from 'node-fetch';
import crypto from 'crypto';

/**
 * x402 Merchant Service - PayAI Integration for Twitter Fuel Payments
 * Enables users to fuel tokens via natural language on Twitter
 * Uses PayAI x402 protocol for on-chain USDC payments on Solana
 * Documentation: https://docs.payai.network/x402/reference
 */
class X402MerchantService {
  constructor() {
    this.facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://facilitator.payai.network';
    this.network = 'solana';
    
    // Merchant wallet address
    this.merchantWallet = process.env.X402_PAY_TO_ADDRESS || '3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1';
    
    // USDC mint and decimals
    this.usdcAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC on Solana
    this.usdcDecimals = 6; // USDC has 6 decimals
    
    // Compute merchant's USDC ATA (Associated Token Account)
    this.payToAddress = this.computeMerchantUSDCATA();
    
    // Twitter x402 prices (90% discount from website prices)
    // NOTE: 10x set to 0.1 USDC for testing
    this.fuelPrices = {
      '10x': { usd: 45.00, discountedUsd: 0.10, usdc: 0.10 * 1e6 },   // 100,000 (TEST PRICE)
      '50x': { usd: 195.00, discountedUsd: 19.50, usdc: 19.50 * 1e6 }, // 19,500,000
      '500x': { usd: 695.00, discountedUsd: 69.50, usdc: 69.50 * 1e6 }, // 69,500,000
      '1000x': { usd: 995.00, discountedUsd: 99.50, usdc: 99.50 * 1e6 }  // 99,500,000
    };
    
    // Track pending payments (nonce -> payment details)
    this.pendingPayments = new Map();
    
    console.log('💳 [x402] Merchant Service initialized');
    console.log('  - Network:', this.network);
    console.log('  - Merchant wallet:', this.merchantWallet);
    console.log('  - Merchant USDC ATA:', this.payToAddress);
    console.log('  - Facilitator:', this.facilitatorUrl);
    console.log('  - Twitter pricing (90% off):');
    Object.entries(this.fuelPrices).forEach(([type, price]) => {
      console.log(`    ${type}: $${price.discountedUsd} USDC (was $${price.usd})`);
    });
  }

  /**
   * Compute merchant's USDC Associated Token Account (ATA)
   * This is the address where USDC payments will be sent
   * 
   * For now, we'll use a precomputed ATA to avoid ES module import issues
   * TODO: Make this dynamic once we resolve the import timing
   */
  computeMerchantUSDCATA() {
    // Precomputed ATA for merchant wallet 3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1
    // USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    // This is the ATA where USDC payments should be sent
    const merchantUSDCATA = '2V6mqjDtaZMaCiMVr9Bad7hD6p3YcAtL3EfzsVJ6CQs7';
    
    console.log('✅ Using precomputed merchant USDC ATA:', merchantUSDCATA);
    return merchantUSDCATA;
  }

  /**
   * Generate payment requirements for fuel request
   * @param {string} tokenSymbol - Token to fuel (e.g., "MEMEPUTER")
   * @param {string} contractAddress - Token contract address
   * @param {string} fuelType - Fuel tier (10x, 50x, 500x, 1000x)
   * @param {string} userHandle - Twitter handle of requester
   * @param {string} originalTweetId - Original tweet ID for final confirmation reply
   * @returns {Object} - Payment requirements and payment URL
   */
  async generateFuelPaymentLink(tokenSymbol, contractAddress, fuelType, userHandle, originalTweetId = null) {
    try {
      if (!this.fuelPrices[fuelType]) {
        throw new Error(`Invalid fuel type: ${fuelType}`);
      }

      const pricing = this.fuelPrices[fuelType];
      const nonce = this.generateNonce();
      const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes

      // Create payment requirements
      const paymentRequirements = {
        scheme: 'exact',
        network: this.network,
        amount: pricing.usdc.toString(), // USDC amount in smallest unit (use 'amount' for PayAI)
        asset: this.usdcAddress,
        payTo: this.payToAddress, // Merchant's USDC ATA (not wallet)
        description: `${fuelType} Fuel for $${tokenSymbol} (Twitter x402 - 90% off)`,
        nonce: nonce,
        validAfter: Math.floor(Date.now() / 1000).toString(),
        validBefore: Math.floor(expiresAt / 1000).toString(),
        metadata: {
          tokenSymbol,
          contractAddress,
          fuelType,
          userHandle,
          source: 'twitter',
          discount: '90%',
          originalPrice: pricing.usd,
          discountedPrice: pricing.discountedUsd
        }
      };

      // Store pending payment
      this.pendingPayments.set(nonce, {
        nonce,
        tokenSymbol,
        contractAddress,
        fuelType,
        userHandle,
        amount: pricing.discountedUsd,
        expiresAt,
        status: 'pending',
        createdAt: Date.now(),
        originalTweetId // Store for final confirmation reply
      });

      // Generate PayAI payment URL
      const paymentUrl = this.createPaymentUrl(paymentRequirements);

      console.log(`💳 [x402] Generated payment link for ${fuelType} fuel to $${tokenSymbol}`);
      console.log(`   Amount: ${pricing.discountedUsd} USDC (90% off)`);
      console.log(`   User: @${userHandle}`);
      console.log(`   Nonce: ${nonce}`);
      console.log(`   Expires: ${new Date(expiresAt).toISOString()}`);

      return {
        paymentUrl,
        amount: pricing.discountedUsd,
        amountUSDC: pricing.usdc,
        currency: 'USDC',
        expiresAt,
        expiresInMinutes: 15,
        nonce,
        tokenSymbol,
        fuelType,
        discount: '90%',
        originalPrice: pricing.usd
      };

    } catch (error) {
      console.error('❌ [x402] Error generating fuel payment link:', error.message);
      throw error;
    }
  }

  /**
   * Create payment URL (our hosted payment page)
   */
  createPaymentUrl(requirements) {
    // Use our own payment page with nonce
    // Payment page will fetch details via API and handle wallet connection
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://degen-oracle.com'
      : 'http://localhost:3000';
    
    return `${baseUrl}/fuel-payment.html?nonce=${requirements.nonce}`;
  }

  /**
   * Verify payment with facilitator
   */
  async verifyPayment(paymentProof) {
    try {
      console.log(`🔍 [x402] Verifying payment with facilitator...`);

      const response = await fetch(`${this.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentProof)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Verification failed: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      console.log(`✅ [x402] Payment verification:`, result);
      
      return {
        valid: result.valid || false,
        reason: result.reason || 'unknown',
        result
      };

    } catch (error) {
      console.error('❌ [x402] Verification error:', error.message);
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Settle payment with facilitator (execute on-chain)
   */
  async settlePayment(paymentProof) {
    try {
      console.log(`💰 [x402] Settling payment with facilitator...`);

      const response = await fetch(`${this.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentProof)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Settlement failed: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      console.log(`✅ [x402] Payment settled:`, result);
      
      return {
        settled: true,
        transactionHash: result.transactionHash || result.txHash,
        blockNumber: result.blockNumber,
        result
      };

    } catch (error) {
      console.error('❌ [x402] Settlement error:', error.message);
      return { settled: false, error: error.message };
    }
  }

  /**
   * Get pending payment by nonce
   */
  getPendingPayment(nonce) {
    return this.pendingPayments.get(nonce);
  }

  /**
   * Mark payment as completed
   */
  completePayment(nonce) {
    const payment = this.pendingPayments.get(nonce);
    if (payment) {
      payment.status = 'completed';
      payment.completedAt = Date.now();
      console.log(`✅ [x402] Payment completed:`, { nonce, tokenSymbol: payment.tokenSymbol, fuelType: payment.fuelType });
    }
    return payment;
  }

  /**
   * Clean up expired payments
   */
  cleanupExpiredPayments() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [nonce, payment] of this.pendingPayments.entries()) {
      if (payment.expiresAt < now && payment.status === 'pending') {
        this.pendingPayments.delete(nonce);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [x402] Cleaned up ${cleaned} expired payments`);
    }
  }

  /**
   * Generate unique nonce for payment
   */
  generateNonce() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get fuel price info
   */
  getFuelPrice(fuelType) {
    return this.fuelPrices[fuelType] || null;
  }

  /**
   * List all available fuel tiers
   */
  getAvailableFuelTiers() {
    return Object.keys(this.fuelPrices).map(type => ({
      type,
      originalPrice: this.fuelPrices[type].usd,
      discountedPrice: this.fuelPrices[type].discountedUsd,
      discount: '90%',
      currency: 'USDC',
      network: 'Solana'
    }));
  }
}

export default X402MerchantService;

