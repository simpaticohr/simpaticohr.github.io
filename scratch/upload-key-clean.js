// Upload private key as clean single-line base64 (no PEM headers, no newlines)
// This avoids all shell escaping and multiline issues with wrangler secrets
const fs = require('fs');
const { execSync } = require('child_process');

const pem = fs.readFileSync('wise_private_key.pem', 'utf8');
const b64 = pem
  .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

console.log("Base64 key length:", b64.length);
console.log("First 40 chars:", b64.substring(0, 40));
console.log("Last 20 chars:", b64.substring(b64.length - 20));

// Write clean base64 to a temp file (single line, no newlines)
const tmpFile = 'scratch\\_tmp_b64key.txt';
fs.writeFileSync(tmpFile, b64, 'utf8');

// Pipe it to wrangler
console.log("\nUploading to Cloudflare...");
try {
  const result = execSync(
    `cmd /c "type ${tmpFile} | npx wrangler secret put WISE_PRIVATE_KEY --config backend/wrangler.toml --env production"`,
    { cwd: process.cwd(), encoding: 'utf8', timeout: 60000 }
  );
  console.log(result);
} catch (err) {
  console.error("Upload error:", err.stdout || err.stderr || err.message);
}

// Clean up
try { fs.unlinkSync(tmpFile); } catch {}
console.log("Done! Temp file cleaned up.");
