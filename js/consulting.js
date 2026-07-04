/**
 * consulting.js — Simpatico HR Business Consulting Dashboard
 * ═══════════════════════════════════════════════════════════════
 * Multi-tenant Supabase integration with localStorage fallback.
 * Data is persisted to Supabase (tenant-scoped via RLS) with
 * localStorage as offline cache. Activity notifications are
 * logged to consulting_activity table.
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // § SUPABASE CLIENT & TENANT HELPERS
    // ═══════════════════════════════════════════════════════════
    function sb() {
        if (typeof getSupabaseClient === 'function') return getSupabaseClient();
        if (window._supabaseClient) return window._supabaseClient;
        if (window.SimpaticoDB) return window.SimpaticoDB;
        return null;
    }

    function getTenantId() {
        try {
            if (window.SIMPATICO_CONFIG && window.SIMPATICO_CONFIG.tenantId) return window.SIMPATICO_CONFIG.tenantId;
            if (typeof getCompanyId === 'function' && getCompanyId()) return getCompanyId();
            const user = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
            return user.company_id || 'SIMP_PRO_MAIN';
        } catch { return 'SIMP_PRO_MAIN'; }
    }

    function getUserInfo() {
        try {
            const user = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
            return {
                id: user.id || user.auth_id || '',
                name: user.name || user.full_name || user.email || 'Unknown',
            };
        } catch { return { id: '', name: 'Unknown' }; }
    }

    // ═══════════════════════════════════════════════════════════
    // § STORAGE LAYER — Supabase with localStorage fallback
    // ═══════════════════════════════════════════════════════════
    const TABLES = {
        projects: 'consulting_projects',
        assessments: 'consulting_assessments',
        swot: 'consulting_swot',
        kpis: 'consulting_kpis',
        documents: 'consulting_documents',
        meetings: 'consulting_meetings',
        activity: 'consulting_activity',
    };

    const LS_KEYS = {
        projects: 'sc_projects',
        swot: 'sc_swot',
        kpis: 'sc_kpis',
        documents: 'sc_documents',
        meetings: 'sc_meetings',
        assessment: 'sc_assessment_results',
        activity: 'sc_activity',
    };

    function lsLoad(key) {
        try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
    }
    function lsSave(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    // Generic Supabase fetch with fallback
    async function dbFetch(table, orderBy) {
        const client = sb();
        const cid = getTenantId();
        if (!client) return null;
        try {
            let q = client.from(table).select('*').eq('tenant_id', cid);
            if (orderBy) q = q.order(orderBy.col, { ascending: orderBy.asc !== false });
            const { data, error } = await q;
            if (error) {
                if (error.code === '42P01' || (error.message && error.message.indexOf('does not exist') !== -1)) return null;
                console.warn('[consulting] DB fetch error on ' + table + ':', error.message);
                return null;
            }
            return data;
        } catch (e) {
            console.warn('[consulting] DB fetch exception:', e);
            return null;
        }
    }

    async function dbInsert(table, record) {
        const client = sb();
        if (!client) return null;
        try {
            const { data, error } = await client.from(table).insert(record).select();
            if (error) { console.warn('[consulting] DB insert error:', error.message); return null; }
            return data;
        } catch (e) { console.warn('[consulting] DB insert exception:', e); return null; }
    }

    async function dbUpdate(table, id, updates) {
        const client = sb();
        if (!client) return null;
        try {
            const { data, error } = await client.from(table).update(updates).eq('id', id).select();
            if (error) { console.warn('[consulting] DB update error:', error.message); return null; }
            return data;
        } catch (e) { console.warn('[consulting] DB update exception:', e); return null; }
    }

    async function dbDelete(table, id) {
        const client = sb();
        if (!client) return null;
        try {
            const { error } = await client.from(table).delete().eq('id', id);
            if (error) { console.warn('[consulting] DB delete error:', error.message); return null; }
            return true;
        } catch (e) { console.warn('[consulting] DB delete exception:', e); return null; }
    }

    // ═══════════════════════════════════════════════════════════
    // § INIT
    // ═══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', async function () {
        initUserAvatar();
        // Try to load from Supabase first, fall back to localStorage
        await Promise.all([
            loadProjects(),
            loadAssessment(),
            loadSwot(),
            loadKPIs(),
            loadDocuments(),
            loadMeetings(),
            loadActivityLog(),
            loadNotifications(),
        ]);
        initCalendar();
        updateOverviewStats();
    });

    function initUserAvatar() {
        try {
            const user = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
            const name = user.name || user.full_name || user.email || 'U';
            const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('userAvatar').textContent = initials;
        } catch {
            document.getElementById('userAvatar').textContent = 'U';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // § NAVIGATION
    // ═══════════════════════════════════════════════════════════
    const sectionTitles = {
        overview: ['Overview', 'Business Consulting Dashboard'],
        assessment: ['Health Assessment', 'Evaluate your business health across 5 dimensions'],
        projects: ['Project Tracker', 'Track consulting engagements across stages'],
        scorecard: ['Strategy Scorecard', 'SWOT Analysis & KPI tracking'],
        documents: ['Document Hub', 'Manage consulting deliverables'],
        meetings: ['Meeting Scheduler', 'Schedule and track consulting sessions'],
        advisor: ['AI Business Advisor', 'Get intelligent business insights'],
    };

    window.navigateTo = function (sectionId, el) {
        document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById('section-' + sectionId);
        if (target) target.classList.add('active');
        document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
        if (el) el.classList.add('active');
        const titles = sectionTitles[sectionId] || ['Dashboard', ''];
        document.getElementById('pageTitle').textContent = titles[0];
        document.getElementById('pageTitleSub').textContent = titles[1];
        document.getElementById('sidebar').classList.remove('open');
    };

    window.toggleSidebar = function () {
        document.getElementById('sidebar').classList.toggle('open');
    };

    window.signOut = function () {
        if (confirm('Sign out of the consulting portal?')) {
            localStorage.removeItem('simpatico_token');
            localStorage.removeItem('sh_token');
            window.location.href = '../platform/login.html';
        }
    };

    // ═══════════════════════════════════════════════════════════
    // § TOAST NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════
    window.showToast = function (message, type) {
        type = type || 'info';
        const container = document.getElementById('toastContainer');
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, 3000);
    };

    // ═══════════════════════════════════════════════════════════
    // § MODALS
    // ═══════════════════════════════════════════════════════════
    window.openModal = function (id) {
        document.getElementById(id).classList.add('active');
    };

    window.closeModal = function (id) {
        document.getElementById(id).classList.remove('active');
    };

    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
        }
    });

    // ═══════════════════════════════════════════════════════════
    // § ACTIVITY LOG (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let cachedActivity = [];

    async function addActivity(title, entity, entityId) {
        const user = getUserInfo();
        const cid = getTenantId();
        const record = {
            tenant_id: cid,
            user_id: user.id,
            user_name: user.name,
            action: title,
            entity: entity || null,
            entity_id: entityId || null,
            detail: null,
            read: false,
        };

        // Save to Supabase
        const result = await dbInsert(TABLES.activity, record);

        // Also update local cache + localStorage
        cachedActivity.unshift({
            title: title,
            meta: user.name + ' • ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            ts: Date.now(),
            user_name: user.name,
        });
        if (cachedActivity.length > 20) cachedActivity.length = 20;
        lsSave(LS_KEYS.activity, cachedActivity);
        renderActivity();
        updateNotificationBadge();
    }

    async function loadActivityLog() {
        const dbData = await dbFetch(TABLES.activity, { col: 'created_at', asc: false });
        if (dbData && dbData.length) {
            cachedActivity = dbData.map(a => ({
                id: a.id,
                title: a.action,
                meta: (a.user_name || 'User') + ' • ' + new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                ts: new Date(a.created_at).getTime(),
                user_name: a.user_name,
                read: a.read,
            }));
        } else {
            cachedActivity = lsLoad(LS_KEYS.activity) || [];
        }
        renderActivity();
    }

    function renderActivity() {
        const el = document.getElementById('activityTimeline');
        if (!cachedActivity.length) {
            el.innerHTML = '<div class="timeline-item"><div class="timeline-title">Welcome to your Consulting Dashboard!</div><div class="timeline-meta">Start by taking the Business Health Assessment</div></div>';
            return;
        }
        el.innerHTML = cachedActivity.slice(0, 8).map(a => '<div class="timeline-item"><div class="timeline-title">' + escHtml(a.title) + '</div><div class="timeline-meta">' + escHtml(a.meta) + '</div></div>').join('');
    }

    // ═══════════════════════════════════════════════════════════
    // § NOTIFICATIONS BELL (real-time activity feed)
    // ═══════════════════════════════════════════════════════════
    let unreadCount = 0;

    async function loadNotifications() {
        const dbData = await dbFetch(TABLES.activity, { col: 'created_at', asc: false });
        if (dbData) {
            unreadCount = dbData.filter(n => !n.read).length;
        }
        updateNotificationBadge();
    }

    function updateNotificationBadge() {
        const badge = document.getElementById('notifBadge');
        if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    }

    window.toggleNotifications = function () {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            renderNotificationPanel();
        }
    };

    function renderNotificationPanel() {
        const list = document.getElementById('notifList');
        if (!list) return;
        if (!cachedActivity.length) {
            list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>No notifications yet</p></div>';
            return;
        }
        list.innerHTML = cachedActivity.slice(0, 15).map(a => {
            const isUnread = !a.read;
            return '<div class="notif-item' + (isUnread ? ' unread' : '') + '">' +
                '<div class="notif-icon"><i class="fas fa-circle-dot"></i></div>' +
                '<div class="notif-content">' +
                '<div class="notif-title">' + escHtml(a.title) + '</div>' +
                '<div class="notif-meta">' + escHtml(a.meta) + '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    window.markAllRead = async function () {
        const client = sb();
        const cid = getTenantId();
        if (client) {
            try {
                await client.from(TABLES.activity).update({ read: true }).eq('tenant_id', cid).eq('read', false);
            } catch (e) { console.warn('[consulting] markAllRead error:', e); }
        }
        cachedActivity.forEach(a => a.read = true);
        unreadCount = 0;
        updateNotificationBadge();
        renderNotificationPanel();
        showToast('All notifications marked as read', 'success');
    };

    // Close notification panel on outside click
    document.addEventListener('click', function (e) {
        const panel = document.getElementById('notifPanel');
        const bellBtn = document.getElementById('notifBellBtn');
        if (panel && panel.classList.contains('open') && !panel.contains(e.target) && bellBtn && !bellBtn.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    // ═══════════════════════════════════════════════════════════
    // § OVERVIEW STATS
    // ═══════════════════════════════════════════════════════════
    function updateOverviewStats() {
        document.getElementById('statProjects').textContent = cachedProjects.filter(p => p.stage !== 'completed').length;
        document.getElementById('statAssessments').textContent = cachedAssessment ? '1' : '0';
        document.getElementById('statDocuments').textContent = cachedDocuments.length;
        document.getElementById('statMeetings').textContent = cachedMeetings.filter(m => m.status === 'scheduled').length;
    }

    // ═══════════════════════════════════════════════════════════
    // § BUSINESS HEALTH ASSESSMENT
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // § BUSINESS HEALTH ASSESSMENT
    // ═══════════════════════════════════════════════════════════
    const assessmentQuestionsTranslations = {
        hi: [
            { category: 'Strategy', q: 'आपकी कंपनी की 3-5 साल की व्यावसायिक रणनीति कितनी स्पष्ट रूप से परिभाषित है?', opts: ['कोई औपचारिक रणनीति मौजूद नहीं है', 'बुनियादी योजना है लेकिन शायद ही कभी संदर्भित की जाती है', 'दस्तावेज है लेकिन अपडेट करने की आवश्यकता है', 'स्पष्ट रणनीति जिसकी वार्षिक समीक्षा की जाती है', 'तिमाही समीक्षाओं के साथ व्यापक रणनीति'] },
            { category: 'Strategy', q: 'आपकी टीम आपके प्रतिस्पर्धी लाभ को कितनी अच्छी तरह समझती है?', opts: ['परिभाषित नहीं है', 'अस्पष्ट रूप से समझा गया', 'कुछ हद तक स्पष्ट', 'नेतृत्व द्वारा अच्छी तरह से समझा गया', 'सभी स्तरों पर बिल्कुल स्पष्ट'] },
            { category: 'Operations', q: 'आपकी मुख्य व्यावसायिक प्रक्रियाएं कितनी कुशल हैं?', opts: ['ज्यादातर मैन्युअल और अव्यवस्थित', 'कुछ प्रक्रियाएं परिभाषित हैं', 'प्रमुख प्रक्रियाएं दस्तावेज में हैं', 'कुछ स्वचालन के साथ अच्छी तरह से अनुकूलित', 'पूरी तरह से अनुकूलित और निरंतर सुधारित'] },
            { category: 'Operations', q: 'आप अपनी आपूर्ति श्रृंखला या सेवा वितरण को कितने प्रभावी ढंग से प्रबंधित करते हैं?', opts: ['बार-बार व्यवधान', 'बुनियादी प्रबंधन', 'सुधार की गुंजाइश के साथ पर्याप्त', 'KPIs के साथ अच्छी तरह से प्रबंधित', 'वास्तविक समय की निगरानी के साथ सर्वश्रेष्ठ वितरण'] },
            { category: 'Finance', q: 'आपकी वित्तीय योजना और पूर्वानुमान कितना मजबूत है?', opts: ['कोई औपचारिक वित्तीय योजना नहीं', 'केवल बुनियादी बजट', 'कुछ पूर्वानुमान के साथ वार्षिक बजट', 'तिमाही रूप से अपडेट किए गए विस्तृत वित्तीय मॉडल', 'परिदृश्य योजना के साथ वास्तविक समय वित्तीय डैशबोर्ड'] },
            { category: 'Finance', q: 'आप निवेश और परियोजनाओं पर आरओआई (ROI) को कितनी अच्छी तरह ट्रैक करते हैं?', opts: ['आरओआई को कभी नहीं मापा जाता है', 'कभी-कभी समीक्षा की जाती है', 'प्रमुख निवेशों के लिए मापा जाता है', 'अधिकांश परियोजनाओं के लिए व्यवस्थित रूप से ट्रैक किया जाता है', 'सभी पहलों के लिए व्यापक आरओआई ढांचा'] },
            { category: 'Digital Maturity', q: 'आपके डिजिटल परिवर्तन का स्तर क्या है?', opts: ['ज्यादातर कागजी संचालन', 'बुनियादी डिजिटल उपकरण (ईमेल, स्प्रेडशीट)', 'कुछ क्लाउड सॉफ्टवेयर अपनाए गए', 'एकीकृत प्रणालियों के साथ डिजिटल-प्रथम', 'उन्नत विश्लेषण के साथ एआई/स्वचालन संचालित'] },
            { category: 'Digital Maturity', q: 'आप निर्णय लेने के लिए डेटा का कितने प्रभावी ढंग से उपयोग करते हैं?', opts: ['निर्णय पूरी तरह से अंतर्ज्ञान पर आधारित हैं', 'बुनियादी डेटा एकत्र किया गया लेकिन शायद ही कभी उपयोग किया गया', 'समय-समय पर कुछ रिपोर्ट तैयार की जाती हैं', 'नेतृत्व स्तर पर डेटा-सूचित निर्णय', 'संगठन भर में डेटा-संचालित संस्कृति'] },
            { category: 'HR & Culture', q: 'आप अपने कर्मचारी जुड़ाव और प्रतिधारण को कैसे रेट करेंगे?', opts: ['उच्च टर्नओवर, कम मनोबल', 'औसत से कम जुड़ाव', 'औसत — कुछ प्रतिधारण चुनौतियां', 'विकास कार्यक्रमों के साथ अच्छा जुड़ाव', 'मजबूत प्रतिधारण के साथ उत्कृष्ट संस्कृति'] },
            { category: 'HR & Culture', q: 'आपकी प्रतिभा अधिग्रहण और विकास कार्यक्रम कितने सुगठित हैं?', opts: ['कोई औपचारिक एचआर प्रक्रिया नहीं', 'केवल बुनियादी भर्ती प्रक्रिया', 'कुछ प्रशिक्षण कार्यक्रम मौजूद हैं', 'कैरियर विकास पथ के साथ संरचित भर्ती', 'उत्तराधिकार योजना के साथ विश्व स्तरीय प्रतिभा प्रबंधन'] }
        ],
        ar: [
            { category: 'Strategy', q: 'ما مدى وضوح تحديد إستراتيجية عمل شركتك لمدة 3-5 سنوات؟', opts: ['لا توجد إستراتيجية رسمية', 'خطة أساسية ولكن نادراً ما يتم الرجوع إليها', 'موثقة ولكن بحاجة للتحديث', 'إستراتيجية واضحة تتم مراجعتها سنوياً', 'إستراتيجية شاملة مع مراجعات ربع سنوية'] },
            { category: 'Strategy', q: 'ما مدى فهم فريقك لميزتك التنافسية؟', opts: ['غير محددة', 'مفهومة بشكل غامض', 'واضحة إلى حد ما', 'مفهومة جيداً من قبل القيادة', 'واضحة تماماً على جميع المستويات'] },
            { category: 'Operations', q: 'ما مدى كفاءة عمليات عملك الأساسية؟', opts: ['يدوية وفوضوية في الغالب', 'تم تحديد بعض العمليات', 'تم توثيق العمليات الرئيسية', 'محسنة جيداً مع بعض الأتمتة', 'محسنة بالكامل ويتم تطويرها باستمرار'] },
            { category: 'Operations', q: 'ما مدى فعالية إدارتك لسلسلة التوريد أو تقديم الخدمات؟', opts: ['اضطرابات متكررة', 'إدارة أساسية', 'كافية مع وجود مجال للتحسين', 'مدارة جيداً مع مؤشرات أداء رئيسية', 'تقديم خدمات الأفضل في فئتها مع مراقبة في الوقت الفعلي'] },
            { category: 'Finance', q: 'ما مدى قوة التخطيط المالي والتنبؤ لديك؟', opts: ['لا يوجد تخطيط مالي رسمي', 'ميزانية أساسية فقط', 'ميزانيات سنوية مع بعض التنبؤ', 'نماذج مالية مفصلة يتم تحديثها ربع سنوي', 'لوحات مالية في الوقت الفعلي مع تخطيط السيناريوهات'] },
            { category: 'Finance', q: 'ما مدى تتبعك لعائد الاستثمار (ROI) على المشاريع؟', opts: ['لا يتم قياس العائد المالي أبداً', 'يتمت مراجعته أحياناً', 'يتم قياسه للاستثمارات الكبرى', 'يتم تتبعه بشكل منهجي لمعظم المشاريع', 'إطار عمل شامل لعائد الاستثمار لجميع المبادرات'] },
            { category: 'Digital Maturity', q: 'ما هو مستوى التحول الرقمي لديك؟', opts: ['عمليات ورقية في الغالب', 'أدوات رقمية أساسية (البريد الإلكتروني، جداول البيانات)', 'تم اعتماد بعض البرامج السحابية', 'الرقمية أولاً مع أنظمة متكاملة', 'مدفوع بالذكاء الاصطناعي/الأتمتة مع تحليلات متقدمة'] },
            { category: 'Digital Maturity', q: 'ما مدى فعالية استخدامك للبيانات في اتخاذ القرار؟', opts: ['القرارات تعتمد فقط على الحدس', 'بيانات أساسية مجمعة ولكن نادراً ما تستخدم', 'يتم إنشاء بعض التقارير بشكل دوري', 'قرارات مدروسة بناءً على البيانات على مستوى القيادة', 'ثقافة قائمة على البيانات في جميع أنحاء المنظمة'] },
            { category: 'HR & Culture', q: 'كيف تقيم ارتباط موظفيك ومعدل الاحتفاظ بهم؟', opts: ['معدل دوران مرتفع، روح معنوية منخفضة', 'ارتباط أقل من المتوسط', 'متوسط — بعض تحديات الاحتفاظ بالموظفين', 'ارتباط جيد مع برامج التطوير', 'ثقافة ممتازة مع احتفاظ قوي بالموظفين'] },
            { category: 'HR & Culture', q: 'ما مدى هيكلة برامج استقطاب وتطوير المواهب لديك؟', opts: ['لا توجد عمليات موارد بشرية رسمية', 'عملية توظيف أساسية فقط', 'توجد بعض برامج التدريب', 'توظيف منظم مع مسارات تطوير وظيفي', 'إدارة مواهب عالمية المستوى مع تخطيط التعاقب الوظيفي'] }
        ],
        ml: [
            { category: 'Strategy', q: 'നിങ്ങളുടെ കമ്പനിയുടെ 3-5 വർഷത്തെ ബിസിനസ്സ് തന്ത്രം എത്രത്തോളം വ്യക്തമായി നിർവചിക്കപ്പെട്ടിരിക്കുന്നു?', opts: ['ഔപചാരികമായ തന്ത്രങ്ങൾ നിലവിലില്ല', 'അടിസ്ഥാന പ്ലാൻ ഉണ്ട് എന്നാൽ അപൂർവ്വമായി മാത്രമേ ഉപയോഗിക്കാറുള്ളൂ', 'രേഖപ്പെടുത്തപ്പെട്ടിട്ടുണ്ട് എന്നാൽ പുതുക്കേണ്ടതുണ്ട്', 'വർഷം തോറും അവലോകനം ചെയ്യുന്ന വ്യക്തമായ തന്ത്രം', 'ത്രൈമാസ അവലോകനങ്ങളോടെയുള്ള സമഗ്രമായ തന്ത്രം'] },
            { category: 'Strategy', q: 'നിങ്ങളുടെ മത്സരാധിഷ്ഠിത നേട്ടത്തെക്കുറിച്ച് നിങ്ങളുടെ ടീം എത്രത്തോളം മനസ്സിലാക്കുന്നുണ്ട്?', opts: ['നിർവചിക്കപ്പെട്ടിട്ടില്ല', 'വ്യക്തമല്ലാത്ത ധാരണ', 'ഒരു പരിധി വരെ വ്യക്തമാണ്', 'നേതൃത്വത്തിന് വ്യക്തമായ ധാരണയുണ്ട്', 'എല്ലാ തലങ്ങളിലും തികച്ചും വ്യക്തമാണ്'] },
            { category: 'Operations', q: 'നിങ്ങളുടെ പ്രധാന ബിസിനസ്സ് പ്രക്രിയകൾ എത്രത്തോളം കാര്യക്ഷമമാണ്?', opts: ['ഭൂരിഭാഗവും മാനുവൽ ആണ്', 'ചില പ്രക്രിയകൾ നിർവചിക്കപ്പെട്ടിട്ടുണ്ട്', 'പ്രധാന പ്രക്രിയകൾ രേഖപ്പെടുത്തപ്പെട്ടിട്ടുണ്ട്', 'ചില ഓട്ടോമേഷനുകളോടെ നന്നായി ക്രമീകരിച്ചിരിക്കുന്നു', 'പൂർണ്ണമായും ഒപ്റ്റിമൈസ് ചെയ്തതും നിരന്തരം മെച്ചപ്പെടുത്തുന്നതുമാണ്'] },
            { category: 'Operations', q: 'നിങ്ങളുടെ സപ്ലൈ ചെയിൻ അല്ലെങ്കിൽ സേവന വിതരണം എത്രത്തോളം ഫലപ്രദമായി നിങ്ങൾ കൈകാര്യം ചെയ്യുന്നു?', opts: ['പലപ്പോഴും തടസ്സങ്ങൾ ഉണ്ടാകുന്നു', 'അടിസ്ഥാനപരമായ മാനേജ്മെന്റ്', 'മെച്ചപ്പെടുത്താൻ അവസരമുള്ള തരത്തിൽ തൃപ്തികരമാണ്', 'KPI-കൾ ഉപയോഗിച്ച് നന്നായി കൈകാര്യം ചെയ്യുന്നു', 'തത്സമയ നിരീക്ഷണത്തോടെ മികച്ച സേവന വിതരണം'] },
            { category: 'Finance', q: 'നിങ്ങളുടെ സാമ്പത്തിക ആസൂത്രണവും പ്രവചനവും എത്രത്തോളം ശക്തമാണ്?', opts: ['ഔപചാരികമായ സാമ്പത്തിക ആസൂത്രണം ഇല്ല', 'അടിസ്ഥാന ബജറ്റിംഗ് മാത്രം', 'ചില പ്രവചനങ്ങളോടെയുള്ള വാർഷിക ബജറ്റുകൾ', 'ത്രൈമാസ അടിസ്ഥാനത്തിൽ പുതുക്കുന്ന വിശദമായ സാമ്പത്തിക മോഡലുകൾ', 'തത്സമയ ധനകാര്യ ഡാഷ്‌ബോർഡുകൾ'] },
            { category: 'Finance', q: 'നിക്ഷേപങ്ങളിലും പ്രോജക്റ്റുകളിലും ലഭിക്കുന്ന ലാഭം (ROI) നിങ്ങൾ എത്രത്തോളം ട്രാക്ക് ചെയ്യുന്നുണ്ട്?', opts: ['ROI ഒരിക്കലും അളക്കാറില്ല', 'അപൂർവ്വമായി അവലോകനം ചെയ്യുന്നു', 'വലിയ നിക്ഷേപങ്ങൾക്ക് മാത്രം അളക്കുന്നു', 'മിക്ക പ്രോജക്റ്റുകൾക്കും വ്യവസ്ഥാപിതമായി ട്രാക്ക് ചെയ്യുന്നു', 'എല്ലാ പദ്ധതികൾക്കും സമഗ്രമായ ROI ചട്ടക്കൂട്'] },
            { category: 'Digital Maturity', q: 'നിങ്ങളുടെ ഡിജിറ്റൽ പുരോഗതിയുടെ നിലവാരം എത്രയാണ്?', opts: ['ഭൂരിഭാഗവും പേപ്പർ അടിസ്ഥാനമാക്കിയുള്ള പ്രവർത്തനങ്ങൾ', 'അടിസ്ഥാന ഡിജിറ്റൽ ഉപകരണങ്ങൾ (ഇമെയിൽ, സ്പ്രെഡ്ഷീറ്റുകൾ)', 'ചില ക്ലൗഡ് സോഫ്റ്റ്‌വെയറുകൾ ഉപയോഗിക്കുന്നു', 'ഡിജിറ്റൽ മുൻഗണന നൽകുന്ന സംയോജിത സിസ്റ്റങ്ങൾ', 'ആധുനിക അനലിറ്റിക്സോടെയുള്ള AI/ഓട്ടോമേഷൻ അധിഷ്ഠിത പ്രവർത്തനം'] },
            { category: 'Digital Maturity', q: 'തീരുമാനങ്ങൾ എടുക്കുന്നതിന് നിങ്ങൾ ഡാറ്റ എത്രത്തോളം ഫലപ്രദമായി ഉപയോഗിക്കുന്നു?', opts: ['തീരുമാനങ്ങൾ പൂർണ്ണമായും ഊഹങ്ങളെ അടിസ്ഥാനമാക്കിയുള്ളതാണ്', 'അടിസ്ഥാന ഡാറ്റ ശേഖരിക്കുന്നുണ്ടെങ്കിലും അപൂർവ്വമായി മാത്രമേ ഉപയോഗിക്കുന്നുള്ളൂ', 'ചില റിപ്പോർട്ടുകൾ ഇടയ്ക്കിടെ തയ്യാറാക്കുന്നു', 'നേതൃത്വ തലത്തിൽ ഡാറ്റ അടിസ്ഥാനമാക്കിയുള്ള തീരുമാനങ്ങൾ', 'ഓർഗനൈസേഷനിലുടനീളം ഡാറ്റ അടിസ്ഥാനമാക്കിയുള്ള സംസ്കാരം'] },
            { category: 'HR & Culture', q: 'നിങ്ങളുടെ ജീവനക്കാരുടെ തൃപ്തിയും നിലനിർത്തലും നിങ്ങൾ എങ്ങനെ വിലയിരുത്തുന്നു?', opts: ['കൂടുതൽ ജീവനക്കാർ ജോലി ഉപേക്ഷിക്കുന്നു, കുറഞ്ഞ തൊഴിൽ സംസ്കാരം', 'ശരാശരിക്ക് താഴെയുള്ള ജീവനക്കാരുടെ തൃപ്തി', 'ശരാശരി നിലവാരം', 'വികസന പരിപാടികളോടെ മികച്ച ജീവനക്കാരുടെ തൃപ്തി', 'മികച്ച തൊഴിൽ സംസ്കാരം'] },
            { category: 'HR & Culture', q: 'നിങ്ങളുടെ പുതിയ ജീവനക്കാരെ കണ്ടെത്തലും വികസന പരിപാടികളും എത്രത്തോളം ഘടനാപരമാണ്?', opts: ['ഔപചാരികമായ HR പ്രക്രിയകൾ ഇല്ല', 'അടിസ്ഥാനപരമായ നിയമന പ്രക്രിയ മാത്രം', 'ചില പരിശീലന പരിപാടികൾ നിലവിലുണ്ട്', 'വ്യക്തമായ തൊഴിൽ പുരോഗതി പാതയോട് കൂടിയ നിയമന പ്രക്രിയ', 'മികച്ച ടാലന്റ് മാനേജ്‌മെന്റ് സിസ്റ്റം'] }
        ]
    };

    const assessmentQuestions = [
        { category: 'Strategy', icon: 'fa-chess', q: 'How clearly defined is your company\'s 3-5 year business strategy?', opts: ['No formal strategy exists', 'Basic plan but rarely referenced', 'Documented but needs updating', 'Clear strategy reviewed annually', 'Comprehensive strategy with quarterly reviews'] },
        { category: 'Strategy', icon: 'fa-chess', q: 'How well does your team understand your competitive advantage?', opts: ['Not defined', 'Vaguely understood', 'Somewhat clear', 'Well understood by leadership', 'Crystal clear across all levels'] },
        { category: 'Operations', icon: 'fa-cogs', q: 'How efficient are your core business processes?', opts: ['Mostly manual and chaotic', 'Some processes defined', 'Key processes documented', 'Well-optimized with some automation', 'Fully optimized and continuously improved'] },
        { category: 'Operations', icon: 'fa-cogs', q: 'How effectively do you manage your supply chain or service delivery?', opts: ['Frequent disruptions', 'Basic management', 'Adequate with room for improvement', 'Well-managed with KPIs', 'Best-in-class delivery with real-time monitoring'] },
        { category: 'Finance', icon: 'fa-chart-pie', q: 'How robust is your financial planning and forecasting?', opts: ['No formal financial planning', 'Basic budgeting only', 'Annual budgets with some forecasting', 'Detailed financial models updated quarterly', 'Real-time financial dashboards with scenario planning'] },
        { category: 'Finance', icon: 'fa-chart-pie', q: 'How well do you track ROI on investments and projects?', opts: ['ROI is never measured', 'Occasionally reviewed', 'Measured for major investments', 'Tracked systematically for most projects', 'Comprehensive ROI framework for all initiatives'] },
        { category: 'Digital Maturity', icon: 'fa-microchip', q: 'What is your level of digital transformation?', opts: ['Mostly paper-based operations', 'Basic digital tools (email, spreadsheets)', 'Some cloud software adopted', 'Digital-first with integrated systems', 'AI/automation-driven with advanced analytics'] },
        { category: 'Digital Maturity', icon: 'fa-microchip', q: 'How effectively do you use data for decision-making?', opts: ['Decisions are purely intuition-based', 'Basic data collected but rarely used', 'Some reports generated periodically', 'Data-informed decisions at leadership level', 'Data-driven culture across the organization'] },
        { category: 'HR & Culture', icon: 'fa-users', q: 'How would you rate your employee engagement and retention?', opts: ['High turnover, low morale', 'Below average engagement', 'Average — some retention challenges', 'Good engagement with development programs', 'Excellent culture with strong retention'] },
        { category: 'HR & Culture', icon: 'fa-users', q: 'How well-structured are your talent acquisition and development programs?', opts: ['No formal HR processes', 'Basic hiring process only', 'Some training programs exist', 'Structured hiring with career development paths', 'World-class talent management with succession planning'] },
    ];

    function getLocalizedQuestions() {
        const list = assessmentQuestionsTranslations[LANG] || [];
        return assessmentQuestions.map((eq, i) => {
            const lq = list[i] || {};
            return {
                category: lq.category || eq.category,
                icon: eq.icon,
                q: lq.q || eq.q,
                opts: lq.opts || eq.opts
            };
        });
    }

    let currentQuestion = 0;
    let answers = [];
    let cachedAssessment = null;

    async function loadAssessment() {
        const dbData = await dbFetch(TABLES.assessments, { col: 'created_at', asc: false });
        if (dbData && dbData.length) {
            const a = dbData[0];
            cachedAssessment = {
                answers: a.answers || [],
                overall: a.overall_score,
                categories: Object.entries(a.category_scores || {}).map(([k, v]) => [k, v]),
                recommendations: a.recommendations || [],
                dbId: a.id,
            };
            answers = cachedAssessment.answers;
            showResults(cachedAssessment);
        } else {
            cachedAssessment = lsLoad(LS_KEYS.assessment);
            if (cachedAssessment) {
                answers = cachedAssessment.answers || [];
                showResults(cachedAssessment);
            } else {
                buildQuestions();
            }
        }
    }

    function buildQuestions() {
        const container = document.getElementById('questionsContainer');
        const progress = document.getElementById('assessmentProgress');
        const questions = getLocalizedQuestions();

        if (progress) progress.innerHTML = questions.map((_, i) => '<div class="progress-step' + (i === 0 ? ' current' : '') + '" data-step="' + i + '"></div>').join('');

        if (container) {
            container.innerHTML = questions.map((q, i) =>
                '<div class="assessment-question' + (i === currentQuestion ? ' active' : '') + '" data-q="' + i + '">' +
                '<div class="assessment-category"><i class="fas ' + q.icon + '"></i> ' + t(q.category) + ' — ' + t('question') + ' ' + ((i % 2) + 1) + '/2</div>' +
                '<div class="assessment-q-text">' + q.q + '</div>' +
                '<div class="assessment-options">' +
                q.opts.map((opt, oi) => {
                    const isSelected = answers[i] === (oi + 1) ? ' selected' : '';
                    return '<div class="assessment-option' + isSelected + '" onclick="selectOption(' + i + ',' + (oi + 1) + ',this)">' +
                    '<div class="opt-radio"></div>' +
                    '<span>' + opt + '</span>' +
                    '</div>';
                }).join('') +
                '</div>' +
                '</div>'
            ).join('');
        }

        const nav = document.getElementById('assessmentNav');
        if (nav) nav.style.display = 'flex';
        updateNavButtons();
    }

    window.selectOption = function (qIndex, value, el) {
        el.parentElement.querySelectorAll('.assessment-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        answers[qIndex] = value;
    };

    window.nextQuestion = function () {
        if (answers[currentQuestion] === undefined) {
            showToast('Please select an answer before proceeding', 'error');
            return;
        }
        if (currentQuestion < assessmentQuestions.length - 1) {
            currentQuestion++;
            showQuestion(currentQuestion);
        } else {
            finishAssessment();
        }
    };

    window.prevQuestion = function () {
        if (currentQuestion > 0) {
            currentQuestion--;
            showQuestion(currentQuestion);
        }
    };

    function showQuestion(index) {
        document.querySelectorAll('.assessment-question').forEach(q => q.classList.remove('active'));
        const target = document.querySelector('.assessment-question[data-q="' + index + '"]');
        if (target) target.classList.add('active');

        document.querySelectorAll('.progress-step').forEach((s, i) => {
            s.classList.remove('current', 'done');
            if (i < index) s.classList.add('done');
            if (i === index) s.classList.add('current');
        });

        updateNavButtons();
    }

    function updateNavButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        if (prevBtn) {
            prevBtn.textContent = t('prev');
            prevBtn.style.visibility = currentQuestion === 0 ? 'hidden' : 'visible';
        }
        if (nextBtn) nextBtn.textContent = currentQuestion === assessmentQuestions.length - 1 ? t('finishAssessment') : t('next');
    }

    async function finishAssessment() {
        const categories = {};
        assessmentQuestions.forEach((q, i) => {
            if (!categories[q.category]) categories[q.category] = [];
            categories[q.category].push(answers[i] || 0);
        });

        const categoryScores = {};
        const categoryArr = [];
        Object.entries(categories).forEach(([cat, scores]) => {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const pct = Math.round((avg / 5) * 100);
            categoryScores[cat] = pct;
            categoryArr.push([cat, pct]);
        });

        const overall = Math.round(Object.values(categoryScores).reduce((a, b) => a + b, 0) / Object.keys(categoryScores).length);

        const recommendations = [];
        if (categoryScores['Strategy'] < 60) recommendations.push('recStrategy');
        if (categoryScores['Operations'] < 60) recommendations.push('recOperations');
        if (categoryScores['Finance'] < 60) recommendations.push('recFinance');
        if (categoryScores['Digital Maturity'] < 60) recommendations.push('recDigital');
        if (categoryScores['HR & Culture'] < 60) recommendations.push('recHR');

        cachedAssessment = { answers: answers, overall: overall, categories: categoryArr, recommendations: recommendations };

        // Save to Supabase
        const dbRecord = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            overall_score: overall,
            category_scores: categoryScores,
            answers: answers,
            recommendations: recommendations,
        };
        await dbInsert(TABLES.assessments, dbRecord);

        // Also save to localStorage
        lsSave(LS_KEYS.assessment, cachedAssessment);

        showResults(cachedAssessment);
        updateOverviewStats();
        addActivity('Completed Business Health Assessment (Score: ' + overall + '%)', 'assessment');
        showToast('Assessment complete! Score: ' + overall + '%', 'success');
    }

    function showResults(data) {
        const container = document.getElementById('questionsContainer');
        const nav = document.getElementById('assessmentNav');
        const progress = document.getElementById('assessmentProgress');

        if (nav) nav.style.display = 'none';
        if (progress) progress.innerHTML = '';

        const categories = data.categories || [];
        const overall = data.overall || 0;
        const recs = data.recommendations || [];

        const gradeClass = overall >= 80 ? 'grade-a' : overall >= 60 ? 'grade-b' : overall >= 40 ? 'grade-c' : 'grade-d';
        const gradeLetter = overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D';
        const gradeLabel = overall >= 80 ? t('excellent') : overall >= 60 ? t('good') : overall >= 40 ? t('needsImprovement') : t('critical');

        container.innerHTML =
            '<div class="assessment-results">' +
            '<div class="results-header">' +
            '<div class="results-grade ' + gradeClass + '">' +
            '<div class="grade-letter">' + gradeLetter + '</div>' +
            '<div class="grade-label">' + gradeLabel + '</div>' +
            '</div>' +
            '<div class="results-score">' +
            '<div class="score-value">' + overall + '%</div>' +
            '<div class="score-label">' + t('overallHealth') + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="results-categories">' +
            categories.map(([name, score]) => {
                const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--primary)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';
                return '<div class="result-cat">' +
                    '<div class="result-cat-header"><span>' + t(name) + '</span><span style="color:' + color + ';font-weight:700;">' + score + '%</span></div>' +
                    '<div class="kpi-bar"><div class="kpi-fill" style="width:' + score + '%;background:' + color + ';"></div></div>' +
                    '</div>';
            }).join('') +
            '</div>' +
            (recs.length ? '<div class="results-recs"><div class="results-recs-title"><i class="fas fa-lightbulb"></i> ' + t('keyRecommendations') + '</div>' +
                recs.map(r => '<div class="rec-item"><i class="fas fa-arrow-right" style="color:var(--primary);margin-right:8px;font-size:.7rem;"></i>' + t(r) + '</div>').join('') +
                '</div>' : '') +
            '<div style="text-align:center;margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
            '<button class="btn btn-secondary" onclick="retakeAssessment()"><i class="fas fa-redo"></i> ' + t('retakeAssessment') + '</button>' +
            '<button class="btn btn-primary" onclick="exportAssessmentPDF()"><i class="fas fa-file-pdf"></i> ' + t('exportPdfReport') + '</button>' +
            '</div>' +
            '</div>';

        // Draw radar chart
        setTimeout(() => drawRadar(categories), 100);
    }

    window.retakeAssessment = async function () {
        // Delete from Supabase
        if (cachedAssessment && cachedAssessment.dbId) {
            await dbDelete(TABLES.assessments, cachedAssessment.dbId);
        }
        cachedAssessment = null;
        answers = [];
        currentQuestion = 0;
        localStorage.removeItem(LS_KEYS.assessment);
        buildQuestions();
        updateOverviewStats();
    };

    function drawRadar(categories) {
        const canvas = document.getElementById('radarChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        ctx.clearRect(0, 0, W, H);

        const n = categories.length;
        if (!n) return;
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(cx, cy) - 40;
        const angleStep = (2 * Math.PI) / n;
        const startAngle = -Math.PI / 2;

        // Grid
        [0.2, 0.4, 0.6, 0.8, 1.0].forEach(level => {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = startAngle + (i % n) * angleStep;
                const x = cx + R * level * Math.cos(angle);
                const y = cy + R * level * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(139,92,246,0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
            ctx.strokeStyle = 'rgba(139,92,246,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.beginPath();
        categories.forEach(([, score], i) => {
            const val = score / 100;
            const angle = startAngle + i * angleStep;
            const x = cx + R * val * Math.cos(angle);
            const y = cy + R * val * Math.sin(angle);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(139,92,246,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        categories.forEach(([, score], i) => {
            const val = score / 100;
            const angle = startAngle + i * angleStep;
            const x = cx + R * val * Math.cos(angle);
            const y = cy + R * val * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#8b5cf6';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        ctx.fillStyle = '#475569';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        categories.forEach(([name], i) => {
            const angle = startAngle + i * angleStep;
            const lx = cx + (R + 28) * Math.cos(angle);
            const ly = cy + (R + 28) * Math.sin(angle);
            ctx.fillText(t(name), lx, ly + 4);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // § PROJECT TRACKER (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let cachedProjects = [];

    async function loadProjects() {
        const dbData = await dbFetch(TABLES.projects, { col: 'created_at', asc: false });
        if (dbData) {
            cachedProjects = dbData;
        } else {
            cachedProjects = (lsLoad(LS_KEYS.projects) || []).map(p => ({
                ...p, id: p.id || crypto.randomUUID(),
                tenant_id: getTenantId(),
            }));
        }
        renderProjects();
    }

    window.saveProject = async function () {
        const name = document.getElementById('projName').value.trim();
        if (!name) { showToast('Project name is required', 'error'); return; }

        const project = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            name: name,
            type: document.getElementById('projType').value,
            stage: document.getElementById('projStage').value,
            start_date: document.getElementById('projStart').value || new Date().toISOString().split('T')[0],
            progress: parseInt(document.getElementById('projProgress').value) || 0,
            milestone: document.getElementById('projMilestone').value.trim(),
        };

        const result = await dbInsert(TABLES.projects, project);
        if (result && result[0]) {
            cachedProjects.unshift(result[0]);
        } else {
            project.id = crypto.randomUUID();
            cachedProjects.unshift(project);
        }

        // localStorage cache
        lsSave(LS_KEYS.projects, cachedProjects);

        document.getElementById('projName').value = '';
        document.getElementById('projProgress').value = '0';
        document.getElementById('projMilestone').value = '';
        closeModal('projectModal');
        renderProjects();
        updateOverviewStats();
        addActivity('Created project: ' + name, 'project', project.id);
        showToast('Project created successfully', 'success');
    };

    function renderProjects() {
        const stages = ['discovery', 'strategy', 'execution', 'review', 'completed'];

        stages.forEach(stage => {
            const stageProjects = cachedProjects.filter(p => p.stage === stage);
            const container = document.querySelector('.kanban-cards[data-stage="' + stage + '"]');
            const countEl = document.querySelector('[data-count="' + stage + '"]');
            if (countEl) countEl.textContent = stageProjects.length;

            if (!stageProjects.length) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.78rem;opacity:.5;"><i class="fas fa-inbox" style="font-size:1.2rem;margin-bottom:6px;display:block;"></i>No projects</div>';
                return;
            }

            container.innerHTML = stageProjects.map(p =>
                '<div class="kanban-card" onclick="editProjectStage(\'' + p.id + '\')">' +
                '<div class="kanban-card-type">' + escHtml(p.type) + '</div>' +
                '<div class="kanban-card-title">' + escHtml(p.name) + '</div>' +
                '<div class="kanban-card-progress"><div class="kanban-card-progress-fill" style="width:' + p.progress + '%;"></div></div>' +
                '<div class="kanban-card-meta">' +
                '<span>' + p.progress + '% complete</span>' +
                '<span><i class="fas fa-trash" style="cursor:pointer;color:var(--danger);" onclick="event.stopPropagation();deleteProject(\'' + p.id + '\')"></i></span>' +
                '</div>' +
                (p.milestone ? '<div style="font-size:.7rem;color:var(--primary);margin-top:6px;"><i class="fas fa-flag"></i> ' + escHtml(p.milestone) + '</div>' : '') +
                '</div>'
            ).join('');
        });
    }

    window.editProjectStage = async function (id) {
        const project = cachedProjects.find(p => p.id === id);
        if (!project) return;

        const stages = ['discovery', 'strategy', 'execution', 'review', 'completed'];
        const currentIdx = stages.indexOf(project.stage);
        const nextStage = stages[Math.min(currentIdx + 1, stages.length - 1)];

        const action = prompt(
            'Project: ' + project.name +
            '\nCurrent stage: ' + project.stage.toUpperCase() +
            '\nProgress: ' + project.progress + '%' +
            '\n\nOptions:' +
            '\n1. Move to next stage (' + nextStage + ')' +
            '\n2. Update progress (enter number 0-100)' +
            '\n\nEnter 1, 2, or a progress number:'
        );

        if (action === null) return;
        if (action === '1') {
            project.stage = nextStage;
            if (nextStage === 'completed') project.progress = 100;
            addActivity('Moved "' + project.name + '" to ' + nextStage, 'project', id);
        } else {
            const num = parseInt(action === '2' ? prompt('Enter progress (0-100):') : action);
            if (!isNaN(num) && num >= 0 && num <= 100) {
                project.progress = num;
                addActivity('Updated "' + project.name + '" progress to ' + num + '%', 'project', id);
            }
        }

        // Update in Supabase
        await dbUpdate(TABLES.projects, id, { stage: project.stage, progress: project.progress, updated_at: new Date().toISOString() });
        lsSave(LS_KEYS.projects, cachedProjects);
        renderProjects();
        updateOverviewStats();
        showToast('Project updated', 'success');
    };

    window.deleteProject = async function (id) {
        if (!confirm('Delete this project?')) return;
        const proj = cachedProjects.find(p => p.id === id);
        await dbDelete(TABLES.projects, id);
        cachedProjects = cachedProjects.filter(p => p.id !== id);
        lsSave(LS_KEYS.projects, cachedProjects);
        renderProjects();
        updateOverviewStats();
        if (proj) addActivity('Deleted project: ' + proj.name, 'project');
        showToast('Project deleted', 'success');
    };

    // ═══════════════════════════════════════════════════════════
    // § SWOT ANALYSIS (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let cachedSwot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };

    async function loadSwot() {
        const dbData = await dbFetch(TABLES.swot, { col: 'created_at', asc: true });
        if (dbData && dbData.length) {
            cachedSwot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
            dbData.forEach(item => {
                if (cachedSwot[item.type]) {
                    cachedSwot[item.type].push({ id: item.id, content: item.content });
                }
            });
        } else {
            const ls = lsLoad(LS_KEYS.swot);
            if (ls) {
                cachedSwot = {
                    strengths: (ls.strengths || []).map(s => ({ id: crypto.randomUUID(), content: s })),
                    weaknesses: (ls.weaknesses || []).map(s => ({ id: crypto.randomUUID(), content: s })),
                    opportunities: (ls.opportunities || []).map(s => ({ id: crypto.randomUUID(), content: s })),
                    threats: (ls.threats || []).map(s => ({ id: crypto.randomUUID(), content: s })),
                };
            }
        }
        renderSwot();
    }

    function renderSwot() {
        ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(key => {
            const list = document.getElementById('swot-' + key);
            if (!list) return;
            const items = cachedSwot[key] || [];
            list.innerHTML = items.map((item, i) =>
                '<li class="swot-item">' +
                '<span style="color:var(--primary);font-size:.75rem;">•</span> ' +
                escHtml(typeof item === 'string' ? item : item.content) +
                '<span class="remove-btn" onclick="removeSwotItem(\'' + key + '\',' + i + ')"><i class="fas fa-times"></i></span>' +
                '</li>'
            ).join('');
        });
    }

    window.addSwotItem = async function (key, inputEl) {
        const val = inputEl.value.trim();
        if (!val) return;

        const record = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            type: key,
            content: val,
        };

        const result = await dbInsert(TABLES.swot, record);
        if (result && result[0]) {
            cachedSwot[key].push({ id: result[0].id, content: val });
        } else {
            cachedSwot[key].push({ id: crypto.randomUUID(), content: val });
        }

        inputEl.value = '';
        renderSwot();
        addActivity('Added SWOT item to ' + key, 'swot');
        showToast('Added to ' + key, 'success');
    };

    window.removeSwotItem = async function (key, index) {
        const item = cachedSwot[key][index];
        if (item && item.id) {
            await dbDelete(TABLES.swot, item.id);
        }
        cachedSwot[key].splice(index, 1);
        renderSwot();
    };

    // ═══════════════════════════════════════════════════════════
    // § KPI TRACKER (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let cachedKPIs = [];

    async function loadKPIs() {
        const dbData = await dbFetch(TABLES.kpis, { col: 'created_at', asc: false });
        if (dbData) {
            cachedKPIs = dbData;
        } else {
            cachedKPIs = lsLoad(LS_KEYS.kpis) || [];
        }
        renderKPIs();
    }

    window.saveKPI = async function () {
        const name = document.getElementById('kpiName').value.trim();
        if (!name) { showToast('KPI name is required', 'error'); return; }

        const kpi = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            name: name,
            current_value: parseFloat(document.getElementById('kpiCurrent').value) || 0,
            target_value: parseFloat(document.getElementById('kpiTarget').value) || 100,
            unit: document.getElementById('kpiUnit').value.trim() || '',
        };

        const result = await dbInsert(TABLES.kpis, kpi);
        if (result && result[0]) {
            cachedKPIs.unshift(result[0]);
        } else {
            kpi.id = crypto.randomUUID();
            cachedKPIs.unshift(kpi);
        }

        lsSave(LS_KEYS.kpis, cachedKPIs);

        document.getElementById('kpiName').value = '';
        document.getElementById('kpiCurrent').value = '0';
        document.getElementById('kpiTarget').value = '100';
        document.getElementById('kpiUnit').value = '';
        closeModal('kpiModal');
        renderKPIs();
        addActivity('Added KPI: ' + name, 'kpi');
        showToast('KPI added', 'success');
    };

    function renderKPIs() {
        const grid = document.getElementById('kpiGrid');
        const empty = document.getElementById('kpiEmpty');

        if (!cachedKPIs.length) {
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        grid.innerHTML = cachedKPIs.map(k => {
            const current = k.current_value || k.current || 0;
            const target = k.target_value || k.target || 100;
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            const color = pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
            return '<div class="kpi-item">' +
                '<div class="kpi-item-header">' +
                '<span class="kpi-name">' + escHtml(k.name) + '</span>' +
                '<span class="kpi-values">' + current + (k.unit ? k.unit : '') + ' / ' + target + (k.unit ? k.unit : '') + ' (' + pct + '%)' +
                '  <i class="fas fa-trash" style="cursor:pointer;color:var(--danger);margin-left:8px;font-size:.7rem;" onclick="deleteKPI(\'' + k.id + '\')"></i></span>' +
                '</div>' +
                '<div class="kpi-bar"><div class="kpi-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
                '</div>';
        }).join('');
    }

    window.deleteKPI = async function (id) {
        if (!confirm('Delete this KPI?')) return;
        await dbDelete(TABLES.kpis, id);
        cachedKPIs = cachedKPIs.filter(k => k.id !== id);
        lsSave(LS_KEYS.kpis, cachedKPIs);
        renderKPIs();
        showToast('KPI deleted', 'success');
    };

    // ═══════════════════════════════════════════════════════════
    // § DOCUMENT HUB (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let cachedDocuments = [];

    async function loadDocuments() {
        const dbData = await dbFetch(TABLES.documents, { col: 'created_at', asc: false });
        if (dbData) {
            cachedDocuments = dbData;
        } else {
            cachedDocuments = lsLoad(LS_KEYS.documents) || [];
        }
        renderDocuments();
    }

    window.saveDocument = async function () {
        const name = document.getElementById('docName').value.trim();
        if (!name) { showToast('Document name is required', 'error'); return; }

        const doc = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            name: name,
            category: document.getElementById('docCategory').value,
            doc_type: document.getElementById('docType').value,
            notes: document.getElementById('docNotes').value.trim(),
            file_path: (document.getElementById('docFilePath') || {}).value || '',
            file_url: (document.getElementById('docFileUrl') || {}).value || '',
            file_name: (document.getElementById('docFileName') || {}).value || '',
        };

        const result = await dbInsert(TABLES.documents, doc);
        if (result && result[0]) {
            cachedDocuments.unshift(result[0]);
        } else {
            doc.id = crypto.randomUUID();
            doc.created_at = new Date().toISOString();
            cachedDocuments.unshift(doc);
        }

        lsSave(LS_KEYS.documents, cachedDocuments);

        document.getElementById('docName').value = '';
        document.getElementById('docNotes').value = '';
        if (document.getElementById('docFilePath')) document.getElementById('docFilePath').value = '';
        if (document.getElementById('docFileUrl')) document.getElementById('docFileUrl').value = '';
        if (document.getElementById('docFileName')) document.getElementById('docFileName').value = '';
        if (document.getElementById('docUploadStatus')) document.getElementById('docUploadStatus').textContent = 'Click to upload a file';
        closeModal('documentModal');
        renderDocuments();
        updateOverviewStats();
        addActivity('Added document: ' + name, 'document');
        showToast('Document added', 'success');
    };

    let currentDocFilter = 'all';

    window.filterDocs = function (cat, btn) {
        currentDocFilter = cat;
        document.querySelectorAll('.doc-filter').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        renderDocuments();
    };

    function renderDocuments() {
        const grid = document.getElementById('docsGrid');
        const empty = document.getElementById('docsEmpty');
        const filtered = currentDocFilter === 'all' ? cachedDocuments : cachedDocuments.filter(d => d.category === currentDocFilter);

        if (!filtered.length) {
            grid.innerHTML = '';
            if (empty) { empty.style.display = 'block'; grid.appendChild(empty); }
            return;
        }
        if (empty) empty.style.display = 'none';

        const typeIcons = { pdf: 'fa-file-pdf', doc: 'fa-file-word', sheet: 'fa-file-excel', ppt: 'fa-file-powerpoint' };
        const catLabels = { proposal: 'Proposal', report: 'Report', strategy: 'Strategy', financial: 'Financial', presentation: 'Presentation' };

        grid.innerHTML = filtered.map(d => {
            const dt = d.doc_type || d.type || 'pdf';
            const date = new Date(d.created_at || d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const hasFile = d.file_url || d.file_name;
            return '<div class="doc-card">' +
                '<div class="doc-card-icon ' + dt + '"><i class="fas ' + (typeIcons[dt] || 'fa-file') + '"></i></div>' +
                '<div class="doc-card-name">' + escHtml(d.name) + '</div>' +
                '<div class="doc-card-meta">' + (catLabels[d.category] || d.category) + ' \u2022 ' + date + '</div>' +
                (d.notes ? '<div style="font-size:.75rem;color:var(--text-muted);margin-bottom:10px;">' + escHtml(d.notes) + '</div>' : '') +
                (hasFile ? '<div style="font-size:.72rem;color:var(--success);margin-bottom:8px;"><i class="fas fa-paperclip" style="margin-right:4px;"></i>' + escHtml(d.file_name || 'Attached file') + '</div>' : '') +
                '<div class="doc-card-actions">' +
                (d.file_url ? '<button class="btn btn-sm btn-primary" onclick="downloadDocument(\'' + escHtml(d.file_url) + '\',\'' + escHtml(d.file_name || d.name) + '\')"><i class="fas fa-download"></i> Download</button>' : '') +
                '<button class="btn btn-sm btn-secondary" onclick="deleteDocument(\'' + d.id + '\')"><i class="fas fa-trash"></i> Remove</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    window.deleteDocument = async function (id) {
        if (!confirm('Remove this document?')) return;
        await dbDelete(TABLES.documents, id);
        cachedDocuments = cachedDocuments.filter(d => d.id !== id);
        lsSave(LS_KEYS.documents, cachedDocuments);
        renderDocuments();
        updateOverviewStats();
        showToast('Document removed', 'success');
    };

    // ═══════════════════════════════════════════════════════════
    // § MEETING SCHEDULER (Supabase-backed)
    // ═══════════════════════════════════════════════════════════
    let calendarDate = new Date();
    let cachedMeetings = [];

    function initCalendar() {
        renderCalendar();
    }

    async function loadMeetings() {
        const dbData = await dbFetch(TABLES.meetings, { col: 'date', asc: true });
        if (dbData) {
            cachedMeetings = dbData;
        } else {
            cachedMeetings = lsLoad(LS_KEYS.meetings) || [];
        }
        renderMeetings();
    }

    window.changeMonth = function (delta) {
        calendarDate.setMonth(calendarDate.getMonth() + delta);
        renderCalendar();
    };

    function renderCalendar() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const today = new Date();

        document.getElementById('calendarMonth').textContent =
            calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const grid = document.getElementById('calendarGrid');
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let html = dayLabels.map(d => '<div class="cal-day-label">' + d + '</div>').join('');

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        const meetingDates = new Set();
        cachedMeetings.forEach(m => {
            const d = new Date(m.date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                meetingDates.add(d.getDate());
            }
        });

        for (let i = firstDay - 1; i >= 0; i--) {
            html += '<div class="cal-day other-month">' + (prevMonthDays - i) + '</div>';
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const hasMeeting = meetingDates.has(d);
            html += '<div class="cal-day' + (isToday ? ' today' : '') + (hasMeeting ? ' has-meeting' : '') + '">' + d + '</div>';
        }

        const totalCells = firstDay + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let d = 1; d <= remaining; d++) {
            html += '<div class="cal-day other-month">' + d + '</div>';
        }

        grid.innerHTML = html;
    }

    window.saveMeeting = async function () {
        const title = document.getElementById('meetTitle').value.trim();
        const date = document.getElementById('meetDate').value;
        if (!title || !date) { showToast('Title and date are required', 'error'); return; }

        const meeting = {
            tenant_id: getTenantId(),
            created_by: getUserInfo().id,
            title: title,
            date: date,
            time: document.getElementById('meetTime').value || '10:00',
            type: document.getElementById('meetType').value,
            status: document.getElementById('meetStatus').value,
            notes: document.getElementById('meetNotes').value.trim(),
        };

        const result = await dbInsert(TABLES.meetings, meeting);
        if (result && result[0]) {
            cachedMeetings.push(result[0]);
        } else {
            meeting.id = crypto.randomUUID();
            cachedMeetings.push(meeting);
        }

        cachedMeetings.sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));
        lsSave(LS_KEYS.meetings, cachedMeetings);

        document.getElementById('meetTitle').value = '';
        document.getElementById('meetDate').value = '';
        document.getElementById('meetNotes').value = '';
        closeModal('meetingModal');
        renderMeetings();
        renderCalendar();
        updateOverviewStats();
        addActivity('Scheduled meeting: ' + title, 'meeting');
        showToast('Meeting scheduled', 'success');
    };

    function renderMeetings() {
        const list = document.getElementById('meetingList');
        const empty = document.getElementById('meetingsEmpty');

        if (!cachedMeetings.length) {
            if (empty) empty.style.display = 'block';
            list.innerHTML = '';
            list.appendChild(empty);
            return;
        }
        if (empty) empty.style.display = 'none';

        const badgeClass = { scheduled: 'badge-scheduled', completed: 'badge-completed', followup: 'badge-followup' };
        const badgeLabel = { scheduled: 'Scheduled', completed: 'Completed', followup: 'Follow-up' };

        list.innerHTML = cachedMeetings.map(m => {
            const [h, min] = (m.time || '10:00').split(':');
            const hour12 = ((parseInt(h) % 12) || 12);
            const ampm = parseInt(h) >= 12 ? 'PM' : 'AM';
            const dateStr = new Date(m.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

            return '<div class="meeting-card">' +
                '<div class="meeting-time">' +
                '<div class="meeting-time-h">' + hour12 + ':' + min + '</div>' +
                '<div class="meeting-time-m">' + ampm + '</div>' +
                '</div>' +
                '<div class="meeting-divider"></div>' +
                '<div class="meeting-info">' +
                '<div class="meeting-title">' + escHtml(m.title) + '</div>' +
                '<div class="meeting-desc">' + escHtml(m.type) + ' • ' + dateStr + (m.notes ? ' • ' + escHtml(m.notes.substring(0, 40)) : '') + '</div>' +
                '</div>' +
                '<span class="meeting-badge ' + (badgeClass[m.status] || 'badge-scheduled') + '">' + (badgeLabel[m.status] || 'Scheduled') + '</span>' +
                '<button class="btn btn-icon btn-sm btn-secondary" onclick="deleteMeeting(\'' + m.id + '\')" title="Delete"><i class="fas fa-trash" style="font-size:.7rem;color:var(--danger);"></i></button>' +
                '</div>';
        }).join('');
    }

    window.deleteMeeting = async function (id) {
        if (!confirm('Delete this meeting?')) return;
        await dbDelete(TABLES.meetings, id);
        cachedMeetings = cachedMeetings.filter(m => m.id !== id);
        lsSave(LS_KEYS.meetings, cachedMeetings);
        renderMeetings();
        renderCalendar();
        updateOverviewStats();
        showToast('Meeting deleted', 'success');
    };

    // ═══════════════════════════════════════════════════════════
    // § AI BUSINESS ADVISOR
    // ═══════════════════════════════════════════════════════════
    const advisorResponsesTranslations = {
        hi: {
            swot: `**SWOT विश्लेषण गाइड:**\n\n**ताकत (Strengths)** — आपकी ताकत क्या है?\n**कमजोरियां (Weaknesses)** — आपकी कमजोरियां क्या हैं?\n**अवसर (Opportunities)** — क्या बाजार के अवसर हैं?\n**खतरे (Threats)** — क्या बाहरी खतरे हैं?\n\n💡 अपनी SWOT देखने के लिए रणनीति स्कोरकार्ड पर जाएं!`,
            growth: `**विकास रणनीतियाँ (Growth Strategies):**\n\n1. बाजार में प्रवेश करें\n2. नए बाजारों में विस्तार करें (भारत, जीसीसी)\n3. सेवाओं में सुधार करें\n4. रणनीतिक साझेदारी बनाएं`,
            market_entry: `**जीसीसी बाजार प्रवेश:**\n\n1. स्थानीय बाजार अनुसंधान\n2. व्यापार लाइसेंस और बैंक खाता खोलना\n3. स्थानीय प्रायोजक खोजना\n4. स्थानीय मार्केटिंग`,
            cost_reduction: `**लागत कम करने के उपाय:**\n\n1. प्रक्रियाओं का स्वचालन\n2. विक्रेताओं का एकीकरण\n3. हाइब्रिड/रिमोट वर्क मॉडल\n4. ऊर्जा दक्षता`,
            kpi: `**प्रमुख व्यावसायिक KPIs:**\n\n• राजस्व वृद्धि दर\n• लाभ मार्जिन\n• ग्राहक प्रतिधारण दर\n• उत्पादकता दर`,
            digital: `**डिजिटल परिवर्तन:**\n\n1. प्रौद्योगिकी ऑडिट\n2. क्लाउड सॉफ़्टवेयर उपयोग\n3. एनालिटिक्स डैशबोर्ड\n4. निरंतर नवाचार`,
            default: `यह एक बढ़िया प्रश्न है! सिम्पैटिको एचआर व्यापार सलाहकार रणनीतिक योजना, बाजार में प्रवेश, और डिजिटल परिवर्तन में आपकी सहायता के लिए तैयार हैं। अधिक जानकारी के लिए +91 954 484 2260 पर संपर्क करें या ईमेल करें: info@simpaticohr.in`
        },
        ar: {
            swot: `**تحليل SWOT:**\n\n**نقاط القوة (Strengths)** — ما هي نقاط قوتك؟\n**نقاط الضعف (Weaknesses)** — ما هي نقاط ضعفك؟\n**الفرص (Opportunities)** — ما هي الفرص المتاحة؟\n**التهديدات (Threats)** — ما هي المخاطر المحتملة؟\n\n💡 انتقل لملء SWOT في بطاقة الإستراتيجية.`,
            growth: `**إستراتيجيات النمو:**\n\n1. اختراق السوق الحالي\n2. دخول أسواق جديدة (الخليج)\n3. تطوير الخدمات والحلول\n4. شراكات إستراتيجية مجدية`,
            market_entry: `**دخول أسواق الخليج (GCC):**\n\n1. دراسة السوق المحلى\n2. تأسيس الشركة والتراخيص\n3. البحث عن كفيل محلي\n4. تسويق وتوسيع العمليات`,
            cost_reduction: `**إطار خفض التكاليف بنسبة 20%:**\n\n1. أتمتة العمليات الأساسية\n2. تفاوض سنوي مع الموردين\n3. العمل عن بعد والمختلط\n4. كفاءة استهلاك الموارد`,
            kpi: `**مؤشرات الأداء الرئيسية (KPIs):**\n\n• معدل نمو الإيرادات\n• هامش الأرباح الإجمالي\n• معدل الاحتفاظ بالعملاء\n• إنتاجية الموظفين`,
            digital: `**خارطة طريق التحول الرقمي:**\n\n1. تدقيق الأنظمة الحالية\n2. الانتقال إلى الأنظمة السحابية\n3. لوحات تحليلات البيانات\n4. الابتكار المستمر والتأهيل`,
            default: `سؤال رائع! مستشارو الأعمال في سيمباتيكو جاهزون لمساعدتكم في التخطيط الإستراتيجي، دخول الأسواق، والتحول الرقمي. لمزيد من المعلومات يرجى التواصل عبر: info@simpaticohr.in`
        },
        ml: {
            swot: `**SWOT വിശകലനം:**\n\n**ശക്തികൾ (Strengths)** — നിങ്ങളുടെ മികച്ച കഴിവുകൾ\n**ബലഹീനതകൾ (Weaknesses)** — മെച്ചപ്പെടുത്തേണ്ട കാര്യങ്ങൾ\n**അവസരങ്ങൾ (Opportunities)** — പുതിയ വിപണി സാധ്യതകൾ\n**ഭീഷണികൾ (Threats)** — ബാഹ്യമായ വെല്ലുവിളികൾ\n\n💡 നിങ്ങളുടെ SWOT പൂർത്തിയാക്കാൻ സ്ട്രാറ്റജി സ്കോർകാർഡ് സന്ദർശിക്കുക.`,
            growth: `**ബിസിനസ്സ് വളർച്ചാ തന്ത്രങ്ങൾ:**\n\n1. വിപണി വ്യാപിപ്പിക്കുക\n2. പുതിയ വിപണികളിലേക്ക് പ്രവേശിക്കുക (ഇന്ത്യ, ഗൾഫ്)\n3. പുതിയ സേവനങ്ങൾ നൽകുക\n4. തന്ത്രപരമായ പങ്കാളിത്തം`,
            market_entry: `**ഗൾഫ് വിപണി പ്രവേശന ചെക്ക്‌ലിസ്റ്റ്:**\n\n1. പ്രാദേശിക വിപണി ഗവേഷണം\n2. ബിസിനസ്സ് ലൈസൻസും ബാങ്ക് അക്കൗണ്ടും\n3. ലോക്കൽ സ്പോൺസർ കണ്ടെത്തൽ\n4. പ്രാദേശിക പരസ്യങ്ങൾ`,
            cost_reduction: `**ചെലവ് കുറയ്ക്കാനുള്ള വഴികൾ:**\n\n1. പ്രവർത്തനങ്ങളുടെ ഓട്ടോമേഷൻ\n2. വെണ്ടർ ഒപ്റ്റിമൈസേഷൻ\n3. റിമോട്ട്/ഹൈബ്രിഡ് ജോലിരീതി\n4. കാര്യക്ഷമമായ വിഭവ വിനിയോഗം`,
            kpi: `**പ്രധാന ബിസിനസ്സ് KPI-കൾ:**\n\n• വരുമാന വളർച്ചാ നിരക്ക്\n• ലാഭത്തിന്റെ അളവ്\n• കസ്റ്റമർ റിട്ടൻഷൻ റേറ്റ്\n• ഉൽപ്പാദനക്ഷമത നിരക്ക്`,
            digital: `**ഡിജിറ്റൽ പുരോഗതിയുടെ ഘട്ടങ്ങൾ:**\n\n1. സിസ്റ്റം ഓഡിറ്റ്\n2. ക്ലൗഡ് സോഫ്റ്റ്‌വെയറുകൾ\n3. ഡാറ്റാ അനലിറ്റിക്സ്\n4. പുതിയ സാങ്കേതിക വിദ്യകൾ`,
            default: `വളരെ നല്ലൊരു ചോദ്യം! സ്ട്രാറ്റജിക് പ്ലാനിംഗ്, ഗൾഫ് മാർക്കറ്റ് എൻട്രി, ഡിജിറ്റൽ ട്രാൻസ്ഫർമേഷൻ എന്നിവയിൽ സഹായിക്കാൻ സിംപാറ്റിക്കോ കൺസൾട്ടന്റുമാർ ലഭ്യമാണ്. കൂടുതൽ വിവരങ്ങൾക്ക്: info@simpaticohr.in`
        }
    };

    const advisorResponses = {
        swot: `Based on best practices, here's how to analyze your SWOT:\n\n**Strengths** — What do you do better than competitors? What unique resources do you have?\n**Weaknesses** — Where do you lose money? What can competitors exploit?\n**Opportunities** — What market trends favor you? Are there unserved customer segments?\n**Threats** — What regulations are changing? Are competitors gaining ground?\n\n📌 **Action Items:**\n1. List 5 items for each quadrant\n2. Prioritize by impact (high/medium/low)\n3. Map strengths to opportunities (SO strategies)\n4. Create mitigation plans for threats × weaknesses\n\n💡 Go to your **Strategy Scorecard** to fill in your SWOT right now!`,

        growth: `Here are proven growth strategies for SMEs in India:\n\n**1. Market Penetration**\n• Increase marketing spend in existing markets\n• Loyalty programs to boost repeat business\n• Competitive pricing strategies\n\n**2. Market Development**\n• Expand to Tier 2/3 cities\n• Enter GCC markets (UAE, Saudi — high demand)\n• Digital channels (e-commerce, SaaS)\n\n**3. Product Development**\n• Add complementary services\n• Create premium/enterprise tiers\n• Build recurring revenue models\n\n**4. Strategic Partnerships**\n• Industry associations\n• Technology partners\n• Channel partnerships\n\n📊 **Key Metrics to Track:** Revenue growth rate, customer acquisition cost, lifetime value, market share.\n\n💡 Need a customized growth plan? Contact Simpatico HR's business consultancy team!`,

        market_entry: `**GCC Market Entry Checklist:**\n\n**Phase 1: Research (Month 1-2)**\n☐ Market sizing and opportunity analysis\n☐ Competitor landscape mapping\n☐ Regulatory requirements review\n☐ Cultural considerations assessment\n☐ Pricing strategy research\n\n**Phase 2: Legal Setup (Month 2-4)**\n☐ Choose business structure (LLC, Free Zone, Branch)\n☐ Trade license application\n☐ Bank account setup\n☐ VAT registration (UAE: 5%)\n☐ Employment visa processing\n\n**Phase 3: Operations (Month 3-6)**\n☐ Local partner/sponsor identification\n☐ Office space or virtual office setup\n☐ Hire local talent (Emiratization/Saudization quotas)\n☐ Supply chain and logistics setup\n☐ Insurance and compliance\n\n**Phase 4: Go-to-Market (Month 4-6)**\n☐ Localized marketing materials (Arabic + English)\n☐ Digital presence (local domains, social media)\n☐ Attend industry events (GITEX, GISEC)\n☐ Launch partnerships and pilot customers\n\n💡 Simpatico HR specializes in India→GCC corridors. Book a free consultation!`,

        cost_reduction: `**20% Cost Reduction Framework:**\n\n**1. Process Automation (Save 15-30%)**\n• Automate invoicing and billing\n• Digital document management\n• Automated reporting dashboards\n• HR automation (payroll, attendance, leave)\n\n**2. Vendor Optimization (Save 10-20%)**\n• Renegotiate contracts annually\n• Consolidate vendors for volume discounts\n• Switch to SaaS (reduce IT infrastructure costs)\n• Competitive bidding for all major purchases\n\n**3. Workforce Optimization (Save 10-15%)**\n• Cross-training for multi-skilled teams\n• Remote/hybrid work (reduce office costs)\n• Performance-based compensation\n• Outsource non-core functions\n\n**4. Energy & Operations (Save 5-10%)**\n• Energy-efficient equipment\n• Lean methodology implementation\n• Inventory optimization\n• Preventive maintenance programs\n\n📌 **Quick Wins:** Start with process automation — highest ROI with minimal disruption.\n\n💡 Use the **KPI Tracker** in Strategy Scorecard to monitor cost reduction progress!`,

        kpi: `**Essential KPIs by Business Function:**\n\n**Financial KPIs**\n• Revenue Growth Rate — Target: 15-25% YoY\n• Gross Profit Margin — Target: 40-60%\n• Customer Acquisition Cost (CAC)\n• Customer Lifetime Value (LTV)\n• LTV:CAC Ratio — Target: 3:1 or higher\n\n**Operational KPIs**\n• Employee Productivity (revenue per employee)\n• Process Cycle Time\n• Quality/Defect Rate\n• Capacity Utilization\n\n**Customer KPIs**\n• Net Promoter Score (NPS) — Target: 50+\n• Customer Retention Rate — Target: 85%+\n• Customer Satisfaction (CSAT)\n• Response Time\n\n**Growth KPIs**\n• Monthly Active Users/Customers\n• Pipeline Value\n• Conversion Rate\n• Market Share\n\n📌 **Pro Tip:** Start with 5-7 KPIs maximum. Too many KPIs dilute focus.\n\n💡 Add these to your **KPI Tracker** in the Strategy Scorecard!`,

        digital: `**Digital Transformation Roadmap:**\n\n**Stage 1: Foundation (Month 1-3)**\n• Audit current technology stack\n• Identify manual processes for automation\n• Cloud migration assessment\n• Cybersecurity baseline audit\n• Staff digital literacy training\n\n**Stage 2: Core Digitization (Month 3-6)**\n• Implement cloud ERP/CRM\n• Digitize document management\n• Automate finance (invoicing, expense tracking)\n• Set up HR automation (Simpatico HR platform!)\n• Build data collection infrastructure\n\n**Stage 3: Intelligence (Month 6-12)**\n• Business analytics dashboards\n• AI-powered decision support\n• Customer experience personalization\n• Predictive analytics implementation\n• Process mining for optimization\n\n**Stage 4: Innovation (Month 12+)**\n• AI/ML integration\n• IoT for operations (if applicable)\n• API ecosystem partnerships\n• Innovation labs/hackathons\n• Continuous improvement culture\n\n📊 **ROI Benchmark:** Digitally mature companies see 26% higher profitability.\n\n💡 Book a Digital Transformation consultation with Simpatico HR!`,

        default: `That's a great question! Here are some key considerations:\n\n**Strategic Thinking Framework:**\n1. Define the problem clearly\n2. Gather data and analyze trends\n3. Identify options and evaluate trade-offs\n4. Choose the best path and create an action plan\n5. Set milestones and KPIs to track progress\n\n**Resources Available to You:**\n• 📊 **Health Assessment** — Evaluate your business across 5 dimensions\n• 📋 **Strategy Scorecard** — SWOT analysis and KPI tracking\n• 📁 **Document Hub** — Organize consulting deliverables\n• 📅 **Meeting Scheduler** — Book consulting sessions\n\n**Need Expert Advice?**\nSimpatico HR's business consultants are available for:\n• Free initial consultation\n• Strategic planning workshops\n• Market entry advisory\n• Digital transformation roadmaps\n\n📞 Contact: +91 954 484 2260\n💬 WhatsApp: Click the green button in the sidebar!\n✉️ Email: info@simpaticohr.in`
    };

    window.sendPrompt = function (text) {
        document.getElementById('chatInput').value = text;
        sendChatMessage();
    };

    window.sendChatMessage = async function () {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;

        const messages = document.getElementById('chatMessages');

        messages.innerHTML += '<div class="chat-msg user">' +
            '<div class="chat-msg-avatar"><i class="fas fa-user"></i></div>' +
            '<div class="chat-msg-bubble">' + escHtml(text) + '</div>' +
            '</div>';

        input.value = '';

        const typingId = 'typing-' + Date.now();
        messages.innerHTML += '<div class="chat-msg bot" id="' + typingId + '">' +
            '<div class="chat-msg-avatar"><i class="fas fa-robot"></i></div>' +
            '<div class="chat-msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>' +
            '</div>';
        messages.scrollTop = messages.scrollHeight;

        try {
            const WORKER_URL = window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';
            
            // Build strategy scorecard context
            const swotContext = [];
            if (window.cachedSwot) {
                ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(k => {
                    const items = window.cachedSwot[k] || [];
                    if (items.length) {
                        swotContext.push(k.toUpperCase() + ': ' + items.map(i => i.content || i).join(', '));
                    }
                });
            }
            const kpiContext = (window.cachedKPIs || []).map(k => k.name + ': ' + k.current_value + ' / ' + k.target_value + ' ' + (k.unit || '')).join(', ');
            
            const systemPrompt = `You are an expert Business Consulting AI Advisor for Simpatico HR. 
Today's language is: ${LANG}. You MUST respond in the client's language (${LANG}).
Client Strategy Context:
SWOT: ${swotContext.length ? swotContext.join(' | ') : 'No SWOT data yet.'}
KPIs: ${kpiContext.length ? kpiContext : 'No KPIs tracked yet.'}

Be professional, highly strategic, clear, and action-oriented. Support the customer in their business operations. Use Markdown for formatting.`;

            const headers = {
                'Content-Type': 'application/json',
                'X-Tenant-ID': getTenantId()
            };
            const token = localStorage.getItem('simpatico_token') || localStorage.getItem('sh_token');
            if (token) headers['Authorization'] = 'Bearer ' + token;

            const response = await fetch(`${WORKER_URL}/ai/chat`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ]
                })
            });

            const typing = document.getElementById(typingId);
            if (typing) typing.remove();

            if (!response.ok) throw new Error('API failed');

            const data = await response.json();
            const reply = data.data ? data.data.response : data.response;

            messages.innerHTML += '<div class="chat-msg bot">' +
                '<div class="chat-msg-avatar"><i class="fas fa-robot"></i></div>' +
                '<div class="chat-msg-bubble">' + markdownToHtml(reply) + '</div>' +
                '</div>';
            messages.scrollTop = messages.scrollHeight;

        } catch (err) {
            console.warn('[consulting AI] API failed, falling back to static keyword response:', err);
            const typing = document.getElementById(typingId);
            if (typing) typing.remove();

            const lower = text.toLowerCase();
            let responseText;
            const fallbackList = advisorResponsesTranslations[LANG] || advisorResponsesTranslations['en'] || advisorResponses;
            const originalFallback = advisorResponses;

            if (lower.includes('swot')) responseText = fallbackList.swot || originalFallback.swot;
            else if (lower.includes('growth') || lower.includes('grow')) responseText = fallbackList.growth || originalFallback.growth;
            else if (lower.includes('market entry') || lower.includes('gcc') || lower.includes('checklist')) responseText = fallbackList.market_entry || originalFallback.market_entry;
            else if (lower.includes('cost') || lower.includes('reduce') || lower.includes('save')) responseText = fallbackList.cost_reduction || originalFallback.cost_reduction;
            else if (lower.includes('kpi') || lower.includes('metric') || lower.includes('track')) responseText = fallbackList.kpi || originalFallback.kpi;
            else if (lower.includes('digital') || lower.includes('transform') || lower.includes('technology')) responseText = fallbackList.digital || originalFallback.digital;
            else responseText = fallbackList.default || originalFallback.default;

            messages.innerHTML += '<div class="chat-msg bot">' +
                '<div class="chat-msg-avatar"><i class="fas fa-robot"></i></div>' +
                '<div class="chat-msg-bubble">' + markdownToHtml(responseText) + '</div>' +
                '</div>';
            messages.scrollTop = messages.scrollHeight;
        }
    };

    function markdownToHtml(text) {
        return (text || '')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^### (.+)$/gm, '<h4 style="font-size:14px;font-weight:600;margin:12px 0 6px;">$1</h4>')
            .replace(/^## (.+)$/gm,  '<h3 style="font-size:15px;font-weight:700;margin:14px 0 6px">$1</h3>')
            .replace(/^# (.+)$/gm,   '<h2 style="font-size:17px;font-weight:700;margin:16px 0 8px">$1</h2>')
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
            .replace(/\n/g, '<br>');
    }

    // ═══════════════════════════════════════════════════════════
    // § PDF EXPORT (jsPDF)
    // ═══════════════════════════════════════════════════════════
    window.exportAssessmentPDF = function () {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            showToast('PDF library loading... try again in a moment', 'info');
            return;
        }
        if (!cachedAssessment) { showToast('No assessment data to export', 'error'); return; }

        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF();
        var y = 20;

        // Header
        doc.setFillColor(30, 27, 75);
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('SIMPATICO HR', 15, 15);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Business Health Assessment Report', 15, 25);
        doc.setFontSize(9);
        doc.text(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), 160, 25);

        y = 48;
        doc.setTextColor(15, 23, 42);

        // Overall Score
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Overall Score: ' + cachedAssessment.overall + '%', 15, y);
        var grade = cachedAssessment.overall >= 80 ? 'A - Excellent' : cachedAssessment.overall >= 60 ? 'B - Good' : cachedAssessment.overall >= 40 ? 'C - Needs Improvement' : 'D - Critical';
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Grade: ' + grade, 15, y + 8);
        y += 20;

        // Category Scores
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Category Breakdown', 15, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        (cachedAssessment.categories || []).forEach(function(cat) {
            var name = cat[0], score = cat[1];
            doc.text(name + ': ' + score + '%', 20, y);
            // Progress bar
            doc.setFillColor(226, 232, 240);
            doc.rect(80, y - 3.5, 80, 4, 'F');
            var barColor = score >= 80 ? [16, 185, 129] : score >= 60 ? [139, 92, 246] : score >= 40 ? [245, 158, 11] : [239, 68, 68];
            doc.setFillColor(barColor[0], barColor[1], barColor[2]);
            doc.rect(80, y - 3.5, 80 * (score / 100), 4, 'F');
            y += 9;
        });

        // Recommendations
        var recs = cachedAssessment.recommendations || [];
        if (recs.length) {
            y += 6;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Key Recommendations', 15, y);
            y += 8;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            recs.forEach(function(r, i) {
                var lines = doc.splitTextToSize((i + 1) + '. ' + r, 170);
                doc.text(lines, 20, y);
                y += lines.length * 5 + 3;
            });
        }

        // SWOT Summary
        if (cachedSwot) {
            y += 8;
            if (y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('SWOT Analysis Summary', 15, y);
            y += 8;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(function(key) {
                var items = cachedSwot[key] || [];
                if (items.length) {
                    doc.setFont('helvetica', 'bold');
                    doc.text(key.charAt(0).toUpperCase() + key.slice(1) + ':', 20, y);
                    doc.setFont('helvetica', 'normal');
                    y += 5;
                    items.forEach(function(item) {
                        var text = typeof item === 'string' ? item : item.content;
                        doc.text('• ' + text, 25, y);
                        y += 5;
                    });
                    y += 2;
                }
            });
        }

        // KPIs
        if (cachedKPIs.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            y += 5;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('KPI Dashboard', 15, y);
            y += 8;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            cachedKPIs.forEach(function(k) {
                var current = k.current_value || k.current || 0;
                var target = k.target_value || k.target || 100;
                var pct = target > 0 ? Math.round((current / target) * 100) : 0;
                doc.text(k.name + ': ' + current + ' / ' + target + ' (' + pct + '%)', 20, y);
                y += 6;
            });
        }

        // Footer
        var pageCount = doc.internal.getNumberOfPages();
        for (var i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('Generated by Simpatico HR Business Consulting Dashboard | Page ' + i + ' of ' + pageCount, 105, 290, { align: 'center' });
        }

        doc.save('Simpatico_Business_Health_Report_' + new Date().toISOString().split('T')[0] + '.pdf');
        showToast('PDF report downloaded!', 'success');
        addActivity('Exported Business Health Assessment PDF', 'report');
    };

    // Export SWOT as PDF
    window.exportSwotPDF = function () {
        if (typeof window.jspdf === 'undefined') { showToast('PDF library loading...', 'info'); return; }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF();
        doc.setFillColor(30, 27, 75);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SWOT Analysis Report', 15, 20);
        var y = 42;
        doc.setTextColor(15, 23, 42);
        var colors = { strengths: [16, 185, 129], weaknesses: [239, 68, 68], opportunities: [59, 130, 246], threats: [245, 158, 11] };
        ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(function(key) {
            var items = cachedSwot[key] || [];
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            var c = colors[key];
            doc.setTextColor(c[0], c[1], c[2]);
            doc.text(key.charAt(0).toUpperCase() + key.slice(1), 15, y);
            y += 7;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            if (!items.length) { doc.text('No items added', 20, y); y += 6; }
            items.forEach(function(item) {
                doc.text('• ' + (typeof item === 'string' ? item : item.content), 20, y);
                y += 5;
            });
            y += 6;
            if (y > 260) { doc.addPage(); y = 20; }
        });
        doc.save('Simpatico_SWOT_Analysis_' + new Date().toISOString().split('T')[0] + '.pdf');
        showToast('SWOT PDF downloaded!', 'success');
    };

    // Export KPIs as PDF
    window.exportKpiPDF = function () {
        if (typeof window.jspdf === 'undefined') { showToast('PDF library loading...', 'info'); return; }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF();
        doc.setFillColor(30, 27, 75);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('KPI Scorecard Report', 15, 20);
        var y = 42;
        doc.setTextColor(15, 23, 42);
        if (!cachedKPIs.length) { doc.setFontSize(11); doc.text('No KPIs configured.', 15, y); }
        cachedKPIs.forEach(function(k) {
            var current = k.current_value || k.current || 0;
            var target = k.target_value || k.target || 100;
            var pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(k.name, 15, y);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(current + (k.unit || '') + ' / ' + target + (k.unit || '') + '  (' + pct + '%)', 15, y + 6);
            doc.setFillColor(226, 232, 240);
            doc.rect(15, y + 9, 120, 4, 'F');
            var barC = pct >= 75 ? [16, 185, 129] : pct >= 40 ? [245, 158, 11] : [239, 68, 68];
            doc.setFillColor(barC[0], barC[1], barC[2]);
            doc.rect(15, y + 9, 120 * (pct / 100), 4, 'F');
            y += 22;
            if (y > 270) { doc.addPage(); y = 20; }
        });
        doc.save('Simpatico_KPI_Scorecard_' + new Date().toISOString().split('T')[0] + '.pdf');
        showToast('KPI report downloaded!', 'success');
    };

    // ═══════════════════════════════════════════════════════════
    // § FILE UPLOADS (Supabase Storage)
    // ═══════════════════════════════════════════════════════════
    window.handleDocFileUpload = async function (fileInput) {
        var file = fileInput.files[0];
        if (!file) return;
        var maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) { showToast('File too large (max 10MB)', 'error'); return; }

        var allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'];
        var ext = '.' + file.name.split('.').pop().toLowerCase();
        if (allowed.indexOf(ext) === -1) {
            showToast('Unsupported file type. Allowed: ' + allowed.join(', '), 'error');
            return;
        }

        var uploadBtn = document.getElementById('docUploadStatus');
        if (uploadBtn) {
            uploadBtn.textContent = 'Uploading...';
            uploadBtn.style.color = 'var(--primary)';
        }

        var client = sb();
        if (!client) {
            if (uploadBtn) uploadBtn.textContent = 'Upload failed (no connection)';
            return;
        }

        var cid = getTenantId();
        var filePath = cid + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        try {
            var result = await client.storage.from('consulting-docs').upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

            if (result.error) {
                // If bucket doesn't exist, store metadata only
                if (result.error.message && (result.error.message.indexOf('not found') !== -1 || result.error.statusCode === '404')) {
                    if (uploadBtn) uploadBtn.textContent = file.name + ' (metadata only - storage bucket not configured)';
                    document.getElementById('docFilePath').value = '';
                    document.getElementById('docFileName').value = file.name;
                    return;
                }
                throw result.error;
            }

            // Get public URL
            var urlResult = client.storage.from('consulting-docs').getPublicUrl(filePath);
            if (uploadBtn) uploadBtn.textContent = '✓ ' + file.name;
            if (uploadBtn) uploadBtn.style.color = 'var(--success)';
            document.getElementById('docFilePath').value = filePath;
            document.getElementById('docFileUrl').value = urlResult.data?.publicUrl || '';
            document.getElementById('docFileName').value = file.name;
        } catch (e) {
            console.warn('[consulting] File upload error:', e);
            if (uploadBtn) uploadBtn.textContent = file.name + ' (saved locally)';
            document.getElementById('docFilePath').value = '';
            document.getElementById('docFileName').value = file.name;
        }
    };

    window.downloadDocument = function (url, name) {
        if (!url) {
            showToast('No file attached to this document', 'info');
            return;
        }
        var a = document.createElement('a');
        a.href = url;
        a.download = name || 'document';
        a.target = '_blank';
        a.click();
    };

    // ═══════════════════════════════════════════════════════════
    // § MULTI-LANGUAGE / i18n
    // ═══════════════════════════════════════════════════════════
    // § MULTI-LANGUAGE / i18n
    // ═══════════════════════════════════════════════════════════
    var LANG = localStorage.getItem('sc_lang') || 'en';

    var i18n = {
        en: {
            overview: 'Overview', healthAssessment: 'Health Assessment', projectTracker: 'Project Tracker',
            strategyScorecard: 'Strategy Scorecard', documentHub: 'Document Hub', meetingScheduler: 'Meeting Scheduler',
            aiAdvisor: 'AI Business Advisor', signOut: 'Sign Out', activeProjects: 'Active Projects',
            assessmentsDone: 'Assessments Done', documents: 'Documents', upcomingMeetings: 'Upcoming Meetings',
            quickActions: 'Quick Actions', recentActivity: 'Recent Activity', noNotifications: 'No notifications yet',
            markAllRead: 'Mark all read', exportPdf: 'Export PDF', takeAssessment: 'Take Health Assessment',
            newProject: 'New Project', scheduleMeeting: 'Schedule Meeting', askAdvisor: 'Ask AI Advisor',
            welcome: 'Welcome to your Consulting Dashboard!', welcomeSub: 'Start by taking the Business Health Assessment',
            dragHint: 'Drag cards to move between stages',
            // new keys
            question: 'Question', next: 'Next', prev: 'Previous', finishAssessment: 'Finish Assessment',
            excellent: 'Excellent', good: 'Good', needsImprovement: 'Needs Improvement', critical: 'Critical',
            overallHealth: 'Overall Business Health', keyRecommendations: 'Key Recommendations',
            retakeAssessment: 'Retake Assessment', exportPdfReport: 'Export PDF Report',
            recStrategy: 'Develop a formal 3-5 year strategic plan with quarterly review cycles.',
            recOperations: 'Document and standardize core processes. Consider lean methodology.',
            recFinance: 'Implement financial dashboards and ROI tracking for all major projects.',
            recDigital: 'Prioritize digital transformation — start with cloud migration and data analytics.',
            recHR: 'Invest in employee engagement programs and structured career development paths.',
            Strategy: 'Strategy', Operations: 'Operations', Finance: 'Finance', 'Digital Maturity': 'Digital Maturity', 'HR & Culture': 'HR & Culture',
            navDashboard: 'Dashboard', navManagement: 'Management', navIntelligence: 'Intelligence', navLinks: 'Links',
            chatPlaceholder: 'Ask a business question...', chatStatus: 'Powered by Simpatico Intelligence'
        },
        hi: {
            overview: 'अवलोकन', healthAssessment: 'स्वास्थ्य मूल्यांकन', projectTracker: 'प्रोजेक्ट ट्रैकर',
            strategyScorecard: 'रणनीति स्कोरकार्ड', documentHub: 'दस्तावेज़ हब', meetingScheduler: 'बैठक अनुसूचक',
            aiAdvisor: 'AI व्यापार सलाहकार', signOut: 'साइन आउट', activeProjects: 'सक्रिय प्रोजेक्ट',
            assessmentsDone: 'मूल्यांकन पूर्ण', documents: 'दस्तावेज़', upcomingMeetings: 'आगामी बैठकें',
            quickActions: 'त्वरित कार्य', recentActivity: 'हालिया गतिविधि', noNotifications: 'कोई सूचना नहीं',
            markAllRead: 'सभी पढ़ी गईं', exportPdf: 'PDF निर्यात', takeAssessment: 'स्वास्थ्य मूल्यांकन करें',
            newProject: 'नया प्रोजेक्ट', scheduleMeeting: 'बैठक निर्धारित करें', askAdvisor: 'AI सलाहकार से पूछें',
            welcome: 'आपके कंसल्टिंग डैशबोर्ड में स्वागत है!', welcomeSub: 'व्यापार स्वास्थ्य मूल्यांकन से शुरू करें',
            dragHint: 'चरणों के बीच ले जाने के लिए कार्ड खींचें',
            // new keys
            question: 'प्रश्न', next: 'आगे', prev: 'पीछे', finishAssessment: 'मूल्यांकन समाप्त करें',
            excellent: 'उत्कृष्ट', good: 'अच्छा', needsImprovement: 'सुधार की आवश्यकता', critical: 'गंभीर',
            overallHealth: 'समग्र व्यावसायिक स्वास्थ्य', keyRecommendations: 'प्रमुख सिफारिशें',
            retakeAssessment: 'मूल्यांकन पुनः करें', exportPdfReport: 'PDF रिपोर्ट निर्यात करें',
            recStrategy: 'तिमाही समीक्षा चक्रों के साथ एक औपचारिक 3-5 साल की रणनीतिक योजना विकसित करें।',
            recOperations: 'मुख्य प्रक्रियाओं का दस्तावेजीकरण और मानकीकरण करें। लीन पद्धति पर विचार करें।',
            recFinance: 'सभी प्रमुख परियोजनाओं के लिए वित्तीय डैशबोर्ड और आरओआई ट्रैकिंग लागू करें।',
            recDigital: 'डिजिटल परिवर्तन को प्राथमिकता दें — क्लाउड माइग्रेशन और डेटा एनालिटिक्स के साथ शुरू करें।',
            recHR: 'कर्मचारी जुड़ाव कार्यक्रमों और संरचित कैरियर विकास पथों में निवेश करें।',
            Strategy: 'रणनीति', Operations: 'संचालन', Finance: 'वित्त', 'Digital Maturity': 'डिजिटल परिपक्वता', 'HR & Culture': 'एचआर और संस्कृति',
            navDashboard: 'डैशबोर्ड', navManagement: 'प्रबंधन', navIntelligence: 'खुफिया', navLinks: 'लिंक्स',
            chatPlaceholder: 'एक व्यावसायिक प्रश्न पूछें...', chatStatus: 'सिम्पैटिको इंटेलिजेंस द्वारा संचालित'
        },
        ar: {
            overview: 'نظرة عامة', healthAssessment: 'تقييم الصحة', projectTracker: 'متتبع المشاريع',
            strategyScorecard: 'بطاقة الإستراتيجية', documentHub: 'مركز المستندات', meetingScheduler: 'جدولة الاجتماعات',
            aiAdvisor: 'مستشار الأعمال الذكي', signOut: 'تسجيل الخروج', activeProjects: 'المشاريع النشطة',
            assessmentsDone: 'التقييمات المنجزة', documents: 'المستندات', upcomingMeetings: 'الاجتماعات القادمة',
            quickActions: 'إجراءات سريعة', recentActivity: 'النشاط الأخير', noNotifications: 'لا توجد إشعارات',
            markAllRead: 'تحديد الكل كمقروء', exportPdf: 'تصدير PDF', takeAssessment: 'إجراء تقييم الصحة',
            newProject: 'مشروع جديد', scheduleMeeting: 'جدولة اجتماع', askAdvisor: 'اسأل المستشار الذكي',
            welcome: 'مرحباً بك في لوحة الاستشارات!', welcomeSub: 'ابدأ بإجراء تقييم صحة الأعمال',
            dragHint: 'اسحب البطاقات للتنقل بين المراحل',
            // new keys
            question: 'سؤال', next: 'التالي', prev: 'السابق', finishAssessment: 'إنهاء التقييم',
            excellent: 'ممتاز', good: 'جيد', needsImprovement: 'بحاجة إلى تحسين', critical: 'حرج',
            overallHealth: 'صحة العمل العامة', keyRecommendations: 'التوصيات الرئيسية',
            retakeAssessment: 'إعادة التقييم', exportPdfReport: 'تصدير تقرير PDF',
            recStrategy: 'تطوير خطة إستراتيجية رسمية لمدة 3-5 سنوات مع دورات مراجعة ربع سنوية.',
            recOperations: 'توثيق وتوحيد العمليات الأساسية. النظر في منهجية لين (Lean).',
            recFinance: 'تنفيذ لوحات المعلومات المالية وتتبع عائد الاستثمار لجميع المشاريع الكبرى.',
            recDigital: 'تحديد أولويات التحول الرقمي — ابدأ بالهجرة السحابية وتحليلات البيانات.',
            recHR: 'الاستثمار في برامج مشاركة الموظفين ومسارات التطوير المهني المهيكلة.',
            Strategy: 'الاستراتيجية', Operations: 'العمليات', Finance: 'المالية', 'Digital Maturity': 'النضج الرقمي', 'HR & Culture': 'الموارد البشرية والثقافة',
            navDashboard: 'لوحة القيادة', navManagement: 'الإدارة', navIntelligence: 'الذكاء', navLinks: 'روابط',
            chatPlaceholder: 'اسأل سؤالاً تجارياً...', chatStatus: 'مدعوم من ذكاء سيمباتيكو'
        },
        ml: {
            overview: 'അവലോകനം', healthAssessment: 'ആരോഗ്യ വിലയിരുത്തൽ', projectTracker: 'പ്രോജക്ട് ട്രാക്കർ',
            strategyScorecard: 'തന്ത്ര സ്കോർകാർഡ്', documentHub: 'ഡോക്യുമെന്റ് ഹബ്', meetingScheduler: 'മീറ്റിംഗ് ഷെഡ്യൂളർ',
            aiAdvisor: 'AI ബിസിനസ് ഉപദേശകൻ', signOut: 'സൈൻ ഔട്ട്', activeProjects: 'സജീവ പ്രോജക്ടുകൾ',
            assessmentsDone: 'വിലയിരുത്തലുകൾ പൂർത്തിയായി', documents: 'ഡോക്യുമെന്റുകൾ', upcomingMeetings: 'വരാനിരിക്കുന്ന മീറ്റിംഗുകൾ',
            quickActions: 'ദ്രുത പ്രവർത്തനങ്ങൾ', recentActivity: 'സമീപകാല പ്രവർത്തനം', noNotifications: 'അറിയിപ്പുകളൊന്നുമില്ല',
            markAllRead: 'എല്ലാം വായിച്ചതായി', exportPdf: 'PDF എക്സ്പോർട്ട്', takeAssessment: 'ആരോഗ്യ വിലയിരുത്തൽ നടത്തുക',
            newProject: 'പുതിയ പ്രോജക്ട്', scheduleMeeting: 'മീറ്റിംഗ് ഷെഡ്യൂൾ ചെയ്യുക', askAdvisor: 'AI ഉപദേശകനോട് ചോദിക്കുക',
            welcome: 'നിങ്ങളുടെ കൺസൾട്ടിംഗ് ഡാഷ്ബോർഡിലേക്ക് സ്വാഗതം!', welcomeSub: 'ബിസിനസ് ആരോഗ്യ വിലയിരുത്തൽ ആരംഭിക്കുക',
            dragHint: 'ഘട്ടങ്ങൾക്കിടയിൽ നീക്കാൻ കാർഡുകൾ വലിച്ചിടുക',
            // new keys
            question: 'ചോദ്യം', next: 'അടുത്തത്', prev: 'മുമ്പത്തേത്', finishAssessment: 'വിലയിരുത്തൽ പൂർത്തിയാക്കുക',
            excellent: 'മികച്ചത്', good: 'നല്ലത്', needsImprovement: 'മെച്ചപ്പെടുത്തേണ്ടതുണ്ട്', critical: 'ഗുരുതരം',
            overallHealth: 'ആകെ ബിസിനസ്സ് ആരോഗ്യം', keyRecommendations: 'പ്രധാന നിർദ്ദേശങ്ങൾ',
            retakeAssessment: 'വീണ്ടും വിലയിരുത്തുക', exportPdfReport: 'PDF റിപ്പോർട്ട് ഡൗൺലോഡ് ചെയ്യുക',
            recStrategy: 'ത്രൈമാസ അവലോകനങ്ങളോടെയുള്ള 3-5 വർഷത്തെ തന്ത്രപരമായ പ്ലാൻ തയ്യാറാക്കുക.',
            recOperations: 'പ്രധാന പ്രവർത്തനങ്ങൾ ഡോക്യുമെന്റ് ചെയ്യുകയും ഒപ്റ്റിമൈസ് ചെയ്യുകയും ചെയ്യുക.',
            recFinance: 'സാമ്പത്തിക ഡാഷ്‌ബോർഡുകളും ROI ട്രാക്കിംഗും നടപ്പിലാക്കുക.',
            recDigital: 'ഡിജിറ്റൽ പുരോഗതിക്ക് മുൻഗണന നൽകുക — ക്ലൗഡ് മൈഗ്രേഷനിലൂടെ ആരംഭിക്കുക.',
            recHR: 'ജീവനക്കാരുടെ തൃപ്തി വർദ്ധിപ്പിക്കുന്ന പ്രോഗ്രാമുകളിൽ നിക്ഷേപിക്കുക.',
            Strategy: 'തന്ത്രം', Operations: 'പ്രവർത്തനങ്ങൾ', Finance: 'ധനകാര്യം', 'Digital Maturity': 'ഡിജിറ്റൽ പുരോഗതി', 'HR & Culture': 'HR & സംസ്കാരം',
            navDashboard: 'ഡാഷ്‌ബോർഡ്', navManagement: 'മാനേജ്‌മെന്റ്', navIntelligence: 'ഇന്റലിജൻസ്', navLinks: 'ലിങ്കുകൾ',
            chatPlaceholder: 'ഒരു ബിസിനസ്സ് ചോദ്യം ചോദിക്കുക...', chatStatus: 'സിംപാറ്റിക്കോ ഇന്റലിജൻസ് നൽകുന്നത്'
        }
    };

    function t(key) {
        return (i18n[LANG] && i18n[LANG][key]) || (i18n.en[key]) || key;
    }

    window.switchLanguage = function (lang) {
        LANG = lang;
        localStorage.setItem('sc_lang', lang);
        // Update direction
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        // Update lang selector visual
        document.querySelectorAll('.lang-option').forEach(function(el) {
            el.classList.toggle('active', el.dataset.lang === lang);
        });
        // Update key UI text
        applyLanguage();
        var langNames = { en: 'Language: English', hi: 'भाषा: हिंदी', ar: 'اللغة: العربية', ml: 'ഭാഷ: മലയാളം' };
        showToast(langNames[lang] || 'Language changed', 'success');
    };

    function applyLanguage() {
        // Update stat labels
        var labelMap = {
            statProjectsLabel: 'activeProjects', statAssessmentsLabel: 'assessmentsDone',
            statDocumentsLabel: 'documents', statMeetingsLabel: 'upcomingMeetings'
        };
        Object.entries(labelMap).forEach(function(pair) {
            var el = document.getElementById(pair[0]);
            if (el) el.textContent = t(pair[1]);
        });

        // Update nav items
        document.querySelectorAll('.nav-item[data-section]').forEach(el => {
            const sec = el.dataset.section;
            const icon = el.querySelector('i');
            const badge = el.querySelector('.nav-badge');
            el.innerHTML = '';
            if (icon) el.appendChild(icon);
            el.appendChild(document.createTextNode(' ' + t(sec)));
            if (badge) el.appendChild(badge);
        });

        // Update nav labels
        const labels = document.querySelectorAll('.nav-label');
        if (labels.length >= 4) {
            labels[0].textContent = t('navDashboard');
            labels[1].textContent = t('navManagement');
            labels[2].textContent = t('navIntelligence');
            labels[3].textContent = t('navLinks');
        }

        // Update active page titles
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) {
            const sectionId = activeNav.dataset.section;
            const titles = sectionTitles[sectionId];
            if (titles) {
                document.getElementById('pageTitle').textContent = t(titles[0]);
                document.getElementById('pageTitleSub').textContent = t(titles[1]);
            }
        }

        // Re-render assessment screen if loaded
        if (document.getElementById('questionsContainer')) {
            if (cachedAssessment) {
                showResults(cachedAssessment);
            } else {
                buildQuestions();
            }
        }

        // Re-render AI chat header status/name and input placeholders
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.placeholder = t('chatPlaceholder');
        const chatName = document.querySelector('.chat-name');
        if (chatName) chatName.textContent = t('aiAdvisor');
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) chatStatus.textContent = t('chatStatus');

        // Apply RTL
        if (LANG === 'ar') {
            document.documentElement.dir = 'rtl';
        } else {
            document.documentElement.dir = 'ltr';
        }
    }

    // Apply saved language on load
    if (LANG !== 'en') {
        setTimeout(function() { applyLanguage(); }, 200);
    }

    // ═══════════════════════════════════════════════════════════
    // § UTILITIES
    // ═══════════════════════════════════════════════════════════
    function escHtml(str) {
        if (str === null || str === undefined) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(str).replace(/[&<>"']/g, c => map[c]);
    }

})();
