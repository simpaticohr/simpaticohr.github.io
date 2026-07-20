const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// __dirname is c:\Users\user\simpaticohr.github.io\scratch
const keyPath = path.resolve(__dirname, '../wise_private_key.pem');
if (!fs.existsSync(keyPath)) {
  console.error(`Error: wise_private_key.pem not found at: ${keyPath}`);
  process.exit(1);
}

const keyContent = fs.readFileSync(keyPath, 'utf8');
console.log("Uploading wise_private_key.pem to Cloudflare Wrangler secrets...");

const child = spawn('npx', ['wrangler', 'secret', 'put', 'WISE_PRIVATE_KEY', '--env', 'production'], {
  cwd: path.resolve(__dirname, '../backend'),
  shell: true,
  stdio: ['pipe', 'inherit', 'inherit']
});

child.stdin.write(keyContent);
child.stdin.end();

child.on('close', (code) => {
  if (code === 0) {
    console.log("\n✅ Secret WISE_PRIVATE_KEY uploaded successfully!");
  } else {
    console.error(`\n❌ Failed to upload secret. Exit code: ${code}`);
  }
});
