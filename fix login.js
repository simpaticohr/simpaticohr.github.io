const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const newFn = `function redirectByRole(role) {
    const TAB = {
        hr: ['hr','hr_manager','interviewer','company_admin'],
        candidate: ['candidate'],
        super_admin: ['super_admin'],
    };
    if (!(TAB[selectedRole] || []).includes(role)) {
        showAlert('Access denied.', 'Your account cannot access this portal. Select the correct login tab.');
        resetBtn(
            document.getElementById('submitBtn'),
            document.getElementById('spinner'),
            document.getElementById('btnIcon'),
            document.getElementById('btnText')
        );
        return;
    }
    const target = ROLE_ROUTES[role] || ROLE_ROUTES['hr'];
    debug('-> ' + target);
    window.location.href = target;
}`;

const idx = html.indexOf('function redirectByRole(role)');
const end = html.indexOf('// ═══════════════════════════════════════════════════════════════════\n// ERROR MAPPING', idx);
html = html.slice(0, idx) + newFn + '\n' + html.slice(end);
fs.writeFileSync('platform/login.html', html);
console.log('Fixed!');