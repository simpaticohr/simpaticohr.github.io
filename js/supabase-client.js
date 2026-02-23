// js/supabase-client.js
const SUPABASE_URL = 'https://cvkxtsvgnynxexmemfuy.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual key
const WORKER_URL = 'https://evalis-ai.simpaticohrconsultancy.workers.dev';
const SITE_URL = 'https://simpaticohr.in';

// Initialize Supabase Client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    redirectTo: `${SITE_URL}/auth/callback`
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Worker API Client
class WorkerAPI {
  constructor() {
    this.baseUrl = WORKER_URL;
  }

  async request(endpoint, options = {}) {
    const session = await supabaseClient.auth.getSession();
    const token = session?.data?.session?.access_token;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // AI JD Generation
  async generateJD(params) {
    return this.request('/api/ai/generate-jd', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  // AI Resume Parsing
  async parseResume(file) {
    const formData = new FormData();
    formData.append('resume', file);
    
    const session = await supabaseClient.auth.getSession();
    const token = session?.data?.session?.access_token;
    
    return fetch(`${this.baseUrl}/api/ai/parse-resume`, {
      method: 'POST',
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
      body: formData
    }).then(r => r.json());
  }

  // AI Match Score
  async calculateMatchScore(jobId, candidateId) {
    return this.request('/api/ai/match-score', {
      method: 'POST',
      body: JSON.stringify({ jobId, candidateId })
    });
  }

  // Send WhatsApp
  async sendWhatsApp(params) {
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  // Proctoring Analysis
  async analyzeProctoringFrame(data) {
    return this.request('/api/proctor/analyze', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // AI Interview Questions
  async generateInterviewQuestions(jobId) {
    return this.request('/api/ai/interview-questions', {
      method: 'POST',
      body: JSON.stringify({ jobId })
    });
  }
}

const workerAPI = new WorkerAPI();

// Export for use in other modules
window.SimpaticoDB = supabaseClient;
window.SimpaticoAPI = workerAPI;
window.SUPABASE_URL = SUPABASE_URL;
window.WORKER_URL = WORKER_URL;
window.SITE_URL = SITE_URL;
