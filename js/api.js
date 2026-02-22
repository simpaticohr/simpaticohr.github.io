// js/api.js — Shared API client for all pages
const API_BASE = "https://evalis-ai.simpaticohrconsultancy.workers.dev";

const API = {
  token: localStorage.getItem("auth_token") || "",
  user: JSON.parse(localStorage.getItem("auth_user") || "null"),
  client: JSON.parse(localStorage.getItem("auth_client") || "null"),

  setAuth(token, user, client) {
    this.token = token;
    this.user = user;
    this.client = client;
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    localStorage.setItem("auth_client", JSON.stringify(client));
  },

  clearAuth() {
    this.token = "";
    this.user = null;
    this.client = null;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_client");
  },

  isLoggedIn() {
    if (!this.token) return false;
    try {
      const d = JSON.parse(atob(this.token));
      return d.exp > Date.now();
    } catch { return false; }
  },

  getRole() {
    return this.user?.role || "";
  },

  async request(path, method = "GET", data = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (this.token) opts.headers["Authorization"] = "Bearer " + this.token;
    if (data && method !== "GET") opts.body = JSON.stringify(data);

    const r = await fetch(API_BASE + path, opts);
    const json = await r.json();

    if (r.status === 401) {
      this.clearAuth();
      if (!window.location.pathname.includes("login")) {
        window.location.href = "login.html";
      }
      throw new Error(json.error || "Session expired");
    }
    if (!r.ok) throw new Error(json.error || "Request failed");
    return json;
  },

  // Auth
  async login(email, password) {
    const r = await this.request("/auth/login", "POST", { email, password });
    this.setAuth(r.token, r.user, r.client);
    return r;
  },

  async register(data) {
    const r = await this.request("/auth/register", "POST", data);
    this.setAuth(r.token, r.user, r.client);
    return r;
  },

  logout() {
    this.clearAuth();
    window.location.href = "login.html";
  },

  async me() { return this.request("/auth/me"); },
  async changePassword(current, password) { return this.request("/auth/password", "POST", { current, password }); },

  // SuperAdmin
  async adminStats() { return this.request("/admin/stats"); },
  async adminClients() { return this.request("/admin/clients"); },
  async adminCreateClient(data) { return this.request("/admin/clients", "POST", data); },
  async adminToggleClient(id) { return this.request(`/admin/clients/${id}/toggle`, "POST"); },
  async adminUpdateClient(id, data) { return this.request(`/admin/clients/${id}`, "PATCH", data); },
  async adminResetPassword(id) { return this.request(`/admin/clients/${id}/reset-password`, "POST"); },
  async adminDeleteClient(id) { return this.request(`/admin/clients/${id}`, "DELETE"); },
  async adminUsers() { return this.request("/admin/users"); },

  // Client Dashboard
  async clientStats() { return this.request("/client/stats"); },
  async clientAnalytics() { return this.request("/client/analytics"); },
  async clientAudit() { return this.request("/client/audit"); },

  // HR Users
  async listHR() { return this.request("/client/hr"); },
  async createHR(data) { return this.request("/client/hr", "POST", data); },
  async toggleHR(id) { return this.request(`/client/hr/${id}/toggle`, "POST"); },
  async deleteHR(id) { return this.request(`/client/hr/${id}`, "DELETE"); },

  // Jobs
  async publicJobs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/jobs" + (q ? "?" + q : ""));
  },
  async clientJobs() { return this.request("/client/jobs"); },
  async createJob(data) { return this.request("/client/jobs", "POST", data); },
  async updateJob(id, data) { return this.request(`/client/jobs/${id}`, "PATCH", data); },
  async deleteJob(id) { return this.request(`/client/jobs/${id}`, "DELETE"); },

  // Applications
  async applyJob(jobId, data) { return this.request(`/jobs/${jobId}/apply`, "POST", data); },
  async clientApplications(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/client/applications" + (q ? "?" + q : ""));
  },
  async getApplication(id) { return this.request(`/client/applications/${id}`); },
  async updateAppStatus(id, status, note = "") { return this.request(`/client/applications/${id}/status`, "POST", { status, note }); },
  async bulkStatus(ids, status) { return this.request("/client/applications/bulk-status", "POST", { ids, status }); },
  async deleteApplication(id) { return this.request(`/client/applications/${id}`, "DELETE"); },
  async runATS(id) { return this.request(`/client/applications/${id}/ats`, "POST"); },

  // Notes
  async getNotes(appId) { return this.request(`/client/applications/${appId}/notes`); },
  async addNote(appId, note, type = "general") { return this.request(`/client/applications/${appId}/notes`, "POST", { note, type }); },

  // Interviews
  async createInterview(data) { return this.request("/client/interviews/create", "POST", data); },
  async listInterviews(status = "") {
    return this.request("/client/interviews" + (status ? "?status=" + status : ""));
  },

  // Onboarding
  async submitOnboarding(clientId, data) { return this.request(`/onboarding/${clientId}`, "POST", data); },
  async listOnboarding() { return this.request("/client/onboarding"); },
  async updateOnboardingStatus(id, status) { return this.request(`/client/onboarding/${id}/status`, "POST", { status }); },

  // Templates
  async listTemplates() { return this.request("/client/templates"); },
  async createTemplate(data) { return this.request("/client/templates", "POST", data); },

  // Public
  async publicCompanies() { return this.request("/public/companies"); },

  // Legacy
  async db(action, table, data = null, filters = null, select = null, order = null) {
    return this.request("/db", "POST", { action, table, data, filters, select, order });
  }
};

// Auth guard utility
function requireAuth(roles = []) {
  if (!API.isLoggedIn()) { window.location.href = "login.html"; return false; }
  if (roles.length && !roles.includes(API.getRole())) { window.location.href = "login.html"; return false; }
  return true;
}

function toast(msg, type = "info") {
  const c = document.getElementById("toasts") || (() => {
    const d = document.createElement("div");
    d.id = "toasts";
    d.style.cssText = "position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;";
    document.body.appendChild(d);
    return d;
  })();
  const t = document.createElement("div");
  const colors = { info: "#3b82f6", success: "#10b981", error: "#ef4444", warning: "#f59e0b" };
  t.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:12px 20px;border-radius:12px;font-size:0.88rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.2);animation:tIn .3s ease;font-family:system-ui;`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = "tOut .3s ease forwards"; setTimeout(() => t.remove(), 300); }, 3000);
}
