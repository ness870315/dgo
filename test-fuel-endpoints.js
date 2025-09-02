import axios from 'axios';

async function testFuelEndpoints() {
  try {
    console.log('🔥 Testing Fuel Token Endpoints...\n');

    // Test GET /api/tokens/fuel
    console.log('1. Testing GET /api/tokens/fuel');
    try {
      const getResponse = await axios.get('http://localhost:4000/api/tokens/fuel');
      console.log('✅ GET Success:', getResponse.data);
    } catch (error) {
      console.log('❌ GET Error:', error.response?.data || error.message);
    }

    console.log('\n2. Testing POST /api/tokens/fuel (without data)');
    try {
      const postResponse = await axios.post('http://localhost:4000/api/tokens/fuel', {});
      console.log('✅ POST Success:', postResponse.data);
    } catch (error) {
      console.log('❌ POST Error:', error.response?.data || error.message);
    }

    console.log('\n3. Testing POST /api/tokens/fuel (with invalid fuel type)');
    try {
      const postResponse = await axios.post('http://localhost:4000/api/tokens/fuel', {
        contractAddress: 'test123',
        fuelType: 'invalid'
      });
      console.log('✅ POST Success:', postResponse.data);
    } catch (error) {
      console.log('❌ POST Error:', error.response?.data || error.message);
    }

    console.log('\n4. Testing POST /api/tokens/fuel (with valid data but non-existent token)');
    try {
      const postResponse = await axios.post('http://localhost:4000/api/tokens/fuel', {
        contractAddress: 'nonexistenttoken123456789',
        fuelType: '10x'
      });
      console.log('✅ POST Success:', postResponse.data);
    } catch (error) {
      console.log('❌ POST Error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

testFuelEndpoints();




