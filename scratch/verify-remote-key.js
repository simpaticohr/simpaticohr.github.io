const crypto = require('crypto');
const fs = require('fs');

// Data from the worker test endpoint
const testOtt = "test-verify-key-match-2026";
const workerSignature = "YUTL8sNIEqHBxY+RzSMc07ZWV9xwGJ5aP6/01PIhzDwG+laiJbRLwc7HPNzTUId3KXlnusZtlX9DXlgSZDEdQGvy7hUHki7f5uC7gwwd/OcL+3gypLMHPhjLCAMCy/CLEF0r+RE3QkOUX+VxEiUMIo++fdIGT/6FNpY2XYQobvARM/0YDMrZCwE8Wb76XdeJqQgoS89HFuyookLC4g04BgKw0WQTH8fuem5qz9PLegSj8oBKjna5/dVxHUK57xjlqPOUGvQmu5ENSefO33iTeYFhJGYKGs6v7svwTMBswO+gmgsym1gAEFZqxunCh/B8ujuxLoXvcPx5+teTG4OBEw==";
const workerKeyFirst40 = "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSi";
const workerKeyLength = 1624;

// Local key info
const pem = fs.readFileSync('wise_private_key.pem', 'utf8');
const localB64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s/g, '');
console.log("=== KEY COMPARISON ===");
console.log("Worker key length:", workerKeyLength, "Local key length:", localB64.length);
console.log("Worker first 40:", workerKeyFirst40);
console.log("Local  first 40:", localB64.substring(0, 40));
console.log("Keys match:", localB64.substring(0, 40) === workerKeyFirst40 && localB64.length === workerKeyLength);

// Verify the worker's signature against the local public key
const pubKey = fs.readFileSync('wise_public_key.pem', 'utf8');
const verify = crypto.createVerify('SHA256');
verify.update(testOtt);
const isValid = verify.verify(pubKey, workerSignature, 'base64');
console.log("\n=== SIGNATURE VERIFICATION ===");
console.log("Worker signature verified with local public key:", isValid);

if (isValid) {
  console.log("\n✅ The stored private key MATCHES the local public key!");
  console.log("   The problem is on Wise's side - the public key in their system doesn't match.");
} else {
  console.log("\n❌ The stored private key does NOT match the local public key!");
  console.log("   The key got corrupted during upload.");
}

// Also sign locally and compare
const sign = crypto.createSign('SHA256');
sign.update(testOtt);
const localSig = sign.sign(pem, 'base64');
console.log("\n=== LOCAL SIGNATURE ===");
console.log("Local signature:", localSig.substring(0, 40) + "...");
console.log("Worker signature:", workerSignature.substring(0, 40) + "...");
console.log("Signatures match:", localSig === workerSignature);
