const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const hideAlertFn = `
function hideAlert() {
    const el = document.getElementById('alertBox');
    if (el) el.style.display = 'none';
}
`;

const idx = html.indexOf('function showAlert');
html = html.slice(0, idx) + hideAlertFn + html.slice(idx);
fs.writeFileSync('platform/login.html', html);
console.log('Done! hideAlert added.');