import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Rettiwt } = require('rettiwt-api');

dotenv.config();

async function main() {
  const email = process.env.RETTIWT_EMAIL;
  const username = process.env.RETTIWT_USERNAME;
  const password = process.env.RETTIWT_PASSWORD;
  if (!email || !username || !password) {
    console.error('Set RETTIWT_EMAIL, RETTIWT_USERNAME, RETTIWT_PASSWORD in .env');
    process.exit(1);
  }
  
  console.log('Attempting to login with Rettiwt-API...');
  const rt = new Rettiwt();
  
  // Check what methods are available
  console.log('Available methods:', Object.getOwnPropertyNames(rt));
  console.log('Auth object:', rt.auth);
  
  if (rt.auth && typeof rt.auth.login === 'function') {
    const apiKey = await rt.auth.login(email, username, password);
    console.log('RETTIWT_API_KEY=', apiKey);
  } else {
    console.error('Login method not available in this version of Rettiwt-API');
    console.log('You may need to generate an API key manually or use a different version');
  }
}

main().catch(err => {
  console.error('Login failed:', err?.message || err);
  process.exit(1);
});


