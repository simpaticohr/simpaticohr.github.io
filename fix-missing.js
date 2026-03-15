const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

const missingFns = `
function mapError(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid password'))
        return 'Invalid email or password.';
    if (m.includes('email not confirmed'))
        return 'Please verify your email before signing in.';
    if (m.includes('user not found'))
        return 'No account found. Please register first.';
    return msg || 'Login failed. Please try again.';
}
`;

html = html.replace('function debug(msg) {', missingFns + '\nfunction debug(msg) {');
fs.writeFileSync('platform/login.html', html);
console.log('Done!');