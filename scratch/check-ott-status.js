const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const API_TOKEN = process.env.WISE_API_TOKEN;
const privateKey = fs.readFileSync('wise_private_key.pem', 'utf8');
const BASE_URL = 'https://api.wise.com';

function makeRequest(method, url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json', ...extraHeaders },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Get profile & accounts
  const profiles = JSON.parse((await makeRequest('GET', `${BASE_URL}/v2/profiles`)).body);
  const profile = profiles.find(p => p.type === 'BUSINESS') || profiles[0];
  const accounts = JSON.parse((await makeRequest('GET', `${BASE_URL}/v1/borderless-accounts?profileId=${profile.id}`)).body);
  console.log(`Profile: ${profile.type} ID:${profile.id}, Account: ${accounts[0].id}`);

  // Trigger SCA to get OTT
  const now = new Date();
  const start = new Date(now.getTime() - 5*86400000);
  const params = new URLSearchParams({ currency:'USD', intervalStart:start.toISOString(), intervalEnd:now.toISOString(), type:'COMPACT' });
  const url = `${BASE_URL}/v3/profiles/${profile.id}/borderless-accounts/${accounts[0].id}/statement.json?${params}`;

  const r1 = await makeRequest('GET', url);
  console.log(`\nStatement request: ${r1.status}`);
  
  const ott = r1.headers['x-2fa-approval'];
  const firstResult = r1.headers['x-2fa-approval-result'];
  console.log(`OTT: ${ott}`);
  console.log(`First x-2fa-approval-result: ${firstResult || '(none)'}`);
  console.log(`Response body: ${r1.body.substring(0, 300) || '(empty)'}`);
  
  if (!ott) {
    console.log('No OTT received!');
    return;
  }

  // CHECK OTT STATUS — this tells us what type of challenge is needed
  console.log('\n=== Checking OTT Status ===');
  const statusRes = await makeRequest('GET', `${BASE_URL}/v1/identity/one-time-token/status`, {
    'One-Time-Token': ott,
  });
  console.log(`OTT Status endpoint: ${statusRes.status}`);
  console.log(`OTT Status body: ${statusRes.body}`);
  
  // Also try the newer endpoint
  const statusRes2 = await makeRequest('GET', `${BASE_URL}/v1/identity/one-time-tokens/${ott}/status`);
  console.log(`\nOTT Status v2 endpoint: ${statusRes2.status}`);
  console.log(`OTT Status v2 body: ${statusRes2.body}`);

  // Print ALL headers from the first 403
  console.log('\n=== ALL headers from first 403 ===');
  for (const [k, v] of Object.entries(r1.headers)) {
    console.log(`  ${k}: ${v}`);
  }
})().catch(e => console.error(e));
