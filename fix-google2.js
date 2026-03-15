const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

// Remove duplicate Google buttons - keep only one
const googleBtn = `<button type="button" onclick="signInWithGoogle()" style="width:100%;padding:11px;margin-bottom:12px;border:1px solid #dadce0;border-radius:8px;background:#fff;color:#3c4043;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;">
  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20">
  Continue with Google
</button>
<div style="text-align:center;color:#9ca3af;font-size:13px;margin-bottom:12px;">— or continue with email —</div>`;

// Remove all existing google buttons
while (html.includes('Continue with Google')) {
    const start = html.lastIndexOf('<button', html.indexOf('Continue with Google'));
    const end = html.indexOf('</button>', start) + 9;
    html = html.slice(0, start) + html.slice(end);
}

// Remove old dividers added by script
html = html.replace(/— or continue with email —<\/div>/g, '');

// Add single Google button before submit
html = html.replace('<button type="submit"', googleBtn + '\n<button type="submit"');

// Fix signInWithGoogle to hide Google button for Super Admin tab
html = html.replace('function signInWithGoogle() {',
`function signInWithGoogle() {
    if (selectedRole === 'super_admin') {
        alert('Super Admin must use email and password only.');
        return;
    }`
);

fs.writeFileSync('platform/login.html', html);
console.log('Done!');