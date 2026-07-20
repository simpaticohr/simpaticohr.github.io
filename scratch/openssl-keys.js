// Generate keys using OpenSSL commands exactly as Wise recommends
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopPath = path.join(require('os').homedir(), 'Desktop');

console.log("🔑 Generating RSA key pair using OpenSSL (Wise recommended method)...\n");

// Step 1: Generate private key (PKCS#1 format as Wise recommends)
execSync('openssl genrsa -out wise_private_key_openssl.pem 2048', { cwd: process.cwd() });
console.log("✅ Generated private key (PKCS#1/traditional format)");

// Step 2: Extract public key
execSync('openssl rsa -pubout -in wise_private_key_openssl.pem -out wise_public_key_openssl.pem', { cwd: process.cwd() });
console.log("✅ Generated public key");

// Step 3: Convert private key to PKCS#8 for Web Crypto API compatibility
execSync('openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in wise_private_key_openssl.pem -out wise_private_key_pkcs8.pem', { cwd: process.cwd() });
console.log("✅ Converted private key to PKCS#8 format");

// Read the keys
const privatePkcs8 = fs.readFileSync('wise_private_key_pkcs8.pem', 'utf8');
const publicKey = fs.readFileSync('wise_public_key_openssl.pem', 'utf8');

console.log("\nPrivate key (PKCS#8) starts:", privatePkcs8.substring(0, 40));
console.log("Public key starts:", publicKey.substring(0, 40));

// Overwrite the main key files
fs.writeFileSync('wise_private_key.pem', privatePkcs8);
fs.writeFileSync('wise_public_key.pem', publicKey);
console.log("\n✅ Overwrote wise_private_key.pem and wise_public_key.pem");

// Copy public key to Desktop
fs.copyFileSync('wise_public_key.pem', path.join(desktopPath, 'wise_public_key.pem'));
console.log("📋 Public key copied to Desktop");

// Upload private key to Cloudflare (clean base64, no PEM headers)
const b64 = privatePkcs8
  .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

const tmpFile = 'scratch/_tmp_b64key.txt';
fs.writeFileSync(tmpFile, b64, 'utf8');

console.log("\n☁️ Uploading to Cloudflare...");
try {
  const result = execSync(
    `cmd /c "type ${tmpFile} | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production"`,
    { cwd: process.cwd(), encoding: 'utf8', timeout: 60000 }
  );
  console.log(result);
} catch (err) {
  console.error("Upload error:", err.stdout || err.stderr || err.message);
}

// Cleanup
try { fs.unlinkSync(tmpFile); } catch {}
try { fs.unlinkSync('wise_private_key_openssl.pem'); } catch {}
try { fs.unlinkSync('wise_private_key_pkcs8.pem'); } catch {}
try { fs.unlinkSync('wise_public_key_openssl.pem'); } catch {}

// Verify
const crypto = require('crypto');
const sign = crypto.createSign('SHA256');
sign.update('test');
const sig = sign.sign(privatePkcs8, 'base64');
const verify = crypto.createVerify('SHA256');
verify.update('test');
console.log("🔐 Keys verified:", verify.verify(publicKey, sig, 'base64'));

console.log("\n🎯 NEXT STEPS:");
console.log("   1. Go to Wise Business → Settings → API tokens → Manage public keys");
console.log("   2. DELETE the old public key");
console.log("   3. Upload wise_public_key.pem from Desktop");
console.log("   4. WAIT 5 minutes, then test");
