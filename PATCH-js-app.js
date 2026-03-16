/**
 * PATCH: js/app.js
 *
 * Add the following navigation links to the existing sidebar/nav
 * wherever your module links are currently rendered.
 * This is a PATCH — do NOT overwrite your existing app.js.
 *
 * Instructions:
 *   1. Find the section in your existing app.js that builds sidebar navigation
 *   2. Add the new module entries from NAV_MODULES_EXTENSION below
 *   3. If your nav is HTML-template based, add the HTML snippet from
 *      NAV_HTML_EXTENSION into your sidebar template instead
 */

// ── Extension nav entries (append to your existing nav array) ──
const NAV_MODULES_EXTENSION = [
  // Separator
  { type: 'section', label: 'Core HR' },
  { type: 'link', href: '/employees/employees.html',      icon: 'users',      label: 'Employees' },
  { type: 'link', href: '/onboarding/onboarding.html',    icon: 'clipboard',  label: 'Onboarding' },
  { type: 'link', href: '/training/training.html',        icon: 'book-open',  label: 'Training' },
  { type: 'link', href: '/performance/performance.html',  icon: 'trending-up',label: 'Performance' },
  { type: 'section', label: 'Operations' },
  { type: 'link', href: '/hr-ops/hr-ops.html',            icon: 'monitor',    label: 'HR Ops' },
  { type: 'link', href: '/payroll/payroll.html',          icon: 'dollar-sign',label: 'Payroll' },
  { type: 'section', label: 'Intelligence' },
  { type: 'link', href: '/analytics/analytics.html',      icon: 'bar-chart-2',label: 'Analytics' },
  { type: 'link', href: '/ai-assistant/ai-assistant.html',icon: 'cpu',        label: 'AI Assistant' },
];

// ── HTML snippet (if your nav is rendered via innerHTML / template) ──
const NAV_HTML_EXTENSION = `
<!-- ── New HR Modules (added by extension patch) ── -->
<div class="nav-section">Core HR</div>
<a class="nav-item" href="/employees/employees.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  Employees
</a>
<a class="nav-item" href="/onboarding/onboarding.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  Onboarding
</a>
<a class="nav-item" href="/training/training.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  Training
</a>
<a class="nav-item" href="/performance/performance.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  Performance
</a>
<div class="nav-section">Operations</div>
<a class="nav-item" href="/hr-ops/hr-ops.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
  HR Ops
</a>
<a class="nav-item" href="/payroll/payroll.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  Payroll
</a>
<div class="nav-section">Intelligence</div>
<a class="nav-item" href="/analytics/analytics.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  Analytics
</a>
<a class="nav-item" href="/ai-assistant/ai-assistant.html">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
  AI Assistant
</a>
`;

// ── Global config injection (add to your existing config object) ──
// Merge these into your existing window.SIMPATICO_CONFIG:
window.SIMPATICO_CONFIG = Object.assign(window.SIMPATICO_CONFIG || {}, {
  // supabaseUrl:    'https://YOUR_PROJECT.supabase.co',
  // supabaseAnonKey:'YOUR_ANON_KEY',
  workerUrl:   'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl: 'https://files.YOUR_DOMAIN.com',
});

// ── Active nav highlight helper (reuse or replace your existing one) ──
(function highlightActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item, .hr-nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const match = href.split('?')[0];
    if (path.endsWith(match) || path.includes(match.replace(/^\//, ''))) {
      link.classList.add('active');
    }
  });
})();
