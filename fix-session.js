const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const oldLine = 'redirectByRole(user.role);';
const newLine = `const allowedRoles = {hr:['hr','hr_manager','interviewer','company_admin'],candidate:['candidate'],super_admin:['super_admin']};
                if ((allowedRoles[selectedRole]||[]).includes(user.role)) { redirectByRole(user.role); }`;

html = html.replace(oldLine, newLine);
fs.writeFileSync('platform/login.html', html);
console.log('Fixed!');