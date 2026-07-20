// End-to-end test: Call the worker's Wise verify endpoint and check what happens
// This will trigger the SCA flow and let us see exactly what error comes back

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const WORKER_URL = 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';

// Step 1: Read the local private key and derive its public key fingerprint
const privateKeyPem = fs.readFileSync('wise_private_key.pem', 'utf8');
const publicKeyPem = fs.readFileSync('wise_public_key.pem', 'utf8');

// Get the raw base64 as stored in Cloudflare
const rawB64 = privateKeyPem
  .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

console.log('=== LOCAL KEY INFO ===');
console.log('Private key (raw base64) length:', rawB64.length);
console.log('Private key first 40:', rawB64.substring(0, 40));
console.log('Private key last 20:', rawB64.substring(rawB64.length - 20));
console.log('');

// Step 2: Sign a test message locally using both methods
const testOtt = 'test-ott-' + Date.now();

// Method A: Node.js native crypto (gold standard)
const sign = crypto.createSign('SHA256');
sign.update(testOtt);
const nativeSig = sign.sign(privateKeyPem, 'base64');

// Method B: Web Crypto API (same as worker uses)
async function webCryptoSign() {
  const b64 = rawB64; // already clean
  const binaryString = Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const cryptoKey = await crypto.webcrypto.subtle.importKey(
    'pkcs8', bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBuffer = await crypto.webcrypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(testOtt)
  );
  return Buffer.from(sigBuffer).toString('base64');
}

async function run() {
  const webSig = await webCryptoSign();

  console.log('=== SIGNATURE TEST ===');
  console.log('Test OTT:', testOtt);
  console.log('Native sig (first 40):', nativeSig.substring(0, 40));
  console.log('WebCrypto sig (first 40):', webSig.substring(0, 40));
  console.log('Signatures match:', nativeSig === webSig);

  // Verify both signatures against public key
  const v1 = crypto.createVerify('SHA256');
  v1.update(testOtt);
  console.log('Native sig verified:', v1.verify(publicKeyPem, nativeSig, 'base64'));

  const v2 = crypto.createVerify('SHA256');
  v2.update(testOtt);
  console.log('WebCrypto sig verified:', v2.verify(publicKeyPem, webSig, 'base64'));

  // Step 3: Check what key info the worker has
  console.log('\n=== CHECKING WORKER KEY ===');
  console.log('(We need to see the worker logs for the key info it prints)');
  console.log('The key first 40 chars stored in Cloudflare should be:', rawB64.substring(0, 40));
  console.log('');
  
  // Step 4: Check if maybe the issue is the Wise API token profile
  console.log('=== POSSIBLE ROOT CAUSES ===');
  console.log('1. Public key not linked to the CORRECT API token in Wise');
  console.log('   → In Wise, each API token has its own public key association');
  console.log('   → Make sure you uploaded to: Settings → API tokens → [your token] → Manage public keys');
  console.log('');
  console.log('2. Wise profile mismatch (personal vs business)');
  console.log('   → The API token must belong to the business profile');
  console.log('   → The key must be linked to that same token');
  console.log('');
  console.log('3. Sandbox vs Production mismatch');
  console.log('   → sandbox tokens start with "scb-"');
  console.log('   → live tokens start with different prefix');
  console.log('   → Keys uploaded to sandbox don\'t work on live and vice versa');
}

run().catch(console.error);
