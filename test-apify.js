import { ApifyClient } from 'apify-client';

async function testApify() {
  try {
    console.log('🔍 Testing Apify client...');
    
    const client = new ApifyClient({ 
      token: 'apify_api_6Q8Oi0XJfrJLa9FgTf18fDl1zPErHb37FGWx' 
    });
    
    console.log('✅ Apify client created successfully');
    
    // Test the specific actor
    const actorId = 'eoF4jxJZItdkP33r9';
    console.log(`🎭 Testing actor: ${actorId}`);
    
    const run = await client.actor(actorId).start({ 
      your: 'input' 
    });
    
    console.log('✅ Actor started successfully!');
    console.log('📊 Run ID:', run.id);
    console.log('📊 Dataset ID:', run.defaultDatasetId);
    console.log('🔍 Full run object:', run);
    
  } catch (error) {
    console.error('❌ Error testing Apify:', error.message);
    console.error('Full error:', error);
  }
}

testApify();




