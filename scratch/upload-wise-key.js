/**
 * Upload the Wise private key to Cloudflare Workers as a base64-encoded
 * single-line string. This avoids the terminal newline corruption that
 * happens with `wrangler secret put` when pasting multi-line PEM content.
 *
 * Usage: node scratch/upload-wise-key.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const privateKeyPath = path.join(ROOT, 'wise_private_key.pem');
const publicKeyPath = path.join(ROOT, 'wise_public_key.pem');

console.log('=== Wise Key Upload Tool ===\n');

// 1. Read and validate the private key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8').trim();
const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8').trim();

if (!privateKeyPem.includes('PRIVATE KEY')) {
  console.error('❌ Invalid private key file');
  process.exit(1);
}

console.log(`✅ Private key read (${privateKeyPem.length} chars)`);
console.log(`   Format: ${privateKeyPem.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1' : 'PKCS#8'}`);

// 2. Verify key pair matches
const crypto = require('crypto');
try {
  const testMsg = 'test-ott-verification';
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(testMsg);
  const sig = signer.sign(privateKeyPem, 'base64');
  
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(testMsg);
  const valid = verifier.verify(publicKeyPem, sig, 'base64');
  
  if (valid) {
    console.log('✅ Key pair verified — private key matches public key');
  } else {
    console.error('❌ KEY PAIR MISMATCH! Aborting.');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Key verification failed:', e.message);
  process.exit(1);
}

// 3. Base64-encode the ENTIRE PEM file into a single line
const b64Key = Buffer.from(privateKeyPem, 'utf8').toString('base64');
console.log(`\n📦 Base64-encoded key: ${b64Key.length} chars (single line, no newlines)`);
console.log(`   First 40: ${b64Key.substring(0, 40)}...`);

// 4. Verify we can decode it back
const decoded = Buffer.from(b64Key, 'base64').toString('utf8');
if (decoded === privateKeyPem) {
  console.log('✅ Round-trip verification passed — decoded matches original');
} else {
  console.error('❌ Round-trip verification FAILED!');
  process.exit(1);
}

// 5. Upload via wrangler secret put (piping via stdin to avoid terminal issues)
console.log('\n🚀 Uploading to Cloudflare Workers...');
try {
  // Use echo piping to avoid interactive terminal paste issues
  const cmd = process.platform === 'win32'
    ? `echo ${b64Key}| npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production`
    : `echo '${b64Key}' | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production`;
  
  const result = execSync(cmd, { 
    cwd: ROOT, 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });
  console.log('✅ Secret uploaded successfully!');
  console.log(result);
} catch (e) {
  console.error('⚠️  Automatic upload failed:', e.message);
  console.log('\n📋 Manual upload instructions:');
  console.log('   1. Copy the base64 string below');
  console.log('   2. Run: npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production');
  console.log('   3. Paste the base64 string when prompted\n');
  console.log('--- BASE64 KEY (copy everything between the lines) ---');
  console.log(b64Key);
  console.log('--- END ---\n');
}

// 6. Also show the public key for verification
console.log('\n📋 Public key (should match what is uploaded to Wise):');
console.log(publicKeyPem);
