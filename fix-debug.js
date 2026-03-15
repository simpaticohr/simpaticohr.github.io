const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const debugFn = `function debug(msg) {
    console.log('[Login]', msg);
}
`;

html = html.replace('function hideAlert() {', debugFn + 'function hideAlert() {');
fs.writeFileSync('platform/login.html', html);
console.log('Done!');