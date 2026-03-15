const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const resetBtnFn = `
function resetBtn(btn, spinner, btnIcon, btnText) {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnIcon) btnIcon.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Sign In';
}
`;

html = html.replace('function debug(msg) {', resetBtnFn + '\nfunction debug(msg) {');
fs.writeFileSync('platform/login.html', html);
console.log('Fixed!');