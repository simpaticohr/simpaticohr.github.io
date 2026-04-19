const fs = require('fs'); 
const { execSync } = require('child_process');

const content = fs.readFileSync('dashboard/hr.html', 'utf8'); 
const scripts = content.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi); 
if (scripts) { 
    scripts.forEach((s, i) => { 
        const code = s.replace(/<script[\s\S]*?>/i, '').replace(/<\/script>/i, ''); 
        fs.writeFileSync(`tmp_script_${i}.js`, code); 
        try { 
            execSync(`node -c tmp_script_${i}.js`); 
            console.log(`Script ${i} is valid.`); 
        } catch(e) { 
            console.error(`Script ${i} invalid:`, e.message); 
        } 
    }); 
}