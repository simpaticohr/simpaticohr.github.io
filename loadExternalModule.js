async function loadExternalModule(sectionId, href) {
    const container = document.getElementById(sectionId + '-module-container');
    if (!container || loadedModules[sectionId]) return;
    
    loadedModules[sectionId] = true;
    container.innerHTML = `
        <div id="loading-${sectionId}" style="display:flex;justify-content:center;align-items:center;height:400px;background:white;border-radius:12px;">
            <div class="text-center">
                <i class="fas fa-circle-notch fa-spin mb-3" style="font-size:2.5rem;color:var(--primary);"></i>
                <div style="font-weight:600;color:var(--text-secondary);">Initializing SaaS Engine...</div>
            </div>
        </div>
    `;

    try {
        const res = await fetch(href.replace(/^\//, ''));
        if (!res.ok) throw new Error('Module not found');
        const html = await res.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const mainContent = doc.querySelector('.main, .hr-main, .content, .shell > .main');
        if (mainContent) {
            const selectorsToRemove = [
                '.sidebar', 'sidebar',
                '.topbar', 'topbar',
                '.hr-sidebar', '.hr-topbar',
                '.sb-top', '.cx-topbar', '.db-topbar',
                '.nav-label', 'nav.sidebar',
                '[data-role="sidebar"]', '[data-role="topbar"]'
            ].join(',');
            mainContent.querySelectorAll(selectorsToRemove).forEach(el => el.remove());
            container.innerHTML = mainContent.innerHTML;
        } else {
            container.innerHTML = doc.body.innerHTML;
        }

        doc.querySelectorAll('.tc, .drawer-overlay, .drawer, .mo, .modal, #tc, #drawer, .drawer-content').forEach(el => {
            if (el.id) {
                let existing = document.getElementById(el.id);
                if (existing) {
                    existing.innerHTML = el.innerHTML;
                    existing.className = el.className;
                } else {
                    const clone = el.cloneNode(true);
                    document.body.appendChild(clone);
                }
                el.remove();
            } else if (el.classList.contains('mo') || el.classList.contains('drawer')) {
                document.body.appendChild(el.cloneNode(true));
                el.remove();
            }
        });

        doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const lHref = link.getAttribute('href');
            if (lHref && !document.querySelector(`link[href*="${lHref.split('/').pop()}"]`)) {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = lHref;
                document.head.appendChild(newLink);
            }
        });
        doc.querySelectorAll('style').forEach(style => document.head.appendChild(style.cloneNode(true)));

        window.loadedScripts = window.loadedScripts || new Set();

        for (const oldScript of doc.querySelectorAll('script')) {
            let jsCode = "";
            let srcAttr = oldScript.getAttribute('src');
            let scriptName = srcAttr ? srcAttr.split('/').pop() : "inline-" + Math.random().toString(36).substr(2, 5);

            if (srcAttr) {
                let scriptUrl = srcAttr;
                if (!srcAttr.startsWith('http') && !srcAttr.startsWith('/') && !srcAttr.startsWith('../')) {
                    scriptUrl = '../' + srcAttr;
                }

                if (scriptName.includes('supabase') || scriptName.includes('hr-config') 
                    || scriptName.includes('shared-utils') || scriptName.includes('app.js') 
                    || scriptName.includes('api.js') || scriptName.includes('auth.js')
                    || scriptName.includes('bootstrap')) continue;
                if (window.loadedScripts.has(scriptName)) continue; 
                window.loadedScripts.add(scriptName);
                
                try {
                    const scriptRes = await fetch(scriptUrl);
                    if (!scriptRes.ok) {
                        console.warn(`[Module Loader] Skipping missing script: ${scriptUrl}`);
                        continue;
                    }
                    jsCode = await scriptRes.text();
                } catch (e) {
                    console.warn(`[Module Loader] Failed to fetch script: ${scriptUrl}`);
                    continue;
                }
            } else {
                if (oldScript.textContent.includes('window.self !== window.top')) continue;
                jsCode = oldScript.textContent;
            }

            jsCode = jsCode.replace(/(const|let)\s+(SB_URL|SB_ANON|TENANT|WORKER_URL|AN_CONFIG|_sb|sbHeaders|allEmployees|filtered|currentView|editingId|avatarColors|statusBadge|statusLabel|typeLabel|conversations|currentConvId|messages|activeContexts|isStreaming|currentUserInitials|AI_CONFIG|CANDIDATES|STAGES|STAGE_KEYS|TRIG_LABELS|ACT_LABELS|STAGE_COLORS|ICON_MAP|INTEGRATIONS|pendingAI|SLA_CONFIG|TEMPLATES|KR|KL|actCount)\s*=/g, 'var $2 =');
            
            jsCode = jsCode.replace(/document\.addEventListener\(\s*['"`]DOMContentLoaded['"`]/g, "window.addEventListener('SimpaticoSPA'");

            const newScript = document.createElement('script');
            newScript.textContent = jsCode;
            document.body.appendChild(newScript);
        }

        setTimeout(() => { window.dispatchEvent(new Event('SimpaticoSPA')); }, 150);

    } catch (error) {
        console.error("Fetch Error:", error);
        container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);">Failed to load module. Check console.</div>`;
        loadedModules[sectionId] = false; 
    }
}