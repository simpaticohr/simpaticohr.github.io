/**
 * 🏢 SIMPATICO HR — ENTERPRISE CONFIGURATION (v5.0)
 * Points to the isolated 'production' environment.
 */
// Fix "Not Secure" by enforcing HTTPS on production domain
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  location.replace(`https:${location.href.substring(location.protocol.length)}`);
}

window.SIMPATICO_CONFIG = {
  // 1. DATABASE GATEWAY
  supabaseUrl: 'https://cvkxtsvgnynxexmemfuy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4',

  // 2. INDUSTRIAL BACKEND (Points to the new worker we built)
  workerUrl: 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',

  // 3. SECURE STORAGE (R2 Public Bucket)
  r2PublicUrl: 'https://files.simpaticohr.in',

  // 4. SAAS ATTRIBUTES (For Enterprise Isolation)
  tenantId: 'SIMP_PRO_MAIN', // Change this when you onboard new clients
  appVersion: '5.0.0-Industrial',
  
  // Helper to generate Trace IDs for debugging (crypto-safe)
  generateTraceId: () => {
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    return 'TRC-' + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
};

// Secure token generation (crypto.getRandomValues — NOT Math.random)
// shared-utils.js provides the canonical version; this is a fallback.
if (!window.generateSecureToken) {
  window.generateSecureToken = function(length) {
    length = length || 32;
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) token += chars[array[i] % chars.length];
    return token;
  };
}

if (!window.generateInterviewToken) {
  window.generateInterviewToken = function() { return window.generateSecureToken(); };
}

window.getInterviewLink = function(token) {
  const baseUrl = window.location.origin + '/interview/proctored-room.html';
  return baseUrl + '?token=' + (token || window.generateSecureToken());
};