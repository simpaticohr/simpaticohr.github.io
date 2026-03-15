const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const showAlertFn = `function showAlert(msg, detail, type) {
    alert(msg + (detail ? '\\n' + detail : ''));
}
`;

html = html.replace('function debug(msg) {', showAlertFn + 'function debug(msg) {');
fs.writeFileSync('platform/login.html', html);
console.log('Done!');