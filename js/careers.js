// Ensure this points to your actual backend worker URL
const API_BASE_URL = 'https://YOUR_WORKER_URL'; 

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tenantId = urlParams.get('company');
    const jobsContainer = document.getElementById('jobsContainer');
    const emptyState = document.getElementById('emptyState');
    const filterDepartment = document.getElementById('filterDepartment');
    const companyName = document.getElementById('companyName');

    if (!tenantId) {
        jobsContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border border-red-200">Error: No company identifier provided in the URL.</div>`;
        return;
    }

    // Optionally, format tenant ID to look like a company name if you don't have an endpoint fetching the real Org Profile yet
    companyName.textContent = tenantId.replace(/_/g, ' ').toUpperCase() + ' Careers';

    try {
        const response = await fetch(`${API_BASE_URL}/api/public/jobs?tenant_id=${tenantId}`);
        
        if (!response.ok) throw new Error('Failed to fetch jobs');
        
        const data = await response.json();
        const jobs = data.jobs || [];

        renderJobs(jobs);
        populateDepartments(jobs);

    } catch (error) {
        console.error('Error fetching jobs:', error);
        jobsContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border border-red-200">Could not load active job listings. Please try again later.</div>`;
    }

    function renderJobs(jobsToRender) {
        jobsContainer.innerHTML = ''; // clear loading state
        
        if (jobsToRender.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');

        jobsToRender.forEach(job => {
            const jobCard = document.createElement('div');
            jobCard.className = "p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow group";
            
            jobCard.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">${job.title}</h2>
                        <div class="mt-2 flex items-center gap-4 text-sm text-gray-600">
                            <span class="flex items-center"><svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>${job.department}</span>
                            <span class="flex items-center"><svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>${job.location || 'Remote'}</span>
                            <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">${job.employment_type || 'Full-time'}</span>
                        </div>
                    </div>
                    <!-- Clicking apply passes the job ID for the next page application form -->
                    <a href="apply.html?company=${tenantId}&job_id=${job.id}" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Apply Now
                    </a>
                </div>
            `;
            jobsContainer.appendChild(jobCard);
        });
    }

    function populateDepartments(jobsList) {
        const depts = [...new Set(jobsList.map(j => j.department).filter(Boolean))];
        depts.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            filterDepartment.appendChild(option);
        });
    }
});