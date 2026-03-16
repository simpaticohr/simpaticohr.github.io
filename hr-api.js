/**
 * Cloudflare Worker — Simpatico HR Platform API
 * File: workers/hr-api.js
 *
 * Bindings required (set in wrangler.toml):
 *   - SUPABASE_URL          (secret)
 *   - SUPABASE_SERVICE_KEY  (secret)
 *   - AI                    (Workers AI binding)
 *   - VECTORIZE             (Vectorize binding: index "hr-knowledge")
 *   - HR_BUCKET             (R2 binding)
 *   - HR_KV                 (KV namespace for cache/sessions)
 *   - RESEND_API_KEY        (secret — for email notifications)
 *
 * wrangler.toml example:
 * ─────────────────────────────────────────────
 * name = "hr-api"
 * compatibility_date = "2024-09-23"
 *
 * [ai]
 * binding = "AI"
 *
 * [[vectorize]]
 * binding = "VECTORIZE"
 * index_name = "hr-knowledge"
 *
 * [[r2_buckets]]
 * binding = "HR_BUCKET"
 * bucket_name = "simpatico-hr-files"
 *
 * [[kv_namespaces]]
 * binding = "HR_KV"
 * id = "YOUR_KV_NAMESPACE_ID"
 * ─────────────────────────────────────────────
 */

// ── Router ──
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
    if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // Auth
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    try {
      // ── Employees ──
      if (path === '/employees' && method === 'POST') return handleCreateEmployee(request, env, token, corsHeaders);
      if (path.match(/^\/employees\/[^/]+\/avatar$/) && method === 'POST') return handleUploadAvatar(request, env, token, path, corsHeaders);
      if (path.match(/^\/employees\/[^/]+\/documents$/) && method === 'POST') return handleUploadDocument(request, env, token, path, corsHeaders);

      // ── R2 signed URL ──
      if (path === '/r2/signed-url' && method === 'GET') return handleSignedUrl(request, env, token, url, corsHeaders);

      // ── Onboarding ──
      if (path === '/onboarding/start' && method === 'POST') return handleStartOnboarding(request, env, token, corsHeaders);

      // ── Training ──
      if (path === '/training/courses' && method === 'POST') return handleCreateCourse(request, env, token, corsHeaders);
      if (path === '/training/enroll'  && method === 'POST') return handleEnrollTraining(request, env, token, corsHeaders);
      if (path.match(/^\/training\/remind\/[^/]+$/) && method === 'POST') return handleSendReminder(request, env, token, path, corsHeaders);
      if (path === '/training/semantic-search' && method === 'POST') return handleSemanticCourseSearch(request, env, token, corsHeaders);

      // ── Performance ──
      if (path === '/performance/cycles' && method === 'POST') return handleCreateCycle(request, env, token, corsHeaders);

      // ── Leave ──
      if (path === '/leave' && method === 'POST') return handleSubmitLeave(request, env, token, corsHeaders);
      if (path.match(/^\/leave\/[^/]+\/(approved|rejected)$/) && method === 'PATCH') return handleLeaveDecision(request, env, token, path, corsHeaders);

      // ── Policies ──
      if (path === '/policies' && method === 'POST') return handleUploadPolicy(request, env, token, corsHeaders);

      // ── Payroll ──
      if (path === '/payroll/calculate' && method === 'POST') return handleCalculatePayroll(request, env, token, corsHeaders);
      if (path === '/payroll/run'       && method === 'POST') return handleRunPayroll(request, env, token, corsHeaders);
      if (path.match(/^\/payroll\/payslips\/[^/]+\/send$/) && method === 'POST') return handleSendPayslip(request, env, token, path, corsHeaders);
      if (path === '/payroll/payslips/send-all' && method === 'POST') return handleSendAllPayslips(request, env, token, corsHeaders);

      // ── Analytics ──
      if (path === '/analytics/summary' && method === 'GET') return handleAnalyticsSummary(request, env, token, url, corsHeaders);
      if (path === '/analytics/report'  && method === 'GET') return handleAnalyticsReport(request, env, token, url, corsHeaders);

      // ── AI endpoints ──
      if (path === '/ai/chat'                   && method === 'POST') return handleAIChat(request, env, token, corsHeaders);
      if (path === '/ai/employee-insight'       && method === 'POST') return handleEmployeeInsight(request, env, token, corsHeaders);
      if (path === '/ai/onboarding-checklist'   && method === 'POST') return handleOnboardingChecklist(request, env, token, corsHeaders);
      if (path === '/ai/generate-course'        && method === 'POST') return handleGenerateCourse(request, env, token, corsHeaders);
      if (path === '/ai/performance-feedback'   && method === 'POST') return handlePerformanceFeedback(request, env, token, corsHeaders);

      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500, corsHeaders);
    }
  }
};

// ════════════════════════════════════════════════════════
// EMPLOYEE HANDLERS
// ════════════════════════════════════════════════════════

async function handleCreateEmployee(request, env, token, corsHeaders) {
  const body = await request.json();
  const { employee_id, ...rest } = body;

  // Generate employee_id
  const empNum = `EMP-${Date.now().toString(36).toUpperCase()}`;

  const res = await sbFetch(env, 'POST', '/rest/v1/employees', { ...rest, employee_id: empNum });
  if (!res.ok) {
    const err = await res.json();
    return json({ error: err.message || 'Failed to create employee' }, 400, corsHeaders);
  }
  const data = await res.json();

  // Trigger welcome email via Resend
  await sendEmail(env, {
    to:      body.email,
    subject: `Welcome to the team, ${body.first_name}!`,
    html:    `<p>Hi ${body.first_name},</p><p>Your HR profile has been created. Welcome aboard!</p>`,
  });

  return json({ success: true, employee: data[0] || data }, 201, corsHeaders);
}

async function handleUploadAvatar(request, env, token, path, corsHeaders) {
  const empId = path.split('/')[2];
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: 'No file' }, 400, corsHeaders);

  const key = `avatars/${empId}/${Date.now()}-${file.name}`;
  await env.HR_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  // Update Supabase
  await sbFetch(env, 'PATCH', `/rest/v1/employees?id=eq.${empId}`, { avatar_url: key });
  return json({ success: true, key }, 200, corsHeaders);
}

async function handleUploadDocument(request, env, token, path, corsHeaders) {
  const empId = path.split('/')[2];
  const formData = await request.formData();
  const file  = formData.get('file');
  const name  = formData.get('name') || file?.name;
  const type  = formData.get('type') || 'general';
  if (!file) return json({ error: 'No file' }, 400, corsHeaders);

  const key = `documents/${empId}/${Date.now()}-${file.name}`;
  await env.HR_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  await sbFetch(env, 'POST', '/rest/v1/employee_documents', {
    employee_id: empId, name, type, file_key: key,
  });
  return json({ success: true, key }, 201, corsHeaders);
}

// ════════════════════════════════════════════════════════
// R2 SIGNED URL
// ════════════════════════════════════════════════════════

async function handleSignedUrl(request, env, token, url, corsHeaders) {
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'Key required' }, 400, corsHeaders);

  // Generate a 1-hour presigned URL
  const signedUrl = await env.HR_BUCKET.createMultipartUpload
    ? `https://r2.YOUR_ACCOUNT.r2.cloudflarestorage.com/${key}?token=temp` // placeholder
    : `https://files.YOUR_DOMAIN.com/${key}`; // Use public bucket URL if available

  return json({ url: signedUrl }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════════

async function handleStartOnboarding(request, env, token, corsHeaders) {
  const { employee_id, template_id, start_date, buddy_id } = await request.json();

  // Load template tasks
  let tasks = [];
  if (template_id) {
    const tmplRes = await sbFetch(env, 'GET', `/rest/v1/onboarding_template_tasks?template_id=eq.${template_id}&select=*`);
    if (tmplRes.ok) tasks = await tmplRes.json();
  }

  // Default tasks if no template
  if (tasks.length === 0) {
    tasks = [
      { title: 'Complete I-9 / employment verification', category: 'compliance', due_days: 1 },
      { title: 'Set up workstation & accounts', category: 'it', due_days: 1 },
      { title: 'Read employee handbook', category: 'hr', due_days: 3 },
      { title: 'Meet with manager & team', category: 'social', due_days: 3 },
      { title: 'Complete security awareness training', category: 'training', due_days: 7 },
      { title: '30-day check-in with HR', category: 'hr', due_days: 30 },
    ];
  }

  // Create onboarding record
  const recRes = await sbFetch(env, 'POST', '/rest/v1/onboarding_records', {
    employee_id, template_id, start_date, buddy_id,
    stage: 'not_started', completion_pct: 0,
  });
  const rec = await recRes.json();
  const recId = rec[0]?.id || rec?.id;

  // Create tasks
  const startDate = new Date(start_date);
  const taskRows = tasks.map(t => ({
    onboarding_record_id: recId,
    title:    t.title,
    category: t.category || 'general',
    due_date: new Date(startDate.getTime() + (t.due_days||7)*24*60*60*1000).toISOString().slice(0,10),
    status:   'pending',
  }));
  await sbFetch(env, 'POST', '/rest/v1/onboarding_tasks', taskRows);

  // Update employee status
  await sbFetch(env, 'PATCH', `/rest/v1/employees?id=eq.${employee_id}`, { status: 'active' });

  return json({ success: true, record_id: recId }, 201, corsHeaders);
}

// ════════════════════════════════════════════════════════
// TRAINING
// ════════════════════════════════════════════════════════

async function handleCreateCourse(request, env, token, corsHeaders) {
  const body = await request.json();
  const res  = await sbFetch(env, 'POST', '/rest/v1/training_courses', body);
  const data = await res.json();

  // Index in Vectorize for semantic search
  if (env.VECTORIZE && body.title) {
    try {
      const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [body.title + ' ' + (body.description||'')] });
      await env.VECTORIZE.insert([{
        id:     data[0]?.id || crypto.randomUUID(),
        values: embedding.data[0],
        metadata: { title: body.title, category: body.category },
      }]);
    } catch (e) { console.error('Vectorize index error:', e); }
  }

  return json({ success: true, course: data[0] || data }, 201, corsHeaders);
}

async function handleEnrollTraining(request, env, token, corsHeaders) {
  const { course_id, employee_ids, due_date } = await request.json();
  const rows = employee_ids.map(id => ({
    course_id, employee_id: id, due_date, status: 'enrolled',
    enrolled_at: new Date().toISOString(),
  }));
  await sbFetch(env, 'POST', '/rest/v1/training_enrollments', rows);

  // Send enrollment emails
  for (const empId of employee_ids) {
    const empRes = await sbFetch(env, 'GET', `/rest/v1/employees?id=eq.${empId}&select=email,first_name`);
    if (empRes.ok) {
      const [emp] = await empRes.json();
      if (emp?.email) {
        await sendEmail(env, {
          to: emp.email,
          subject: 'You have been enrolled in a training course',
          html: `<p>Hi ${emp.first_name},</p><p>You have been enrolled in a new training course${due_date ? ` due by ${due_date}` : ''}. Log in to complete it.</p>`,
        });
      }
    }
  }

  return json({ success: true, enrolled: employee_ids.length }, 201, corsHeaders);
}

async function handleSendReminder(request, env, token, path, corsHeaders) {
  const enrollId = path.split('/')[3];
  const res = await sbFetch(env, 'GET', `/rest/v1/training_enrollments?id=eq.${enrollId}&select=*,employees(email,first_name),training_courses(title)`);
  if (res.ok) {
    const [enrollment] = await res.json();
    if (enrollment?.employees?.email) {
      await sendEmail(env, {
        to: enrollment.employees.email,
        subject: `Reminder: Complete "${enrollment.training_courses?.title}"`,
        html: `<p>Hi ${enrollment.employees.first_name},</p><p>This is a reminder to complete your training: <strong>${enrollment.training_courses?.title}</strong>.</p>`,
      });
    }
  }
  return json({ success: true }, 200, corsHeaders);
}

async function handleSemanticCourseSearch(request, env, token, corsHeaders) {
  const { query } = await request.json();
  if (!env.VECTORIZE || !env.AI) return json({ courses: [] }, 200, corsHeaders);

  const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [query] });
  const results   = await env.VECTORIZE.query(embedding.data[0], { topK: 8, returnMetadata: true });
  const ids       = results.matches.map(m => m.id);

  const res    = await sbFetch(env, 'GET', `/rest/v1/training_courses?id=in.(${ids.join(',')})&select=*`);
  const courses = res.ok ? await res.json() : [];
  return json({ courses }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════
// PERFORMANCE
// ════════════════════════════════════════════════════════

async function handleCreateCycle(request, env, token, corsHeaders) {
  const { name, start_date, end_date, type, scope } = await request.json();

  const cycleRes = await sbFetch(env, 'POST', '/rest/v1/review_cycles', {
    name, start_date, end_date, type, scope, status: 'active',
  });
  const cycle = await cycleRes.json();
  const cycleId = cycle[0]?.id;

  // Auto-create review records based on scope
  if (scope === 'all') {
    const empRes = await sbFetch(env, 'GET', '/rest/v1/employees?status=eq.active&select=id');
    if (empRes.ok) {
      const employees = await empRes.json();
      const reviews = employees.map(e => ({
        employee_id: e.id, cycle_id: cycleId, period: name, status: 'draft',
      }));
      if (reviews.length) await sbFetch(env, 'POST', '/rest/v1/performance_reviews', reviews);
    }
  }

  return json({ success: true, cycle_id: cycleId }, 201, corsHeaders);
}

// ════════════════════════════════════════════════════════
// LEAVE
// ════════════════════════════════════════════════════════

async function handleSubmitLeave(request, env, token, corsHeaders) {
  const body = await request.json();
  const res  = await sbFetch(env, 'POST', '/rest/v1/leave_requests', { ...body, status: 'pending' });

  // Notify HR manager
  const data = await res.json();
  return json({ success: true, leave: data[0] || data }, 201, corsHeaders);
}

async function handleLeaveDecision(request, env, token, path, corsHeaders) {
  const parts  = path.split('/');
  const id     = parts[2];
  const status = parts[3]; // 'approved' or 'rejected'

  // Get leave request to find employee
  const leaveRes = await sbFetch(env, 'GET', `/rest/v1/leave_requests?id=eq.${id}&select=*,employees(email,first_name)`);
  const [leave]  = leaveRes.ok ? await leaveRes.json() : [null];

  await sbFetch(env, 'PATCH', `/rest/v1/leave_requests?id=eq.${id}`, { status });

  if (leave?.employees?.email) {
    await sendEmail(env, {
      to:      leave.employees.email,
      subject: `Leave Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      html:    `<p>Hi ${leave.employees.first_name},</p><p>Your leave request (${leave.from_date} – ${leave.to_date}) has been <strong>${status}</strong>.</p>`,
    });
  }

  // Update employee status
  if (status === 'approved' && leave?.employee_id) {
    await sbFetch(env, 'PATCH', `/rest/v1/employees?id=eq.${leave.employee_id}`, { status: 'on_leave' });
  }

  return json({ success: true }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════
// POLICIES
// ════════════════════════════════════════════════════════

async function handleUploadPolicy(request, env, token, corsHeaders) {
  const formData = await request.formData();
  const file     = formData.get('file');
  const name     = formData.get('name') || file?.name;
  const category = formData.get('category') || 'hr';

  const key = `policies/${Date.now()}-${file.name}`;
  await env.HR_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  await sbFetch(env, 'POST', '/rest/v1/hr_policies', { name, category, file_key: key, version: '1.0' });
  return json({ success: true, key }, 201, corsHeaders);
}

// ════════════════════════════════════════════════════════
// PAYROLL
// ════════════════════════════════════════════════════════

async function handleCalculatePayroll(request, env, token, corsHeaders) {
  const { period } = await request.json();

  // Fetch salary data
  const salRes = await sbFetch(env, 'GET', '/rest/v1/employee_salaries?select=*,employees(id,status)');
  const salaries = salRes.ok ? await salRes.json() : [];
  const active   = salaries.filter(s => s.employees?.status === 'active');

  // Fetch deductions
  const dedRes = await sbFetch(env, 'GET', '/rest/v1/payroll_deductions?status=eq.active&select=employee_id,amount,type');
  const deductions = dedRes.ok ? await dedRes.json() : [];

  const dedByEmp = {};
  deductions.forEach(d => { dedByEmp[d.employee_id] = (dedByEmp[d.employee_id]||0) + d.amount; });

  let totalGross = 0, totalNet = 0, totalDeductions = 0;
  for (const s of active) {
    const gross  = s.base_salary || 0;
    const deds   = dedByEmp[s.employee_id] || 0;
    const net    = gross - deds;
    totalGross       += gross;
    totalDeductions  += deds;
    totalNet         += net;
  }

  return json({
    period,
    employee_count:   active.length,
    total_gross:      totalGross,
    deductions_total: totalDeductions,
    total_net:        totalNet,
  }, 200, corsHeaders);
}

async function handleRunPayroll(request, env, token, corsHeaders) {
  const { period, pay_date, type, notes } = await request.json();

  const calc = await (await handleCalculatePayroll(new Request('', { method:'POST', body: JSON.stringify({ period }), headers:{'Content-Type':'application/json'} }), env, token, {})).json();

  // Create payroll run
  const runRes = await sbFetch(env, 'POST', '/rest/v1/payroll_runs', {
    period, type, pay_date, notes, status: 'processing',
    total_gross: calc.total_gross, total_net: calc.total_net,
    deductions_total: calc.deductions_total, employee_count: calc.employee_count,
  });
  const [run] = await runRes.json();

  // Generate individual payslips
  const salRes = await sbFetch(env, 'GET', '/rest/v1/employee_salaries?select=*,employees(id,status)');
  const salaries = (salRes.ok ? await salRes.json() : []).filter(s => s.employees?.status === 'active');
  const dedRes = await sbFetch(env, 'GET', '/rest/v1/payroll_deductions?status=eq.active&select=employee_id,amount');
  const deductions = dedRes.ok ? await dedRes.json() : [];
  const dedByEmp = {};
  deductions.forEach(d => { dedByEmp[d.employee_id] = (dedByEmp[d.employee_id]||0) + d.amount; });

  const payslips = salaries.map(s => ({
    employee_id:       s.employee_id,
    payroll_run_id:    run?.id,
    period,
    gross_pay:         s.base_salary || 0,
    deductions_total:  dedByEmp[s.employee_id] || 0,
    net_pay:           (s.base_salary||0) - (dedByEmp[s.employee_id]||0),
    status:            'generated',
  }));

  if (payslips.length) await sbFetch(env, 'POST', '/rest/v1/payslips', payslips);

  // Mark run completed
  if (run?.id) await sbFetch(env, 'PATCH', `/rest/v1/payroll_runs?id=eq.${run.id}`, { status: 'completed' });

  return json({ success: true, ...calc }, 201, corsHeaders);
}

async function handleSendPayslip(request, env, token, path, corsHeaders) {
  const payslipId = path.split('/')[3];
  const res = await sbFetch(env, 'GET', `/rest/v1/payslips?id=eq.${payslipId}&select=*,employees(email,first_name)`);
  const [payslip] = res.ok ? await res.json() : [];

  if (payslip?.employees?.email) {
    await sendEmail(env, {
      to:      payslip.employees.email,
      subject: `Your payslip for ${payslip.period} is ready`,
      html:    `<p>Hi ${payslip.employees.first_name},</p><p>Your payslip for <strong>${payslip.period}</strong> is now available. Net pay: <strong>$${(payslip.net_pay||0).toLocaleString()}</strong>.</p>`,
    });
    await sbFetch(env, 'PATCH', `/rest/v1/payslips?id=eq.${payslipId}`, { status: 'sent' });
  }

  return json({ success: true }, 200, corsHeaders);
}

async function handleSendAllPayslips(request, env, token, corsHeaders) {
  const res = await sbFetch(env, 'GET', '/rest/v1/payslips?status=eq.generated&select=id');
  const payslips = res.ok ? await res.json() : [];
  let sent = 0;
  for (const p of payslips) {
    await handleSendPayslip(request, env, token, `/payroll/payslips/${p.id}/send`, corsHeaders);
    sent++;
  }
  return json({ success: true, sent }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════

async function handleAnalyticsSummary(request, env, token, url, corsHeaders) {
  const days  = parseInt(url.searchParams.get('days') || '90');
  const since = new Date(Date.now() - days*24*60*60*1000).toISOString();

  // Time to hire: avg days from created_at to hired
  const hiresRes = await sbFetch(env, 'GET', `/rest/v1/candidates?stage=eq.Hired&created_at=gte.${since}&select=created_at,hired_at`);
  const hires = hiresRes.ok ? await hiresRes.json() : [];
  const avgTTH = hires.length
    ? Math.round(hires.reduce((s, h) => s + (new Date(h.hired_at||h.created_at) - new Date(h.created_at)) / (1000*60*60*24), 0) / hires.length)
    : null;

  // Absenteeism
  const leaveRes = await sbFetch(env, 'GET', `/rest/v1/leave_requests?status=eq.approved&created_at=gte.${since}&select=days`);
  const leaves   = leaveRes.ok ? await leaveRes.json() : [];
  const totalDays = leaves.reduce((s, l) => s + (l.days||1), 0);
  const empRes   = await sbFetch(env, 'GET', '/rest/v1/employees?status=eq.active&select=id');
  const empCount  = empRes.ok ? (await empRes.json()).length : 1;
  const workdays  = days * (5/7);
  const absenteeism = empCount > 0 ? Math.round(totalDays / (empCount * workdays) * 100 * 10) / 10 : 0;

  return json({ time_to_hire: avgTTH, absenteeism }, 200, corsHeaders);
}

async function handleAnalyticsReport(request, env, token, url, corsHeaders) {
  const days  = parseInt(url.searchParams.get('days') || '90');
  const since = new Date(Date.now() - days*24*60*60*1000).toISOString();

  const [empRes, leaveRes, payRes] = await Promise.all([
    sbFetch(env, 'GET', `/rest/v1/employees?select=first_name,last_name,status,departments(name),start_date`),
    sbFetch(env, 'GET', `/rest/v1/leave_requests?created_at=gte.${since}&select=*,employees(first_name,last_name)`),
    sbFetch(env, 'GET', `/rest/v1/payslips?select=period,gross_pay,net_pay,employees(first_name,last_name)`),
  ]);

  const emp  = empRes.ok  ? await empRes.json()  : [];
  const leave = leaveRes.ok ? await leaveRes.json() : [];
  const pay   = payRes.ok   ? await payRes.json()   : [];

  const rows = [
    ['Type','Name','Department','Period/Date','Amount/Days','Status'],
    ...emp.map(e  => ['Employee', `${e.first_name} ${e.last_name}`, e.departments?.name||'', e.start_date||'', '', e.status]),
    ...leave.map(l => ['Leave', `${l.employees?.first_name||''} ${l.employees?.last_name||}`, '', `${l.from_date}–${l.to_date}`, l.days, l.status]),
    ...pay.map(p  => ['Payslip', `${p.employees?.first_name||''} ${p.employees?.last_name||}`, '', p.period||'', p.net_pay, 'paid']),
  ];
  const csv = rows.map(r => r.map(c=>`"${c}"`).join(',')).join('\n');
  return new Response(csv, { headers: { ...corsHeaders, 'Content-Type':'text/csv', 'Content-Disposition':`attachment; filename="hr-report.csv"` } });
}

// ════════════════════════════════════════════════════════
// AI HANDLERS (Cloudflare AI + Vectorize RAG)
// ════════════════════════════════════════════════════════

async function handleAIChat(request, env, token, corsHeaders) {
  const { messages, system, contexts, stream } = await request.json();

  // Build RAG context from Vectorize
  let ragContext = '';
  if (env.VECTORIZE && env.AI && messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      try {
        const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [lastUserMsg.content] });
        const results   = await env.VECTORIZE.query(embedding.data[0], { topK: 4, returnMetadata: true });
        const docs = results.matches
          .filter(m => m.score > 0.7)
          .map(m => m.metadata?.content || m.metadata?.title || '')
          .filter(Boolean);
        if (docs.length) ragContext = `\n\n## Relevant HR Knowledge\n${docs.join('\n')}`;
      } catch { /* Vectorize optional */ }
    }
  }

  const systemPrompt = (system || '') + ragContext;

  if (!env.AI) {
    return json({ response: "Cloudflare AI binding not configured. Add `[ai]\nbinding = \"AI\"` to wrangler.toml." }, 200, corsHeaders);
  }

  // Stream with Cloudflare AI
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  if (stream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Non-blocking stream
    (async () => {
      try {
        const aiStream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: aiMessages,
          stream: true,
          max_tokens: 1024,
        });

        const reader = aiStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          const lines = text.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'));
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const token  = parsed.response || '';
              if (token) await writer.write(encoder.encode(`data: ${JSON.stringify({ text: token })}\n\n`));
            } catch { /* partial */ }
          }
        }
      } finally { await writer.close(); }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  // Non-streaming fallback
  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: aiMessages, max_tokens: 1024 });
  return json({ response: result.response }, 200, corsHeaders);
}

async function handleEmployeeInsight(request, env, token, corsHeaders) {
  const { employee_id } = await request.json();
  if (!env.AI) return json({ insight: 'AI not configured.' }, 200, corsHeaders);

  // Load employee data
  const res = await sbFetch(env, 'GET', `/rest/v1/employees?id=eq.${employee_id}&select=*,departments(name),performance_reviews(score,period),training_enrollments(status)`);
  const [emp] = res.ok ? await res.json() : [null];
  if (!emp) return json({ insight: 'Employee not found.' }, 200, corsHeaders);

  const prompt = `You are an HR analyst. Based on this employee data, provide a brief 2-3 sentence insight and one actionable recommendation:

Employee: ${emp.first_name} ${emp.last_name}
Role: ${emp.job_title}
Department: ${emp.departments?.name}
Performance scores: ${emp.performance_reviews?.map(r=>`${r.period}: ${r.score}`).join(', ') || 'none'}
Training completions: ${emp.training_enrollments?.filter(e=>e.status==='completed').length || 0}/${emp.training_enrollments?.length || 0}

Keep it professional and actionable.`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  });
  return json({ insight: result.response }, 200, corsHeaders);
}

async function handleOnboardingChecklist(request, env, token, corsHeaders) {
  const { role, department } = await request.json();
  if (!env.AI) return json({ tasks: [] }, 200, corsHeaders);

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{
      role: 'user',
      content: `Generate a 10-item onboarding checklist for a new ${role} in the ${department} department. Format as JSON array with objects: {title, category, due_days}. Categories: hr, it, compliance, training, social. Reply ONLY with the JSON array.`
    }],
    max_tokens: 500,
  });

  try {
    const text  = result.response.replace(/```json|```/g,'').trim();
    const tasks = JSON.parse(text);
    return json({ tasks }, 200, corsHeaders);
  } catch { return json({ tasks: [] }, 200, corsHeaders); }
}

async function handleGenerateCourse(request, env, token, corsHeaders) {
  const { title } = await request.json();
  if (!env.AI) return json({ description:'', duration_hours:1 }, 200, corsHeaders);

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{
      role:'user',
      content:`For an HR training course titled "${title}", write a 2-sentence description and suggest duration in hours. Reply ONLY with JSON: {"description":"...","duration_hours":N}`
    }],
    max_tokens: 150,
  });

  try {
    const data = JSON.parse(result.response.replace(/```json|```/g,'').trim());
    return json(data, 200, corsHeaders);
  } catch { return json({ description: result.response, duration_hours: 1 }, 200, corsHeaders); }
}

async function handlePerformanceFeedback(request, env, token, corsHeaders) {
  const { review_id } = await request.json();
  if (!env.AI) return json({ feedback: 'AI not configured.' }, 200, corsHeaders);

  const res = await sbFetch(env, 'GET', `/rest/v1/performance_reviews?id=eq.${review_id}&select=*,employees(first_name,last_name,job_title)`);
  const [review] = res.ok ? await res.json() : [null];
  if (!review) return json({ feedback: 'Review not found.' }, 200, corsHeaders);

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{
      role: 'user',
      content: `Generate 3 constructive performance review feedback suggestions for ${review.employees?.first_name} ${review.employees?.last_name} (${review.employees?.job_title}). Score: ${review.score}/100. Period: ${review.period}. Keep each suggestion under 50 words and make them specific and actionable.`
    }],
    max_tokens: 400,
  });
  return json({ feedback: result.response }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

async function sbFetch(env, method, path, body) {
  const url = `${env.SUPABASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : '',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return; // Email optional
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'hr@simpatico.app', to, subject, html }),
    });
  } catch (e) { console.error('Email send error:', e); }
}

function json(data, status=200, extraHeaders={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
