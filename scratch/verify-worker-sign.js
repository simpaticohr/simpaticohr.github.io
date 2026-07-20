// Simulate EXACTLY what the worker does with raw base64 key
const crypto = require('crypto');
const fs = require('fs');

// Read the local PEM and strip to raw base64 (same as what's stored in Cloudflare)
const pem = fs.readFileSync('wise_private_key.pem', 'utf8');
const rawB64 = pem
  .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

// Now simulate signWiseOtt exactly as the worker does it
const b64 = rawB64
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n")
  .replace(/-----(BEGIN|END) (RSA )?PRIVATE KEY-----/g, "")
  .replace(/[^A-Za-z0-9+/=]/g, "");

console.log("Raw base64 length:", rawB64.length);
console.log("After processing length:", b64.length);
console.log("Are they identical?", rawB64 === b64);

// Sign using Web Crypto (same as worker)
async function testSign() {
  const binaryString = Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const cryptoKey = await crypto.webcrypto.subtle.importKey(
    "pkcs8", bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const testOtt = "test-ott-12345";
  const sigBuffer = await crypto.webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(testOtt)
  );
  const sigB64 = Buffer.from(sigBuffer).toString('base64');
  console.log("Signature:", sigB64.substring(0, 40) + "...");

  // Verify with public key
  const pubKey = fs.readFileSync('wise_public_key.pem', 'utf8');
  const verify = crypto.createVerify('SHA256');
  verify.update(testOtt);
  const valid = verify.verify(pubKey, Buffer.from(sigBuffer));
  console.log("Verified against public key:", valid);
}

testSign().catch(console.error);
