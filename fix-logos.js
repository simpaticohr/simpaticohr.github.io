const fs = require('fs');
const path = require('path');

const htmlFiles = [
    'training.html', 'performance.html', 'payroll.html', 'onboarding.html', 
    'hr-ops.html', 'employee-profile.html', 'analytics.html', 'ai-assistant.html'
];

const imgLogoStr = '<img src="favicon-96x96.png" style="width:32px;height:32px;border-radius:8px;margin-right:8px;vertical-align:middle;">Simpatico<span>HR</span>';

const newSvgLogoStr = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="margin-right:10px">
        <rect x="2" y="2" width="9" height="9" rx="2" fill="#00c4ff"/>
        <rect x="13" y="2" width="9" height="9" rx="2" fill="#00c4ff" opacity=".5"/>
        <rect x="2" y="13" width="9" height="9" rx="2" fill="#00c4ff" opacity=".5"/>
        <rect x="13" y="13" width="9" height="9" rx="2" fill="#00c4ff"/>
      </svg>Simpatico<span>HR</span>`;

for (const file of htmlFiles) {
    const fPath = path.join(__dirname, file);
    if (fs.existsSync(fPath)) {
        let content = fs.readFileSync(fPath, 'utf8');
        content = content.replace(imgLogoStr, newSvgLogoStr);
        fs.writeFileSync(fPath, content);
        console.log('Replaced logo in ' + file);
    }
}

// Enhance CSS for premium production feel
const cssPath = path.join(__dirname, 'hr-modules.css');
if (fs.existsSync(cssPath)) {
    let css = fs.readFileSync(cssPath, 'utf8');
    
    // Check if scrollbar CSS exists, if not, append premium UI fixes
    if (!css.includes('/* ── PREMIUM SCROLLBARS ── */')) {
        const premiumCss = `
/* ── PREMIUM SCROLLBARS ── */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--hr-bg-base);
}
::-webkit-scrollbar-thumb {
  background: var(--hr-border-light);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--hr-text-muted);
}

/* ── IMPROVED HOVERS ── */
.hr-card:hover { 
  transform: translateY(-2px); 
  box-shadow: 0 8px 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,196,255,0.05);
}
.hr-table tr:hover td { 
  background: rgba(0,196,255,0.06); 
}
.hr-nav-item:hover { 
  color: #fff; 
  background: rgba(0,196,255,0.08); 
}
.hr-btn-primary {
  background: linear-gradient(135deg, var(--hr-primary), #00addc);
}
.hr-btn-primary:hover { 
  transform: translateY(-2px);
  box-shadow: 0 4px 15px var(--hr-primary-glow); 
}
`;
        fs.appendFileSync(cssPath, premiumCss);
        console.log('Appended premium CSS enhancements.');
    }
}
