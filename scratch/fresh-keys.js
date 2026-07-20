// Generate a fresh RSA key pair and upload the private key to Cloudflare in one script
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');

// 1. Generate new 2048-bit RSA key pair
console.log("🔑 Generating fresh RSA 2048-bit key pair...\n");
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// 2. Overwrite the local files
fs.writeFileSync('wise_private_key.pem', privateKey);
fs.writeFileSync('wise_public_key.pem', publicKey);
console.log("✅ Saved wise_private_key.pem");
console.log("✅ Saved wise_public_key.pem\n");

// 3. Verify they match
const sign = crypto.createSign('SHA256');
sign.update('verify-test');
const sig = sign.sign(privateKey, 'base64');
const verify = crypto.createVerify('SHA256');
verify.update('verify-test');
console.log("🔐 Keys match:", verify.verify(publicKey, sig, 'base64'), "\n");

// 4. Upload private key to Cloudflare as a secret
console.log("☁️  Uploading private key to Cloudflare Workers secret...");
try {
  const result = execSync(
    `echo ${JSON.stringify(privateKey)} | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production`,
    { cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(result);
} catch (err) {
  console.error("Wrangler upload failed, uploading manually...");
  // Fallback: write a temp file and pipe it
  fs.writeFileSync('scratch/_tmp_key.txt', privateKey);
  try {
    const result2 = execSync(
      `type scratch\\_tmp_key.txt | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production`,
      { cwd: process.cwd(), encoding: 'utf8', shell: 'cmd.exe' }
    );
    console.log(result2);
  } catch (err2) {
    console.error("Auto-upload failed:", err2.message);
    console.log("\n⚠️  Please run this command manually:");
    console.log('   npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production');
    console.log("   Then paste the contents of wise_private_key.pem when prompted.\n");
  }
  // Clean up temp file
  try { fs.unlinkSync('scratch/_tmp_key.txt'); } catch {}
}

// 5. Copy public key to Desktop for easy upload
const desktopPath = require('path').join(require('os').homedir(), 'Desktop', 'wise_public_key.pem');
fs.copyFileSync('wise_public_key.pem', desktopPath);
console.log(`\n📋 Public key copied to: ${desktopPath}`);
console.log("\n🎯 NEXT STEPS:");
console.log("   1. Go to Wise Business → Settings → API tokens → Manage public keys");
console.log("   2. DELETE any old public keys");
console.log("   3. Upload the new wise_public_key.pem from your Desktop");
console.log("   4. Test the verification on your website");
