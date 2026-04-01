const fs = require('fs');
const path = require('path');

// 1. Fix authHeaders in all JS files so payroll, reviews, etc. work properly.
const jsFiles = ['employees.js', 'onboarding.js', 'training.js', 'performance.js', 'hr-ops.js', 'payroll.js', 'analytics.js', 'ai-assistant.js'];
const syncAuthHeaders = `function authHeaders() {
  let token = localStorage.getItem('simpatico_token') || localStorage.getItem('sb-token') || '';
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            try { token = JSON.parse(localStorage.getItem(k)).access_token; } catch(e){}
        }
    }
  }
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}`;

for (const file of jsFiles) {
    const fPath = path.join(__dirname, 'js', file);
    if (!fs.existsSync(fPath)) continue;
    let content = fs.readFileSync(fPath, 'utf8');
    
    // Replace async function authHeaders
    content = content.replace(/async function authHeaders\(\)\s*\{[\s\S]*?return token[^}]*\}\s*\}/g, syncAuthHeaders);
    // Replace traditional function authHeaders
    content = content.replace(/function authHeaders\(\)\s*\{[\s\S]*?return token[^}]*\}\s*\}/g, syncAuthHeaders);
    // Also a more generic replace if it didn't match:
    content = content.replace(/function authHeaders\(\)\s*\{[\s\S]*?(?:return.*?;)\s*\}/g, syncAuthHeaders);
    
    fs.writeFileSync(fPath, content);
    console.log('Fixed authHeaders in', file);
}

// 2. Add Automation links and fix Logo in HR modules
const htmlFiles = [
    'employees.html', 'employee-profile.html', 'onboarding.html', 'training.html', 
    'performance.html', 'hr-ops.html', 'payroll.html', 'analytics.html', 'ai-assistant.html'
];

const newLinks = `    <div class="hr-nav-section" style="margin-top:8px">Automation</div>
    <a class="hr-nav-item" href="hr-automation.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      HR Rules
    </a>
    <a class="hr-nav-item" href="ats-automation.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      ATS Engine
    </a>
`;

const logoSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="9" height="9" rx="2" fill="#00c4ff"/>
        <rect x="13" y="2" width="9" height="9" rx="2" fill="#00c4ff" opacity=".5"/>
        <rect x="2" y="13" width="9" height="9" rx="2" fill="#00c4ff" opacity=".5"/>
        <rect x="13" y="13" width="9" height="9" rx="2" fill="#00c4ff"/>
      </svg>`;

for (const file of htmlFiles) {
    const fPath = path.join(__dirname, file);
    if (!fs.existsSync(fPath)) continue;
    let content = fs.readFileSync(fPath, 'utf8');

    // Add automation links before the ATS section
    if (!content.includes('href="hr-automation.html"')) {
        content = content.replace(/<div class="hr-nav-section" style="margin-top:8px">ATS<\/div>/g, newLinks + '\n    <div class="hr-nav-section" style="margin-top:8px">ATS</div>');
    }

    fs.writeFileSync(fPath, content);
    console.log('Updated sidebars in', file);
}

// 3. Update dashboard/hr.html (ATS platform) to include HR and ATS automation links and SVG Logo
const tsPath = path.join(__dirname, 'dashboard', 'hr.html');
if (fs.existsSync(tsPath)) {
    let tsContent = fs.readFileSync(tsPath, 'utf8');
    
    // Replace text logo with SVG logo
    tsContent = tsContent.replace(/<div class="brand-logo-fallback">S<\/div>/g, logoSvg);

    // Add automation links to dashboard sidebar
    const atsDashboardLinks = `
        <li class="sidebar-item">
            <a href="../ats-automation.html" class="sidebar-link">
                <i class="fas fa-robot"></i><span>ATS AI Engine</span>
            </a>
        </li>
        <li class="sidebar-item">
            <a href="../hr-automation.html" class="sidebar-link">
                <i class="fas fa-cogs"></i><span>HR Automation</span>
            </a>
        </li>`;
    
    if (!tsContent.includes('ats-automation.html')) {
        tsContent = tsContent.replace('<!-- Add more ATS specific tools if needed -->', '<!-- Add more ATS specific tools if needed -->' + atsDashboardLinks);
    }
    fs.writeFileSync(tsPath, tsContent);
    console.log('Updated dashboard/hr.html');
}

console.log('All HR UI/UX and API fixes applied!');
