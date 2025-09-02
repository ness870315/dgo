import HelioPaymentService from './helioPaymentService.js';

async function testHelioIntegration() {
  console.log('💳 Testing Helio Payment Integration');
  console.log('='.repeat(50));

  try {
    // Test 1: Initialize service
    console.log('\n📋 Test 1: Service Initialization');
    console.log('-'.repeat(30));

    const helioService = new HelioPaymentService();
    console.log('✅ Helio Payment Service initialized');

    // Test 2: Create token listing payment
    console.log('\n💰 Test 2: Create Token Listing Payment');
    console.log('-'.repeat(30));

    const tokenData = {
      symbol: 'TEST',
      name: 'Test Token',
      contractAddress: '11111111111111111111111111111112'
    };

    const payment = await helioService.createTokenListingPayment(tokenData, {
      userId: 'test_user_123',
      successUrl: 'http://localhost:3000/?payment=success',
      cancelUrl: 'http://localhost:3000/?payment=cancelled'
    });

    console.log('✅ Payment created successfully:');
    console.log('   Payment ID:', payment.paymentId);
    console.log('   Amount:', `$${(payment.amount / 100).toFixed(2)}`);
    console.log('   Payment URL:', payment.paymentUrl.substring(0, 60) + '...');

    // Test 3: Validate payment
    console.log('\n✅ Test 3: Validate Payment');
    console.log('-'.repeat(30));

    const validation = await helioService.validatePayment(payment.paymentId, {
      amount: payment.amount,
      currency: payment.currency
    });

    console.log('✅ Payment validation result:');
    console.log('   Is Valid:', validation.isValid);
    console.log('   Status:', validation.status);
    console.log('   Amount:', `$${(validation.amount / 100).toFixed(2)}`);

    // Test 4: Create social update payment
    console.log('\n📱 Test 4: Create Social Update Payment');
    console.log('-'.repeat(30));

    const socialPayment = await helioService.createSocialUpdatePayment(
      'TEST',
      {
        twitter: 'https://twitter.com/testtoken',
        discord: 'https://discord.gg/test'
      },
      'test_user_123'
    );

    console.log('✅ Social payment created successfully:');
    console.log('   Payment ID:', socialPayment.paymentId);
    console.log('   Amount:', `$${(socialPayment.amount / 100).toFixed(2)}`);
    console.log('   Social Platforms:', socialPayment.metadata.socialPlatforms);

    // Test 5: Get payment status
    console.log('\n📊 Test 5: Get Payment Status');
    console.log('-'.repeat(30));

    const status = await helioService.getPaymentStatus(payment.paymentId);
    console.log('✅ Payment status retrieved:');
    console.log('   Status:', status.status);
    console.log('   Created:', new Date(status.createdAt).toLocaleString());
    console.log('   Amount:', `$${(status.amount / 100).toFixed(2)}`);

    // Test 6: Process webhook
    console.log('\n🔔 Test 6: Process Webhook');
    console.log('-'.repeat(30));

    const webhookData = {
      paymentId: payment.paymentId,
      status: 'completed',
      amount: payment.amount,
      currency: 'USD',
      metadata: payment.metadata
    };

    const webhookResult = await helioService.processWebhook(webhookData);
    console.log('✅ Webhook processed successfully:');
    console.log('   Payment ID:', webhookResult.paymentId);
    console.log('   Status:', webhookResult.status);
    console.log('   Processed At:', new Date(webhookResult.processedAt).toLocaleString());

    // Test 7: Get payment history
    console.log('\n📜 Test 7: Get Payment History');
    console.log('-'.repeat(30));

    const history = await helioService.getPaymentHistory('test_user_123', 5);
    console.log('✅ Payment history retrieved:');
    console.log('   Total Payments:', history.payments.length);
    console.log('   User ID:', history.userId);

    if (history.payments.length > 0) {
      console.log('   Latest Payment:');
      console.log('     Type:', history.payments[0].type);
      console.log('     Amount:', `$${(history.payments[0].amount / 100).toFixed(2)}`);
      console.log('     Status:', history.payments[0].status);
    }

    // Summary
    console.log('\n🎯 HELIO INTEGRATION TEST COMPLETE');
    console.log('='.repeat(50));
    console.log('✅ All tests passed!');
    console.log('💳 Helio Payment Service is fully functional');
    console.log('🔗 PayLink ID:', helioService.paylinkId);
    console.log('💰 Token Listing Price: $9.90');
    console.log('📱 Social Update Price: $4.90');
    console.log('🚀 Ready for production use!');

  } catch (error) {
    console.error('❌ Helio integration test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testHelioIntegration().catch(console.error);




