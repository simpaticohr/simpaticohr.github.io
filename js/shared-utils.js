/**
 * shared-utils.js — Simpatico HR Platform
 * ═══════════════════════════════════════════════════════════════════
 * Single source of truth for all shared utilities.
 * MUST be loaded BEFORE any module JS (employees, payroll, hr-ops, etc.)
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CONFIG = window.SIMPATICO_CONFIG || {};

  // ═══════════════════════════════════════════════
  // § 1.  AUTH TOKEN — Single retrieval function
  // ═══════════════════════════════════════════════

  /**
   * Returns the best available auth token from localStorage.
   * Priority: sh_token → simpatico_token → sb-*-auth-token
   */
  function getAuthToken() {
    // Primary keys
    let token = localStorage.getItem('sh_token')
             || localStorage.getItem('simpatico_token')
             || localStorage.getItem('sb-token')
             || '';

    // Fallback: scan for Supabase auto-generated key
    if (!token) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k));
            token = parsed.access_token || '';
            if (token) break;
          } catch (e) { /* skip malformed */ }
        }
      }
    }
    return token;
  }

  /**
   * Returns standard auth headers for Worker API calls.
   */
  function authHeaders() {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    if (CONFIG.supabaseAnonKey) {
      headers['apikey'] = CONFIG.supabaseAnonKey;
    }
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (CONFIG.tenantId) {
      headers['X-Tenant-ID'] = CONFIG.tenantId;
    }
    return headers;
  }

  /**
   * Returns headers WITHOUT Content-Type (for FormData uploads).
   */
  function authHeadersMultipart() {
    const h = authHeaders();
    delete h['Content-Type'];
    return h;
  }

  // ═══════════════════════════════════════════════
  // § 2.  SUPABASE CLIENT — Single instance
  // ═══════════════════════════════════════════════

  /**
   * Returns the shared Supabase client instance.
   * Creates one if needed (lazy singleton).
   */
  function getSupabaseClient() {
    if (window._supabaseClient) return window._supabaseClient;
    if (!window.supabase || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
      console.warn('[shared-utils] Supabase not available');
      return null;
    }
    const token = getAuthToken();
    const opts = token
      ? { global: { headers: { Authorization: 'Bearer ' + token } } }
      : {};
    window._supabaseClient = window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey,
      opts
    );
    window.SimpaticoDB = window._supabaseClient;
    return window._supabaseClient;
  }

  // ═══════════════════════════════════════════════
  // § 3.  XSS PROTECTION
  // ═══════════════════════════════════════════════

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /**
   * Escapes HTML entities to prevent XSS.
   * MUST be used for ALL user-provided data inserted into HTML.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ESC_MAP[c]);
  }

  /**
   * Escapes a value for safe use inside CSV cells.
   * Prevents CSV formula injection (=, +, -, @, \t, \r).
   */
  function escapeCsv(val) {
    let s = String(val == null ? '' : val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s + '"';
  }

  // ═══════════════════════════════════════════════
  // § 4.  TOAST NOTIFICATIONS — Single implementation
  // ═══════════════════════════════════════════════

  function showToast(message, type) {
    type = type || 'info';

    // Normalize object messages
    let msg = message;
    if (typeof message === 'object' && message !== null) {
      msg = message.message || message.error || message.statusText || JSON.stringify(message);
    }

    // Try both container IDs for compatibility
    const container = document.getElementById('toastContainer')
                   || document.getElementById('toasts');
    if (!container) {
      console.warn('[toast]', type, msg);
      return;
    }

    const icons = {
      success: '✓', error: '✕', warning: '⚠', info: 'ℹ'
    };
    const colors = {
      success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#6366f1'
    };

    const toast = document.createElement('div');
    toast.className = 'hr-toast ' + type;
    toast.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:12px 20px', 'border-radius:10px',
      'background:' + (colors[type] || colors.info),
      'color:#fff', 'font-size:0.85rem', 'font-weight:600',
      'margin-top:8px', 'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'animation:fadeIn 0.3s ease', 'max-width:420px', 'word-break:break-word'
    ].join(';');
    toast.innerHTML = '<span style="font-size:15px">' + (icons[type] || 'ℹ') + '</span>'
                    + '<span>' + escapeHtml(msg) + '</span>';

    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3800);
  }

  // ═══════════════════════════════════════════════
  // § 5.  MODAL MANAGEMENT — Unified
  // ═══════════════════════════════════════════════

  /**
   * Opens a modal. Supports both .active and .open classes.
   */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Support both CSS class conventions
    el.classList.add('active');
    el.classList.add('open');
  }

  /**
   * Closes a modal. Removes both .active and .open classes.
   */
  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.classList.remove('open');
  }

  // Close modals on overlay click
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('hr-modal-overlay') || e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
      e.target.classList.remove('open');
    }
  });

  // ═══════════════════════════════════════════════
  // § 6.  DOM HELPERS
  // ═══════════════════════════════════════════════

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  // ═══════════════════════════════════════════════
  // § 7.  FORMATTING HELPERS
  // ═══════════════════════════════════════════════

  function formatEnum(s) {
    return (s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function formatCurrency(amount, currency) {
    currency = currency || 'USD';
    if (!amount && amount !== 0) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency, maximumFractionDigits: 0
    }).format(amount);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'N/A';
    var seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
    return Math.floor(seconds / 2592000) + ' months ago';
  }

  // ═══════════════════════════════════════════════
  // § 8.  VISUAL HELPERS
  // ═══════════════════════════════════════════════

  const AVATAR_COLORS = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899'];

  function avatarColor(id) {
    var h = 0;
    var s = String(id || '');
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
    }
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function statusBadge(s) {
    var map = {
      active: 'hr-badge-active',
      on_leave: 'hr-badge-pending',
      terminated: 'hr-badge-inactive',
      offboarding: 'hr-badge-pending'
    };
    var label = (s || 'unknown').replace(/_/g, ' ');
    return '<span class="hr-badge ' + (map[s] || 'hr-badge-inactive') + '">' + escapeHtml(label) + '</span>';
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ',' + g + ',' + b;
  }

  // ═══════════════════════════════════════════════
  // § 9.  LOGOUT — Single implementation
  // ═══════════════════════════════════════════════

  function doLogout() {
    // Clear all auth tokens
    ['sh_token', 'sh_user', 'sh_client',
     'simpatico_token', 'simpatico_user',
     'sb-token'].forEach(function (k) {
      localStorage.removeItem(k);
    });

    // Clear Supabase auto-generated keys
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.removeItem(k);
      }
    }

    sessionStorage.clear();
    window.location.href = '/platform/login.html';
  }

  // ═══════════════════════════════════════════════
  // § 10. SECURE TOKEN GENERATION
  // ═══════════════════════════════════════════════

  function generateSecureToken(length) {
    length = length || 32;
    var array = new Uint8Array(length);
    crypto.getRandomValues(array);
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var token = '';
    for (var i = 0; i < length; i++) {
      token += chars[array[i] % chars.length];
    }
    return token;
  }

  // ═══════════════════════════════════════════════
  // § 11. CSV EXPORT HELPER
  // ═══════════════════════════════════════════════

  function downloadCsv(headers, rows, filename) {
    var csvRows = [headers.map(escapeCsv).join(',')];
    rows.forEach(function (row) {
      csvRows.push(row.map(escapeCsv).join(','));
    });
    var csv = csvRows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export downloaded', 'success');
  }

  // ═══════════════════════════════════════════════
  // § 12. GLOBAL ERROR HANDLER
  // ═══════════════════════════════════════════════

  window.addEventListener('unhandledrejection', function (event) {
    console.error('[Unhandled Promise]', event.reason);
    var msg = event.reason?.message || 'An unexpected error occurred';
    if (msg.includes('Failed to fetch')) {
      msg = 'Network error. Please check your connection.';
    }
    showToast(msg, 'error');
  });

  window.onerror = function (msg, source, line) {
    console.error('[Global Error]', msg, source, line);
    // Don't show toast for every script error in production
    // but log for monitoring
  };

  // ═══════════════════════════════════════════════
  // § 13. WORKER API HELPER
  // ═══════════════════════════════════════════════

  var WORKER_URL = CONFIG.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';

  /**
   * Makes an authenticated request to the Worker API.
   * This is the preferred way to make API calls (NOT direct Supabase).
   */
  async function workerFetch(path, options) {
    options = options || {};
    var url = WORKER_URL + path;
    var headers = authHeaders();

    if (options.formData) {
      // For file uploads, don't set Content-Type (browser will set multipart boundary)
      delete headers['Content-Type'];
    }

    var fetchOpts = {
      method: options.method || 'GET',
      headers: headers,
    };

    if (options.body) {
      fetchOpts.body = JSON.stringify(options.body);
    } else if (options.formData) {
      fetchOpts.body = options.formData;
    }

    var res = await fetch(url, fetchOpts);
    var data = await res.json();

    if (!res.ok) {
      var errMsg = data.error?.message || data.error || data.message || 'Request failed (' + res.status + ')';
      if (res.status === 401) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(doLogout, 1500);
      }
      throw new Error(errMsg);
    }

    return data;
  }

  // ═══════════════════════════════════════════════
  // § 14. EXPORT TO WINDOW (global scope)
  // ═══════════════════════════════════════════════

  // Auth
  window.getAuthToken       = getAuthToken;
  window.authHeaders        = authHeaders;
  window.authHeadersMultipart = authHeadersMultipart;
  window.getSupabaseClient  = getSupabaseClient;

  // Security
  window.escapeHtml         = escapeHtml;
  window.escapeCsv          = escapeCsv;
  window.generateSecureToken = generateSecureToken;
  window.generateInterviewToken = generateSecureToken;

  // UI
  window.showToast          = showToast;
  window.openModal          = openModal;
  window.closeModal         = closeModal;
  window.setText            = setText;
  window.setHtml            = setHtml;

  // Formatting
  window.formatEnum         = formatEnum;
  window.formatCurrency     = formatCurrency;
  window.formatDate         = formatDate;
  window.formatDateTime     = formatDateTime;
  window.timeAgo            = timeAgo;

  // Visual
  window.avatarColor        = avatarColor;
  window.statusBadge        = statusBadge;
  window.hexToRgb           = hexToRgb;

  // Navigation
  window.doLogout           = doLogout;

  // Data
  window.downloadCsv        = downloadCsv;

  // API
  window.workerFetch         = workerFetch;
  window.WORKER_URL          = WORKER_URL;
  window.getSupabaseClient   = getSupabaseClient;

  console.log('[shared-utils] Simpatico HR utilities loaded (v5.0)');
})();
