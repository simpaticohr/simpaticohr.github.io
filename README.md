# Simpatico HR Platform — Extension Modules

This package extends the existing Simpatico HR ATS into a **full SaaS HR platform**.

---

## New Modules Added

| Module | Files | Description |
|--------|-------|-------------|
| `employees/` | `employees.html`, `employee-profile.html` | Full employee directory + profile pages |
| `onboarding/` | `onboarding.html` | Kanban-style onboarding pipeline |
| `training/` | `training.html` | LMS: courses, paths, compliance tracking |
| `performance/` | `performance.html` | Review cycles, goals, 9-box grid |
| `hr-ops/` | `hr-ops.html` | Leave management, policies, tickets, org chart |
| `payroll/` | `payroll.html` | Payslips, salary register, payroll runs |
| `analytics/` | `analytics.html` | Charts, KPIs, workforce intelligence |
| `ai-assistant/` | `ai-assistant.html` | RAG chat: Cloudflare AI + Vectorize |

### JavaScript (new files only)
- `js/employees.js`
- `js/onboarding.js`
- `js/training.js`
- `js/performance.js`
- `js/hr-ops.js`
- `js/payroll.js`
- `js/analytics.js`
- `js/ai-assistant.js`

### CSS (new file only)
- `css/hr-modules.css` — Complete design system for all new modules

### Backend
- `workers/hr-api.js` — Single Cloudflare Worker handling all API routes
- `wrangler.toml` — Worker deployment config
- `supabase-schema.sql` — Full Postgres schema (run once in Supabase SQL editor)

### Patch (NOT a replacement)
- `PATCH-js-app.js` — Instructions + snippets to add new nav links to your existing `js/app.js`

---

## Integration Setup

### Step 1: Supabase
```sql
-- Run in Supabase SQL Editor
\i supabase-schema.sql
```

### Step 2: Cloudflare Worker
```bash
# Set secrets
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put RESEND_API_KEY   # optional, for emails

# Create Vectorize index
npx wrangler vectorize create hr-knowledge --dimensions=384 --metric=cosine

# Create R2 bucket
npx wrangler r2 bucket create simpatico-hr-files

# Deploy
npx wrangler deploy workers/hr-api.js
```

### Step 3: Configure Frontend
In your existing `js/app.js`, update (or add) the config:
```js
window.SIMPATICO_CONFIG = {
  supabaseUrl:     'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  workerUrl:       'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl:     'https://files.YOUR_DOMAIN.com',
};
```

### Step 4: Add Nav Links
See `PATCH-js-app.js` — copy the HTML snippet into your existing sidebar template.

### Step 5: Link CSS
Add to your existing base HTML template:
```html
<link rel="stylesheet" href="/css/hr-modules.css">
```

### Step 6: Load Supabase JS (if not already loaded)
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

---

## Architecture

```
Browser
  │
  ├── Supabase JS (direct DB reads for lists/profiles)
  │
  └── Cloudflare Workers (hr-api.js)
        ├── Supabase Service Role (write ops, payroll, leave approval)
        ├── Cloudflare AI (llama-3.1-8b — AI chat, insights, feedback)
        ├── Cloudflare Vectorize (semantic course search, RAG)
        ├── Cloudflare R2 (avatars, documents, policies, payslip PDFs)
        └── Resend API (email notifications)
```

## Cloudflare AI Models Used
| Feature | Model |
|---------|-------|
| Chat assistant | `@cf/meta/llama-3.1-8b-instruct` |
| Embeddings (Vectorize) | `@cf/baai/bge-small-en-v1.5` |

---

## File Structure (new files only)
```
employees/
  employees.html
  employee-profile.html
onboarding/
  onboarding.html
training/
  training.html
performance/
  performance.html
hr-ops/
  hr-ops.html
payroll/
  payroll.html
analytics/
  analytics.html
ai-assistant/
  ai-assistant.html
js/
  employees.js
  onboarding.js
  training.js
  performance.js
  hr-ops.js
  payroll.js
  analytics.js
  ai-assistant.js
css/
  hr-modules.css
workers/
  hr-api.js
wrangler.toml
supabase-schema.sql
PATCH-js-app.js      ← instructions, not a replacement
README.md
```

---

## Existing Files — NOT Modified
The following existing modules are untouched:
`auth/` `dashboard/` `interview/` `js/` (existing) `CSS/` (existing) `admin/` `candidates/` `employers/` `pipeline` `jobs` `career` `ai-job-portal` `evalis-interview` `mock-admin` `platform`
