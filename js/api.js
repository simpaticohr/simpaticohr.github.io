// js/api.js — SimpaticoHR API Client v4.0
// Matches Worker v4.0 endpoints exactly

const API = (() => {
    const CONFIG = {
        // UPDATE THIS to your actual Worker URL
        baseUrl: 'https://evalis-ai.simpaticohrconsultancy.workers.dev',
        tokenKey: 'sh_token',
        userKey: 'sh_user',
        clientKey: 'sh_client'
    };

    // State
    let _token = localStorage.getItem(CONFIG.tokenKey);
    let _user = null;
    let _client = null;

    try { _user = JSON.parse(localStorage.getItem(CONFIG.userKey)); } catch {}
    try { _client = JSON.parse(localStorage.getItem(CONFIG.clientKey)); } catch {}

    // ═══════════════════════════════════
    // HTTP CLIENT
    // ═══════════════════════════════════
    async function request(path, options = {}) {
        const url = `${CONFIG.baseUrl}${path}`;
        const headers = { 'Content-Type': 'application/json' };

        if (_token) headers['Authorization'] = `Bearer ${_token}`;

        try {
            const res = await fetch(url, {
                method: options.method || 'GET',
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401) {
                    clearAuth();
                    if (!window.location.pathname.includes('login')) {
                        window.location.href = '/login.html?expired=true';
                    }
                }
                throw new Error(data.error || `Request failed (${res.status})`);
            }

            return data;
        } catch (err) {
            if (err.message?.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your connection.');
            }
            throw err;
        }
    }

    const get = (path, params) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.fromEntries(Object.entries(params).filter(([_, v]) => v))
        ).toString() : '';
        return request(path + qs);
    };
    const post = (path, body) => request(path, { method: 'POST', body });
    const patch = (path, body) => request(path, { method: 'PATCH', body });
    const put = (path, body) => request(path, { method: 'PUT', body });
    const del = (path) => request(path, { method: 'DELETE' });

    // ═══════════════════════════════════
    // AUTH
    // ═══════════════════════════════════
    function setAuth(token, user, client) {
        _token = token;
        _user = user;
        _client = client;
        localStorage.setItem(CONFIG.tokenKey, token);
        localStorage.setItem(CONFIG.userKey, JSON.stringify(user));
        if (client) localStorage.setItem(CONFIG.clientKey, JSON.stringify(client));
    }

    function clearAuth() {
        _token = null; _user = null; _client = null;
        localStorage.removeItem(CONFIG.tokenKey);
        localStorage.removeItem(CONFIG.userKey);
        localStorage.removeItem(CONFIG.clientKey);
    }

    const auth = {
        async login(email, password) {
            const data = await post('/auth/login', { email, password });
            if (data.token) setAuth(data.token, data.user, data.client);
            return data;
        },

        async register(params) {
            const data = await post('/auth/register', params);
            if (data.token) setAuth(data.token, data.user, data.client);
            return data;
        },

        async me() {
            const data = await get('/auth/me');
            if (data.user) {
                _user = data.user;
                _client = data.client;
                localStorage.setItem(CONFIG.userKey, JSON.stringify(_user));
                if (_client) localStorage.setItem(CONFIG.clientKey, JSON.stringify(_client));
            }
            return data;
        },

        async changePassword(current, password) {
            return post('/auth/password', { current, password });
        },

        async updateProfile(data) {
            return patch('/auth/profile', data);
        },

        logout() {
            clearAuth();
            window.location.href = '/login.html';
        },

        get isAuthenticated() { return !!_token && !!_user; },
        get user() { return _user; },
        get client() { return _client; },
        get token() { return _token; },

        get isSuperAdmin() { return _user?.role === 'superadmin'; },
        get isClientAdmin() { return _user?.role === 'client_admin'; },
        get isHR() { return _user?.role === 'hr'; },
        get isStaff() { return ['client_admin', 'hr'].includes(_user?.role); },

        hasRole(...roles) { return roles.includes(_user?.role); }
    };

    // ═══════════════════════════════════
    // DASHBOARD
    // ═══════════════════════════════════
    const dashboard = {
        stats: () => get('/client/stats'),
        pipeline: (jobId) => get('/client/pipeline', { job_id: jobId }),
        analytics: () => get('/client/analytics'),
        audit: (params) => get('/client/audit', params)
    };

    // ═══════════════════════════════════
    // JOBS
    // ═══════════════════════════════════
    const jobs = {
        // Public
        list: (params) => get('/jobs', params),
        getById: (id) => get(`/jobs/${id}`),
        apply: (jobId, data) => post(`/jobs/${jobId}/apply`, data),

        // Client management
        managed: () => get('/client/jobs'),
        create: (data) => post('/client/jobs', data),
        update: (id, data) => patch(`/client/jobs/${id}`, data),
        remove: (id) => del(`/client/jobs/${id}`),
        generateJD: (data) => post('/client/jobs/generate-jd', data)
    };

    // ═══════════════════════════════════
    // PIPELINE / APPLICATIONS
    // ═══════════════════════════════════
    const pipeline = {
        board: (jobId) => get('/client/pipeline', { job_id: jobId }),
        list: (params) => get('/client/applications', params),
        getById: (id) => get(`/client/applications/${id}`),
        moveStatus: (id, status, note) => post(`/client/applications/${id}/status`, { status, note }),
        bulkStatus: (ids, status) => post('/client/applications/bulk-status', { ids, status }),
        remove: (id) => del(`/client/applications/${id}`),
        runATS: (id) => post(`/client/applications/${id}/ats`),
        bulkATS: (ids) => post('/client/applications/bulk-ats', { ids }),
        getNotes: (id) => get(`/client/applications/${id}/notes`),
        addNote: (id, note, type) => post(`/client/applications/${id}/notes`, { note, type })
    };

    // ═══════════════════════════════════
    // INTERVIEWS
    // ═══════════════════════════════════
    const interviews = {
        list: (params) => get('/client/interviews', params),
        create: (data) => post('/client/interviews/create', data),
        validate: (token) => post('/interviews/validate', { token }),
        submit: (data) => post('/interviews/submit', data)
    };

    // ═══════════════════════════════════
    // HR TEAM
    // ═══════════════════════════════════
    const team = {
        list: () => get('/client/hr'),
        add: (data) => post('/client/hr', data),
        toggle: (id) => post(`/client/hr/${id}/toggle`),
        remove: (id) => del(`/client/hr/${id}`)
    };

    // ═══════════════════════════════════
    // AUTOMATION
    // ═══════════════════════════════════
    const automation = {
        rules: () => get('/client/automation/rules'),
        createRule: (data) => post('/client/automation/rules', data),
        updateRule: (id, data) => patch(`/client/automation/rules/${id}`, data),
        toggleRule: (id) => post(`/client/automation/rules/${id}/toggle`),
        deleteRule: (id) => del(`/client/automation/rules/${id}`),
        logs: () => get('/client/automation/logs')
    };

    // ═══════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════
    const notifications = {
        list: (params) => get('/notifications', params),
        unread: () => get('/notifications', { unread: 'true' }),
        markRead: (ids) => post('/notifications/mark-read', { ids })
    };

    // ═══════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════
    const settings = {
        get: () => get('/client/settings'),
        update: (data) => patch('/client/settings', data),
        emailTemplates: () => get('/client/email-templates'),
        saveEmailTemplate: (data) => post('/client/email-templates', data)
    };

    // ═══════════════════════════════════
    // ONBOARDING
    // ═══════════════════════════════════
    const onboarding = {
        submit: (clientId, data) => post(`/onboarding/${clientId}`, data),
        list: () => get('/client/onboarding'),
        updateStatus: (id, status) => post(`/client/onboarding/${id}/status`, { status })
    };

    // ═══════════════════════════════════
    // SUPERADMIN
    // ═══════════════════════════════════
    const admin = {
        stats: () => get('/admin/stats'),
        clients: (params) => get('/admin/clients', params),
        createClient: (data) => post('/admin/clients', data),
        updateClient: (id, data) => patch(`/admin/clients/${id}`, data),
        toggleClient: (id) => post(`/admin/clients/${id}/toggle`),
        deleteClient: (id) => del(`/admin/clients/${id}`),
        resetPassword: (id) => post(`/admin/clients/${id}/reset-password`),
        users: (params) => get('/admin/users', params),
        createUser: (data) => post('/admin/users', data),
        audit: () => get('/admin/audit')
    };

    // ═══════════════════════════════════
    // CANDIDATE SELF-SERVICE
    // ═══════════════════════════════════
    const candidate = {
        track: (email) => post('/candidate/track', { email })
    };

    // ═══════════════════════════════════
    // AI
    // ═══════════════════════════════════
    const ai = {
        chat: (messages) => post('/ai', { messages })
    };

    // ═══════════════════════════════════
    // PUBLIC
    // ═══════════════════════════════════
    const pub = {
        companies: () => get('/public/companies'),
        contact: (data) => post('/contact', data)
    };

    // ═══════════════════════════════════
    // UPLOAD
    // ═══════════════════════════════════
    async function upload(file, fileName) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileName', fileName || `${Date.now()}_${file.name}`);

        const res = await fetch(`${CONFIG.baseUrl}/upload`, {
            method: 'POST',
            headers: _token ? { 'Authorization': `Bearer ${_token}` } : {},
            body: fd
        });

        return res.json();
    }

    // ═══════════════════════════════════
    // UI UTILITIES
    // ═══════════════════════════════════
    const toast = {
        _container: null,
        _getContainer() {
            if (!this._container) {
                this._container = document.createElement('div');
                this._container.className = 'toast-container';
                document.body.appendChild(this._container);
            }
            return this._container;
        },
        show(type, title, message, duration = 4000) {
            const container = this._getContainer();
            const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
            const el = document.createElement('div');
            el.className = `toast toast-${type}`;
            el.innerHTML = `
                <span class="toast-icon">${icons[type] || 'ℹ'}</span>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    ${message ? `<div class="toast-message">${message}</div>` : ''}
                </div>
                <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
            `;
            container.appendChild(el);
            if (duration > 0) {
                setTimeout(() => {
                    el.classList.add('removing');
                    setTimeout(() => el.remove(), 300);
                }, duration);
            }
        },
        success(title, msg) { this.show('success', title, msg); },
        error(title, msg) { this.show('error', title, msg); },
        warning(title, msg) { this.show('warning', title, msg); },
        info(title, msg) { this.show('info', title, msg); }
    };

    // Auth guard
    function requireAuth(redirectTo = '/login.html') {
        if (!auth.isAuthenticated) {
            window.location.href = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
            return false;
        }
        return true;
    }

    function requireRole(...roles) {
        if (!requireAuth()) return false;
        if (!roles.includes(_user?.role)) {
            toast.error('Access Denied', 'You do not have permission.');
            setTimeout(() => window.location.href = '/login.html', 1500);
            return false;
        }
        return true;
    }

    // Format helpers
    const fmt = {
        date(d, style = 'medium') {
            if (!d) return '—';
            const opts = {
                short: { month: 'short', day: 'numeric' },
                medium: { month: 'short', day: 'numeric', year: 'numeric' },
                long: { month: 'long', day: 'numeric', year: 'numeric' },
                datetime: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            };
            return new Date(d).toLocaleDateString('en-IN', opts[style] || opts.medium);
        },
        relative(d) {
            if (!d) return '—';
            const diff = Math.floor((Date.now() - new Date(d)) / 1000);
            if (diff < 60) return 'just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        },
        salary(min, max) {
            if (!min && !max) return 'Not disclosed';
            const f = n => {
                if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
                if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
                return `₹${n.toLocaleString('en-IN')}`;
            };
            if (min && max) return `${f(min)} - ${f(max)}`;
            return min ? `From ${f(min)}` : `Up to ${f(max)}`;
        },
        initials(name) {
            return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        },
        scoreClass(score) {
            if (score >= 75) return 'high';
            if (score >= 50) return 'medium';
            return 'low';
        },
        scoreColor(score) {
            if (score >= 75) return 'var(--secondary)';
            if (score >= 50) return 'var(--warning)';
            return 'var(--accent)';
        },
        statusBadge(status) {
            const colors = {
                applied: 'primary', screened: 'info', shortlisted: 'warning',
                interview_scheduled: 'warning', interviewed: 'info',
                offered: 'success', hired: 'success',
                onboarding: 'success', rejected: 'danger', withdrawn: 'neutral'
            };
            const color = colors[status] || 'neutral';
            const label = (status || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `<span class="badge badge-${color} badge-dot">${label}</span>`;
        },
        number(n) {
            if (!n && n !== 0) return '0';
            if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
            if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
            return n.toString();
        }
    };

    // ═══════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════
    return {
        auth, dashboard, jobs, pipeline, interviews, team,
        automation, notifications, settings, onboarding,
        admin, candidate, ai, pub, upload, toast,
        requireAuth, requireRole, fmt, config: CONFIG
    };
})();

// Global shortcut
window.API = API;
