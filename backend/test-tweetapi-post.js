import axios from 'axios';

const API_KEY = 'sk_3135aaf4ab493a2526fbb3e30bd183a0ee858d05';
const AUTH_TOKEN = '1cbfac75f2f9bccd74d622bf367629546b6fbb25';
const PROXY = 'proxy.smartproxy.net:3120@smart-aw735n1ip22k:ua2kdThjMfJlqtXa';

async function main() {
  console.log(' Starting TweetAPI smoke test with proxy...');
  try {
    const payload = {
      authToken: AUTH_TOKEN,
      text: 'Hello CT',
      proxy: PROXY
    };

    const response = await axios.post(
      'https://api.tweetapi.com/tw-v2/interaction/create-post',
      payload,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 20000,
        validateStatus: (status) => status < 500
      }
    );

    console.log(' Status:', response.status);
    console.dir(response.data, { depth: 5 });
  } catch (error) {
    console.error(' Request failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Body:', error.response.data);
    }
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

main();
