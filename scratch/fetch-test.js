const https = require('https');

https.get('https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev/api/test-token-mask', (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode} ${res.statusMessage}`);
    console.log('Headers:', res.headers);
    console.log('Body:', body);
  });
}).on('error', console.error);
