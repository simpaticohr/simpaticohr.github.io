const fs = require('fs');
let html = fs.readFileSync('platform/register-company.html', 'utf8');
html = html.replace('/api/auth/register-company', '/auth/register');
fs.writeFileSync('platform/register-company.html', html);
console.log('Fixed!');