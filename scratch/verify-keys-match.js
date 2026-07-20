const crypto = require('crypto');
const fs = require('fs');

try {
  const privateKey = fs.readFileSync('wise_private_key.pem', 'utf8');
  const publicKey = fs.readFileSync('wise_public_key.pem', 'utf8');

  console.log("Private key starts with:", privateKey.substring(0, 40));
  console.log("Public key starts with:", publicKey.substring(0, 40));

  // Sign a test message with the private key
  const testMessage = "test-ott-token-12345";
  const sign = crypto.createSign('SHA256');
  sign.update(testMessage);
  const signature = sign.sign(privateKey, 'base64');
  console.log("\nSignature:", signature.substring(0, 40) + "...");

  // Verify the signature with the public key
  const verify = crypto.createVerify('SHA256');
  verify.update(testMessage);
  const isValid = verify.verify(publicKey, signature, 'base64');
  console.log("\n✅ Keys match:", isValid);

  if (!isValid) {
    console.log("❌ The public key does NOT match the private key!");
    console.log("   You need to re-upload the correct public key to Wise.");
  }
} catch (err) {
  console.error("Error:", err.message);
}
