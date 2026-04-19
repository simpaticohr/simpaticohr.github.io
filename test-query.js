const fs = require('fs');
const txt = fs.readFileSync('js/hr-config.js', 'utf8');
const key = txt.match(/supabaseAnonKey\s*:\s*['"]([^'"]+)['"]/)[1];
const url = 'https://cvkxtsvgnynxexmemfuy.supabase.co/rest/v1/';

async function test() {
    const res = await fetch(url + "?apikey=" + key);
    const data = await res.json();
    const table = data.definitions?.review_cycles;
    console.log(table?.required);
}
test();
