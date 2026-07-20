// Re-upload the WISE_PRIVATE_KEY to Cloudflare Workers secret
// This reads the local wise_private_key.pem, strips PEM headers to raw base64,
// and uploads via wrangler secret put

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const pemPath = path.resolve(__dirname, '../wise_private_key.pem');
const pem = fs.readFileSync(pemPath, 'utf8');

// Extract raw base64 (no PEM headers, no whitespace)
const b64 = pem
  .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

console.log(`Private key: ${pemPath}`);
console.log(`Raw base64 length: ${b64.length}`);
console.log(`First 40 chars: ${b64.substring(0, 40)}`);
console.log(`Last 20 chars: ${b64.substring(b64.length - 20)}`);

// Write to a temp file for piping
const tmpFile = path.resolve(__dirname, '_tmp_key_upload.txt');
fs.writeFileSync(tmpFile, b64, 'utf8');

console.log('\n☁️ Uploading WISE_PRIVATE_KEY to Cloudflare...');
try {
  const result = execSync(
    `cmd /c "type ${tmpFile} | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production"`,
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60000 }
  );
  console.log(result);
  console.log('✅ WISE_PRIVATE_KEY uploaded successfully!');
} catch (err) {
  console.error('Upload error:', err.stdout || err.stderr || err.message);
} finally {
  try { fs.unlinkSync(tmpFile); } catch {}
}

console.log('\n🎯 NEXT STEPS:');
console.log('   1. Go to Wise Business → Settings → API tokens → Manage public keys');
console.log('   2. DELETE the old public key');
console.log('   3. Upload wise_public_key.pem from your project root');
console.log('   4. Wait 2-3 minutes for Wise to propagate the key');
console.log('   5. Test the payment verification again');
