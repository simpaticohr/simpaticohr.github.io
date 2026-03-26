/**
 * 🏢 SIMPATICO HR — ENTERPRISE CONFIGURATION (v5.0)
 * Points to the isolated 'production' environment.
 */
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
  
  // Helper to generate Trace IDs for debugging
  generateTraceId: () => `TRC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
};