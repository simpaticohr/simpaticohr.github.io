const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const toastFn = `function toast(msg) {
    alert(msg);
}
`;

html = html.replace('function debug(msg) {', toastFn + 'function debug(msg) {');
fs.writeFileSync('platform/login.html', html);
console.log('Done!');