const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const marker = "// ④ Success — persist and redirect";
const idx = html.indexOf(marker);

if (idx === -1) {
    console.log('Marker not found');
    process.exit(1);
}

const roleCheck = `// ④ Role check
    const TAB_ROLES = {
        hr: ['hr','hr_manager','interviewer','company_admin'],
        candidate: ['candidate'],
        super_admin: ['super_admin'],
    };
    if (!(TAB_ROLES[selectedRole] || []).includes(userRole)) {
        showAlert('Access denied.', 'Wrong portal. Use the correct login tab.');
        resetBtn(btn, spinner, btnIcon, btnText);
        return;
    }
    // ⑤ Success — persist and redirect`;

html = html.slice(0, idx) + roleCheck + html.slice(idx + marker.length);
fs.writeFileSync('platform/login.html', html);
console.log('Fixed!');