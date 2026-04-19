
console.log('SCRIPT STARTING');
// ===========================================================================
// SIMPATICO HR — CORE APPLICATION LOGIC v2.0
// ===========================================================================

const DataStore = {
    get _storageKey() {
        try {
            const u = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
            const cid = u.company_id || u.tenant_id || 'default';
            return 'simpaticoHR_data_' + cid;
        } catch(e) { return 'simpaticoHR_data_default'; }
    },

    _defaults: {
        jobs: [],
        interviews: [],
        activities: [],
        job_applications: [],
        user: {
            name: '',
            email: '',
            role: '',
            isLoggedIn: false
        },
        stats: { totalEmployees: 0, openPositions: 0, interviewsToday: 0, totalApplications: 0, pendingLeaves: 0 }
    },

    load() {
        try {
            const stored = localStorage.getItem(this._storageKey);
            if (stored) return { ...this._defaults, ...JSON.parse(stored) };
        } catch(e) {}
        return JSON.parse(JSON.stringify(this._defaults));
    },

    save(data) {
        try { localStorage.setItem(this._storageKey, JSON.stringify(data)); } catch(e) {}
    },

    get() { return this.load(); },

    update(fn) {
        const data = this.load();
        fn(data);
        this.save(data);
        return data;
    },

    clear() { localStorage.removeItem(this._storageKey); }
};

// ===== APP STATE =====
let appData = DataStore.get();
let currentSection = 'dashboard';
let loadedModules = {};
let selectedInterviewMode = '';
let activeChannels = new Set(['email']); 

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => { initApp(); });

async function initApp() {
    const realToken = localStorage.getItem('simpatico_token');
    let realUser = JSON.parse(localStorage.getItem('simpatico_user') || '{}');

    if (!realToken) { performLogout(); return; }

    // ★ One-time cleanup: remove old shared cache to prevent data bleed
    if (localStorage.getItem('simpaticoHR_data')) {
        console.log('[init] Cleaning up old global cache key simpaticoHR_data');
        localStorage.removeItem('simpaticoHR_data');
    }

    // ★ AUTO-RESOLVE company_id if missing (ROOT CAUSE FIX)
    // Without company_id, strict isolation blocks all employee/payroll operations
    if (!realUser.company_id && !realUser.tenant_id) {
        console.warn('[init] No company_id in session — attempting auto-resolution from Supabase');
        try {
            const db = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null) || window.SimpaticoDB || window._supabaseClient;
            if (db) {
                // Step 1: Use getSession() first (reads from local storage, no network lock)
                // Fall back to getUser() only if session is empty
                let authUser = null;
                try {
                    const { data: sesData } = await db.auth.getSession();
                    authUser = sesData?.session?.user || null;
                } catch(e) {}
                if (!authUser) {
                    const { data: { user: u } } = await db.auth.getUser();
                    authUser = u;
                }
                // Cache globally so embedded modules don't trigger a second getUser()
                window._simpaticoAuthUser = authUser;
                if (authUser) {
                    // Step 2: Look up profile in users table
                    const { data: profiles } = await db
                        .from('users')
                        .select('company_id, role, full_name')
                        .eq('auth_id', authUser.id)
                        .limit(1);
                    
                    const profile = profiles?.[0];
                    if (profile?.company_id) {
                        realUser.company_id = profile.company_id;
                        realUser.tenant_id = profile.company_id;
                        if (profile.role) realUser.role = profile.role;
                        if (profile.full_name && !realUser.full_name) realUser.full_name = profile.full_name;
                        localStorage.setItem('simpatico_user', JSON.stringify(realUser));
                        console.log('[init] ✅ Auto-resolved company_id:', profile.company_id);
                    } else {
                        // Step 3: Fallback — check if user owns a company via companies table
                        const { data: companies } = await db
                            .from('companies')
                            .select('id, name')
                            .eq('owner_id', authUser.id)
                            .limit(1);
                        
                        if (companies?.[0]) {
                            realUser.company_id = companies[0].id;
                            realUser.tenant_id = companies[0].id;
                            localStorage.setItem('simpatico_user', JSON.stringify(realUser));
                            console.log('[init] ✅ Auto-resolved company_id from ownership:', companies[0].id);
                            
                            // Also update the users table so this doesn't happen again
                            db.from('users')
                              .update({ company_id: companies[0].id })
                              .eq('auth_id', authUser.id)
                              .then(() => console.log('[init] Updated users table with company_id'))
                              .catch(e => console.warn('[init] Could not update users table:', e.message));
                        } else {
                            console.warn('[init] ⚠ No company found for user — dashboard will be empty');
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[init] company_id auto-resolution failed:', e.message);
        }
    }

    // Initialize local session data from the REAL logged-in user
    DataStore.update(data => { 
        data.user.isLoggedIn = true; 
        data.user.name = realUser.full_name || realUser.name || realUser.email || 'User';
        data.user.email = realUser.email || '';
        data.user.role = realUser.role || 'HR';
        data.user.company_id = realUser.company_id || realUser.tenant_id || null;
    });
    
    // ★ CRITICAL: Refresh appData BEFORE updating the UI
    appData = DataStore.get();
    updateUserDisplay();
    
    // ── Render immediately with cached data (fast first paint) ──
    renderDashboardStats();
    renderDashboardInterviews();
    renderDashboardActivities();
    renderJobTable();
    renderInterviewTable();
    renderProctoredTable();
    renderResultsTable();
    renderCandidates(); 
    updateInterviewCounts();
    populatePositionDropdown();

    // ── PRODUCTION SYNC — then re-render with live data ──
    try {
        await syncWithSupabase();
        console.log('✅ Simpatico HR synced with production data.');
        // Re-render with fresh data after sync
        appData = DataStore.get();
        renderDashboardStats();
        renderDashboardInterviews();
        renderDashboardActivities();
        renderJobTable();
        renderInterviewTable();
        renderProctoredTable();
        renderResultsTable();
        renderCandidates();
        updateInterviewCounts();
        populatePositionDropdown();
    } catch (e) {
        console.warn('⚠️ Sync failed, using local offline data.', e);
        showToast('Running in offline mode — check connectivity', 'warning');
    }

    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('intDate');
    if (dateInput) {
        dateInput.setAttribute('min', today);
        dateInput.addEventListener('change', refreshTimeSlots);
    }

    const roundSelect = document.getElementById('intRound');
    if (roundSelect) {
        roundSelect.addEventListener('change', function() {
            if (this.value.toLowerCase().includes('proctored') || this.value.toLowerCase().includes('coding assessment')) {
                const modeCard = document.querySelector('.mode-card:nth-child(4)');
                selectInterviewMode('proctored', modeCard);
                if(window.showToast) showToast('💡 Proctored mode auto-selected for coding assessments', 'success');
            }
        });
    }

    loadInterviewerSuggestions();
}

async function syncWithSupabase() {
    const db = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null) || window.SimpaticoDB || window._supabaseClient;
    if (!db) {
        console.warn('[sync] No Supabase client available — skipping live sync');
        return;
    }
    
    const userJson = localStorage.getItem('simpatico_user');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const companyId = user.company_id || user.tenant_id || null;

    // ★ STRICT ISOLATION: If no company_id, user has no tenant — show empty dashboard
    if (!companyId) {
        console.warn('[sync] No company_id in session — enforcing empty dashboard (strict isolation)');
        DataStore.update(data => {
            data.jobs = [];
            data.interviews = [];
            data.job_applications = [];
            data.stats.totalEmployees = 0;
        });
        appData = DataStore.get();
        return;
    }

    let synced = 0;

    // 1. Fetch Jobs — STRICTLY FILTERED by company_id
    try {
        const jobsRes = await db.from('jobs').select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        if (!jobsRes.error && jobsRes.data) {
            DataStore.update(data => { data.jobs = jobsRes.data; });
            synced++;
        } else if (jobsRes.error) {
            console.warn('[sync] Jobs fetch error:', jobsRes.error.message);
        }
    } catch(e) { console.warn('[sync] Jobs query failed:', e.message); }

    // 2. Fetch Interviews — STRICTLY FILTERED by company_id
    try {
        const intRes = await db.from('interviews').select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        if (!intRes.error && intRes.data) {
            DataStore.update(data => { 
                data.interviews = intRes.data.map(dbInt => ({
                    id: dbInt.id,
                    candidateName: dbInt.candidate_name || 'Candidate',
                    candidateEmail: dbInt.candidate_email || '',
                    candidatePhone: dbInt.candidate_phone || '',
                    position: dbInt.interview_role || 'Position',
                    round: dbInt.interview_level || 'Round',
                    date: dbInt.created_at ? dbInt.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                    startTime: '10:00',
                    endTime: '10:45',
                    interviewer: 'Recruiting Team',
                    mode: dbInt.interview_type === 'ai_voice' ? 'proctored' : 'video',
                    status: dbInt.status === 'pending' ? 'scheduled' : (dbInt.status || 'scheduled'),
                    token: dbInt.token || '',
                    job_id: dbInt.job_id
                }));
            });
            synced++;
        } else if (intRes.error) {
            console.warn('[sync] Interviews fetch error:', intRes.error.message);
        }
    } catch(e) { console.warn('[sync] Interviews query failed:', e.message); }

    // 3. Fetch Applications — STRICTLY FILTERED by company_id
    try {
        const appRes = await db.from('job_applications').select('*, jobs(title, department)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        if (!appRes.error && appRes.data) {
            DataStore.update(data => {
                data.job_applications = appRes.data;
                data.jobs.forEach(job => {
                    job.applications = appRes.data.filter(a => a.job_id === job.id).length;
                });
            });
            synced++;
        } else if (appRes.error) {
            console.warn('[sync] Applications fetch error:', appRes.error.message);
        }
    } catch(e) { console.warn('[sync] Applications query failed:', e.message); }

    // 4. Fetch Employee count — STRICTLY FILTERED by company_id
    try {
        const empRes = await db.from('employees').select('id', { count: 'exact', head: true })
            .eq('company_id', companyId);
        if (!empRes.error) {
            DataStore.update(data => { data.stats.totalEmployees = empRes.count || 0; });
            synced++;
        }
    } catch(e) { /* employees table may not exist */ }

    if (synced === 0) throw new Error('All sync queries failed');

    appData = DataStore.get();
    console.log(`[sync] Synced ${synced} data sources from Supabase (company: ${companyId})`);
}

// ===== CHANNEL TOGGLE =====
function toggleChannel(channel, el) {
    if (activeChannels.has(channel)) {
        activeChannels.delete(channel);
        el.classList.remove('selected');
    } else {
        activeChannels.add(channel);
        el.classList.add('selected');
    }

    document.getElementById('notifEmailSection').style.display = activeChannels.has('email') ? 'block' : 'none';
    document.getElementById('notifWASection').style.display = activeChannels.has('whatsapp') ? 'block' : 'none';
}

// ===== WHATSAPP MESSAGE PREVIEW =====
function previewWhatsAppMessage() {
    const name = document.getElementById('intCandidateName')?.value || '[Candidate Name]';
    const position = document.getElementById('intPosition')?.value || '[Position]';
    const round = document.getElementById('intRound')?.value || '[Round]';
    const date = document.getElementById('intDate')?.value || '[Date]';
    const startTime = document.getElementById('intStartTime')?.value || '[Time]';
    const mode = document.getElementById('intMode')?.value || '[Mode]';
    const meetingLink = document.getElementById('intMeetingLink')?.value || '';

    const sampleToken = generateInterviewToken();
    const interviewLink = getInterviewLink(sampleToken);
    const msg = buildWhatsAppMessage({ candidateName: name, position, round, date, startTime, mode, meetingLink, interviewLink });

    document.getElementById('waMessagePreview').textContent = msg;
    document.getElementById('waPreviewBox').style.display = 'block';
}

function buildWhatsAppMessage(int) {
    const dateStr = int.date ? formatDate(int.date) : int.date;
    const timeStr = int.startTime ? formatTime(int.startTime) : int.startTime;
    const modeLabel = { video: 'Video Call', inperson: 'In-Person', phone: 'Phone Call', proctored: 'Proctored (AI Monitored)' }[int.mode] || int.mode;

    let msg = `🎉 *Interview Invitation — Simpatico HR*\n\n`;
    msg += `Hi ${int.candidateName},\n\n`;
    msg += `You have been shortlisted for an interview at *Simpatico HR*. Here are your details:\n\n`;
    msg += `📋 *Position:* ${int.position}\n`;
    msg += `🔄 *Round:* ${int.round}\n`;
    msg += `📅 *Date:* ${dateStr}\n`;
    msg += `⏰ *Time:* ${timeStr}\n`;
    msg += `🖥️ *Mode:* ${modeLabel}\n`;

    if (int.meetingLink) {
        msg += `🔗 *Meeting Link:* ${int.meetingLink}\n`;
    }

    if (int.interviewLink) {
        msg += `\n🔑 *Your Secure Interview Link:*\n${int.interviewLink}\n`;
        msg += `\n_(Click the link above to join your interview session)_\n`;
    }

    msg += `\n📌 *Important:*\n• Please join 5 minutes early\n• Keep your ID ready\n• Ensure stable internet connection\n`;
    msg += `\nFor any queries, reply to this message.\n\n— *Simpatico HR Team*`;
    return msg;
}

// ===== SEND WHATSAPP (API + Fallback) =====
async function sendWhatsAppNotification(int) {
    const phone = int.candidatePhone;
    if (!phone) return { success: false, reason: 'No phone number' };

    const message = buildWhatsAppMessage(int);
    const workerUrl = window.SIMPATICO_CONFIG?.workerUrl;
    
    if (workerUrl) {
        try {
            const res = await fetch(`${workerUrl}/notifications/whatsapp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': window.SIMPATICO_CONFIG?.tenantId || 'default'
                },
                body: JSON.stringify({
                    phone: phone,
                    message: message,
                    candidateName: int.candidateName,
                    interviewLink: int.interviewLink,
                    token: int.token
                })
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.method === 'fallback_wame') {
                    const cleanPhone = phone.replace(/\D/g, '');
                    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                    window.open(waUrl, '_blank');
                    return { success: true, method: 'fallback_wame' };
                }
                return { success: true, method: 'api' };
            }
        } catch(e) {
            console.warn('[WhatsApp] API call failed, falling back to wa.me', e);
        }
    }

    // Fallback: open wa.me link
    const cleanPhone = phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    return { success: true, method: 'fallback_wame' };
}

// ===== SEND EMAIL NOTIFICATION =====
async function sendEmailNotification(int, recipientType = 'candidate') {
    const workerUrl = window.SIMPATICO_CONFIG?.workerUrl;
    if (!workerUrl) {
        return { success: false, reason: 'Worker not configured' };
    }

    try {
        const payload = {
            candidateName: int.candidateName,
            candidateEmail: int.candidateEmail,
            interviewerEmail: int.interviewerEmail || '',
            position: int.position,
            round: int.round,
            date: int.date,
            startTime: int.startTime,
            endTime: int.endTime,
            interviewer: int.interviewer,
            mode: int.mode,
            meetingLink: int.meetingLink || '',
            interviewLink: int.interviewLink || '',
            token: int.token || '',
            notes: int.notes || '',
            recipientType 
        };

        const res = await fetch(`${workerUrl}/interviews/schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-ID': window.SIMPATICO_CONFIG?.tenantId || 'default'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) return { success: true };
        const data = await res.json().catch(() => ({}));
        return { success: false, reason: data.error || 'API error' };
    } catch(e) {
        return { success: false, reason: e.message };
    }
}

// ===== COPY TO CLIPBOARD =====
function copyToClipboard(text, label = 'Link') {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`✅ ${label} copied to clipboard!`);
        }).catch(() => fallbackCopy(text, label));
    } else {
        fallbackCopy(text, label);
    }
}

function fallbackCopy(text, label) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`✅ ${label} copied!`);
}

// ===== INTERVIEWER SUGGESTIONS =====
function loadInterviewerSuggestions() {
    const datalist = document.getElementById('interviewerSuggestions');
    if (!datalist) return;
    const saved = JSON.parse(localStorage.getItem('simpaticoHR_interviewers') || '[]');
    datalist.innerHTML = saved.map(name => `<option value="${name}">`).join('');
}

function saveInterviewerSuggestion(name) {
    if (!name || name.length < 2) return;
    const saved = JSON.parse(localStorage.getItem('simpaticoHR_interviewers') || '[]');
    if (!saved.includes(name)) {
        saved.unshift(name);
        localStorage.setItem('simpaticoHR_interviewers', JSON.stringify(saved.slice(0, 20)));
        loadInterviewerSuggestions();
    }
}

function updateUserDisplay() {
    // Read directly from localStorage for the most accurate user data
    const realUser = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
    const name = realUser.full_name || realUser.name || realUser.email?.split('@')[0] || 'User';
    const email = realUser.email || '';
    const role = realUser.role || 'HR';
    const companyData = JSON.parse(localStorage.getItem('simpatico_company') || '{}');
    const companyName = companyData.name || '';

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('userName', name);
    set('userRole', companyName || role);
    set('dropdownUserName', name);
    set('dropdownUserEmail', email);
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff`;

    // Also sync the appData.user for other parts of the codebase
    appData.user.name = name;
    appData.user.email = email;
    appData.user.role = role;
}

// ===== NAVIGATION =====
function navigateTo(sectionId, navEl) {
    console.log(`[Navigation] Moving to: ${sectionId}`);
    
    // Production-ready cleanup: remove active/animate classes from ALL sections
    document.querySelectorAll('.content-section').forEach(s => {
        s.style.setProperty('display', 'none', 'important');
        s.classList.remove('active');
        s.classList.remove('animate-in');
    });

    const target = document.getElementById('section-' + sectionId);
    if (target) { 
        console.log(`[Navigation] Target section found: ${sectionId}`);
        target.style.setProperty('display', 'block', 'important'); 
        target.classList.add('active'); 
        target.classList.add('animate-in'); 
    } else {
        console.warn(`[Navigation] Target section NOT found: ${sectionId}`);
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navEl) {
        navEl.classList.add('active');
    } else {
        const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (navItem) navItem.classList.add('active');
    }

    currentSection = sectionId;
    const navLink = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (navLink && navLink.dataset.href) loadExternalModule(sectionId, navLink.dataset.href);

    if (sectionId === 'storage' && typeof loadCompanyStorage === 'function') {
        loadCompanyStorage();
    }

    document.getElementById('sidebar').classList.remove('open');
    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.remove('open');
}

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

        doc.querySelectorAll('.tc, .drawer-overlay, .drawer, .mo, .modal, .modal-overlay, .hr-modal-overlay, #tc, #drawer, .drawer-content').forEach(el => {
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
                // Ensure inline scripts are executed (removed skipping condition to allow module logic)
                jsCode = oldScript.textContent;
            }

            jsCode = jsCode.replace(/(const|let)\s+(SB_URL|SB_ANON|TENANT|WORKER_URL|AN_CONFIG|_sb|sbHeaders|allEmployees|filtered|currentView|editingId|avatarColors|statusBadge|statusLabel|typeLabel|conversations|currentConvId|messages|activeContexts|isStreaming|currentUserInitials|AI_CONFIG|CANDIDATES|STAGES|STAGE_KEYS|TRIG_LABELS|ACT_LABELS|STAGE_COLORS|ICON_MAP|INTEGRATIONS|pendingAI|SLA_CONFIG|TEMPLATES|KR|KL|actCount|EMP_CONFIG|PAY_CONFIG|OPS_CONFIG|OB_CONFIG|PERF_CONFIG|TR_CONFIG|allPayslips|allSalaries|allRuns|allDeductions|allLeave|allTickets|onboardingRecords|allReviews|allGoals|allCycles|allCourses|allEnrollments|currentTabId|departments|THUMB_PALETTES|THUMB_ICONS|ESC_MAP|AVATAR_COLORS|API|SB_KEY|runs|data|client|result|profile|companyId|cid|authUser|token|key|charts|CX_CONFIG|cxData|CHART_COLORS)\s*=/g, 'var $2 =');
            
            jsCode = jsCode.replace(/(document|window)\.addEventListener\(\s*['"`]DOMContentLoaded['"`]/g, "window.addEventListener('SimpaticoSPA'");

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

function openAddModal() {
    // Specifically directed to the 'add-modal' used in the Employees module
    const el = document.getElementById('add-modal');
    if (el) { el.classList.add('open'); el.classList.add('active'); }
    else console.warn("[UI] 'add-modal' not found in DOM");
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function toggleUserDropdown(e) {
    e.stopPropagation();
    document.getElementById('userDropdown').classList.toggle('open');
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && !e.target.closest('.user-profile')) dropdown.classList.remove('open');
});

function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el.classList.contains('hr-modal-overlay') || el.classList.contains('hr-modal') || el.classList.contains('modal-overlay')) {
        el.classList.add('open', 'active');
        return;
    }
    let modal = bootstrap.Modal.getInstance(el);
    if (!modal) {
        modal = new bootstrap.Modal(el);
    }
    try { modal.show(); } catch(e) {}
    if (modalId === 'scheduleInterviewModal') {
        populatePositionDropdown();
        refreshTimeSlots();
        loadInterviewerSuggestions();
        selectedInterviewMode = '';
        document.getElementById('intMode').value = '';
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('proctoredSettings').classList.remove('visible');
        activeChannels = new Set(['email']);
        document.getElementById('channelEmail').classList.add('selected');
        document.getElementById('channelWhatsApp').classList.remove('selected');
        document.getElementById('notifEmailSection').style.display = 'block';
        document.getElementById('notifWASection').style.display = 'none';
        document.getElementById('waPreviewBox').style.display = 'none';
    }
}

function closeModal(modalId) {
    if (!modalId) return;
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el.classList.contains('hr-modal-overlay') || el.classList.contains('hr-modal') || el.classList.contains('modal-overlay')) {
        el.classList.remove('open', 'active');
        return;
    }
    try {
        const modal = bootstrap.Modal.getInstance(el);
        if (modal) modal.hide();
        else el.classList.remove('open', 'active');
    } catch (err) {
        el.classList.remove('open', 'active');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-exclamation-circle';
    const color = type === 'success' ? 'var(--success)' : type === 'warning' ? 'var(--warning)' : 'var(--danger)';
    toast.innerHTML = `
        <i class="fas ${icon}" style="color:${color};font-size:1.2rem;"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function showLogoutConfirmation() {
    document.getElementById('logoutOverlay').classList.add('open');
    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.remove('open');
}

function hideLogoutConfirmation() { document.getElementById('logoutOverlay').classList.remove('open'); }

function performLogout() {
    DataStore.update(data => { data.user.isLoggedIn = false; });
    hideLogoutConfirmation();
    showToast('Signed out successfully. Redirecting...', 'success');
    ['simpatico_token','simpatico_user','simpatico_refresh','simpatico_company'].forEach(k=>{
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
    setTimeout(() => {
        window.location.href = '/platform/login.html'; 
    }, 1000);
}

// ===== MODE SELECTION =====
function selectInterviewMode(mode, el) {
    selectedInterviewMode = mode;
    document.getElementById('intMode').value = mode;
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    if (el) el.classList.add('selected');

    const proctoredSettings = document.getElementById('proctoredSettings');
    const meetingHint = document.getElementById('meetingLinkHint');
    const meetingInput = document.getElementById('intMeetingLink');

    if (mode === 'proctored') {
        proctoredSettings.classList.add('visible');
        meetingHint.style.display = 'block';
        meetingHint.textContent = '🔒 A secure tokenised interview link will be auto-generated for the candidate.';
        meetingInput.placeholder = 'Auto-generated (or enter custom proctored platform URL)';
    } else {
        proctoredSettings.classList.remove('visible');
        const hints = {
            video: { show: true, text: '💡 Paste your Google Meet, Zoom, or Teams link here.', placeholder: 'https://meet.google.com/abc-defg-hij' },
            inperson: { show: true, text: '📍 Enter the office room or location details.', placeholder: 'e.g. Office Room 3, Floor 2' },
            phone: { show: true, text: '📞 Enter a contact number if needed.', placeholder: 'e.g. +91 98765 43210' }
        };
        const hint = hints[mode] || { show: false };
        meetingHint.style.display = hint.show ? 'block' : 'none';
        if (hint.text) meetingHint.textContent = hint.text;
        if (hint.placeholder) meetingInput.placeholder = hint.placeholder;
    }
}

// ===== DASHBOARD RENDERS =====
function renderDashboardStats() {
    const data = DataStore.get();
    const stats = calculateStats(data);
    const container = document.getElementById('dashboardStats');
    if (!container) return;

    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon blue"><i class="fas fa-users"></i></div>
            <div class="stat-info">
                <h3>${stats.totalEmployees}</h3>
                <p>Total Employees</p>
                <div class="stat-change" style="color:var(--text-secondary)">${stats.totalEmployees > 0 ? 'Active workforce' : 'No employees added yet'}</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon green"><i class="fas fa-briefcase"></i></div>
            <div class="stat-info">
                <h3>${stats.openPositions}</h3>
                <p>Open Positions</p>
                <div class="stat-change ${stats.openPositions > 0 ? 'up' : ''}">${stats.openPositions > 0 ? `<i class="fas fa-arrow-up"></i> ${stats.openPositions} active` : 'Post a job to start'}</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon orange"><i class="fas fa-calendar-check"></i></div>
            <div class="stat-info">
                <h3>${stats.interviewsToday}</h3>
                <p>Interviews Today</p>
                <div class="stat-change ${stats.interviewsToday > 0 ? 'up' : ''}">${stats.interviewsToday > 0 ? `<i class="fas fa-arrow-up"></i> ${stats.interviewsToday} scheduled` : 'None scheduled today'}</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon purple"><i class="fas fa-shield-halved"></i></div>
            <div class="stat-info">
                <h3>${stats.proctoredCount}</h3>
                <p>Proctored Sessions</p>
                <div class="stat-change ${stats.proctoredCount > 0 ? 'up' : ''}" style="${stats.proctoredCount === 0 ? 'color:var(--text-secondary)' : ''}">${stats.proctoredCount > 0 ? '<i class="fas fa-arrow-up"></i> AI-monitored' : 'No proctored sessions'}</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon red"><i class="fas fa-link"></i></div>
            <div class="stat-info">
                <h3>${stats.tokenLinksGenerated}</h3>
                <p>Token Links Generated</p>
                <div class="stat-change" style="color:var(--text-secondary)">${stats.tokenLinksGenerated > 0 ? 'Secure interview links' : 'Schedule to generate'}</div>
            </div>
        </div>
    `;
}

function calculateStats(data) {
    const today = new Date().toISOString().split('T')[0];
    const openJobs = data.jobs.filter(j => j.status === 'open');
    const todayInterviews = data.interviews.filter(i => i.date === today && i.status === 'scheduled');
    const upcomingInterviews = data.interviews.filter(i => i.date >= today && i.status === 'scheduled');
    const proctoredCount = data.interviews.filter(i => i.mode === 'proctored' && i.status === 'scheduled').length;
    const tokenLinksGenerated = data.interviews.filter(i => i.token).length;

    return {
        totalEmployees: data.stats?.totalEmployees || 0,
        openPositions: openJobs.length,
        interviewsToday: todayInterviews.length,
        totalApplications: data.jobs.reduce((sum, j) => sum + (j.applications || 0), 0),
        upcomingInterviews: upcomingInterviews.length,
        proctoredCount,
        tokenLinksGenerated
    };
}

function renderDashboardInterviews() {
    const container = document.getElementById('dashboardInterviews');
    if (!container) return;
    const today = new Date().toISOString().split('T')[0];
    const upcoming = appData.interviews
        .filter(i => i.date >= today && i.status === 'scheduled')
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        .slice(0, 3);

    if (upcoming.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:30px;"><i class="fas fa-calendar-check" style="font-size:2rem;color:var(--primary);"></i><h5 style="margin-top:10px;">No Upcoming Interviews</h5><p>Schedule an interview to see it here.</p></div>`;
        return;
    }

    container.innerHTML = upcoming.map(interview => {
        const modeIcon = { proctored: '🔒', video: '📹', phone: '📞', inperson: '🏢' }[interview.mode] || '📅';
        const hasToken = !!interview.token;
        return `
            <div class="interview-slot">
                <div>
                    <div class="time">${formatTime(interview.startTime)} − ${formatTime(interview.endTime)}</div>
                    <div class="candidate">${escapeHtml(interview.candidateName)} ${modeIcon}</div>
                    <div class="position">${escapeHtml(interview.position)} · ${escapeHtml(interview.round)}</div>
                    ${hasToken ? `<div style="margin-top:4px;"><span class="token-badge"><i class="fas fa-link"></i> ${interview.token.slice(0,8)}…</span></div>` : ''}
                </div>
                <span class="status-badge ${interview.mode === 'proctored' ? 'proctored' : 'scheduled'}">
                    ${interview.mode === 'proctored' ? '🔒 Proctored' : 'Scheduled'}
                </span>
            </div>
        `;
    }).join('');
}

function renderDashboardActivities() {
    const container = document.getElementById('dashboardActivities');
    if (!container) return;
    const activities = appData.activities.slice(0, 5);
    if (activities.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:30px;"><i class="fas fa-clock-rotate-left" style="font-size:2rem;color:var(--warning);"></i><h5 style="margin-top:10px;">No Recent Activity</h5><p>Your actions will appear here as you use the platform.</p></div>`;
        return;
    }

    const colorMap = { job: 'var(--primary)', interview: 'var(--success)', cancel: 'var(--danger)', proctored: '#7c3aed', whatsapp: 'var(--whatsapp)', email: 'var(--secondary)', general: 'var(--warning)' };

    container.innerHTML = activities.map(a => `
        <div class="timeline-item">
            <div class="timeline-dot" style="background:${colorMap[a.type] || colorMap.general}"></div>
            <div>
                <div style="font-weight:500;font-size:0.9rem;">${escapeHtml(a.title)}</div>
                <div style="font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(a.description)}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">${timeAgo(a.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

// ===== JOB TABLE =====
function renderJobTable() {
    const tbody = document.getElementById('jobTableBody');
    const emptyState = document.getElementById('jobEmptyState');
    const table = document.getElementById('jobTable');
    if (!tbody) return;
    const jobs = appData.jobs;
    if (jobs.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (table) table.style.display = 'none';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (table) table.style.display = 'table';

    tbody.innerHTML = jobs.map((job, index) => `
        <tr data-index="${index}" data-dept="${job.department}" data-status="${job.status}">
            <td><strong>${escapeHtml(job.title)}</strong></td>
            <td>${escapeHtml(job.department)}</td>
            <td>${escapeHtml(job.location)}</td>
            <td>${escapeHtml(job.type)}</td>
            <td>${job.applications || 0}</td>
            <td><span class="status-badge ${job.status}">${capitalize(job.status)}</span></td>
            <td>${formatDate(job.createdAt || job.created_at)}</td>
            <td>
                <button class="btn-sm-action" style="color:#0a66c2;" title="Share on LinkedIn" onclick="shareJobToLinkedIn(${index})"><i class="fab fa-linkedin"></i></button>
                <button class="btn-sm-action view" title="View" onclick="viewJob(${index})"><i class="fas fa-eye"></i></button>
                <button class="btn-sm-action edit" title="Edit" onclick="editJob(${index})"><i class="fas fa-pen"></i></button>
                <button class="btn-sm-action delete" title="Delete" onclick="deleteJob(${index})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function shareJobToLinkedIn(index) {
    const job = appData.jobs[index];
    if (!job) return;
    
    // Fallback ID if not yet saved to DB
    const jobId = job.id || job.job_id || Math.random().toString(36).substr(2, 9);
    const title = job.title || 'a new role';
    const location = job.location || 'Remote';
    const type = job.type || 'Full-time';
    
    const jobUrl = window.location.origin + '/job-apply.html?job_id=' + jobId + '&role=' + encodeURIComponent(title);
    const shareText = `We are hiring for a ${title}!\n\n📍 Location: ${location}\n👔 Employment: ${type}\n\nApply now: ${jobUrl}\n\n#hiring #${title.replace(/\\s+/g, '')} #jobs`;
    const linkedInShareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
    
    showToast('🚀 Opening LinkedIn for manual sharing...', 'info');
    window.open(linkedInShareUrl, '_blank', 'noopener,noreferrer');
}

// ===== INTERVIEW TABLE =====
function renderInterviewTable() {
    const tbody = document.getElementById('interviewTableBody');
    const emptyState = document.getElementById('interviewEmptyState');
    if (!tbody) return;

    const upcoming = appData.interviews
        .filter(i => i.status === 'scheduled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    if (upcoming.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const modeIcons = {
        video: '<i class="fas fa-video me-1" style="color:var(--primary)"></i>Video',
        inperson: '<i class="fas fa-building me-1" style="color:var(--success)"></i>In-person',
        phone: '<i class="fas fa-phone me-1" style="color:var(--warning)"></i>Phone',
        proctored: '<i class="fas fa-shield-halved me-1" style="color:#7c3aed"></i>Proctored'
    };

    tbody.innerHTML = upcoming.map(int => {
        const link = int.token ? getInterviewLink(int.token) : null;
        const shortToken = int.token ? int.token.slice(0, 8) + '…' : null;
        const notifHtml = buildNotifStatusBadges(int);

        return `
            <tr data-id="${int.id}">
                <td>
                    <strong>${escapeHtml(int.candidateName)}</strong><br>
                    <small style="color:var(--text-secondary)">${escapeHtml(int.candidateEmail)}</small>
                    ${int.candidatePhone ? `<br><small style="color:var(--whatsapp)"><i class="fab fa-whatsapp"></i> ${escapeHtml(int.candidatePhone)}</small>` : ''}
                </td>
                <td>${escapeHtml(int.position)}</td>
                <td>${escapeHtml(int.round)}</td>
                <td>${formatDate(int.date)}<br><strong>${formatTime(int.startTime)}</strong></td>
                <td>${escapeHtml((int.interviewer || 'Unassigned').split('(')[0].trim())}</td>
                <td>${modeIcons[int.mode] || int.mode}</td>
                <td>
                    ${link ? `
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span class="token-badge" title="${link}">
                                <i class="fas fa-link"></i> ${shortToken}
                            </span>
                            <button class="btn-sm-action link-btn" title="Copy link" onclick="copyToClipboard('${link}','Interview Link')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    ` : '<span style="color:var(--text-secondary);font-size:0.8rem;">—</span>'}
                </td>
                <td>${notifHtml}</td>
                <td>
                    <button class="btn-sm-action view" title="Details" onclick="viewInterview('${int.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-sm-action notify" title="Send Notification" onclick="openSendNotifModal('${int.id}')"><i class="fas fa-paper-plane"></i></button>
                    ${int.mode === 'proctored' ? `<button class="btn-sm-action" style="background:#ede9fe;color:#7c3aed;" title="Proctor Settings" onclick="viewProctorSettings('${int.id}')"><i class="fas fa-shield-halved"></i></button>` : ''}
                    <button class="btn-sm-action delete" title="Cancel" onclick="cancelInterview('${int.id}')"><i class="fas fa-xmark"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function buildNotifStatusBadges(int) {
    const logs = int.notificationLog || [];
    if (logs.length === 0) return '<span class="notification-status pending">⏳ Pending</span>';

    const emailSent = logs.some(l => l.type === 'email' && l.success);
    const waSent = logs.some(l => l.type === 'whatsapp' && l.success);
    let html = '';
    if (emailSent) html += `<span class="notification-status sent-email">✉️ Email</span> `;
    if (waSent) html += `<span class="notification-status sent-wa"><i class="fab fa-whatsapp"></i> WA</span>`;
    if (!emailSent && !waSent) html = '<span class="notification-status failed">❌ Failed</span>';
    return html;
}

function renderProctoredTable() {
    const tbody = document.getElementById('proctoredTableBody');
    const emptyState = document.getElementById('proctoredEmptyState');
    if (!tbody) return;

    const proctored = appData.interviews.filter(i => i.mode === 'proctored');

    if (proctored.length === 0) {
        try { tbody.closest('table').style.display = 'none'; } catch(e) {}
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    try { tbody.closest('table').style.display = 'table'; } catch(e) {}
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = proctored.map(int => {
        const features = [];
        const s = int.proctorSettings || {};
        if (s.camera) features.push('📹');
        if (s.eyeTracking) features.push('👁️');
        if (s.tabSwitch) features.push('🔄');
        if (s.screenRecord) features.push('🖥️');
        if (s.browserLock) features.push('🔒');
        if (s.audioMonitor) features.push('🎤');
        const link = int.token ? getInterviewLink(int.token) : null;
        return `
            <tr>
                <td><strong>${escapeHtml(int.candidateName)}</strong></td>
                <td>${escapeHtml(int.position)}</td>
                <td>${formatDate(int.date)} ${formatTime(int.startTime)}</td>
                <td>
                    ${link ? `
                        <div class="token-badge" style="margin-bottom:4px;">${int.token.slice(0,10)}…</div>
                        <button class="btn-sm-action link-btn" onclick="copyToClipboard('${link}','Proctored Link')" style="font-size:0.75rem;">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                    ` : '—'}
                </td>
                <td>${features.length > 0 ? features.join(' ') : 'Default'}</td>
                <td><span style="font-weight:600;color:var(--success);">0</span></td>
                <td><span class="status-badge ${int.status}">${capitalize(int.status)}</span></td>
                <td>
                    <button class="btn-sm-action view" title="Monitor" onclick="startProctoredMonitor('${int.id}')"><i class="fas fa-desktop"></i></button>
                    <button class="btn-sm-action notify" title="Notify" onclick="openSendNotifModal('${int.id}')"><i class="fas fa-paper-plane"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderResultsTable() {
    const tbody = document.getElementById('resultsTableBody');
    const emptyState = document.getElementById('resultsEmptyState');
    if (!tbody) return;
    const completed = appData.interviews.filter(i => i.status === 'completed');
    if (completed.length === 0) {
        try { tbody.closest('table').style.display = 'none'; } catch(e) {}
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    try { tbody.closest('table').style.display = 'table'; } catch(e) {}
    if (emptyState) emptyState.style.display = 'none';
    tbody.innerHTML = completed.map(int => `
        <tr>
            <td><strong>${escapeHtml(int.candidateName)}</strong></td>
            <td>${escapeHtml(int.position)}</td>
            <td>${escapeHtml(int.round)}</td>
            <td>${formatDate(int.date)}</td>
            <td>${int.score || 'Pending'}</td>
            <td>${int.recommendation || 'Awaiting feedback'}</td>
            <td>${escapeHtml((int.interviewer || 'Unassigned').split('(')[0].trim())}</td>
            <td><button class="btn-sm-action view" onclick="viewInterview('${int.id}')"><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('');
}

function updateInterviewCounts() {
    const scheduled = appData.interviews.filter(i => i.status === 'scheduled').length;
    const completed = appData.interviews.filter(i => i.status === 'completed').length;
    const cancelled = appData.interviews.filter(i => i.status === 'cancelled').length;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('upcomingCount', scheduled);
    set('completedCount', completed);
    set('cancelledCount', cancelled);
}

function populatePositionDropdown() {
    const select = document.getElementById('intPosition');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">Select Position</option>';
    appData.jobs.filter(j => j.status === 'open').forEach(job => {
        const opt = document.createElement('option');
        opt.value = job.title;
        opt.textContent = job.title;
        opt.dataset.jobId = job.id;
        opt.dataset.description = job.description;
        opt.dataset.skills = job.skills;
        select.appendChild(opt);
    });
    const otherOpt = document.createElement('option');
    otherOpt.value = 'Other';
    otherOpt.textContent = 'Other / Not Listed';
    select.appendChild(otherOpt);
    if (currentVal) select.value = currentVal;
}

function refreshTimeSlots() {
    const dateInput = document.getElementById('intDate');
    const selectedDate = dateInput?.value || '';
    if (!selectedDate) return;
    const bookedTimes = appData.interviews
        .filter(i => i.date === selectedDate && i.status === 'scheduled')
        .map(i => i.startTime);

    document.querySelectorAll('#timeSlots .time-slot').forEach(slot => {
        const match = (slot.getAttribute('onclick') || '').match(/selectTimeSlot\('(\d{2}:\d{2})'/);
        if (match) {
            const slotTime = match[1];
            if (bookedTimes.includes(slotTime)) {
                slot.classList.add('booked');
                slot.classList.remove('selected');
            } else {
                slot.classList.remove('booked');
            }
        }
    });
}

function selectTimeSlot(start, end, el) {
    if (el.classList.contains('booked')) { showToast('This time slot is already booked', 'error'); return; }
    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    const s = document.getElementById('intStartTime');
    const e = document.getElementById('intEndTime');
    if (s) s.value = start;
    if (e) e.value = end;
}

function switchInterviewTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.custom-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById('interviewTab-' + tabName);
    if (tab) tab.classList.add('active');
    if (el) el.classList.add('active');
}

// ===== HANDLE CREATE JOB =====
async function handleCreateJob(e, status = 'open') {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof canPerformTrialAction === 'function') {
        const allowed = await canPerformTrialAction('create_job');
        if (!allowed) return false;
    }
    const btn = e.target.closest('button');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const title      = document.getElementById('jobTitle')?.value.trim();
    const department = document.getElementById('jobDepartment')?.value;
    const location   = document.getElementById('jobLocation')?.value.trim();
    const type       = document.getElementById('jobType')?.value;
    const experience = document.getElementById('jobExperience')?.value;
    const salaryMin  = document.getElementById('salaryMin')?.value.trim();
    const salaryMax  = document.getElementById('salaryMax')?.value.trim();
    const skills     = document.getElementById('jobSkills')?.value.trim();
    const notes      = document.getElementById('jobNotes')?.value.trim();
    const jdOutput   = document.getElementById('jdOutput');
    let description = jdOutput ? jdOutput.innerText.trim() : '';

    const synLinkedIn = document.getElementById('synLinkedIn')?.checked;
    const synIndeed = document.getElementById('synIndeed')?.checked;
    const syndication_targets = [];
    if (synLinkedIn) syndication_targets.push("linkedin");
    if (synIndeed) syndication_targets.push("indeed");

    const autoShortlist = document.getElementById('jobAutoShortlist')?.checked;
    if (autoShortlist) {
        description += '\n<!-- SIMPATICO_AUTO_SHORTLIST:TRUE -->';
    }

    if (!title || !department || !location) {
        showToast('Please fill in Job Title, Department, and Location', 'error');
        btn.disabled = false; btn.innerHTML = origHtml;
        return false;
    }

    const user = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
    const editJobId = document.getElementById('editJobId')?.value;
    const isEdit = !!editJobId;

    const newJob = {
        title, category: department, department, location,
        employment_type: type,
        experience_min: experience ? parseFloat(experience) || null : null,
        salary_min: salaryMin ? parseFloat(salaryMin) : null,
        salary_max: salaryMax ? parseFloat(salaryMax) : null, 
        skills_required: skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        description: notes ? (description + '\n\nNotes: ' + notes) : description,
        status, 
        company_id: user.tenant_id || user.company_id,
        syndication_targets
    };

    try {
        let insertedData;
        let syndicationResult = null;

        if (isEdit) {
            // Edits go direct to Supabase (no syndication needed on updates)
            const { data, error } = await SimpaticoDB.from('jobs').update(newJob).eq('id', editJobId).select();
            if (error) throw error;
            insertedData = data;
        } else {
            // NEW jobs route through the Worker backend so syndication fires
            const workerUrl = window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';
            const tenantId = typeof getCompanyId === 'function' ? getCompanyId() : (user.tenant_id || user.company_id || 'default');

            // Get a fresh auth token from the live Supabase session
            let freshToken = '';
            if (window.SimpaticoDB?.auth?.getSession) {
                try {
                    const { data: sessionData } = await SimpaticoDB.auth.getSession();
                    freshToken = sessionData?.session?.access_token || '';
                } catch(tokenErr) { console.warn('[CreateJob] Session refresh failed:', tokenErr.message); }
            }
            if (!freshToken && typeof getAuthToken === 'function') {
                freshToken = getAuthToken();
            }

            const headers = { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId };
            if (freshToken) headers['Authorization'] = 'Bearer ' + freshToken;
            if (window.SIMPATICO_CONFIG?.supabaseAnonKey) headers['apikey'] = window.SIMPATICO_CONFIG.supabaseAnonKey;

            const res = await fetch(`${workerUrl}/recruitment/jobs`, {
                method: 'POST',
                headers,
                body: JSON.stringify(newJob)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error?.message || `Server error (${res.status})`);
            }

            const resJson = await res.json();
            const jobData = resJson.data?.job || resJson.job;
            insertedData = jobData ? [jobData] : [];
            syndicationResult = resJson.data?.syndication || null;
        }

        DataStore.update(state => {
            if (Array.isArray(state.jobs)) {
                if (isEdit) {
                    const idx = state.jobs.findIndex(j => j.id === editJobId);
                    if (idx !== -1) state.jobs[idx] = insertedData[0] || newJob;
                } else {
                    state.jobs.unshift(insertedData[0] || newJob);
                }
            }
            state.activities.unshift({
                type: 'job',
                title: isEdit ? `Job Updated: ${title}` : `Job Posted: ${title}`,
                description: `${department} · ${location} · ${type}`,
                timestamp: Date.now()
            });
        });

        appData = DataStore.get();
        await syncWithSupabase();
        renderJobTable();
        renderDashboardStats();
        renderDashboardActivities();
        populatePositionDropdown();
        closeModal('createJobModal');
        document.getElementById('createJobForm')?.reset();
        const jd = document.getElementById('jdOutput');
        if (jd) { jd.innerText = ''; jd.style.display = 'none'; }
        
        let msg = status === 'draft' ? '📝 Job saved as draft' : `✅ Job "${title}" published successfully!`;
        if (isEdit) msg = `✅ Job "${title}" updated successfully!`;
        showToast(msg);

        // Show syndication feedback if platforms were targeted
        if (syndicationResult && syndicationResult.platforms_queued && syndicationResult.platforms_queued.length > 0) {
            const platformNames = syndicationResult.platforms_queued.map(p => p === 'linkedin' ? 'LinkedIn' : p === 'indeed' ? 'Indeed' : p).join(' & ');
            setTimeout(() => showToast(`📡 Syndication queued → ${platformNames}`, 'success'), 800);
        } else if (!isEdit && syndication_targets.length > 0) {
            const platformNames = syndication_targets.map(p => p === 'linkedin' ? 'LinkedIn' : p === 'indeed' ? 'Indeed' : p).join(' & ');
            setTimeout(() => showToast(`📡 Syndication queued → ${platformNames}`, 'success'), 800);
        }

        // Construct dynamic LinkedIn sharing URL for manual posting since API is closed
        if (!isEdit && syndication_targets.includes('linkedin') && insertedData?.[0]?.id) {
            const jobId = insertedData[0].id;
            const jobUrl = window.location.origin + '/job-apply.html?job_id=' + jobId + '&role=' + encodeURIComponent(title);
            const shareText = `We are hiring for a ${title}!\n\n📍 Location: ${location}\n👔 Employment: ${type}\n\nApply now: ${jobUrl}\n\n#hiring #${title.replace(/\s+/g, '')} #jobs`;
            const linkedInShareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
            
            setTimeout(() => {
                showToast('🚀 Opening LinkedIn for manual sharing...', 'info');
                window.open(linkedInShareUrl, '_blank', 'noopener,noreferrer');
            }, 1800);
        }
    } catch (err) {
        showToast('Error saving job: ' + err.message, 'error');
        console.error(err);
    } finally {
        btn.disabled = false; btn.innerHTML = origHtml;
    }
    return false;
}

// ===== HANDLE SCHEDULE INTERVIEW =====
async function handleScheduleInterview(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof canPerformTrialAction === 'function') {
        const allowed = await canPerformTrialAction('create_interview');
        if (!allowed) return false;
    }
    const user = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
    const candidateName     = document.getElementById('intCandidateName')?.value.trim();
    const candidateEmail    = document.getElementById('intCandidateEmail')?.value.trim();
    const phoneCode         = document.getElementById('intPhoneCode')?.value || '+91';
    const candidatePhoneRaw = document.getElementById('intCandidatePhone')?.value.trim();
    const candidatePhone    = candidatePhoneRaw ? phoneCode + candidatePhoneRaw.replace(/^0/, '') : '';
    const position          = document.getElementById('intPosition')?.value;
    const round             = document.getElementById('intRound')?.value;
    const date              = document.getElementById('intDate')?.value;
    const startTime         = document.getElementById('intStartTime')?.value;
    const endTime           = document.getElementById('intEndTime')?.value;
    const interviewer       = document.getElementById('intInterviewer')?.value;
    const interviewerEmail  = document.getElementById('intInterviewerEmail')?.value.trim();
    const mode              = document.getElementById('intMode')?.value || selectedInterviewMode;
    const meetingLink       = document.getElementById('intMeetingLink')?.value.trim();
    const notes             = document.getElementById('intNotes')?.value.trim();
    const sendEmail         = document.getElementById('intSendEmail')?.checked;
    const sendInterviewerEmail = document.getElementById('intSendInterviewerEmail')?.checked;
    const sendWhatsApp      = activeChannels.has('whatsapp') && document.getElementById('intSendWhatsApp')?.checked;

    const missing = [];
    if (!candidateName)  missing.push('Candidate Name');
    if (!candidateEmail) missing.push('Candidate Email');
    if (!position)       missing.push('Position');
    if (!round)          missing.push('Interview Round');
    if (!date)           missing.push('Date');
    if (!startTime)      missing.push('Start Time');
    if (!endTime)        missing.push('End Time');
    if (!interviewer)    missing.push('Interviewer');

    if (missing.length > 0) {
        showToast('Missing: ' + missing.join(', '), 'error');
        return;
    }

    if (!mode) {
        showToast('Please select an Interview Mode', 'error');
        return;
    }

    if (sendWhatsApp && !candidatePhone) {
        showToast('⚠️ Enter candidate phone number for WhatsApp notification', 'warning');
    }

    const token = generateInterviewToken();
    const interviewLink = getInterviewLink(token);

    const proctorSettings = mode === 'proctored' ? {
        camera:       document.getElementById('proctorCamera')?.checked || false,
        eyeTracking:  document.getElementById('proctorEyeTracking')?.checked || false,
        screenRecord: document.getElementById('proctorScreenRecord')?.checked || false,
        tabSwitch:    document.getElementById('proctorTabSwitch')?.checked || false,
        browserLock:  document.getElementById('proctorBrowserLock')?.checked || false,
        audioMonitor: document.getElementById('proctorAudioMonitor')?.checked || false,
        maxViolations: parseInt(document.getElementById('proctorMaxViolations')?.value) || 5
    } : null;

    // Get the selected job's full data (JD, skills, etc.) for the AI engine
    const selectedJobOption = document.getElementById('intPosition');
    const selectedJobId = selectedJobOption?.selectedOptions?.[0]?.dataset?.jobId || null;
    const selectedJobDesc = selectedJobOption?.selectedOptions?.[0]?.dataset?.description || '';
    const selectedJobSkills = selectedJobOption?.selectedOptions?.[0]?.dataset?.skills || '';
    const language = document.getElementById('intLanguage')?.value || 'en-IN';
    const experienceLevel = document.getElementById('intExperienceLevel')?.value || 'mid';

    // DB Payload aligned with exact schema
    const dbPayload = {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        candidate_phone: candidatePhone,
        interview_role: position,
        interview_level: round,
        interview_type: mode === 'proctored' ? 'ai_voice' : 'human_live',
        token_type: mode === 'proctored' ? 'shortlist' : 'custom',
        token,
        status: mode === 'proctored' ? 'pending' : 'scheduled',
        job_id: selectedJobId,
        company_id: user.company_id || user.tenant_id || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        question_count: 5,
        max_attempts: 1
    };

    // Local Payload for immediate UI rendering (camelCase API expectations)
    const localPayload = {
        id: crypto.randomUUID(), // Fallback ID
        candidateName, candidateEmail, candidatePhone,
        position, round, date, startTime, endTime,
        interviewer, interviewerEmail: interviewerEmail || '', 
        mode, meetingLink, notes,
        proctorSettings, token, interviewLink, job_id: selectedJobId, status: 'scheduled'
    };

    try {
        const { data, error } = await SimpaticoDB.from('interviews').insert([dbPayload]).select();
        if (error) throw error;

        if (data && data.length > 0) localPayload.id = data[0].id;

        DataStore.update(data => {
            data.interviews.unshift(localPayload);
            data.activities.unshift({
                type: mode === 'proctored' ? 'proctored' : 'interview',
                title: `Interview Scheduled: ${candidateName}`,
                description: `${position} · ${round} · ${formatDate(date)} ${formatTime(startTime)} · ${mode === 'proctored' ? '🔒 Proctored' : mode}`,
                timestamp: Date.now()
            });
        });

        appData = DataStore.get();
        await syncWithSupabase();
    renderInterviewTable();
    renderProctoredTable();
    renderDashboardStats();
    renderDashboardInterviews();
    renderDashboardActivities();
    updateInterviewCounts();

    document.getElementById('scheduleInterviewForm')?.reset();
    document.getElementById('intMode').value = '';
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('proctoredSettings').classList.remove('visible');
    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
    selectedInterviewMode = '';
    document.getElementById('waPreviewBox').style.display = 'none';
    activeChannels = new Set(['email']);
    document.getElementById('channelEmail').classList.add('selected');
    document.getElementById('channelWhatsApp').classList.remove('selected');
    document.getElementById('notifEmailSection').style.display = 'block';
    document.getElementById('notifWASection').style.display = 'none';

    closeModal('scheduleInterviewModal');
    saveInterviewerSuggestion(interviewer);

    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerHTML = `
        <i class="fas fa-check-circle" style="color:var(--success);font-size:1.2rem;"></i>
        <div>
            <div style="font-weight:600;">Interview scheduled!</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">Token: <code>${token.slice(0,12)}…</code></div>
        </div>
        <button onclick="copyToClipboard('${interviewLink}','Interview Link')" style="background:var(--primary);color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.78rem;flex-shrink:0;">
            <i class="fas fa-copy"></i> Copy Link
        </button>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.transition='opacity 0.3s'; toast.style.opacity='0'; setTimeout(()=>toast.remove(),300); }, 8000);

    if (sendEmail || sendInterviewerEmail) {
        const recipientType = sendEmail && sendInterviewerEmail ? 'both' : sendEmail ? 'candidate' : 'interviewer';
        sendEmailNotification({ ...localPayload, interviewLink, token }, recipientType).then(result => {
            DataStore.update(data => {
                const stored = data.interviews.find(i => i.id === localPayload.id);
                if (stored) {
                    stored.notificationLog = stored.notificationLog || [];
                    stored.notificationLog.push({ type: 'email', success: result.success, timestamp: Date.now(), recipients: recipientType });
                    data.activities.unshift({
                        type: 'email',
                        title: `Email Sent: ${candidateName}`,
                        description: `Interview invite sent · ${result.success ? '✅ Delivered' : '❌ Failed'}`,
                        timestamp: Date.now()
                    });
                }
            });
            appData = DataStore.get();
            renderInterviewTable();

            if (!result.success) {
                showToast(`⚠️ Email delivery issue: ${result.reason || 'Check worker logs'}`, 'warning');
            } else {
                showToast('✉️ Email notification sent successfully!');
            }
        });
    }

    if (sendWhatsApp && candidatePhone) {
        const intWithLink = { ...localPayload, interviewLink, token };
        setTimeout(async () => {
            const result = await sendWhatsAppNotification(intWithLink);
            DataStore.update(data => {
                const stored = data.interviews.find(i => i.id === localPayload.id);
                if (stored) {
                    stored.notificationLog = stored.notificationLog || [];
                    stored.notificationLog.push({ type: 'whatsapp', success: result.success, method: result.method, timestamp: Date.now() });
                    data.activities.unshift({
                        type: 'whatsapp',
                        title: `WhatsApp Sent: ${candidateName}`,
                        description: `Interview invite sent via WhatsApp · ${result.success ? '✅ Sent' : '❌ Failed'}`,
                        timestamp: Date.now()
                    });
                }
            });
            appData = DataStore.get();
            renderInterviewTable();
            renderDashboardActivities();

            if (result.success) {
                if (result.method === 'fallback_wame') {
                    showToast('📱 WhatsApp opened — please confirm message was sent');
                } else {
                    showToast('📱 WhatsApp notification sent successfully!');
                }
            } else {
                showToast(`⚠️ WhatsApp: ${result.reason}`, 'warning');
            }
        }, 1000);
    }
    } catch (err) {
        showToast('Error scheduling interview: ' + err.message, 'error');
        console.error(err);
    }
}

function viewInterview(id) {
    const int = appData.interviews.find(i => i.id === id);
    if (!int) return;

    const link = int.interviewLink || (int.token ? getInterviewLink(int.token) : null);
    const modeLabel = { video: 'Video Call', inperson: 'In-Person', phone: 'Phone Call', proctored: '🔒 Proctored' }[int.mode] || int.mode;

    const logs = int.notificationLog || [];
    const notifLogsHtml = logs.length > 0
        ? logs.map(l => `
            <div class="notif-log-item">
                <span class="notif-icon">${l.type === 'email' ? '✉️' : '<i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i>'}</span>
                <div class="notif-text">
                    <strong>${l.type === 'email' ? 'Email' : 'WhatsApp'}</strong> —
                    ${l.success ? '<span style="color:var(--success)">✅ Sent</span>' : '<span style="color:var(--danger)">❌ Failed</span>'}
                    ${l.recipients ? ` (${l.recipients})` : ''}
                    ${l.method === 'fallback_wame' ? ' <span style="color:var(--text-secondary);font-size:0.75rem;">(via wa.me)</span>' : ''}
                </div>
                <span class="notif-time">${timeAgo(l.timestamp)}</span>
            </div>
        `).join('')
        : '<p style="color:var(--text-secondary);font-size:0.85rem;">No notifications sent yet.</p>';

    document.getElementById('interviewDetailBody').innerHTML = `
        <div class="detail-section">
            <h6><i class="fas fa-user"></i> Candidate</h6>
            <div class="detail-row"><span class="label">Name</span><span class="value">${escapeHtml(int.candidateName)}</span></div>
            <div class="detail-row"><span class="label">Email</span><span class="value">${escapeHtml(int.candidateEmail)}</span></div>
            ${int.candidatePhone ? `<div class="detail-row"><span class="label"><i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i> Phone</span><span class="value">${escapeHtml(int.candidatePhone)}</span></div>` : ''}
        </div>

        <div class="detail-section">
            <h6><i class="fas fa-calendar-check"></i> Interview Details</h6>
            <div class="detail-row"><span class="label">Position</span><span class="value">${escapeHtml(int.position)}</span></div>
            <div class="detail-row"><span class="label">Round</span><span class="value">${escapeHtml(int.round)}</span></div>
            <div class="detail-row"><span class="label">Date & Time</span><span class="value">${formatDate(int.date)} · ${formatTime(int.startTime)} – ${formatTime(int.endTime)}</span></div>
            <div class="detail-row"><span class="label">Mode</span><span class="value">${modeLabel}</span></div>
            <div class="detail-row"><span class="label">Interviewer</span><span class="value">${escapeHtml(int.interviewer)}</span></div>
            ${int.interviewerEmail ? `<div class="detail-row"><span class="label">Interviewer Email</span><span class="value">${escapeHtml(int.interviewerEmail)}</span></div>` : ''}
            ${int.meetingLink ? `<div class="detail-row"><span class="label">Meeting Link</span><span class="value"><a href="${escapeHtml(int.meetingLink)}" target="_blank" style="color:var(--primary)">${escapeHtml(int.meetingLink).slice(0,40)}…</a></span></div>` : ''}
        </div>

        ${link ? `
        <div class="detail-section">
            <h6><i class="fas fa-link"></i> Interview Token Link</h6>
            <div class="token-link-box">
                <div class="link-icon"><i class="fas fa-link"></i></div>
                <div class="link-url">${link}</div>
                <div class="link-actions">
                    <button class="btn-sm-action link-btn" onclick="copyToClipboard('${link}','Interview Link')">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <a href="${link}" target="_blank" class="btn-sm-action view" style="text-decoration:none;">
                        <i class="fas fa-external-link-alt"></i> Open
                    </a>
                </div>
            </div>
            ${int.token ? `<div style="margin-top:8px;"><span class="token-badge"><i class="fas fa-fingerprint"></i> Token: ${int.token}</span></div>` : ''}
        </div>
        ` : ''}

        <div class="detail-section">
            <h6><i class="fas fa-bell"></i> Notification History</h6>
            ${notifLogsHtml}
        </div>
    `;

    document.getElementById('interviewDetailFooter').innerHTML = `
        <button class="btn-outline-custom" data-bs-dismiss="modal">Close</button>
        <button class="btn-whatsapp" onclick="openSendNotifModal('${int.id}');closeModal('interviewDetailModal');">
            <i class="fas fa-paper-plane"></i> Resend Notification
        </button>
        ${link ? `<button class="btn-primary-custom" onclick="copyToClipboard('${link}','Interview Link')">
            <i class="fas fa-copy"></i> Copy Interview Link
        </button>` : ''}
    `;

    const modal = new bootstrap.Modal(document.getElementById('interviewDetailModal'));
    modal.show();
}

function openSendNotifModal(id) {
    const int = appData.interviews.find(i => i.id === id);
    if (!int) return;

    const link = int.interviewLink || (int.token ? getInterviewLink(int.token) : null);
    const waMsg = buildWhatsAppMessage({ ...int, interviewLink: link });

    document.getElementById('sendNotifBody').innerHTML = `
        <div style="margin-bottom:16px;">
            <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(int.candidateName)}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(int.position)} · ${escapeHtml(int.round)} · ${formatDate(int.date)} ${formatTime(int.startTime)}</div>
        </div>

        <div class="notification-channels" style="margin-bottom:16px;" id="notifModalChannels">
            <div class="channel-card selected" id="modalEmailCard" onclick="this.classList.toggle('selected')">
                <div class="channel-icon">✉️</div>
                <h6>Email</h6>
                <p>${escapeHtml(int.candidateEmail)}</p>
            </div>
            <div class="channel-card wa-card ${int.candidatePhone ? '' : ''}" id="modalWACard" onclick="this.classList.toggle('selected')">
                <div class="channel-icon"><i class="fab fa-whatsapp" style="color:var(--whatsapp);font-size:2rem;"></i></div>
                <h6>WhatsApp</h6>
                <p>${int.candidatePhone ? escapeHtml(int.candidatePhone) : 'No phone on file'}</p>
            </div>
        </div>

        ${link ? `
        <div style="margin-bottom:16px;">
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Interview Link to be sent</div>
            <div class="token-link-box" style="padding:10px;">
                <div class="link-icon" style="width:28px;height:28px;font-size:0.8rem;"><i class="fas fa-link"></i></div>
                <div class="link-url" style="font-size:0.78rem;">${link}</div>
                <button class="btn-sm-action link-btn" onclick="copyToClipboard('${link}','Interview Link')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </div>
        ` : ''}

        <div>
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">
                <i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i> WhatsApp Message Preview
            </div>
            <div class="whatsapp-preview" style="font-size:0.82rem;">${escapeHtml(waMsg)}</div>
        </div>
    `;

    document.getElementById('sendNotifFooter').innerHTML = `
        <button class="btn-outline-custom" data-bs-dismiss="modal">Cancel</button>
        <button class="btn-primary-custom" onclick="executeSendNotification('${id}')">
            <i class="fas fa-paper-plane"></i> Send Notifications
        </button>
    `;

    const modal = new bootstrap.Modal(document.getElementById('sendNotifModal'));
    modal.show();
}

async function executeSendNotification(id) {
    const int = appData.interviews.find(i => i.id === id);
    if (!int) return;

    const sendEmailChecked = document.getElementById('modalEmailCard')?.classList.contains('selected');
    const sendWAChecked = document.getElementById('modalWACard')?.classList.contains('selected');

    closeModal('sendNotifModal');
    showToast('⏳ Sending notifications…', 'info');

    const link = int.interviewLink || (int.token ? getInterviewLink(int.token) : null);
    const intWithLink = { ...int, interviewLink: link };

    if (sendEmailChecked) {
        const result = await sendEmailNotification(intWithLink, 'both');
        DataStore.update(data => {
            const stored = data.interviews.find(i => i.id === id);
            if (stored) {
                stored.notificationLog = stored.notificationLog || [];
                stored.notificationLog.push({ type: 'email', success: result.success, timestamp: Date.now(), recipients: 'both' });
            }
        });
        appData = DataStore.get();
        renderInterviewTable();
        if (result.success) {
            showToast('✉️ Email sent successfully!');
        } else {
            showToast(`⚠️ Email failed: ${result.reason}`, 'warning');
        }
    }

    if (sendWAChecked && int.candidatePhone) {
        const result = await sendWhatsAppNotification(intWithLink);
        DataStore.update(data => {
            const stored = data.interviews.find(i => i.id === id);
            if (stored) {
                stored.notificationLog = stored.notificationLog || [];
                stored.notificationLog.push({ type: 'whatsapp', success: result.success, method: result.method, timestamp: Date.now() });
            }
        });
        appData = DataStore.get();
        renderInterviewTable();
        if (result.success) {
            showToast(result.method === 'fallback_wame' ? '📱 WhatsApp opened — confirm send' : '📱 WhatsApp sent!');
        } else {
            showToast(`⚠️ WhatsApp: ${result.reason}`, 'warning');
        }
    } else if (sendWAChecked && !int.candidatePhone) {
        showToast('⚠️ No phone number on file for this candidate', 'warning');
    }
}

function filterJobs() {
    const dept   = document.getElementById('filterDept')?.value.toLowerCase() || '';
    const status = document.getElementById('filterStatus')?.value.toLowerCase() || '';
    document.querySelectorAll('#jobTableBody tr').forEach(row => {
        const rowDept   = (row.dataset.dept || '').toLowerCase();
        const rowStatus = (row.dataset.status || '').toLowerCase();
        const show = (!dept || rowDept === dept) && (!status || rowStatus === status);
        row.style.display = show ? '' : 'none';
    });
}

function viewJob(index) {
    const job = appData.jobs[index];
    if (job) showToast(`📋 ${job.title} — ${job.department} — ${job.applications || 0} applications`);
}

function editJob(index) { showToast('✏️ Edit job — coming soon', 'success'); }

function deleteJob(index) {
    if (!confirm('Delete this job posting?')) return;
    DataStore.update(data => { data.jobs.splice(index, 1); });
    appData = DataStore.get();
    renderJobTable();
    renderDashboardStats();
    populatePositionDropdown();
    showToast('🗑️ Job posting deleted');
}

function cancelInterview(id) {
    if (!confirm('Cancel this interview?')) return;
    DataStore.update(data => {
        const interview = data.interviews.find(i => i.id === id);
        if (interview) {
            interview.status = 'cancelled';
            data.activities.unshift({
                type: 'cancel',
                title: `Interview Cancelled: ${interview.candidateName}`,
                description: `${interview.position} · ${interview.round}`,
                timestamp: Date.now()
            });
        }
    });
    appData = DataStore.get();
    renderInterviewTable();
    renderProctoredTable();
    renderDashboardStats();
    renderDashboardActivities();
    updateInterviewCounts();
    showToast('Interview cancelled');
}

function viewProctorSettings(id) {
    const interview = appData.interviews.find(i => i.id === id);
    if (!interview || !interview.proctorSettings) {
        showToast('No proctoring settings found', 'error');
        return;
    }
    const s = interview.proctorSettings;
    const features = [
        s.camera       ? '📹 Camera'       : null,
        s.eyeTracking  ? '👁️ Eye Tracking' : null,
        s.tabSwitch    ? '🔄 Tab Detection' : null,
        s.screenRecord ? '🖥️ Screen Record' : null,
        s.browserLock  ? '🔒 Browser Lock'  : null,
        s.audioMonitor ? '🎤 Audio Monitor' : null,
    ].filter(Boolean);
    showToast(`🔒 ${interview.candidateName}: ${features.join(', ') || 'Default settings'}`);
}

function startProctoredSession() {
    showToast('🔒 Proctored session launcher — coming soon with Cloudflare AI integration', 'success');
}

function startProctoredMonitor(id) {
    showToast('🖥️ Live monitoring — coming soon', 'success');
}

async function generateJD() {
    const title      = document.getElementById('jobTitle')?.value.trim();
    const department = document.getElementById('jobDepartment')?.value;
    const type       = document.getElementById('jobType')?.value;
    const experience = document.getElementById('jobExperience')?.value;
    const skills     = document.getElementById('jobSkills')?.value.trim();
    const location   = document.getElementById('jobLocation')?.value.trim();

    if (!title) { showToast('Please enter a job title first', 'error'); return; }

    const output = document.getElementById('jdOutput');
    if (output) { output.style.display = 'block'; output.innerText = '⏳ Generating job description with AI…'; }

    try {
        const workerUrl = window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';
        const tenantId = typeof getCompanyId === 'function' ? getCompanyId() : 'default';

        // Get a FRESH token from the live Supabase session (auto-refreshes if expired)
        let freshToken = '';
        if (window.SimpaticoDB?.auth?.getSession) {
            try {
                const { data: sessionData } = await SimpaticoDB.auth.getSession();
                freshToken = sessionData?.session?.access_token || '';
            } catch(e) { console.warn('[JD] Session refresh failed:', e.message); }
        }
        // Fallback to localStorage token
        if (!freshToken && typeof getAuthToken === 'function') {
            freshToken = getAuthToken();
        }

        const headers = {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenantId
        };
        if (freshToken) headers['Authorization'] = 'Bearer ' + freshToken;
        if (window.SIMPATICO_CONFIG?.supabaseAnonKey) headers['apikey'] = window.SIMPATICO_CONFIG.supabaseAnonKey;

        const res = await fetch(`${workerUrl}/ai/generate-jd`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title, department, type, experience, skills, location })
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `Server error (${res.status})`);
        }

        const resJson = await res.json();
        const jdText = resJson.data?.jd || resJson.jd; 
        
        if (jdText) {
            if (output) output.innerText = jdText;
            showToast('✨ Job description generated!');
        } else {
            throw new Error('Empty response from AI');
        }
    } catch (e) {
        console.error("JD Gen Error:", e);
        if (output) {
            output.innerText = `About the Role\n\nWe are looking for a talented ${title} to join our ${department || 'team'} at Simpatico.\n\nKey Responsibilities\n• Lead and execute ${title.toLowerCase()}-related initiatives\n• Collaborate with cross-functional teams\n• Drive innovation and continuous improvement\n\nRequirements\n• ${experience || '3-5 years'} of relevant experience\n${skills ? `• Proficiency in: ${skills}\n` : ''}• Strong communication and problem-solving skills\n\nWhat We Offer\n• Competitive salary and benefits\n• Flexible working arrangements\n• Learning and development opportunities`;
        }
        showToast('⚠️ AI unavailable — template generated instead', 'warning');
    }
}
function clearJD() {
    const output = document.getElementById('jdOutput');
    if (output) { output.innerText = ''; output.style.display = 'none'; }
}

function handleGlobalSearch(e) {
    if (e.key !== 'Enter') return;
    const query = document.getElementById('globalSearch')?.value.trim().toLowerCase();
    if (!query) return;
    const jobMatch = appData.jobs.find(j => j.title.toLowerCase().includes(query));
    if (jobMatch) { navigateTo('jobPostings'); showToast(`🔍 Found: ${jobMatch.title}`); return; }
    const intMatch = appData.interviews.find(i => i.candidateName.toLowerCase().includes(query));
    if (intMatch) { navigateTo('interviews'); showToast(`🔍 Found: ${intMatch.candidateName}`); return; }
    showToast(`No results for "${query}"`, 'error');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
}

function formatTime(timeStr) {
    if (!timeStr) return '—';
    try {
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch { return timeStr; }
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days  < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    return formatDate(new Date(timestamp).toISOString().split('T')[0]);
}

// ===== CANDIDATES & APPLICATIONS TABLE =====
function renderCandidates() {
    const tbody = document.getElementById('candidatesTableBody');
    const emptyState = document.getElementById('candidatesEmptyState');
    const table = document.getElementById('candidatesTable');
    if (!tbody) return;

    // ✅ Read from job_applications (what Supabase syncs into)
    const raw = appData.job_applications || [];
    const apps = raw.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (apps.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (table) table.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (table) table.style.display = 'table';

    tbody.innerHTML = apps.map(app => {
        // ✅ Map snake_case DB columns to display
        const name   = app.candidate_name  || app.candidateName  || '—';
        const email  = app.candidate_email || app.candidateEmail || '—';
        const phone  = app.candidate_phone || app.candidatePhone || '—';
        const title  = app.jobs?.title     || app.job_role       || app.jobTitle || '—';
        const resume = app.resume_url      || app.resumeLink     || '';
        const status = app.status          || 'Pending';
        const date   = app.created_at      || app.dateApplied    || '';

        const resumeDisplay = resume
            ? `<a href="${escapeHtml(resume)}" target="_blank" style="color:var(--primary);text-decoration:none;"><i class="fas fa-external-link-alt"></i> View</a>`
            : '<span style="color:var(--text-secondary)">—</span>';

        const badgeClass = status === 'Shortlisted' ? 'active' : status === 'Rejected' ? 'cancelled' : 'pending';

        return `<tr>
            <td><strong>${escapeHtml(name)}</strong></td>
            <td><span style="font-weight:600;color:var(--primary);">${escapeHtml(title)}</span></td>
            <td>
                <div style="font-size:0.85rem;">${escapeHtml(email)}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(phone)}</div>
            </td>
            <td>${resumeDisplay}</td>
            <td>${formatDate(date.split('T')[0])}</td>
            <td><span class="status-badge ${badgeClass}">${escapeHtml(status)}</span></td>
            <td>
                <button class="btn-sm-action link-btn" onclick="updateAppStatus('${app.id}','Shortlisted')"><i class="fas fa-check"></i></button>
                <button class="btn-sm-action delete" onclick="updateAppStatus('${app.id}','Rejected')"><i class="fas fa-times"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function updateAppStatus(appId, newStatus) {
    DataStore.update(data => {
        const app = (data.job_applications || data.applications || []).find(a => a.id === appId);
        if (app) app.status = newStatus;
    });
    
    appData = DataStore.get();
    renderCandidates();
    if(window.showToast) showToast(`✅ Candidate marked as ${newStatus}`);
}
