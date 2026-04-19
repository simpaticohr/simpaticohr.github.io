const fs = require('fs');
const txt = fs.readFileSync('js/hr-config.js', 'utf8');
const key = txt.match(/supabaseAnonKey\s*:\s*['"]([^'"]+)['"]/)[1];
const url = 'https://cvkxtsvgnynxexmemfuy.supabase.co/rest/v1/';

async function test() {
    const res = await fetch(url + "performance_reviews?tenant_id=eq.a0000000-0000-0000-0000-000000000001&select=*", {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    const data = await res.json();
    console.log({status: res.status, data});
}
test();
