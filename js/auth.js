// js/auth.js
// SimpaticoHR Authentication Module

class AuthManager {
  constructor() {
    this.db = window.SimpaticoDB;
    this.currentUser = null;
    this.userProfile = null;
  }

  // Login with email/password
  async login(email, password) {
    try {
      const { data, error } = await this.db.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Fetch user profile
      const profile = await this.getUserProfile(data.user.id);
      if (!profile) throw new Error('User profile not found. Please contact admin.');

      // Update last login
      await this.db.from('users').update({ last_login: new Date().toISOString() }).eq('auth_id', data.user.id);

      // Redirect based on role
      this.redirectByRole(profile.role);
      return { success: true, user: data.user, profile };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // Social Login
  async socialLogin(provider) {
    try {
      const { data, error } = await this.db.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.SITE_URL}/auth/callback`
        }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Social login error:', error);
      throw error;
    }
  }

  // Register Company
  async registerCompany(adminData, companyData) {
    try {
      // Create auth user
      const { data: authData, error: authError } = await this.db.auth.signUp({
        email: adminData.email,
        password: adminData.password,
        options: {
          data: {
            full_name: adminData.name,
            phone: adminData.phone,
            role: 'company_admin'
          }
        }
      });
      if (authError) throw authError;

      // Create company
      const slug = companyData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: company, error: compError } = await this.db.from('companies').insert({
        name: companyData.name,
        slug: slug + '-' + Date.now().toString(36),
        industry: companyData.industry,
        company_size: companyData.size,
        website: companyData.website,
        contact_email: adminData.email,
        contact_phone: adminData.phone,
        subscription_plan: 'trial',
        subscription_start: new Date().toISOString().split('T')[0],
        subscription_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        features: companyData.features || { proctoring: true, whatsapp: true, ai_jd: true, automation: true }
      }).select().single();
      if (compError) throw compError;

      // Create user profile
      const { error: userError } = await this.db.from('users').insert({
        auth_id: authData.user.id,
        company_id: company.id,
        email: adminData.email,
        phone: adminData.phone,
        full_name: adminData.name,
        role: 'company_admin'
      });
      if (userError) throw userError;

      // Create default notification templates
      await this.createDefaultTemplates(company.id);

      // Create default automation rules
      await this.createDefaultAutomation(company.id);

      return { success: true, company, user: authData.user };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  // Register Candidate
  async registerCandidate(candidateData) {
    try {
      const { data: authData, error: authError } = await this.db.auth.signUp({
        email: candidateData.email,
        password: candidateData.password,
        options: {
          data: {
            full_name: candidateData.name,
            phone: candidateData.phone,
            role: 'candidate'
          }
        }
      });
      if (authError) throw authError;

      // Create user profile
      const { data: user, error: userError } = await this.db.from('users').insert({
        auth_id: authData.user.id,
        email: candidateData.email,
        phone: candidateData.phone,
        full_name: candidateData.name,
        role: 'candidate'
      }).select().single();
      if (userError) throw userError;

      // Create candidate profile
      const skills = candidateData.skills ? 
        candidateData.skills.split(',').map(s => s.trim()).filter(Boolean) : [];

      const { error: profileError } = await this.db.from('candidate_profiles').insert({
        user_id: user.id,
        skills: skills,
        experience_years: candidateData.experience || 0,
        location: candidateData.location || '',
        source: 'direct_registration'
      });
      if (profileError) throw profileError;

      // Upload resume if provided
      if (candidateData.resume) {
        await this.uploadResume(user.id, candidateData.resume);
      }

      return { success: true, user: authData.user };
    } catch (error) {
      console.error('Candidate registration error:', error);
      throw error;
    }
  }

  // Upload Resume
  async uploadResume(userId, file) {
    const fileExt = file.name.split('.').pop();
    const filePath = `resumes/${userId}/${Date.now()}.${fileExt}`;
    
    const { error } = await this.db.storage.from('documents').upload(filePath, file);
    if (error) throw error;

    const { data: urlData } = this.db.storage.from('documents').getPublicUrl(filePath);
    
    await this.db.from('candidate_profiles').update({ resume_url: urlData.publicUrl }).eq('user_id', userId);
    
    // Trigger AI resume parsing
    try {
      await window.SimpaticoAPI.parseResume(file);
    } catch (e) {
      console.warn('Resume parsing skipped:', e);
    }

    return urlData.publicUrl;
  }

  // Get User Profile
  async getUserProfile(authId) {
    const { data, error } = await this.db
      .from('users')
      .select('*, companies(*)')
      .eq('auth_id', authId)
      .single();
    if (error) return null;
    return data;
  }

  // Check Session
  async checkSession() {
    const { data: { session } } = await this.db.auth.getSession();
    if (!session) return null;
    
    const profile = await this.getUserProfile(session.user.id);
    this.currentUser = session.user;
    this.userProfile = profile;
    return { session, profile };
  }

  // Logout
  async logout() {
    await this.db.auth.signOut();
    window.location.href = '/auth/login.html';
  }

  // Redirect by Role
  redirectByRole(role) {
    const routes = {
      'super_admin': '/dashboard/super-admin.html',
      'company_admin': '/dashboard/company.html',
      'hr_manager': '/dashboard/hr.html',
      'interviewer': '/dashboard/interviewer.html',
      'candidate': '/dashboard/candidate.html'
    };
    window.location.href = routes[role] || '/dashboard/candidate.html';
  }

  // Guard Route
  async guardRoute(allowedRoles = []) {
    const session = await this.checkSession();
    if (!session) {
      window.location.href = '/auth/login.html';
      return null;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(session.profile.role)) {
      this.redirectByRole(session.profile.role);
      return null;
    }
    return session;
  }

  // Create Default Templates
  async createDefaultTemplates(companyId) {
    const templates = [
      {
        company_id: companyId, name: 'Application Received', type: 'email',
        subject: 'Application Received - {{job_title}}',
        body: 'Dear {{candidate_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. We have received your application and will review it shortly.\n\nBest Regards,\n{{company_name}} HR Team',
        variables: ['candidate_name', 'job_title', 'company_name']
      },
      {
        company_id: companyId, name: 'Interview Scheduled', type: 'email',
        subject: 'Interview Scheduled - {{job_title}}',
        body: 'Dear {{candidate_name}},\n\nYour interview for {{job_title}} has been scheduled.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\nType: {{interview_type}}\nLink: {{meeting_url}}\n\nBest Regards,\n{{company_name}} HR Team',
        variables: ['candidate_name', 'job_title', 'interview_date', 'interview_time', 'interview_type', 'meeting_url', 'company_name']
      },
      {
        company_id: companyId, name: 'WhatsApp Interview Reminder', type: 'whatsapp',
        subject: 'Interview Reminder',
        body: 'Hi {{candidate_name}}! 👋\n\nReminder: Your interview for *{{job_title}}* is scheduled for *{{interview_date}}* at *{{interview_time}}*.\n\nJoin here: {{meeting_url}}\n\nGood luck! 🍀\n- {{company_name}}',
        variables: ['candidate_name', 'job_title', 'interview_date', 'interview_time', 'meeting_url', 'company_name']
      },
      {
        company_id: companyId, name: 'Offer Letter', type: 'email',
        subject: 'Offer Letter - {{job_title}} at {{company_name}}',
        body: 'Dear {{candidate_name}},\n\nCongratulations! We are pleased to offer you the position of {{job_title}} at {{company_name}}.\n\nPlease find attached the detailed offer letter.\n\nBest Regards,\n{{company_name}} HR Team',
        variables: ['candidate_name', 'job_title', 'company_name']
      }
    ];
    await this.db.from('notification_templates').insert(templates);
  }

  // Create Default Automation Rules
  async createDefaultAutomation(companyId) {
    const rules = [
      {
        company_id: companyId,
        name: 'Auto-send application confirmation',
        trigger_event: 'application.created',
        conditions: {},
        actions: [{ type: 'send_email', template: 'Application Received' }],
        is_active: true
      },
      {
        company_id: companyId,
        name: 'Auto-screen high-match candidates',
        trigger_event: 'application.created',
        conditions: { ai_match_score: { gte: 80 } },
        actions: [{ type: 'move_stage', stage: 'screened' }],
        is_active: true
      },
      {
        company_id: companyId,
        name: 'Send WhatsApp reminder 1hr before interview',
        trigger_event: 'interview.reminder',
        conditions: { hours_before: 1 },
        actions: [{ type: 'send_whatsapp', template: 'WhatsApp Interview Reminder' }],
        is_active: true
      }
    ];
    await this.db.from('automation_rules').insert(rules);
  }
}

// Initialize Auth Manager
const authManager = new AuthManager();
window.authManager = authManager;

// Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}" 
       style="color: var(--${type === 'error' ? 'danger' : type})"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;background:none;color:var(--gray-400);font-size:1rem;">&times;</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Login Handler
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Signing In...';
  
  try {
    await authManager.login(email, password);
    showToast('Login successful! Redirecting...', 'success');
  } catch (error) {
    showToast(error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
}

// Social Login Handler
async function socialLogin(provider) {
  try {
    await authManager.socialLogin(provider);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Company Registration Handler
async function handleCompanyRegistration() {
  const btn = document.getElementById('registerBtn');
  
  if (!document.getElementById('agreeTerms').checked) {
    showToast('Please agree to the Terms of Service', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Creating Account...';
  
  try {
    const adminData = {
      name: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      phone: document.getElementById('regPhone').value,
      password: document.getElementById('regPassword').value
    };
    
    const companyData = {
      name: document.getElementById('companyName').value,
      industry: document.getElementById('companyIndustry').value,
      size: document.getElementById('companySize').value,
      website: document.getElementById('companyWebsite').value
    };
    
    await authManager.registerCompany(adminData, companyData);
    showToast('Account created! Please check your email to verify.', 'success');
    setTimeout(() => window.location.href = 'login.html', 2000);
  } catch (error) {
    showToast(error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket"></i> Create Account';
  }
}

// Candidate Registration Handler
async function handleCandidateRegistration(e) {
  e.preventDefault();
  const btn = document.getElementById('candRegBtn');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Creating Account...';
  
  try {
    const data = {
      name: document.getElementById('candName').value,
      email: document.getElementById('candEmail').value,
      phone: document.getElementById('candPhone').value,
      password: document.getElementById('candPassword').value,
      experience: parseFloat(document.getElementById('candExperience').value) || 0,
      skills: document.getElementById('candSkills').value,
      location: document.getElementById('candLocation').value,
      resume: document.getElementById('candResume').files[0]
    };
    
    await authManager.registerCandidate(data);
    showToast('Registration successful! Please verify your email.', 'success');
    setTimeout(() => window.location.href = 'login.html', 2000);
  } catch (error) {
    showToast(error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
  }
}
