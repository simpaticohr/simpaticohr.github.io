const fs = require('fs');
const path = require('path');

// 1. Uncomment hr-topbar-brand in the 4 files
const filesToUncomment = ['onboarding.html', 'training.html', 'analytics.html', 'ai-assistant.html'];
for (const file of filesToUncomment) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove the comment tags wrapping the topbar-brand
    content = content.replace(/<!--\s*(<a[^>]*class="hr-topbar-brand"[\s\S]*?<\/a>)\s*-->/g, '$1');

    fs.writeFileSync(filePath, content);
    console.log('Uncommented topbar brand in ' + file);
}

// 2. Add Automation links to sidebars lacking them
const filesWithSidebar = ['onboarding.html', 'training.html', 'analytics.html'];
const automationHtml = `
    <div class="hr-nav-section" style="margin-top:8px">Automation</div>
    <a class="hr-nav-item" href="hr-automation.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      HR Rules
    </a>
    <a class="hr-nav-item" href="ats-automation.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      ATS Engine
    </a>
`;

for (const file of filesWithSidebar) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');

    // Only append if it doesn't already exist
    if (!content.includes('hr-automation.html') && content.includes('</nav>')) {
        content = content.replace('</nav>', automationHtml + '\n  </nav>');
        fs.writeFileSync(filePath, content);
        console.log('Appended Automation links to ' + file);
    }
}
