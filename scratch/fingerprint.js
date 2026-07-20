const crypto = require('crypto');
const fs = require('fs');

const pubKeyPem = fs.readFileSync('wise_public_key.pem', 'utf8');

// Get public key object
const pubKey = crypto.createPublicKey(pubKeyPem);

// Export to DER format (binary)
const der = pubKey.export({ type: 'spki', format: 'der' });

// Compute SHA-256 fingerprint
const sha256 = crypto.createHash('sha256').update(der).digest('hex');

// Format fingerprint in standard colon-separated hex blocks
const formattedSha256 = sha256.match(/.{1,2}/g).join(':').toUpperCase();

console.log('=== WISE PUBLIC KEY FINGERPRINT ===');
console.log('SHA-256 Fingerprint:');
console.log(formattedSha256);
console.log('\nPEM format:');
console.log(pubKeyPem.trim());
