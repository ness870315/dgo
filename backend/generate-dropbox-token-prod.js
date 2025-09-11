const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function generateDropboxToken() {
  console.log('🔑 DROPBOX LONG-LIVED TOKEN GENERATOR');
  console.log('=====================================');
  console.log('');
  console.log('This will help you generate a long-lived Dropbox access token.');
  console.log('');

  try {
    // Step 1: Get app key and secret
    console.log('📋 STEP 1: Get your Dropbox App credentials');
    console.log('1. Go to: https://www.dropbox.com/developers/apps');
    console.log('2. Find your app or create a new one');
    console.log('3. Go to the "Settings" tab');
    console.log('4. Copy your "App key" and "App secret"');
    console.log('');

    const appKey = await askQuestion('Enter your Dropbox App Key: ');
    const appSecret = await askQuestion('Enter your Dropbox App Secret: ');

    if (!appKey || !appSecret) {
      console.log('❌ App key and secret are required!');
      process.exit(1);
    }

    // Step 2: Generate authorization URL
    console.log('');
    console.log('🔗 STEP 2: Authorize the app');
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${appKey}&response_type=code&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
    
    console.log('Open this URL in your browser:');
    console.log(authUrl);
    console.log('');

    const authCode = await askQuestion('Enter the authorization code from the browser: ');

    if (!authCode) {
      console.log('❌ Authorization code is required!');
      process.exit(1);
    }

    // Step 3: Exchange code for token
    console.log('');
    console.log('🔄 STEP 3: Exchanging code for access token...');

    try {
      const tokenResponse = await axios.post('https://api.dropboxapi.com/oauth2/token', {
        code: authCode,
        grant_type: 'authorization_code',
        client_id: appKey,
        client_secret: appSecret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const accessToken = tokenResponse.data.access_token;
      const refreshToken = tokenResponse.data.refresh_token;

      console.log('✅ SUCCESS! Long-lived token generated!');
      console.log('');
      console.log('🔑 ACCESS TOKEN:');
      console.log(accessToken);
      console.log('');
      console.log('🔄 REFRESH TOKEN:');
      console.log(refreshToken);
      console.log('');

      // Step 4: Test the token
      console.log('🧪 STEP 4: Testing the token...');
      try {
        const testResponse = await axios.post('https://api.dropboxapi.com/2/users/get_current_account', {}, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('✅ Token is valid!');
        console.log('Account:', testResponse.data.name.display_name);
        console.log('Email:', testResponse.data.email);
        console.log('');

        // Step 5: Instructions for setting the token
        console.log('🚀 STEP 5: Set the token in your environment');
        console.log('=============================================');
        console.log('');
        console.log('Add this to your environment variables:');
        console.log(`export DROPBOX_TOKEN="${accessToken}"`);
        console.log('');
        console.log('Or add it to your hosting platform environment variables:');
        console.log('DROPBOX_TOKEN=' + accessToken);
        console.log('');
        console.log('Then restart your application.');
        console.log('');

        // Step 6: Save to file for easy access
        const tokenData = {
          access_token: accessToken,
          refresh_token: refreshToken,
          generated_at: new Date().toISOString(),
          account: testResponse.data.name.display_name,
          email: testResponse.data.email
        };

        const fs = require('fs');
        fs.writeFileSync('dropbox-token.json', JSON.stringify(tokenData, null, 2));
        console.log('💾 Token data saved to: dropbox-token.json');
        console.log('');

      } catch (testError) {
        console.log('❌ Token test failed:', testError.response?.data || testError.message);
        console.log('But the token was generated successfully.');
      }

    } catch (tokenError) {
      console.log('❌ Failed to exchange code for token:');
      console.log('Error:', tokenError.response?.data || tokenError.message);
      console.log('');
      console.log('Make sure your app key and secret are correct.');
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the generator
generateDropboxToken().catch(console.error);
