/**
 * 🚀 Simpatico HR — Automated Static Job Pages & Sitemap Generator
 * Fetches all open jobs from Supabase, builds static HTML pages with Google JobPosting
 * JSON-LD schema, and updates sitemap.xml.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cvkxtsvgnynxexmemfuy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4';
const SITE_URL = 'https://simpaticohr.in';

function slugify(text) {
  return (text || 'job')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseLocation(loc) {
  const l = (loc || '').trim();
  const lower = l.toLowerCase();
  const isRemote = lower.includes('remote') || lower.includes('work from home') || lower.includes('wfh');
  
  let locality = l.split(',')[0]?.trim() || (isRemote ? 'Remote' : 'Perinthalmanna');
  let region = 'Kerala';
  let country = 'IN';

  if (lower.includes('karnataka') || lower.includes('bangalore') || lower.includes('bengaluru')) {
    region = 'Karnataka';
    locality = locality || 'Bengaluru';
  } else if (lower.includes('tamil nadu') || lower.includes('chennai') || lower.includes('coimbatore')) {
    region = 'Tamil Nadu';
  } else if (lower.includes('maharashtra') || lower.includes('mumbai') || lower.includes('pune')) {
    region = 'Maharashtra';
  } else if (lower.includes('delhi')) {
    region = 'Delhi';
  } else if (lower.includes('uae') || lower.includes('dubai') || lower.includes('abu dhabi')) {
    region = 'Dubai';
    country = 'AE';
  }

  return { locality, region, country, isRemote };
}

function mapEmploymentType(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('part')) return 'PART_TIME';
  if (t.includes('contract')) return 'CONTRACTOR';
  if (t.includes('intern')) return 'INTERN';
  return 'FULL_TIME';
}

function buildJobHtml(job) {
  const title = job.title || 'Open Position';
  const company = job.company_name || job.department || 'Simpatico HR Consultancy';
  const rawLoc = job.location || 'Perinthalmanna, Kerala';
  const { locality, region, country, isRemote } = parseLocation(rawLoc);
  const empType = mapEmploymentType(job.employment_type || job.job_type);
  const slug = `${slugify(title)}-${job.id}`;
  const canonicalUrl = `${SITE_URL}/job/${slug}`;
  const applyUrl = `${SITE_URL}/job-apply.html?role=${encodeURIComponent(title)}&job_id=${job.id}`;
  
  const postedDate = (job.created_at || new Date().toISOString()).slice(0, 10);
  const validThrough = job.valid_through 
    ? new Date(job.valid_through).toISOString().slice(0, 10)
    : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const cleanDesc = (job.description || `Simpatico HR Consultancy is actively seeking a qualified ${title} to join our client team in ${locality}. Excellent growth opportunities with AI-driven screening and placement assistance.`)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // JobPosting Schema.org for Google for Jobs
  const jobSchema = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": title,
    "description": cleanDesc,
    "datePosted": postedDate,
    "validThrough": validThrough,
    "employmentType": empType,
    "hiringOrganization": {
      "@type": "Organization",
      "name": company,
      "sameAs": SITE_URL,
      "logo": `${SITE_URL}/favicon-96x96.png`
    },
    "directApply": true,
    "url": canonicalUrl
  };

  if (isRemote) {
    jobSchema.jobLocationType = "TELECOMMUTE";
    jobSchema.applicantLocationRequirements = {
      "@type": "Country",
      "name": country
    };
  } else {
    jobSchema.jobLocation = {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": locality,
        "addressRegion": region,
        "addressCountry": country
      }
    };
  }

  if (job.salary_min || job.salary_max) {
    jobSchema.baseSalary = {
      "@type": "MonetaryAmount",
      "currency": country === 'AE' ? 'AED' : 'INR',
      "value": {
        "@type": "QuantitativeValue",
        "minValue": Number(job.salary_min) || Number(job.salary_max),
        "maxValue": Number(job.salary_max) || Number(job.salary_min),
        "unitText": "YEAR"
      }
    };
  }

  const breadcrumbsSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Jobs", "item": `${SITE_URL}/jobs.html` },
      { "@type": "ListItem", "position": 3, "name": title, "item": canonicalUrl }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} Hiring in ${escapeHtml(locality)} | Simpatico HR</title>
  <meta name="description" content="Apply for ${escapeHtml(title)} in ${escapeHtml(locality)}, ${escapeHtml(region)}. Verified hiring opportunity via Simpatico HR. Direct apply with instant screening.">
  <meta name="keywords" content="${escapeHtml(title)}, ${escapeHtml(locality)} jobs, ${escapeHtml(region)} careers, Simpatico HR recruitment, hiring now">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)} in ${escapeHtml(locality)} | Simpatico HR">
  <meta property="og:description" content="Simpatico HR is hiring for ${escapeHtml(title)}. View requirements and apply directly.">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/simpatico_hr_banner.png">
  <meta property="og:site_name" content="Simpatico HR">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} | Simpatico HR">
  <meta name="twitter:description" content="Apply for ${escapeHtml(title)} in ${escapeHtml(locality)}. Instant screening available.">
  <meta name="twitter:image" content="${SITE_URL}/simpatico_hr_banner.png">

  <!-- Google for Jobs Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(jobSchema, null, 2)}
  </script>

  <!-- Breadcrumbs Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(breadcrumbsSchema, null, 2)}
  </script>

  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
  <style>
    :root {
      --bg: #050a18; --bg-card: #0c1225; --bg-surface: #111a33;
      --primary: #6366f1; --primary-light: #818cf8; --primary-glow: rgba(99,102,241,.18);
      --accent: #06b6d4; --success: #10b981; --text: #e2e8f0;
      --text-muted: #94a3b8; --text-dim: #64748b; --border: rgba(255,255,255,.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh; }
    .nav { background: rgba(5,10,24,.92); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border); padding: 14px 6%; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
    .logo { color: #fff; font-weight: 800; font-size: 1.1rem; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .logo span { color: var(--primary); }
    .nav-links { display: flex; gap: 12px; }
    .nav-link { color: var(--text-muted); text-decoration: none; font-size: .88rem; padding: 8px 16px; border-radius: 10px; transition: .2s; }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.05); }
    .hero { background: linear-gradient(135deg, rgba(99,102,241,.14), rgba(6,182,212,.08)); border-bottom: 1px solid var(--border); padding: 48px 6% 40px; }
    .hero-inner { max-width: 900px; margin: 0 auto; }
    .breadcrumb { font-size: .85rem; color: var(--text-dim); margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
    .breadcrumb a { color: var(--primary-light); text-decoration: none; }
    .hero h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); font-weight: 800; color: #fff; margin-bottom: 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.05); border: 1px solid var(--border); border-radius: 10px; padding: 8px 16px; font-size: .85rem; color: var(--text-muted); }
    .chip i { color: var(--primary-light); }
    .btn-apply { display: inline-flex; align-items: center; gap: 10px; background: var(--primary); color: #fff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 1rem; box-shadow: 0 4px 20px rgba(99,102,241,.3); transition: .2s; }
    .btn-apply:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99,102,241,.5); }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 6% 60px; }
    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 32px; margin-bottom: 24px; }
    .card h2 { font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
    .card h2 i { color: var(--primary-light); }
    .card p { color: var(--text-muted); line-height: 1.8; margin-bottom: 16px; white-space: pre-line; }
    .cta-card { background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(6,182,212,.08)); border: 1px solid rgba(99,102,241,.25); border-radius: 20px; padding: 36px; text-align: center; }
    .cta-card h3 { color: #fff; font-size: 1.4rem; margin-bottom: 10px; }
    .cta-card p { color: var(--text-muted); margin-bottom: 24px; }
    footer { text-align: center; padding: 30px 6%; color: var(--text-dim); font-size: .85rem; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/" class="logo">
      <img src="/favicon-96x96.png" width="28" height="28" alt="Simpatico HR" style="border-radius:6px">
      Simpatico <span>HR</span>
    </a>
    <div class="nav-links">
      <a href="/jobs.html" class="nav-link"><i class="fa fa-briefcase"></i> All Jobs</a>
      <a href="/careers.html" class="nav-link">Careers</a>
      <a href="/hr-training-program.html" class="nav-link">Academy</a>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-inner">
      <div class="breadcrumb">
        <a href="/">Home</a> / <a href="/jobs.html">Jobs</a> / <span>${escapeHtml(title)}</span>
      </div>
      <h1>${escapeHtml(title)}</h1>
      <div class="chips">
        <span class="chip"><i class="fa fa-building"></i> ${escapeHtml(company)}</span>
        <span class="chip"><i class="fa fa-location-dot"></i> ${escapeHtml(locality)}, ${escapeHtml(region)}</span>
        <span class="chip"><i class="fa fa-clock"></i> ${empType.replace('_', ' ')}</span>
        ${job.salary_min || job.salary_max ? `<span class="chip" style="color:var(--success);border-color:rgba(16,185,129,.25)"><i class="fa fa-indian-rupee-sign" style="color:var(--success)"></i> ${escapeHtml(String(job.salary_min || job.salary_max))}</span>` : ''}
        <span class="chip"><i class="fa fa-calendar"></i> Posted: ${postedDate}</span>
      </div>
      <div>
        <a href="${applyUrl}" class="btn-apply"><i class="fa fa-paper-plane"></i> Apply for this Position</a>
      </div>
    </div>
  </section>

  <main class="container">
    <div class="card">
      <h2><i class="fa fa-file-lines"></i> Job Description</h2>
      <p>${escapeHtml(job.description || cleanDesc)}</p>
    </div>

    ${job.skills || job.skills_required ? `
    <div class="card">
      <h2><i class="fa fa-star"></i> Required Skills & Qualifications</h2>
      <p>${escapeHtml(Array.isArray(job.skills || job.skills_required) ? (job.skills || job.skills_required).join(', ') : String(job.skills || job.skills_required))}</p>
    </div>` : ''}

    <div class="cta-card">
      <h3>Ready to Apply?</h3>
      <p>Submit your application in 2 minutes. Get fast evaluation through Simpatico's automated recruitment pipeline.</p>
      <a href="${applyUrl}" class="btn-apply"><i class="fa fa-bolt"></i> Instant Apply Now</a>
    </div>
  </main>

  <footer>
    <p>© ${new Date().getFullYear()} Simpatico HR Consultancy. All rights reserved. • <a href="/jobs.html" style="color:var(--primary-light)">Browse All Job Openings</a></p>
  </footer>
</body>
</html>`;
}

async function main() {
  console.log('🔄 Fetching active jobs from Supabase...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY }
  });

  if (!res.ok) {
    console.error('❌ Failed to fetch jobs:', res.status, await res.text());
    process.exit(1);
  }

  const jobs = await res.json();
  console.log(`✅ Loaded ${jobs.length} total jobs from Supabase.`);

  const activeJobs = jobs.filter(j => {
    const s = (j.status || '').toLowerCase();
    return s === 'active' || s === 'open' || s === '';
  });

  console.log(`📌 Found ${activeJobs.length} active/open jobs to generate.`);

  const jobDir = path.join(ROOT_DIR, 'job');
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  const generatedUrls = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const job of activeJobs) {
    const slug = `${slugify(job.title)}-${job.id}`;
    const targetFolder = path.join(jobDir, slug);
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

    const html = buildJobHtml(job);
    fs.writeFileSync(path.join(targetFolder, 'index.html'), html, 'utf-8');
    fs.writeFileSync(path.join(jobDir, `${slug}.html`), html, 'utf-8');

    const canonicalUrl = `${SITE_URL}/job/${slug}`;
    generatedUrls.push(canonicalUrl);
    console.log(`  [OK] Generated: /job/${slug}`);
  }

  // Update sitemap.xml
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    let sitemap = fs.readFileSync(sitemapPath, 'utf-8');

    // Remove any previously generated job URLs to avoid duplicates
    sitemap = sitemap.replace(/<!-- === Generated Jobs Start === -->[\s\S]*?<!-- === Generated Jobs End === -->\r?\n?/g, '');

    const jobXmlEntries = generatedUrls.map(url => `    <url>
      <loc>${url}</loc>
      <lastmod>${today}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.85</priority>
    </url>`).join('\n');

    const jobBlock = `  <!-- === Generated Jobs Start === -->\n${jobXmlEntries}\n  <!-- === Generated Jobs End === -->\n`;

    // Insert before </urlset>
    if (sitemap.includes('</urlset>')) {
      sitemap = sitemap.replace('</urlset>', `${jobBlock}</urlset>`);
      fs.writeFileSync(sitemapPath, sitemap, 'utf-8');
      console.log(`✅ Updated sitemap.xml with ${generatedUrls.length} individual job URLs.`);
    }
  }

  console.log('🎉 Job pages and sitemap generation completed successfully!');
}

main().catch(err => {
  console.error('Fatal error during job page generation:', err);
  process.exit(1);
});
