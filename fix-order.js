const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

// Extract hideAlert function
const hideAlertFn = `function hideAlert() {
    const el = document.getElementById('alertBox');
    if (el) el.style.display = 'none';
}
`;

// Remove it from current location
html = html.replace(hideAlertFn, '');

// Insert it before the first usage (before switchRole function)
html = html.replace('function switchRole(el) {', hideAlertFn + 'function switchRole(el) {');

fs.writeFileSync('platform/login.html', html);
console.log('Done!');