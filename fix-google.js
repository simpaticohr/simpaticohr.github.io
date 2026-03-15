const fs = require('fs');
let html = fs.readFileSync('platform/login.html', 'utf8');

// Add Google button before submit button
const googleBtn = `<button type="button" onclick="signInWithGoogle()" style="width:100%;padding:11px;margin-bottom:12px;border:1px solid #dadce0;border-radius:8px;background:#fff;color:#3c4043;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;">
  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20">
  Continue with Google
</button>
<div style="text-align:center;color:#9ca3af;font-size:13px;margin-bottom:12px;">— or continue with email —</div>`;

const googleFn = `
function signInWithGoogle() {
    const role = selectedRole || 'candidate';
    const base = 'https://cvkxtsvgnynxexmemfuy.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4';
    const callback = window.location.origin + '/platform/auth-callback.html?role=' + role;
    window.location.href = base + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(callback);
}
`;

html = html.replace('<button type="submit"', googleBtn + '<button type="submit"');
html = html.replace('function debug(msg) {', googleFn + '\nfunction debug(msg) {');
fs.writeFileSync('platform/login.html', html);
console.log('login.html updated!');

// Create auth-callback.html
const callback = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Signing in...</title></head>
<body style="font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc">
<div style="text-align:center">
  <div style="width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
  <p style="color:#64748b">Signing you in...</p>
</div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
<script>
const SB_URL = 'https://cvkxtsvgnynxexmemfuy.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4';
const ROLE_ROUTES = {hr:'../dashboard/hr.html',hr_manager:'../dashboard/hr.html',candidate:'../dashboard/candidate.html',super_admin:'super-admin.html'};

async function init() {
    const hash = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
    const params = new URLSearchParams(window.location.search);
    const selectedRole = params.get('role') || 'candidate';
    const token = hash.access_token;
    if (!token) { window.location.href = 'login.html'; return; }

    // Get user info
    const r = await fetch(SB_URL + '/auth/v1/user', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token }
    });
    const user = await r.json();
    if (!user.id) { window.location.href = 'login.html'; return; }

    // Check if user exists in users table
    const ur = await fetch(SB_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(user.email) + '&select=*', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token }
    });
    const users = await ur.json();

    let role = selectedRole === 'hr' ? 'hr' : 'candidate';
    if (users && users.length > 0) {
        role = users[0].role || role;
    } else {
        // Create user record
        await fetch(SB_URL + '/rest/v1/users', {
            method: 'POST',
            headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ name: user.user_metadata?.full_name || user.email, email: user.email, role, is_active: true, created_at: new Date().toISOString() })
        });
    }

    localStorage.setItem('simpatico_token', token);
    localStorage.setItem('simpatico_user', JSON.stringify({ id: user.id, email: user.email, role, name: user.user_metadata?.full_name || user.email }));
    window.location.href = ROLE_ROUTES[role] || '../dashboard/hr.html';
}
init();
</script>
</body></html>`;

fs.writeFileSync('platform/auth-callback.html', callback);
console.log('auth-callback.html created!');