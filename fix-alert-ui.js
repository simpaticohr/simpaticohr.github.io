const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

// Replace the basic alert-based showAlert with a proper UI one
const old = `function showAlert(msg, detail, type) {
    alert(msg + (detail ? '\\n' + detail : ''));
}`;

const newFn = `function showAlert(msg, detail, type) {
    let box = document.getElementById('alertBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'alertBox';
        box.style.cssText = 'margin-top:12px;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:500;';
        const form = document.querySelector('form') || document.querySelector('.auth-form');
        if (form) form.appendChild(box);
    }
    const isError = !type || type === 'error';
    box.style.background = isError ? '#FEE2E2' : '#DCFCE7';
    box.style.color = isError ? '#DC2626' : '#16A34A';
    box.style.border = isError ? '1px solid #FCA5A5' : '1px solid #86EFAC';
    box.style.display = 'block';
    box.textContent = msg + (detail ? ' ' + detail : '');
}`;

if (html.includes(old)) {
    html = html.replace(old, newFn);
    fs.writeFileSync('platform/login.html', html);
    console.log('Fixed!');
} else {
    console.log('Pattern not found - replacing anyway');
    html = html.replace('function showAlert(msg, detail, type) {', newFn.split('{')[0] + '{');
    fs.writeFileSync('platform/login.html', html);
}