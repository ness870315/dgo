/**
 * Test KOL API Response
 */

import axios from 'axios';

async function testKOLAPI() {
  try {
    console.log('🧪 Testing KOL API...');
    
    const response = await axios.get('https://api.degen-oracle.com/api/kolsentiment/kols');
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('✅ API call successful');
      console.log('📊 KOLs array:', response.data.data.kols);
      console.log('📊 Total KOLs:', response.data.data.total);
      console.log('📊 First KOL:', response.data.data.kols[0]);
    } else {
      console.log('❌ API call failed:', response.data.error);
    }
    
  } catch (error) {
    console.error('💥 Error testing API:', error.message);
    if (error.response) {
      console.error('📊 Response data:', error.response.data);
    }
  }
}

testKOLAPI();
