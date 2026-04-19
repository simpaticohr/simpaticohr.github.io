const fs = require('fs');
const txt = fs.readFileSync('js/hr-config.js', 'utf8');
const key = txt.match(/supabaseAnonKey\s*:\s*['"]([^'"]+)['"]/)[1];
const url = 'https://cvkxtsvgnynxexmemfuy.supabase.co/rest/v1/';

async function test() {
    const urls = [
        'jobs?select=*&order=created_at.desc&limit=100',
        'job_applications?select=*,jobs(*)&order=created_at.desc&limit=100',
        'interviews?select=*&order=created_at.desc&limit=100'
    ];
    for (const path of urls) {
        const res = await fetch(url + path, {
            headers: { apikey: key, Authorization: 'Bearer ' + key }
        });
        const data = await res.json().catch(e => ({error: e.message}));
        console.log({path, status: res.status, err: data.message || data.hint || data.error});
    }
}
test();
