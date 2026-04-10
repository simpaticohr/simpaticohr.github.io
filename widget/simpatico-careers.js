/**
 * SimpaticoHR Embeddable Careers Widget
 * 
 * Usage:
 * <div id="simpatico-careers-widget" data-company-id="YOUR_COMPANY_ID"></div>
 * <script src="https://simpaticohr.github.io/widget/simpatico-careers.js"></script>
 */

(function() {
  function initSimpaticoCareers() {
    const container = document.getElementById('simpatico-careers-widget');
    if (!container) return;

    const companyId = container.getAttribute('data-company-id');
    // Using the Cloudflare Worker URL or the configured local/prod API
    const apiUrl = container.getAttribute('data-api-url') || 'https://backend.simpaticohr.workers.dev';
    const atsUrl = container.getAttribute('data-ats-url') || 'https://simpaticohr.github.io';
    
    if (!companyId) {
      container.innerHTML = '<p style="color: #ef4444; font-family: sans-serif;">Error: Simpatico Careers Widget missing data-company-id attribute.</p>';
      return;
    }

    // Loading state
    container.innerHTML = '<div style="font-family: sans-serif; color: #6b7280; padding: 20px; text-align: center;">Loading open positions...</div>';

    fetch(`${apiUrl}/recruitment/public/jobs?company_id=${companyId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data.success || !data.data || !data.data.jobs) throw new Error('Invalid API response format');
        renderJobs(container, data.data.jobs, atsUrl, companyId);
      })
      .catch(err => {
        console.error('Simpatico Widget Error:', err);
        container.innerHTML = `<div style="font-family: sans-serif; color: #ef4444; padding: 20px; text-align: center;">
          Failed to load careers. Please try again later.
        </div>`;
      });
  }

  function renderJobs(container, jobs, atsUrl, companyId) {
    if (!jobs || jobs.length === 0) {
      container.innerHTML = `
        <div style="font-family: sans-serif; padding: 40px 20px; text-align: center; background: #f9fafb; border-radius: 8px; color: #4b5563;">
          <h3 style="margin-top: 0;">No open positions</h3>
          <p style="margin-bottom: 0;">There are currently no open positions. Please check back later.</p>
        </div>`;
      return;
    }

    let html = `
      <style>
        .simpatico-job-list { list-style: none; padding: 0; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .simpatico-job-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; background: #fff; transition: box-shadow 0.2s ease, border-color 0.2s ease; }
        .simpatico-job-item:hover { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-color: #d1d5db; }
        .simpatico-job-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 12px; }
        .simpatico-job-title { font-size: 1.125rem; font-weight: 600; color: #111827; margin: 0; }
        .simpatico-job-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.875rem; color: #6b7280; margin-bottom: 16px; }
        .simpatico-job-meta-item { display: inline-flex; align-items: center; gap: 6px; }
        .simpatico-job-desc { font-size: 0.95rem; color: #4b5563; margin-bottom: 20px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .simpatico-job-apply-btn { display: inline-flex; align-items: center; justify-content: center; background-color: #4f46e5; color: white !important; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-weight: 500; font-size: 0.875rem; transition: background-color 0.2s ease; }
        .simpatico-job-apply-btn:hover { background-color: #4338ca; }
        .simpatico-job-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f3f4f6; padding-top: 16px; }
        .simpatico-job-date { font-size: 0.75rem; color: #9ca3af; }
        
        @media (max-width: 600px) {
          .simpatico-job-header { flex-direction: column; }
        }
      </style>
      <ul class="simpatico-job-list">
    `;

    jobs.forEach(job => {
      const applyLink = `${atsUrl}/job-apply.html?id=${job.id}&company_id=${companyId}`;
      const postDate = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const empType = job.employment_type ? job.employment_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Full Time';
      const department = job.department || 'General';
      const location = job.location || 'Remote';
      
      html += `
        <li class="simpatico-job-item">
          <div class="simpatico-job-header">
            <h3 class="simpatico-job-title">${job.title}</h3>
            <a href="${applyLink}" target="_blank" rel="noopener noreferrer" class="simpatico-job-apply-btn">Apply Now</a>
          </div>
          
          <div class="simpatico-job-meta">
            <span class="simpatico-job-meta-item">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              ${department}
            </span>
            <span class="simpatico-job-meta-item">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              ${location}
            </span>
            <span class="simpatico-job-meta-item">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              ${empType}
            </span>
          </div>
          
          <div class="simpatico-job-desc">${job.description || ''}</div>
          
          <div class="simpatico-job-footer">
            <span class="simpatico-job-date">Posted ${postDate}</span>
          </div>
        </li>
      `;
    });

    html += '</ul>';
    
    // Branding footer (optional, can be styled or removed based on preference)
    html += `
      <div style="text-align: center; margin-top: 16px; font-family: sans-serif; font-size: 0.75rem; color: #9ca3af;">
        Powered by <a href="https://simpaticohr.in" target="_blank" style="color: #6b7280; text-decoration: none; font-weight: 500;">SimpaticoHR</a>
      </div>
    `;

    container.innerHTML = html;
  }

  // Initialize the widget
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimpaticoCareers);
  } else {
    initSimpaticoCareers();
  }
})();
