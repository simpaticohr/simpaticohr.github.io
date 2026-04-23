const fs = require('fs');
const txt = fs.readFileSync('js/hr-config.js', 'utf8');
const key = txt.match(/supabaseAnonKey\s*:\s*['"]([^'"]+)['"]/)[1];
const url = 'https://cvkxtsvgnynxexmemfuy.supabase.co/rest/v1/';

async function test() {
    const res = await fetch(url + "rpc/exec_sql", {
        method: 'POST',
        headers: { 
            'apikey': key, 
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: "SELECT 1" })
    });
    const data = await res.text();
    console.log({status: res.status, data});
}
test();