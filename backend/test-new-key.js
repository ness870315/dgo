/**
 * TEST NEW TWITTER API KEY
 * Quick analysis and test of the fresh session cookie
 */

const newKey = "a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj1iZTUxNzc1N2U1NTQ4YjcxMmRlY2ExYjVjZDdlMWEzNTUyYjc4ODNmO2N0MD1iMmI2ZGUwMGRmMjFkZDQ1ZTQwNmVlZTM3NWYxZDc2ZjM5NDNjMThkMWE2OGE4ZjgwZWFkMGIyYTBhZTJiMTFmMmFmYTFmMDc3MjE2MTI5OWVkNzgyNzA5MzEzNzMyZmYwM2UyYjQ5MThmMDMzNmExN2YyYjA4YTI2ZmYwMTdkZDgyY2E0ODM2YTc0NmIyMWM1YjVmMjU5OGY0YWE1NWMxO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7";
const oldKey = "a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWNlNTYxNzIxY2FmMDM3ZGJhZDFiOWQ5NGE4ZWMwMjY5OTQ3ZjNiZDVlZGFmYjQxZmJkMWVjOGU0ZDYxOGQ5M2Q4NmIwMDYwYzEwMzNkMzExYjY4OGI2YmNkMGZlMDlhYWZhMzk2YTFjZWRiZDRkZDY0ZTFhNWYxYWQzZGEzZDJmM2JkYzU4NjkzNDgyMmI1NWY2NGQ3Y2Q3OTY3ZTc1MGQ7";

console.log('🔍 COMPARING OLD VS NEW TWITTER API KEY');
console.log('=' .repeat(50));

// Decode both keys
const newDecoded = Buffer.from(newKey, 'base64').toString('utf-8');
const oldDecoded = Buffer.from(oldKey, 'base64').toString('utf-8');

console.log('🆕 NEW KEY:');
console.log(`   Length: ${newKey.length} characters`);
console.log(`   Decoded: ${newDecoded}`);

console.log('\n🗝️ OLD KEY:');
console.log(`   Length: ${oldKey.length} characters`);
console.log(`   Decoded: ${oldDecoded}`);

// Compare components
const newAuthToken = newDecoded.match(/auth_token=([^;]+)/)?.[1];
const oldAuthToken = oldDecoded.match(/auth_token=([^;]+)/)?.[1];

const newCt0 = newDecoded.match(/ct0=([^;]+)/)?.[1];
const oldCt0 = oldDecoded.match(/ct0=([^;]+)/)?.[1];

console.log('\n🔄 COMPARISON:');
console.log(`   🎫 Auth Token Changed: ${newAuthToken !== oldAuthToken ? '✅ YES' : '❌ NO'}`);
console.log(`   🛡️ CT0 Token Changed: ${newCt0 !== oldCt0 ? '✅ YES' : '❌ NO'}`);

if (newAuthToken !== oldAuthToken) {
  console.log(`      Old: ${oldAuthToken?.substring(0, 20)}...`);
  console.log(`      New: ${newAuthToken?.substring(0, 20)}...`);
}

if (newCt0 !== oldCt0) {
  console.log(`      Old CT0: ${oldCt0?.substring(0, 20)}...`);
  console.log(`      New CT0: ${newCt0?.substring(0, 20)}...`);
}

console.log('\n🎯 RESULT:');
if (newAuthToken !== oldAuthToken || newCt0 !== oldCt0) {
  console.log('   ✅ SUCCESS! You have a fresh session cookie');
  console.log('   🚀 Ready to test the new key');
} else {
  console.log('   ⚠️ Tokens appear to be the same - may need different approach');
}




