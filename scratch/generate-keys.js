import crypto from 'crypto';
import fs from 'fs';

console.log("Generating RSA key pair (2048-bit, PKCS#8)...");

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

fs.writeFileSync('wise_private_key.pem', privateKey);
fs.writeFileSync('wise_public_key.pem', publicKey);

console.log("Success!");
console.log("- Private key: wise_private_key.pem");
console.log("- Public key: wise_public_key.pem");
