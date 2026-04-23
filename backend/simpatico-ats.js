/**
 * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
 * â•‘          SIMPATICO HR  â€”  ENTERPRISE PLATFORM ENGINE  v5.0                 â•‘
 * ╔═════════════════════════════════════════════════════════════════════════════════════╗
 * ║          SIMPATICO HR  —  ENTERPRISE PLATFORM ENGINE  v5.0                 ║
 * ║          Cloudflare Workers · Edge-Native · Zero Cold-Start                 ║
 * ╠═════════════════════════════════════════════════════════════════════════════════════╣
 * ║  Architecture  : Edge-Native Multi-Tenant API                               ║
 * ║  Auth          : JWT RS256 / HMAC-SHA256 Webhook Signatures                 ║
 * ║  Intelligence  : Workers AI (Llama 3.1) + Vectorize RAG                     ║
 * ║  Storage       : Supabase (RLS-enforced) · R2 · KV Cache                    ║
 * ║  Patterns      : Middleware Pipeline · Circuit Breaker · Idempotency        ║
 * ║                  Cursor Pagination · Audit Trail · Rate Limiting            ║
 * ║                  Outbound Webhooks · SSE Streaming · Background Jobs        ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════╝ 
 */

// ═════════════════════════════════════════════════════════════════════════════════════
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// § 0.  CONSTANTS & CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════════════

const VERSION = "5.0.0";
const REQUEST_TIMEOUT_MS = 28_000; // stay under CF 30 s wall
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const CACHE_TTL_DEFAULT = 60; // seconds
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 120; // requests per window per tenant
const CIRCUIT_OPEN_SECS = 30;
const CIRCUIT_FAIL_THRESH = 5;
const AUDIT_FLUSH_BATCH = 50;
const CURSOR_PAGE_SIZE = 25;

const HTTP = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY: 429,
  SERVER_ERROR: 500,
  UNAVAILABLE: 503,
});

const ALLOWED_ORIGINS = [
  "https://simpaticohr.in",
  "https://www.simpaticohr.in",
  "https://simpaticohrconsultancy.com",
  "https://www.simpaticohrconsultancy.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8000",
];

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.("Origin") || "*";
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,Authorization,X-Tenant-ID,X-Idempotency-Key,X-Request-ID,X-App-Version,apikey",
    "Access-Control-Expose-Headers":
      "X-Request-ID,X-RateLimit-Remaining,X-Cursor",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-API-Version": VERSION,
  };
}

// Legacy constant for code that references CORS_HEADERS directly
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Tenant-ID,X-Idempotency-Key,X-Request-ID,X-App-Version,apikey",
  "Access-Control-Expose-Headers":
    "X-Request-ID,X-RateLimit-Remaining,X-Cursor",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-API-Version": VERSION,
});

// ═════════════════════════════════════════════════════════════════════════════════════
// § 1.  CUSTOM ERROR HIERARCHY
// ═════════════════════════════════════════════════════════════════════════════════════

class AppError extends Error {
  constructor(
    message,
    status = HTTP.SERVER_ERROR,
    code = "INTERNAL_ERROR",
    details = null,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
class ValidationError extends AppError {
  constructor(msg, details) {
    super(msg, HTTP.UNPROCESSABLE, "VALIDATION_ERROR", details);
  }
}
class AuthError extends AppError {
  constructor(msg = "Authentication required") {
    super(msg, HTTP.UNAUTHORIZED, "AUTH_ERROR");
  }
}
class ForbiddenError extends AppError {
  constructor(msg = "Insufficient permissions") {
    super(msg, HTTP.FORBIDDEN, "FORBIDDEN");
  }
}
class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, HTTP.NOT_FOUND, "NOT_FOUND");
  }
}
class ConflictError extends AppError {
  constructor(msg) {
    super(msg, HTTP.CONFLICT, "CONFLICT");
  }
}
class RateLimitError extends AppError {
  constructor(retryAfter) {
    super("Rate limit exceeded", HTTP.TOO_MANY, "RATE_LIMIT_EXCEEDED");
    this.retryAfter = retryAfter;
  }
}
class ServiceUnavailableError extends AppError {
  constructor(svc) {
    super(
      `${svc} temporarily unavailable`,
      HTTP.UNAVAILABLE,
      "SERVICE_UNAVAILABLE",
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 2.  VALIDATION SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════════════

const SCHEMAS = {
  employee: {
    required: ["first_name", "last_name", "email", "job_title"],
    optional: [
      "phone",
      "department",
      "manager_id",
      "start_date",
      "employment_type",
      "salary",
    ],
    rules: {
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Invalid email",
      employment_type: (v) =>
        !v ||
        ["full_time", "part_time", "contractor", "intern"].includes(v) ||
        "Invalid employment_type",
      salary: (v) =>
        !v ||
        (Number.isFinite(v) && v > 0) ||
        "salary must be a positive number",
    },
  },
  leave: {
    required: ["employee_id", "leave_type", "from_date", "to_date"],
    optional: ["reason", "attachments"],
    rules: {
      leave_type: (v) =>
        [
          "annual",
          "sick",
          "maternity",
          "paternity",
          "unpaid",
          "comp_off",
        ].includes(v) || "Invalid leave_type",
      from_date: (v) => !isNaN(Date.parse(v)) || "Invalid from_date",
      to_date: (v) => !isNaN(Date.parse(v)) || "Invalid to_date",
    },
  },
  payroll_run: {
    required: ["period", "pay_date"],
    optional: ["notes", "type", "currency"],
    rules: {
      period: (v) =>
        /^\d{4}-(0[1-9]|1[0-2])(-\d{1,2})?$/.test(v) ||
        "period must be YYYY-MM",
      pay_date: (v) => !isNaN(Date.parse(v)) || "Invalid pay_date",
      type: (v) =>
        !v ||
        [
          "monthly",
          "weekly",
          "bi_weekly",
          "supplemental",
          "bonus",
          "off_cycle",
        ].includes(v) ||
        "Invalid payroll type",
    },
  },
  performance_review: {
    required: ["employee_id", "cycle_id", "rating"],
    optional: ["strengths", "improvements", "comments"],
    rules: {
      rating: (v) =>
        (Number.isInteger(v) && v >= 1 && v <= 5) || "rating must be 1-5",
    },
  },
  job_posting: {
    required: ["title", "department", "location"],
    optional: [
      "description",
      "employment_type",
      "salary_range",
      "salary_min",
      "salary_max",
      "closing_date",
      "skills",
      "skills_required",
      "experience_min",
      "syndication_targets",
      "category",
      "status",
      "company_id",
    ],
    rules: {
      employment_type: (v) =>
        !v ||
        [
          "full_time", "part_time", "contractor", "intern",
          "Full-time", "Part-time", "Contract", "Internship",
        ].includes(v) ||
        "Invalid employment_type",
    },
  },
};

function validate(data, schemaName) {
  const schema = SCHEMAS[schemaName];
  if (!schema) throw new AppError(`Unknown schema: ${schemaName}`);

  const errors = [];
  for (const field of schema.required) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ""
    ) {
      errors.push({ field, message: `${field} is required` });
    }
  }
  for (const [field, rule] of Object.entries(schema.rules || {})) {
    if (data[field] !== undefined) {
      const result = rule(data[field]);
      if (result !== true) errors.push({ field, message: result });
    }
  }
  const allowed = new Set([
    ...(schema.required || []),
    ...(schema.optional || []),
  ]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key))
      errors.push({ field: key, message: `Unknown field: ${key}` });
  }
  if (errors.length)
    throw new ValidationError("Request body validation failed", errors);
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 3.  JWT AUTHENTICATION
// ═════════════════════════════════════════════════════════════════════════════════════

async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64)
      throw new Error("Malformed token");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) throw new Error("Invalid signature");

    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.exp && payload.exp < Date.now() / 1000)
      throw new Error("Token expired");
    return payload;
  } catch (e) {
    throw new AuthError(`JWT verification failed: ${e.message}`);
  }
}

function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 4.  RATE LIMITER  (KV-backed sliding window)
// ═════════════════════════════════════════════════════════════════════════════════════

async function checkRateLimit(env, key) {
  if (!env.HR_KV) return { remaining: 999 };

  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / RATE_LIMIT_WINDOW);
  const kvKey = `rl:${key}:${window}`;

  const raw = await env.HR_KV.get(kvKey);
  const count = raw ? parseInt(raw) : 0;

  if (count >= RATE_LIMIT_MAX) {
    const retryAfter = (window + 1) * RATE_LIMIT_WINDOW - now;
    throw new RateLimitError(retryAfter);
  }

  await env.HR_KV.put(kvKey, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW * 2,
  });
  return { remaining: RATE_LIMIT_MAX - count - 1 };
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 5.  CIRCUIT BREAKER  (KV-backed)
// ═════════════════════════════════════════════════════════════════════════════════════

async function withCircuitBreaker(env, service, fn) {
  if (!env.HR_KV) return fn();
  const key = `cb:${service}`;
  const state = JSON.parse(
    (await env.HR_KV.get(key)) || '{"failures":0,"open":false}',
  );

  if (state.open && Date.now() < state.openUntil) {
    throw new ServiceUnavailableError(service);
  }

  try {
    const result = await fn();
    if (state.open || state.failures > 0) {
      await env.HR_KV.put(key, JSON.stringify({ failures: 0, open: false }), {
        expirationTtl: 3600,
      });
    }
    return result;
  } catch (err) {
    const failures = state.failures + 1;
    const open = failures >= CIRCUIT_FAIL_THRESH;
    await env.HR_KV.put(
      key,
      JSON.stringify({
        failures,
        open,
        openUntil: open ? Date.now() + CIRCUIT_OPEN_SECS * 1000 : 0,
      }),
      { expirationTtl: 3600 },
    );
    throw err;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 6.  IDEMPOTENCY  (KV-backed)
// ═════════════════════════════════════════════════════════════════════════════════════

async function withIdempotency(env, key, tenantId, fn) {
  if (!key || !env.HR_KV) return fn();
  const kvKey = `idem:${tenantId}:${key}`;
  const cached = await env.HR_KV.get(kvKey, { type: "json" });
  if (cached)
    return Response.json(cached, {
      headers: { "X-Idempotent-Replayed": "true", ...CORS_HEADERS },
    });

  const result = await fn();
  const clone = result.clone();
  const body = await clone.json().catch(() => null);
  if (body && result.status < 500) {
    await env.HR_KV.put(kvKey, JSON.stringify(body), { expirationTtl: 86400 });
  }
  return result;
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 7.  KV CACHE LAYER
// ═════════════════════════════════════════════════════════════════════════════════════

async function withCache(env, key, ttl, fn) {
  if (!env.HR_KV) return fn();
  const cached = await env.HR_KV.get(key, { type: "json" });
  if (cached) return cached;
  const result = await fn();
  await env.HR_KV.put(key, JSON.stringify(result), { expirationTtl: ttl });
  return result;
}

async function invalidateCache(env, ...keys) {
  if (!env.HR_KV) return;
  await Promise.allSettled(keys.map((k) => env.HR_KV.delete(k)));
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 8.  STRUCTURED AUDIT LOGGER
// ═════════════════════════════════════════════════════════════════════════════════════

const auditBuffer = [];

async function audit(env, ctx, action, resource, resourceId, meta = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    tenant_id: ctx.tenantId,
    actor_id: ctx.actorId || null,
    actor_email: ctx.actorEmail || null,
    action,
    resource,
    resource_id: resourceId || null,
    ip: ctx.ip || null,
    request_id: ctx.requestId,
    meta,
  };

  auditBuffer.push(event);

  if (auditBuffer.length >= AUDIT_FLUSH_BATCH) {
    const batch = auditBuffer.splice(0, AUDIT_FLUSH_BATCH);
    await sbFetch(
      env,
      "POST",
      "/rest/v1/audit_logs",
      batch,
      false,
      ctx.tenantId,
    ).catch(console.error);
  }

  // Always log to console for Cloudflare Logpush / Tail Workers
  console.log(JSON.stringify({ type: "AUDIT", ...event }));
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 9.  OUTBOUND WEBHOOK DISPATCHER
// ═════════════════════════════════════════════════════════════════════════════════════

async function dispatchWebhook(env, tenantId, event, payload) {
  if (!env.HR_KV) return;
  const endpoints = JSON.parse(
    (await env.HR_KV.get(`webhooks:${tenantId}`)) || "[]",
  );
  if (!endpoints.length) return;

  const body = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
  const signature = await hmacSign(env.WEBHOOK_SECRET || "default", body);

  for (const ep of endpoints) {
    if (!ep.events.includes(event) && !ep.events.includes("*")) continue;
    fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Simpatico-Signature": signature,
        "X-Simpatico-Event": event,
      },
      body,
    }).catch((e) => console.error(`Webhook failed [${ep.url}]:`, e.message));
  }
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 10.  MIDDLEWARE PIPELINE
// ═════════════════════════════════════════════════════════════════════════════════════

async function buildContext(request, env) {
  const url = new URL(request.url);
  const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
  const tenantId = request.headers.get("X-Tenant-ID") || "default";
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const authHeader = request.headers.get("Authorization") || "";

  let actor = null;
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      if (env.JWT_SECRET) {
        try {
          actor = await verifyJWT(token, env.JWT_SECRET);
        } catch (e) {
          if (e.message.includes("signature") || e.message.includes("failed")) {
            // Fallback to verifying directly with Supabase if local JWT secret fails
            actor = await verifyViaSupabase(token, env);
          } else {
            throw e;
          }
        }
      } else {
        actor = await verifyViaSupabase(token, env);
      }
    } catch (authErr) {
      // Don't crash the pipeline — let route handlers decide via requireAuth/requireRole
      console.warn(
        "[Auth] Token verification failed (will be unauthenticated):",
        authErr.message,
      );
      actor = null;
    }
  }

  return {
    url,
    requestId,
    tenantId,
    ip,
    actorId: actor?.sub || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || "viewer",
    actor,
  };
}

async function verifyViaSupabase(token, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    throw new AuthError("Cannot verify token: database offline");
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new AuthError("Invalid or expired remote token");
  const user = await res.json();
  let role = user.app_metadata?.role || user.user_metadata?.role || "viewer";
  if (role === "viewer") {
    const pRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/employees?auth_id=eq.${user.id}&select=role`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    if (pRes.ok) {
      const profs = await pRes.json();
      if (profs && profs.length > 0) role = profs[0].role || "viewer";
    }
  }
  return { sub: user.id, email: user.email, role };
}

function requireAuth(ctx) {
  if (!ctx.actor) throw new AuthError();
}

function requireRole(ctx, ...roles) {
  requireAuth(ctx);
  // Normalize role strings: strip underscores for flexible matching
  // e.g. "super_admin" matches "superadmin", "company_admin" matches "companyadmin"
  const normalize = (r) => (r || "").toLowerCase().replace(/_/g, "");
  const normalizedActor = normalize(ctx.actorRole);
  // Superadmin, employer, and companyadmin always have full tenant access
  if (
    [
      "superadmin",
      "employer",
      "companyadmin",
      "hradmin",
      "recruiter",
      "interviewer",
    ].includes(normalizedActor)
  )
    return;
  const allowed = roles.map(normalize);
  if (!allowed.includes(normalizedActor))
    throw new ForbiddenError(`Required roles: ${roles.join(", ")}`);
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 11.  RESPONSE HELPERS
// ═════════════════════════════════════════════════════════════════════════════════════

function apiResponse(data, status = HTTP.OK, extra = {}) {
  return Response.json(
    {
      success: true,
      data,
      meta: { version: VERSION, ts: new Date().toISOString() },
    },
    { status, headers: { ...CORS_HEADERS, ...extra } },
  );
}

function errorResponse(err, requestId) {
  const status = err.status || HTTP.SERVER_ERROR;
  const headers = { ...CORS_HEADERS, "X-Request-ID": requestId };

  if (err instanceof RateLimitError) {
    headers["Retry-After"] = String(err.retryAfter);
    headers["X-RateLimit-Remaining"] = "0";
  }

  return Response.json(
    {
      success: false,
      error: {
        code: err.code || "INTERNAL_ERROR",
        message: err.message,
        details: err.details || undefined,
      },
      request_id: requestId,
    },
    { status, headers },
  );
}

function paginatedResponse(items, cursor, total, extra = {}) {
  return apiResponse(
    { items, pagination: { cursor: cursor || null, total } },
    HTTP.OK,
    extra,
  );
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § 12.  ROUTER
// ═════════════════════════════════════════════════════════════════════════════════════

const ROUTES = [];

function route(method, pattern, ...fns) {
  ROUTES.push({
    method,
    pattern:
      typeof pattern === "string"
        ? new RegExp(`^${pattern.replace(/:[^/]+/g, "([^/]+)")}$`)
        : pattern,
    fns,
    raw: pattern,
  });
}

function matchRoute(method, path) {
  for (const r of ROUTES) {
    if (r.method !== method && r.method !== "*") continue;
    const m = path.match(r.pattern);
    if (m) return { route: r, params: m.slice(1) };
  }
  return null;
}

// ——— Route Declarations —————————————————————————————————————————————————————————————

// Health & Meta
route("GET", "/health", handleHealth);
route("GET", "/version", handleVersion);
route("POST", "/webhooks/register", handleRegisterWebhook);

// Employees & Identity
route("POST", "/employees", handleCreateEmployee);
route("GET", "/employees", handleListEmployees);
route("GET", "/employees/:id", handleGetEmployee);
route("PATCH", "/employees/:id", handleUpdateEmployee);
route("DELETE", "/employees/:id", handleDeactivateEmployee);
route("POST", "/employees/:id/avatar", handleUploadAvatar);
route("POST", "/employees/:id/documents", handleUploadDocument);
route("GET", "/employees/:id/documents", handleListDocuments);
route("POST", "/employees/bulk", handleBulkCreateEmployees);
route("GET", "/org-chart", handleOrgChart);

// R2 Signed URLs
route("GET", "/r2/signed-url", handleSignedUrl);

// Onboarding
route("POST", "/onboarding/start", handleStartOnboarding);
route("GET", "/onboarding/tasks", handleListOnboarding);
route("PATCH", "/onboarding/tasks/:id", handleUpdateOnboardingTask);
route("POST", "/ai/onboarding-checklist", handleOnboardingChecklist);

// Training
route("POST", "/training/courses", handleCreateCourse);
route("GET", "/training/courses", handleListCourses);
route("POST", "/api/training_courses", handleCreateCourse);
route("GET", "/api/training_courses", handleListCourses);
route("POST", "/api/training-courses", handleCreateCourse);
route("GET", "/api/training-courses", handleListCourses);
route("POST", "/training/enroll", handleEnrollTraining);
route("GET",  "/training/enrollments", handleListEnrollments);
route("POST", "/training/semantic-search", handleSemanticCourseSearch);
route("POST", "/training/remind/:id", handleSendReminder);

// Performance
route("POST", "/performance/cycles", handleCreateCycle);
route("GET", "/performance/cycles", handleListCycles);
route("POST", "/performance/reviews", handleSubmitReview);
route("GET", "/performance/reviews", handleListReviews);
route("GET", "/performance/reviews/:employeeId", handleGetEmployeeReviews);
route("POST", "/ai/performance-feedback", handlePerformanceFeedback);

// OKRs / Goals
route("POST", "/goals", handleCreateGoal);
route("GET", "/goals", handleListGoals);
route("PATCH", "/goals/:id", handleUpdateGoal);

// Leave
route("POST", "/leave", handleSubmitLeave);
route("GET", "/leave", handleListLeave);
route("GET", "/leave/balance", handleGetLeaveBalance);
route("PATCH", "/leave/:id/approved", handleLeaveDecision);
route("PATCH", "/leave/:id/rejected", handleLeaveDecision);
route("POST", "/policies", handleUploadPolicy);

// Payroll
route("POST", "/payroll/calculate", handleCalculatePayroll);
route("POST", "/payroll/run", handleRunPayroll);
route("GET", "/payroll/runs", handleListPayrollRuns);
route("GET", "/payroll/payslips/all", handleListAllPayslips);
route("POST", "/payroll/payslips/:id/send", handleSendPayslip);
route("POST", "/payroll/payslips/send-all", handleSendAllPayslips);
route("GET", "/payroll/payslips/:id/pdf", handleGeneratePayslipPdf);
route("GET", "/payroll/payslips/:employeeId", handleGetPayslips);

// Recruitment / ATS
route("POST", "/recruitment/jobs", handleCreateJob);
route("GET", "/recruitment/jobs", handleListJobs);
route("GET", "/recruitment/public/jobs", handlePublicJobs);
route("POST", "/recruitment/applications", handleCreateApplication);
route("POST", "/interviews/schedule", handleScheduleInterviewEmail);
route("GET", "/recruitment/applications", handleListApplications);
route("PATCH", "/recruitment/applications/:id", handleUpdateApplication);
route("POST", "/ai/generate-jd", handleGenerateJD);
route("POST", "/email/interview-invite", handleInterviewEmail);
// Client Interview Management
route("GET", "/client/interviews", handleListClientInterviews);
route("POST", "/client/interviews/create", handleCreateInterview);
route("POST", "/interviews/validate", handleValidateInterview);
route("POST", "/interviews/submit", handleSubmitInterview);
// Notifications
route("GET", "/notifications", handleListNotifications);
route("PATCH", "/notifications/:id/read", handleMarkNotificationRead);
route("POST", "/notifications/whatsapp", handleWhatsAppNotification);

// AI Intelligence
route("POST", "/ai/expense-ocr", handleExpenseOCR);
route("POST", "/ai/chat", handleAIChat);
route("POST", "/ai/chat/stream", handleAIChatStream);
route("POST", "/ai/employee-insight", handleEmployeeInsight);
route("POST", "/ai/sentiment", handleSentimentAnalysis);
route("POST", "/ai/interview-question", handleInterviewQuestion);
route("POST", "/ai/ats-generator", handleATSGenerator);
route("POST", "/ai/generate-assessment", handleGenerateAssessment);
route("POST", "/ai/assessments", handleSaveAssessment);
route("POST", "/ai/generate-course", handleGenerateCourse);

// Candidate Assessments
route("POST", "/candidates/:id/assessments/:assessmentId/assign", handleAssignAssessment);
route("POST", "/candidates/:id/assessments/:assessmentId/submit", handleSubmitAssessment);
route("GET", "/candidates/:id/assessments", handleGetCandidateAssessments);
route("POST", "/assessments/:assessmentId/score", handleScoreAssessment);

// Analytics
route("GET", "/analytics/summary", handleAnalyticsSummary);
route("GET", "/analytics/report", handleAnalyticsReport);
route("GET", "/analytics/headcount-trend", handleHeadcountTrend);
route("GET", "/analytics/attrition", handleAttritionReport);

// Registration & Welcome
route("POST", "/companies/register", handleCompanyRegister);
route("POST", "/email/welcome", handleWelcomeEmail);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 13.  MAIN ENTRY POINT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export default {
  async fetch(request, env, execCtx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Preflight
    if (method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });

    // Reject oversized bodies early
    const contentLength = parseInt(
      request.headers.get("Content-Length") || "0",
    );
    if (contentLength > MAX_BODY_BYTES)
      return errorResponse(
        new AppError("Payload too large", 413, "PAYLOAD_TOO_LARGE"),
        "n/a",
      );

    let ctx;
    try {
      ctx = await buildContext(request, env);
    } catch (err) {
      return errorResponse(
        err,
        request.headers.get("X-Request-ID") || crypto.randomUUID(),
      );
    }

    const { requestId, tenantId } = ctx;

    try {
      // â”€â”€ Global Rate Limiting â”€â”€
      const { remaining } = await checkRateLimit(env, `${tenantId}:${ctx.ip}`);

      // â”€â”€ Route Matching â”€â”€
      const match = matchRoute(method, path);
      if (!match) return errorResponse(new NotFoundError("Route"), requestId);

      const { route: r, params } = match;
      const idempotencyKey = request.headers.get("X-Idempotency-Key");

      // â”€â”€ Handler Execution with timeout â”€â”€
      const handlerFn = async () => {
        const result = await Promise.race([
          r.fns[0](request, env, ctx, params, url),
          new Promise((_, rej) =>
            setTimeout(
              () => rej(new AppError("Request timeout", 504, "TIMEOUT")),
              REQUEST_TIMEOUT_MS,
            ),
          ),
        ]);
        if (!(result instanceof Response)) return apiResponse(result);
        return result;
      };

      const response = await withIdempotency(
        env,
        idempotencyKey,
        tenantId,
        handlerFn,
      );

      // â”€â”€ Flush Audit Buffer â”€â”€
      if (auditBuffer.length) {
        execCtx?.waitUntil?.(
          sbFetch(
            env,
            "POST",
            "/rest/v1/audit_logs",
            auditBuffer.splice(0),
            false,
            tenantId,
          ).catch(console.error),
        );
      }

      // Inject rate limit headers
      response.headers?.set?.("X-RateLimit-Remaining", String(remaining));
      response.headers?.set?.("X-Request-ID", requestId);
      return response;
    } catch (err) {
      const errorId = crypto.randomUUID();
      if (!(err instanceof AppError)) {
        console.error(
          JSON.stringify({
            type: "CRITICAL",
            errorId,
            path,
            method,
            stack: err.stack,
            tenantId,
          }),
        );
        return errorResponse(
          new AppError(
            `Internal error [${errorId}]`,
            HTTP.SERVER_ERROR,
            "INTERNAL_ERROR",
          ),
          requestId,
        );
      }
      return errorResponse(err, requestId);
    }
  },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 14.  HANDLER IMPLEMENTATIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Health & Meta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleHealth(request, env, ctx) {
  const checks = await Promise.allSettled([
    sbFetch(env, "GET", "/rest/v1/", null, false, ctx.tenantId),
  ]);

  return apiResponse({
    status: checks.every((c) => c.status === "fulfilled")
      ? "healthy"
      : "degraded",
    version: VERSION,
    timestamp: new Date().toISOString(),
    services: {
      database: checks[0].status === "fulfilled" ? "up" : "down",
      cache: env.HR_KV ? "up" : "disabled",
      storage: env.HR_BUCKET ? "up" : "disabled",
      ai: env.AI ? "up" : "disabled",
      vectorize: env.VECTORIZE ? "up" : "disabled",
    },
  });
}

async function handleVersion() {
  return apiResponse({
    version: VERSION,
    runtime: "Cloudflare Workers",
    build: new Date().toISOString().split("T")[0],
  });
}

// â”€â”€ Webhook Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleRegisterWebhook(request, env, ctx) {
  requireAuth(ctx);
  requireRole(ctx, "admin", "superadmin");
  const { url, events } = await request.json();
  if (!url || !events?.length)
    throw new ValidationError("url and events required");

  const existing = JSON.parse(
    (await env.HR_KV?.get(`webhooks:${ctx.tenantId}`)) || "[]",
  );
  existing.push({ url, events, created: new Date().toISOString() });
  await env.HR_KV?.put(`webhooks:${ctx.tenantId}`, JSON.stringify(existing), {
    expirationTtl: 365 * 86400,
  });
  return apiResponse({ registered: true, url, events }, HTTP.CREATED);
}

// â”€â”€ Employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCreateEmployee(request, env, ctx) {
  requireAuth(ctx);
  requireRole(ctx, "hr", "admin", "superadmin");

  const body = await safeJson(request);
  validate(body, "employee");

  // Duplicate email check
  const existRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/employees?email=eq.${encodeURIComponent(body.email)}&select=id`,
    null,
    false,
    ctx.tenantId,
  );
  const existing = await existRes.json();
  if (existing.length)
    throw new ConflictError(`Employee with email ${body.email} already exists`);

  const empNum = `EMP-${Date.now().toString(36).toUpperCase()}`;
  const payload = {
    ...sanitize(body),
    employee_id: empNum,
    tenant_id: ctx.tenantId,
    status: "active",
    created_by: ctx.actorId,
  };

  const res = await withCircuitBreaker(env, "supabase", () =>
    sbFetch(env, "POST", "/rest/v1/employees", payload, false, ctx.tenantId),
  );
  if (!res.ok)
    throw new AppError(
      "Failed to persist employee",
      HTTP.SERVER_ERROR,
      "DB_ERROR",
    );
  const [employee] = await res.json();

  await audit(env, ctx, "employee.create", "employees", employee.id, {
    email: body.email,
  });

  // Welcome email (fire-and-forget)
  sendEmail(env, {
    to: body.email,
    subject: `Welcome to the Team, ${body.first_name}! ðŸŽ‰`,
    html: welcomeEmailHtml(body.first_name, empNum),
  }).catch(console.error);

  await dispatchWebhook(env, ctx.tenantId, "employee.created", {
    id: employee.id,
    email: body.email,
  });
  await invalidateCache(env, `analytics:summary:${ctx.tenantId}`);

  return apiResponse({ employee }, HTTP.CREATED);
}

async function handleListEmployees(request, env, ctx, _, url) {
  requireAuth(ctx);
  const cursor = url.searchParams.get("cursor");
  const search = url.searchParams.get("q");
  const status = url.searchParams.get("status") || "active";
  const department = url.searchParams.get("department");

  const cacheKey = `employees:list:${ctx.tenantId}:${status}:${department || "all"}:${cursor || "start"}:${search || ""}`;

  const data = await withCache(env, cacheKey, CACHE_TTL_DEFAULT, async () => {
    let qp = `select=id,employee_id,first_name,last_name,email,job_title,department,status,start_date,avatar_url&status=eq.${status}&order=created_at.desc&limit=${CURSOR_PAGE_SIZE}`;
    if (cursor) qp += `&id=lt.${cursor}`;
    if (department) qp += `&department=eq.${encodeURIComponent(department)}`;
    if (search)
      qp += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;

    const res = await sbFetch(
      env,
      "GET",
      `/rest/v1/employees?${qp}`,
      null,
      false,
      ctx.tenantId,
    );
    const employees = await res.json();
    const nextCursor =
      employees.length === CURSOR_PAGE_SIZE ? employees.at(-1).id : null;
    return { items: employees, pagination: { cursor: nextCursor } };
  });

  return apiResponse(data);
}

async function handleGetEmployee(request, env, ctx, [id]) {
  requireAuth(ctx);
  const cacheKey = `employee:${ctx.tenantId}:${id}`;
  const employee = await withCache(
    env,
    cacheKey,
    CACHE_TTL_DEFAULT,
    async () => {
      const res = await sbFetch(
        env,
        "GET",
        `/rest/v1/employees?id=eq.${id}&select=*`,
        null,
        false,
        ctx.tenantId,
      );
      const [emp] = await res.json();
      if (!emp) throw new NotFoundError("Employee");
      return emp;
    },
  );
  return apiResponse({ employee });
}

async function handleUpdateEmployee(request, env, ctx, [id]) {
  requireAuth(ctx);
  requireRole(ctx, "hr", "admin", "superadmin");
  const body = await safeJson(request);

  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/employees?id=eq.${id}`,
    {
      ...sanitize(body),
      updated_by: ctx.actorId,
      updated_at: new Date().toISOString(),
    },
    false,
    ctx.tenantId,
  );
  if (!res.ok) throw new AppError("Update failed");
  const [employee] = await res.json();

  await invalidateCache(
    env,
    `employee:${ctx.tenantId}:${id}`,
    `employees:list:${ctx.tenantId}:active:all:start:`,
  );
  await audit(env, ctx, "employee.update", "employees", id, {
    fields: Object.keys(body),
  });
  await dispatchWebhook(env, ctx.tenantId, "employee.updated", {
    id,
    changes: body,
  });

  return apiResponse({ employee });
}

async function handleDeactivateEmployee(request, env, ctx, [id]) {
  requireRole(ctx, "admin", "superadmin");
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/employees?id=eq.${id}`,
    {
      status: "inactive",
      deactivated_at: new Date().toISOString(),
      deactivated_by: ctx.actorId,
    },
    false,
    ctx.tenantId,
  );
  await invalidateCache(env, `employee:${ctx.tenantId}:${id}`);
  await audit(env, ctx, "employee.deactivate", "employees", id);
  await dispatchWebhook(env, ctx.tenantId, "employee.deactivated", { id });
  return new Response(null, { status: HTTP.NO_CONTENT, headers: CORS_HEADERS });
}

async function handleBulkCreateEmployees(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const { employees } = await safeJson(request);
  if (!Array.isArray(employees) || employees.length > 200)
    throw new ValidationError("employees must be an array of â‰¤ 200");

  const results = await Promise.allSettled(
    employees.map(async (emp) => {
      validate(emp, "employee");
      const empNum = `EMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
      const res = await sbFetch(
        env,
        "POST",
        "/rest/v1/employees",
        {
          ...sanitize(emp),
          employee_id: empNum,
          tenant_id: ctx.tenantId,
          status: "active",
        },
        false,
        ctx.tenantId,
      );
      return res.json();
    }),
  );

  const succeeded = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const failed = results
    .filter((r) => r.status === "rejected")
    .map((r, i) => ({ index: i, error: r.reason?.message }));
  await invalidateCache(env, `analytics:summary:${ctx.tenantId}`);
  return apiResponse(
    { succeeded: succeeded.length, failed: failed.length, errors: failed },
    HTTP.CREATED,
  );
}

async function handleOrgChart(request, env, ctx) {
  requireAuth(ctx);
  const cacheKey = `orgchart:${ctx.tenantId}`;
  const data = await withCache(env, cacheKey, 300, async () => {
    const res = await sbFetch(
      env,
      "GET",
      `/rest/v1/employees?status=eq.active&select=id,first_name,last_name,job_title,department,manager_id,avatar_url`,
      null,
      false,
      ctx.tenantId,
    );
    return res.json();
  });
  return apiResponse({ nodes: data });
}

async function handleUploadAvatar(request, env, ctx, [id]) {
  requireAuth(ctx);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) throw new ValidationError("file is required");
  if (file.size > 5 * 1024 * 1024)
    throw new ValidationError("Avatar must be â‰¤ 5 MB");

  const key = `avatars/${ctx.tenantId}/${id}/${Date.now()}-${sanitizeFilename(file.name)}`;
  await env.HR_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/employees?id=eq.${id}`,
    { avatar_url: key },
    false,
    ctx.tenantId,
  );
  await invalidateCache(env, `employee:${ctx.tenantId}:${id}`);
  return apiResponse({ avatar_key: key }, HTTP.CREATED);
}

async function handleUploadDocument(request, env, ctx, [id]) {
  requireAuth(ctx);
  const formData = await request.formData();
  const file = formData.get("file");
  const type = formData.get("type") || "General";
  if (!file) throw new ValidationError("file is required");

  const key = `documents/${ctx.tenantId}/${id}/${Date.now()}-${sanitizeFilename(file.name)}`;
  await env.HR_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/employee_documents",
    {
      employee_id: id,
      name: file.name,
      type,
      file_key: key,
      tenant_id: ctx.tenantId,
    },
    false,
    ctx.tenantId,
  );
  const [doc] = await res.json();
  await audit(env, ctx, "document.upload", "employee_documents", doc.id, {
    employee_id: id,
    type,
  });
  return apiResponse({ document: doc }, HTTP.CREATED);
}

async function handleListDocuments(request, env, ctx, [id]) {
  requireAuth(ctx);
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/employee_documents?employee_id=eq.${id}&select=*&order=created_at.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ documents: await res.json() });
}

async function handleSignedUrl(request, env, ctx, _, url) {
  requireAuth(ctx);
  const key = url.searchParams.get("key");
  if (!key) throw new ValidationError("key is required");
  const publicUrl = `${env.R2_PUBLIC_URL || "https://files.simpaticohr.in"}/${key}`;
  return apiResponse({ url: publicUrl, expires_in: 3600 });
}

// â”€â”€ Onboarding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleStartOnboarding(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const { employee_id, template_id, start_date } = await safeJson(request);
  if (!employee_id || !start_date)
    throw new ValidationError("employee_id and start_date required");

  const onRes = await sbFetch(
    env,
    "POST",
    "/rest/v1/onboarding_records",
    {
      employee_id,
      template_id,
      start_date,
      stage: "not_started",
      completion_pct: 0,
      tenant_id: ctx.tenantId,
    },
    false,
    ctx.tenantId,
  );
  const [record] = await onRes.json();

  const baseTasks = [
    {
      title: "Identity Verification (KYC)",
      category: "compliance",
      due_days: 1,
    },
    { title: "IT Equipment Setup", category: "it", due_days: 2 },
    { title: "Read Employee Handbook", category: "hr", due_days: 3 },
    { title: "Benefits Enrollment", category: "hr", due_days: 5 },
    { title: "Security Awareness Briefing", category: "training", due_days: 7 },
    { title: "Meet Your Buddy / Mentor", category: "social", due_days: 3 },
  ];

  const tasks = baseTasks.map((t) => ({
    onboarding_record_id: record.id,
    title: t.title,
    category: t.category,
    status: "pending",
    due_date: addDays(start_date, t.due_days),
    tenant_id: ctx.tenantId,
  }));

  await sbFetch(
    env,
    "POST",
    "/rest/v1/onboarding_tasks",
    tasks,
    false,
    ctx.tenantId,
  );
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/employees?id=eq.${employee_id}`,
    { status: "onboarding" },
    false,
    ctx.tenantId,
  );
  await audit(env, ctx, "onboarding.start", "onboarding_records", record.id, {
    employee_id,
  });
  await dispatchWebhook(env, ctx.tenantId, "onboarding.started", {
    employee_id,
    record_id: record.id,
  });

  return apiResponse(
    { record_id: record.id, tasks_created: tasks.length },
    HTTP.CREATED,
  );
}

async function handleListOnboarding(request, env, ctx, _, url) {
  requireAuth(ctx);
  const empId = url.searchParams.get("employee_id");
  const qp = empId ? `&employee_id=eq.${empId}` : "";
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/onboarding_tasks?select=*,onboarding_records(employee_id,stage,completion_pct)${qp}&order=due_date.asc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ tasks: await res.json() });
}

async function handleUpdateOnboardingTask(request, env, ctx, [id]) {
  requireAuth(ctx);
  const body = await safeJson(request);
  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/onboarding_tasks?id=eq.${id}`,
    sanitize(body),
    false,
    ctx.tenantId,
  );
  const [task] = await res.json();

  // Recalculate completion %
  if (task?.onboarding_record_id) {
    const allRes = await sbFetch(
      env,
      "GET",
      `/rest/v1/onboarding_tasks?onboarding_record_id=eq.${task.onboarding_record_id}&select=status`,
      null,
      false,
      ctx.tenantId,
    );
    const all = await allRes.json();
    const pct = Math.round(
      (all.filter((t) => t.status === "completed").length / all.length) * 100,
    );
    await sbFetch(
      env,
      "PATCH",
      `/rest/v1/onboarding_records?id=eq.${task.onboarding_record_id}`,
      { completion_pct: pct, stage: pct === 100 ? "completed" : "in_progress" },
      false,
      ctx.tenantId,
    );
  }

  return apiResponse({ task });
}

async function handleUploadPolicy(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name") || file?.name || "Untitled Policy";
  if (!file) throw new ValidationError("file is required");

  const key = `policies/${ctx.tenantId}/${Date.now()}-${sanitizeFilename(file.name || "doc")}`;
  await env.HR_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  // Try to insert cleanly; if Supabase hr_policies misses version, fallback or assume db defaults version
  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/hr_policies",
    {
      name,
      category: "general",
      version: "1.0.0",
      file_key: key,
      tenant_id: ctx.tenantId,
    },
    false,
    ctx.tenantId,
  );
  const [policy] = await res.json();

  await audit(env, ctx, "policy.upload", "hr_policies", policy?.id, { name });
  return apiResponse({ policy }, HTTP.CREATED);
}

// â”€â”€ Training â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCreateCourse(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const body = await safeJson(request);
  if (!body.title) throw new ValidationError("title is required");

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/training_courses",
    { ...sanitize(body), tenant_id: ctx.tenantId, company_id: ctx.tenantId },
    false,
    ctx.tenantId,
  );
  const [course] = await res.json();

  if (env.VECTORIZE && course.title) {
    const emb = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
      text: [`${course.title}: ${course.description || ""}`],
    });
    await env.VECTORIZE.insert([
      {
        id: course.id,
        values: emb.data[0],
        metadata: {
          title: course.title,
          type: "course",
          tenant_id: ctx.tenantId,
        },
      },
    ]);
  }

  await invalidateCache(env, `courses:list:${ctx.tenantId}`);
  return apiResponse({ course }, HTTP.CREATED);
}

async function handleListCourses(request, env, ctx, _, url) {
  requireAuth(ctx);
  const cacheKey = `courses:list:${ctx.tenantId}`;
  const courses = await withCache(env, cacheKey, 120, async () => {
    const res = await sbFetch(
      env,
      "GET",
      `/rest/v1/training_courses?select=*&order=created_at.desc`,
      null,
      false,
      ctx.tenantId,
    );
    return res.json();
  });
  return apiResponse({ courses });
}

async function handleEnrollTraining(request, env, ctx) {
  requireAuth(ctx);
  const { employee_id, course_id, due_date } = await safeJson(request);
  if (!employee_id || !course_id)
    throw new ValidationError("employee_id and course_id required");

  const insertPayload = {
    employee_id,
    course_id,
    status: "enrolled",
    enrolled_at: new Date().toISOString(),
    tenant_id: ctx.tenantId,
  };
  // Include due_date if provided by frontend
  if (due_date) insertPayload.due_date = due_date;

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/training_enrollments",
    insertPayload,
    false,
    ctx.tenantId,
  );
  const parsed = await res.json();
  const enrollment = Array.isArray(parsed) ? parsed[0] : parsed;
  if (enrollment?.id) {
    await audit(
      env,
      ctx,
      "training.enroll",
      "training_enrollments",
      enrollment.id,
      { employee_id, course_id },
    );
  }
  return apiResponse({ enrollment }, HTTP.CREATED);
}

async function handleListEnrollments(request, env, ctx) {
  requireAuth(ctx);
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/training_enrollments?select=*,employees(first_name,last_name,email),training_courses(title,category,is_required,duration_hours)&order=enrolled_at.desc&limit=200`,
    null,
    false,
    ctx.tenantId,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`[handleListEnrollments] Supabase GET failed (${res.status}):`, errText);
    throw new AppError(
      `Failed to fetch enrollments: ${errText}`,
      res.status >= 500 ? HTTP.SERVER_ERROR : HTTP.BAD_REQUEST,
      "DB_ERROR",
    );
  }
  const enrollments = await res.json();
  return apiResponse({ enrollments });
}

async function handleSemanticCourseSearch(request, env, ctx) {
  requireAuth(ctx);
  const { query, topK = 5 } = await safeJson(request);
  if (!query) throw new ValidationError("query is required");
  if (!env.VECTORIZE) throw new ServiceUnavailableError("Vectorize");

  const emb = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [query] });
  const matches = await env.VECTORIZE.query(emb.data[0], {
    topK,
    returnMetadata: true,
    filter: { tenant_id: ctx.tenantId },
  });
  const ids = matches.matches.map((m) => m.id);
  if (!ids.length) return apiResponse({ courses: [], scores: [] });

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/training_courses?id=in.(${ids.join(",")})&select=*`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({
    courses: await res.json(),
    scores: matches.matches.map((m) => ({ id: m.id, score: m.score })),
  });
}

async function handleSendReminder(request, env, ctx, [id]) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/training_enrollments?id=eq.${id}&select=*,employees(email,first_name),training_courses(title)`,
    null,
    false,
    ctx.tenantId,
  );
  const [en] = await res.json();
  if (!en) throw new NotFoundError("Enrollment");

  await sendEmail(env, {
    to: en.employees.email,
    subject: `Reminder: Complete "${en.training_courses.title}"`,
    html: `<p>Hi ${en.employees.first_name}, this is a reminder to complete your training course: <strong>${en.training_courses.title}</strong>.</p>`,
  });
  return apiResponse({ sent: true });
}

// â”€â”€ Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCreateCycle(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const body = await safeJson(request);
  if (!body.name || !body.start_date || !body.end_date)
    throw new ValidationError("name, start_date, end_date required");

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/review_cycles",
    { ...sanitize(body), status: "active", company_id: ctx.tenantId, tenant_id: ctx.tenantId },
    false,
    ctx.tenantId,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to create review cycle: ${errText}`, res.status, "DB_ERROR");
  }
  const [cycle] = await res.json();
  return apiResponse({ cycle }, HTTP.CREATED);
}

async function handleListCycles(request, env, ctx) {
  requireAuth(ctx);
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/review_cycles?select=*&order=start_date.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ cycles: await res.json() });
}

async function handleSubmitReview(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  validate(body, "performance_review");

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/performance_reviews",
    {
      ...sanitize(body),
      reviewer_id: ctx.actorId,
      submitted_at: new Date().toISOString(),
      tenant_id: ctx.tenantId,
    },
    false,
    ctx.tenantId,
  );
  const [review] = await res.json();
  await audit(env, ctx, "review.submit", "performance_reviews", review.id, {
    employee_id: body.employee_id,
  });
  await dispatchWebhook(env, ctx.tenantId, "review.submitted", {
    review_id: review.id,
    employee_id: body.employee_id,
  });
  return apiResponse({ review }, HTTP.CREATED);
}

async function handleGetEmployeeReviews(request, env, ctx, [employeeId]) {
  requireAuth(ctx);
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/performance_reviews?employee_id=eq.${employeeId}&select=*,review_cycles(name)&order=submitted_at.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ reviews: await res.json() });
}

async function handleListReviews(request, env, ctx, _, url) {
  requireAuth(ctx);
  const cycleId = url?.searchParams.get("cycle_id");
  const qp = cycleId ? `&cycle_id=eq.${cycleId}` : "";
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/performance_reviews?select=*,review_cycles(name)${qp}&order=submitted_at.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ reviews: await res.json() });
}

async function handlePerformanceFeedback(request, env, ctx) {
  requireAuth(ctx);
  const { employee_id, rating, strengths, improvements } =
    await safeJson(request);
  if (!employee_id) throw new ValidationError("employee_id required");

  const empRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/employees?id=eq.${employee_id}&select=first_name,last_name,job_title`,
    null,
    false,
    ctx.tenantId,
  );
  const [emp] = await empRes.json();

  const prompt = `You are an expert HR business partner at a world-class company.
Generate a balanced, constructive, STAR-method performance review paragraph for:
Employee: ${emp?.first_name} ${emp?.last_name} | Role: ${emp?.job_title}
Manager Rating: ${rating}/5 | Strengths noted: ${strengths} | Areas for improvement: ${improvements}
Be specific, professional, growth-oriented, and 150-200 words. Avoid clichÃ©s.`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 400,
  });
  return apiResponse({
    feedback: result.response,
    generated_at: new Date().toISOString(),
  });
}

// â”€â”€ OKRs / Goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCreateGoal(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  if (!body.title || !body.employee_id)
    throw new ValidationError("title and employee_id required");

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/performance_goals",
    {
      ...sanitize(body),
      progress: 0,
      status: "on_track",
      tenant_id: ctx.tenantId,
      created_by: ctx.actorId,
    },
    false,
    ctx.tenantId,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to create goal: ${errText}`, res.status, "DB_ERROR");
  }
  const [goal] = await res.json();
  return apiResponse({ goal }, HTTP.CREATED);
}

async function handleListGoals(request, env, ctx, _, url) {
  requireAuth(ctx);
  const empId = url.searchParams.get("employee_id");
  const qp = empId ? `&employee_id=eq.${empId}` : "";
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/performance_goals?select=*${qp}&order=created_at.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ goals: await res.json() });
}

async function handleUpdateGoal(request, env, ctx, [id]) {
  requireAuth(ctx);
  const body = await safeJson(request);
  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/performance_goals?id=eq.${id}`,
    sanitize(body),
    false,
    ctx.tenantId,
  );
  const [goal] = await res.json();
  return apiResponse({ goal });
}

// â”€â”€ Leave â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleSubmitLeave(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  validate(body, "leave");

  const from = new Date(body.from_date);
  const to = new Date(body.to_date);
  if (to < from) throw new ValidationError("to_date must be after from_date");
  const days = Math.ceil((to - from) / 86400000) + 1;

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/leave_requests",
    {
      ...sanitize(body),
      days,
      status: "pending",
      tenant_id: ctx.tenantId,
      submitted_at: new Date().toISOString(),
    },
    false,
    ctx.tenantId,
  );
  const [leave] = await res.json();

  await audit(env, ctx, "leave.submit", "leave_requests", leave.id, {
    employee_id: body.employee_id,
    days,
  });
  await dispatchWebhook(env, ctx.tenantId, "leave.submitted", {
    leave_id: leave.id,
    employee_id: body.employee_id,
    days,
  });
  await invalidateCache(env, `analytics:summary:${ctx.tenantId}`);
  return apiResponse({ leave }, HTTP.CREATED);
}

async function handleListLeave(request, env, ctx, _, url) {
  requireAuth(ctx);
  const status = url.searchParams.get("status");
  const empId = url.searchParams.get("employee_id");
  let qp = `select=*,employees(first_name,last_name)&order=submitted_at.desc&limit=${CURSOR_PAGE_SIZE}`;
  if (status) qp += `&status=eq.${status}`;
  if (empId) qp += `&employee_id=eq.${empId}`;

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/leave_requests?${qp}`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ leaves: await res.json() });
}

async function handleGetLeaveBalance(request, env, ctx, _, url) {
  requireAuth(ctx);
  const empId = url.searchParams.get("employee_id");
  if (!empId) throw new ValidationError("employee_id required");

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/leave_balances?employee_id=eq.${empId}&select=*`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ balances: await res.json() });
}

async function handleLeaveDecision(request, env, ctx, [id]) {
  requireRole(ctx, "manager", "hr", "admin", "superadmin");
  // Route pattern: PATCH /leave/:id/approved  or  PATCH /leave/:id/rejected
  // `id` is the leave UUID from the route param
  const leaveId = id;
  // Extract the decision (last segment) from the URL path
  const pathSegments = new URL(request.url).pathname.split("/").filter(Boolean);
  const decision = pathSegments[pathSegments.length - 1]; // "approved" or "rejected"

  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/leave_requests?id=eq.${leaveId}`,
    {
      status: decision,
      decided_by: ctx.actorId,
      decided_at: new Date().toISOString(),
    },
    false,
    ctx.tenantId,
  );
  const [leave] = await res.json();

  if (decision === "approved") {
    await sbFetch(
      env,
      "PATCH",
      `/rest/v1/employees?id=eq.${leave.employee_id}`,
      { status: "on_leave" },
      false,
      ctx.tenantId,
    );
  }

  await audit(env, ctx, `leave.${decision}`, "leave_requests", leaveId, {
    decision,
  });
  await dispatchWebhook(env, ctx.tenantId, `leave.${decision}`, {
    leave_id: leaveId,
  });
  await invalidateCache(env, `analytics:summary:${ctx.tenantId}`);
  return apiResponse({ status: decision, leave_id: leaveId });
}

// â”€â”€ Payroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TAX_PROFILES = {
  IN: {
    name: 'India (Old Regime)',
    slabs: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 500000, rate: 0.05 },
      { min: 500000, max: 1000000, rate: 0.20 },
      { min: 1000000, max: Infinity, rate: 0.30 }
    ],
    pf: { rate: 0.12, cap: 15000 },
    esi: { rate: 0.0075, ceiling: 21000 },
    professionalTax: 200,
    cess: 0.04
  },
  IN_NEW: {
    name: 'India (New Regime)',
    slabs: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 700000, rate: 0.05 },
      { min: 700000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: 1500000, rate: 0.20 },
      { min: 1500000, max: Infinity, rate: 0.30 }
    ],
    pf: { rate: 0.12, cap: 15000 },
    esi: { rate: 0.0075, ceiling: 21000 },
    professionalTax: 200,
    cess: 0.04
  },
  US: {
    name: 'United States',
    slabs: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 }
    ],
    fica: { ss: 0.062, ssWageCap: 168600, medicare: 0.0145 },
    state: 0.05
  },
  UK: {
    name: 'United Kingdom',
    slabs: [
      { min: 0, max: 12570, rate: 0 },
      { min: 12570, max: 50270, rate: 0.20 },
      { min: 50270, max: 125140, rate: 0.40 },
      { min: 125140, max: Infinity, rate: 0.45 }
    ],
    ni: { rate: 0.08, threshold: 12570 }
  },
  AE: {
    name: 'UAE',
    slabs: [{ min: 0, max: Infinity, rate: 0 }],
    gratuity: { rate: 0.0575 }
  },
  CA: {
    name: 'Canada',
    slabs: [
      { min: 0, max: 53359, rate: 0.15 },
      { min: 53359, max: 106717, rate: 0.205 },
      { min: 106717, max: 165430, rate: 0.26 },
      { min: 165430, max: 235675, rate: 0.29 },
      { min: 235675, max: Infinity, rate: 0.33 }
    ],
    cpp: { rate: 0.0595, max: 3867.50 },
    ei: { rate: 0.0166, max: 1049.12 }
  },
  AU: {
    name: 'Australia',
    slabs: [
      { min: 0, max: 18200, rate: 0 },
      { min: 18200, max: 45000, rate: 0.19 },
      { min: 45000, max: 120000, rate: 0.325 },
      { min: 120000, max: 180000, rate: 0.37 },
      { min: 180000, max: Infinity, rate: 0.45 }
    ],
    medicare: 0.02,
    super: 0.11
  },
  DE: {
    name: 'Germany (EU)',
    slabs: [
      { min: 0, max: 10908, rate: 0 },
      { min: 10908, max: 62809, rate: 0.24 },
      { min: 62809, max: 277825, rate: 0.42 },
      { min: 277825, max: Infinity, rate: 0.45 }
    ],
    social: {
      health: 0.073,
      pension: 0.093,
      unemployment: 0.013,
      care: 0.01525
    }
  }
};

function calculateTax(monthlyIncome, countryCode = 'IN', taxRegime = 'old') {
  let profileKey = countryCode;
  if (countryCode === 'IN' && taxRegime === 'new') profileKey = 'IN_NEW';
  const profile = TAX_PROFILES[profileKey] || TAX_PROFILES['IN'];
  const annual = monthlyIncome * 12;
  let remainingIncome = annual;
  let annualTax = 0;
  const breakdown = [];

  for (const slab of profile.slabs) {
    if (remainingIncome <= 0) break;
    const taxableInSlab = Math.min(remainingIncome, slab.max - slab.min);
    const slabTax = taxableInSlab * slab.rate;
    if (slabTax > 0) breakdown.push({ slab: `${slab.rate * 100}%`, amount: slabTax / 12 });
    annualTax += slabTax;
    remainingIncome -= taxableInSlab;
  }

  let monthlyIncomeTax = annualTax / 12;
  let socialTax = 0;

  if (countryCode === 'IN') {
    socialTax += Math.min(monthlyIncome * profile.pf.rate, profile.pf.cap);
    if (monthlyIncome <= profile.esi.ceiling) socialTax += monthlyIncome * profile.esi.rate;
    socialTax += profile.professionalTax;
    monthlyIncomeTax *= (1 + profile.cess);
  } else if (countryCode === 'US') {
    const annualSoFar = monthlyIncome * 12;
    if (annualSoFar <= profile.fica.ssWageCap) socialTax += monthlyIncome * profile.fica.ss;
    socialTax += monthlyIncome * profile.fica.medicare;
    socialTax += monthlyIncome * profile.state;
  } else if (countryCode === 'UK') {
    const niable = Math.max(0, monthlyIncome - profile.ni.threshold / 12);
    socialTax += niable * profile.ni.rate;
  } else if (countryCode === 'AE') {
    socialTax += monthlyIncome * (profile.gratuity?.rate || 0);
  } else if (countryCode === 'CA') {
    socialTax += Math.min(monthlyIncome * profile.cpp.rate, profile.cpp.max / 12);
    socialTax += Math.min(monthlyIncome * profile.ei.rate, profile.ei.max / 12);
  } else if (countryCode === 'AU') {
    socialTax += monthlyIncome * profile.medicare;
  } else if (countryCode === 'DE') {
    socialTax += monthlyIncome * (profile.social.health + profile.social.pension + profile.social.unemployment + profile.social.care);
  }

  return {
    incomeTax: Math.max(0, Math.round(monthlyIncomeTax * 100) / 100),
    socialTax: Math.max(0, Math.round(socialTax * 100) / 100),
    totalTax: Math.max(0, Math.round((monthlyIncomeTax + socialTax) * 100) / 100)
  };
}

function currencyToCountry(currency) {
  return { INR: 'IN', USD: 'US', GBP: 'UK', AED: 'AE', EUR: 'DE', CAD: 'CA', AUD: 'AU' }[currency] || 'IN';
}

async function handleCalculatePayroll(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const { period, currency } = await safeJson(request);

  const [salRes, dedRes, leaveRes, perfRes, expRes] = await Promise.all([
    sbFetch(
      env,
      "GET",
      currency ? `/rest/v1/employee_salaries?currency=eq.${currency}&select=*,employees(status,id)` : "/rest/v1/employee_salaries?select=*,employees(status,id)",
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      "/rest/v1/payroll_deductions?status=eq.active&select=*",
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/leave_requests?status=eq.approved&leave_type=eq.unpaid&select=employee_id,days`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/performance_reviews?status=eq.completed&select=employee_id,score`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/expenses?status=eq.approved&select=employee_id,amount`,
      null,
      false,
      ctx.tenantId,
    ),
  ]);

  const salaries = (await salRes.json()).filter(
    (s) => s.employees?.status === "active",
  );
  const deductions = await dedRes.json();
  const unpaidLeave = await leaveRes.json();
  const reviews = await perfRes.json() || [];
  const expenses = await expRes.json() || [];

  const perfMap = {};
  reviews.sort((a,b)=>b.id-a.id).forEach(r => {
    if(!perfMap[r.employee_id] && r.score) perfMap[r.employee_id] = r.score;
  });

  const expenseMap = {};
  expenses.forEach(ex => {
    expenseMap[ex.employee_id] = (expenseMap[ex.employee_id] || 0) + (ex.amount || 0);
  });

  const countryCode = currencyToCountry(currency || 'USD');

  const payslips = salaries.map((s) => {
    let base = s.base_salary || 0;
    let allowances = s.allowances || {};
    let totalAllowances = (allowances.hra || 0) + (allowances.special || 0);

    let score = perfMap[s.employee_id] || 0;
    let bonus = 0;
    if (score >= 90) bonus = base * 0.10;
    else if (score >= 80) bonus = base * 0.05;

    const empDeds = deductions
      .filter((d) => d.employee_id === s.employee_id)
      .reduce((sum, d) => sum + Number(d.amount), 0);
      
    const unpaidDays = unpaidLeave
      .filter((l) => l.employee_id === s.employee_id)
      .reduce((sum, l) => sum + l.days, 0);
      
    const dailyRate = (base + totalAllowances) / 22;
    const unpaidAdj = dailyRate * unpaidDays;

    let taxableIncome = base + totalAllowances + bonus - unpaidAdj;
    const taxResult = calculateTax(taxableIncome, countryCode, s.tax_regime || 'old');

    let reimbursements = expenseMap[s.employee_id] || 0;

    const gross = base + totalAllowances + bonus + reimbursements;
    const totalDeductionsAgg = empDeds + unpaidAdj + taxResult.totalTax;
    const net = Math.max(0, gross - totalDeductionsAgg);

    return {
      employee_id: s.employee_id,
      gross_pay: gross,
      deductions_total: totalDeductionsAgg,
      net_pay: net,
      currency: s.currency || currency || 'USD',
    };
  });

  const totals = payslips.reduce(
    (acc, p) => ({
      gross: acc.gross + p.gross_pay,
      net: acc.net + p.net_pay,
      deductions: acc.deductions + p.deductions_total,
      count: acc.count + 1,
    }),
    { gross: 0, net: 0, deductions: 0, count: 0 },
  );

  return apiResponse({ period, payslips, totals });
}

async function handleGeneratePayslipPdf(request, env, ctx, [payslipId]) {
  requireAuth(ctx);
  
  // Fetch payslip data with employee details and company details
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?id=eq.${payslipId}&select=*,employees(first_name,last_name,job_title,departments(name)),companies(name,address,registration_number)&limit=1`,
    null,
    false,
    ctx.tenantId,
  );
  const data = await res.json();
  const payslip = data?.[0];
  if (!payslip) throw new NotFoundError("Payslip");
  
  // Generate PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { width, height } = page.getSize();
  const colorDark = rgb(0.1, 0.1, 0.1);
  const colorGray = rgb(0.4, 0.4, 0.4);
  const colorBrand = rgb(0.15, 0.25, 0.45);
  
  const companyName = payslip.companies?.name || "Simpatico HR Enterprise";
  const empName = `${payslip.employees?.first_name || ""} ${payslip.employees?.last_name || ""}`.trim();
  const period = payslip.period || "Unknown Period";
  const currency = payslip.currency || "INR";
  
  // Header
  page.drawText(companyName, { x: 50, y: height - 60, size: 24, font: helveticaBold, color: colorBrand });
  page.drawText("PAYSLIP", { x: width - 150, y: height - 60, size: 20, font: helveticaBold, color: colorGray });
  
  page.drawLine({
    start: { x: 50, y: height - 80 },
    end: { x: width - 50, y: height - 80 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  // Employee Details
  page.drawText(`Employee Name: ${empName}`, { x: 50, y: height - 120, size: 12, font: helveticaBold, color: colorDark });
  page.drawText(`Job Title: ${payslip.employees?.job_title || "N/A"}`, { x: 50, y: height - 140, size: 10, font: helveticaFont, color: colorDark });
  page.drawText(`Department: ${payslip.employees?.departments?.name || "N/A"}`, { x: 50, y: height - 155, size: 10, font: helveticaFont, color: colorDark });
  
  page.drawText(`Pay Period: ${period}`, { x: width - 200, y: height - 120, size: 10, font: helveticaBold, color: colorDark });
  page.drawText(`Pay Date: ${payslip.pay_date || "N/A"}`, { x: width - 200, y: height - 135, size: 10, font: helveticaFont, color: colorDark });
  page.drawText(`Status: ${payslip.status?.toUpperCase() || "GENERATED"}`, { x: width - 200, y: height - 150, size: 10, font: helveticaFont, color: colorDark });
  
  // Earnings & Deductions Table Header
  const tableY = height - 220;
  page.drawRectangle({
    x: 50, y: tableY - 5, width: width - 100, height: 25,
    color: rgb(0.95, 0.95, 0.95),
  });
  page.drawText("EARNINGS", { x: 60, y: tableY, size: 10, font: helveticaBold, color: colorDark });
  page.drawText("AMOUNT", { x: 200, y: tableY, size: 10, font: helveticaBold, color: colorDark });
  page.drawText("DEDUCTIONS", { x: width / 2 + 10, y: tableY, size: 10, font: helveticaBold, color: colorDark });
  page.drawText("AMOUNT", { x: width - 100, y: tableY, size: 10, font: helveticaBold, color: colorDark });
  
  // Content
  const formatAmt = (amt) => `${currency} ${Number(amt).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  
  page.drawText("Basic Salary", { x: 60, y: tableY - 30, size: 10, font: helveticaFont, color: colorDark });
  page.drawText(formatAmt(payslip.gross_pay), { x: 200, y: tableY - 30, size: 10, font: helveticaFont, color: colorDark });
  
  let dY = tableY - 30;
  if (payslip.deductions && Array.isArray(payslip.deductions)) {
    payslip.deductions.forEach(d => {
      page.drawText(d.name || "Deduction", { x: width / 2 + 10, y: dY, size: 10, font: helveticaFont, color: colorDark });
      page.drawText(formatAmt(d.amount), { x: width - 100, y: dY, size: 10, font: helveticaFont, color: colorDark });
      dY -= 20;
    });
  } else {
    page.drawText("Total Deductions", { x: width / 2 + 10, y: dY, size: 10, font: helveticaFont, color: colorDark });
    page.drawText(formatAmt(payslip.deductions_total), { x: width - 100, y: dY, size: 10, font: helveticaFont, color: colorDark });
  }
  
  // Totals
  const totalY = dY - 40;
  page.drawLine({
    start: { x: 50, y: totalY + 15 },
    end: { x: width - 50, y: totalY + 15 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  page.drawText("Gross Earnings:", { x: 60, y: totalY, size: 10, font: helveticaBold, color: colorDark });
  page.drawText(formatAmt(payslip.gross_pay), { x: 200, y: totalY, size: 10, font: helveticaBold, color: colorDark });
  
  page.drawText("Total Deductions:", { x: width / 2 + 10, y: totalY, size: 10, font: helveticaBold, color: colorDark });
  page.drawText(formatAmt(payslip.deductions_total), { x: width - 100, y: totalY, size: 10, font: helveticaBold, color: colorDark });
  
  page.drawRectangle({
    x: 50, y: totalY - 45, width: width - 100, height: 30,
    color: rgb(0.9, 0.95, 0.9),
  });
  page.drawText("NET PAY:", { x: 60, y: totalY - 35, size: 12, font: helveticaBold, color: colorDark });
  page.drawText(formatAmt(payslip.net_pay), { x: width - 150, y: totalY - 35, size: 14, font: helveticaBold, color: rgb(0.1, 0.5, 0.2) });
  
  // Footer
  page.drawText("This is a computer-generated document. No signature is required.", {
    x: 50, y: 50, size: 8, font: helveticaFont, color: colorGray,
  });
  
  const pdfBytes = await pdfDoc.save();
  
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Payslip_${empName.replace(/\\s+/g, '_')}_${period}.pdf"`,
    }
  });
}

async function handleRunPayroll(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const body = await safeJson(request);
  validate(body, "payroll_run");

  const runRes = await sbFetch(
    env,
    "POST",
    "/rest/v1/payroll_runs",
    {
      ...body,
      status: "processing",
      initiated_by: ctx.actorId,
      tenant_id: ctx.tenantId,
    },
    false,
    ctx.tenantId,
  );
  const [run] = await runRes.json();

  const calcRes = await handleCalculatePayroll(
    new Request("http://internal", {
      method: "POST",
      body: JSON.stringify({ period: body.period, currency: body.currency }),
    }),
    env,
    ctx,
  );
  const calc = await calcRes.json();
  const { payslips, totals } = calc.data;

  // Persist individual payslips
  await sbFetch(
    env,
    "POST",
    "/rest/v1/payslips",
    payslips.map((p) => ({
      ...p,
      period: body.period,
      pay_date: body.pay_date,
      payroll_run_id: run.id,
      tenant_id: ctx.tenantId,
    })),
    false,
    ctx.tenantId,
  );

  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/payroll_runs?id=eq.${run.id}`,
    {
      status: "completed",
      total_gross: totals.gross,
      total_net: totals.net,
      employee_count: totals.count,
    },
    false,
    ctx.tenantId,
  );

  await audit(env, ctx, "payroll.run", "payroll_runs", run.id, {
    period: body.period,
    count: totals.count,
  });
  await dispatchWebhook(env, ctx.tenantId, "payroll.completed", {
    run_id: run.id,
    period: body.period,
    totals,
  });

  return apiResponse({ run_id: run.id, totals }, HTTP.CREATED);
}

async function handleListPayrollRuns(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payroll_runs?select=*&order=created_at.desc&limit=24`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ runs: await res.json() });
}

async function handleGetPayslips(request, env, ctx, [employeeId]) {
  requireAuth(ctx);
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?employee_id=eq.${employeeId}&select=*&order=pay_date.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ payslips: await res.json() });
}

async function handleListAllPayslips(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?select=*,employees(id,first_name,last_name,departments(name))&order=created_at.desc&limit=200`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ payslips: await res.json() });
}

async function handleSendPayslip(request, env, ctx, [id]) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?id=eq.${id}&select=*,employees(email,first_name)`,
    null,
    false,
    ctx.tenantId,
  );
  const [ps] = await res.json();
  if (!ps) throw new NotFoundError("Payslip");

  await sendEmail(env, {
    to: ps.employees.email,
    subject: `Your Payslip for ${ps.period}`,
    html: payslipEmailHtml(ps),
  });
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/payslips?id=eq.${id}`,
    { sent_at: new Date().toISOString() },
    false,
    ctx.tenantId,
  );
  return apiResponse({ sent: true });
}

async function handleSendAllPayslips(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "hr_manager",
    "company_admin",
    "payroll",
    "admin",
    "superadmin",
  );
  const { period } = await safeJson(request);
  if (!period) throw new ValidationError("period required");

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?period=eq.${period}&sent_at=is.null&select=*,employees(email,first_name)`,
    null,
    false,
    ctx.tenantId,
  );
  const pss = await res.json();
  const sent = await Promise.allSettled(
    pss.map((ps) =>
      sendEmail(env, {
        to: ps.employees.email,
        subject: `Your Payslip for ${ps.period}`,
        html: payslipEmailHtml(ps),
      }),
    ),
  );
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/payslips?period=eq.${period}`,
    { sent_at: new Date().toISOString() },
    false,
    ctx.tenantId,
  );
  return apiResponse({
    total: pss.length,
    succeeded: sent.filter((s) => s.status === "fulfilled").length,
  });
}

// â”€â”€ Recruitment / ATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCreateJob(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const body = await safeJson(request);
  validate(body, "job_posting");

  // Accept status from frontend (open, draft, closed) â€” default to "open"
  const jobStatus = ["open", "draft", "closed"].includes(body.status) ? body.status : "open";

  // Validate syndication_targets values
  const validPlatforms = ["linkedin", "indeed"];
  const syndicationTargets = Array.isArray(body.syndication_targets)
    ? body.syndication_targets.filter(t => validPlatforms.includes(t))
    : [];

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/jobs",
    {
      ...sanitize(body),
      syndication_targets: syndicationTargets,
      status: jobStatus,
      tenant_id: ctx.tenantId,
      created_by: ctx.actorId,
    },
    false,
    ctx.tenantId,
  );
  const [job] = await res.json();

  // Multi-Platform Job Syndication Integration (LinkedIn & Indeed)
  let syndicationInfo = { platforms_queued: [], status: "none" };

  if (syndicationTargets.length > 0 && jobStatus === "open") {
    syndicationInfo.platforms_queued = [...syndicationTargets];
    syndicationInfo.status = "queued";

    const syndicationPromise = (async () => {
      try {
        const results = [];
        if (syndicationTargets.includes("linkedin")) {
          console.log(`[Syndication] Pushing job ${job.id} to LinkedIn Direct...`);
          // TODO: Replace with real LinkedIn Job Posting API call
          // Requires OAuth 2.0 token from env.LINKEDIN_ACCESS_TOKEN
          // POST https://api.linkedin.com/v2/simpleJobPostings
          await new Promise(r => setTimeout(r, 800));
          await audit(env, ctx, "job.syndicated", "jobs", job.id, { platform: "linkedin" });
          results.push("linkedin");
        }
        if (syndicationTargets.includes("indeed")) {
          console.log(`[Syndication] Pushing job ${job.id} to Indeed XML feed...`);
          // TODO: Replace with real Indeed Sponsored Jobs API call
          // Requires API key from env.INDEED_API_KEY
          // POST https://apis.indeed.com/ads/v1/sponsoredJobs
          await new Promise(r => setTimeout(r, 600));
          await audit(env, ctx, "job.syndicated", "jobs", job.id, { platform: "indeed" });
          results.push("indeed");
        }
        if (results.length > 0) {
          console.log(`[Syndication Success] Job ${job.id} successfully syndicated to:`, results.join(", "));
          // Persist syndication status back to the job record
          await sbFetch(
            env,
            "PATCH",
            `/rest/v1/jobs?id=eq.${job.id}`,
            { syndication_status: "syndicated", syndicated_platforms: results },
            false,
            ctx.tenantId,
          ).catch(err => console.warn("[Syndication] DB status update failed:", err.message));
        }
      } catch (err) {
        console.error(`[Syndication Failed] Job ${job.id}:`, err.message);
        // Persist failure status
        await sbFetch(
          env,
          "PATCH",
          `/rest/v1/jobs?id=eq.${job.id}`,
          { syndication_status: "failed" },
          false,
          ctx.tenantId,
        ).catch(() => {});
      }
    })();
    
    // Ensure background tasks finish before Worker terminates
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(syndicationPromise);
    }
  }

  await invalidateCache(env, `analytics:summary:${ctx.tenantId}`);
  return apiResponse({ job, syndication: syndicationInfo }, HTTP.CREATED);
}

async function handleListJobs(request, env, ctx, _, url) {
  // No strict role check â€” tenant isolation enforced by sbFetch
  const status = url.searchParams.get("status") || "open";
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/jobs?status=eq.${status}&select=*&order=created_at.desc`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ jobs: await res.json() });
}

async function handlePublicJobs(request, env, ctx, _, url) {
  // Unauthenticated endpoint for embeddable Careers Widget
  const company_id = url.searchParams.get("company_id");
  if (!company_id)
    throw new ValidationError(
      "company_id parameter is required for public job listings",
    );

  // Pass company_id as the tenant parameter to sbFetch to auto-filter and isolate tenant records securely
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/jobs?status=eq.open&select=id,title,department,location,employment_type,salary_min,description,created_at&order=created_at.desc`,
    null,
    false,
    company_id,
  );
  const jobs = await res.json();

  // Return formatted array for the widget
  return apiResponse({ jobs });
}

async function handleCreateApplication(request, env, ctx) {
  const body = await safeJson(request);
  if (!body.job_id || !body.candidate_email)
    throw new ValidationError("job_id and candidate_email required");

  // 0. Base64 Upload Handling (Bypass Frontend RLS limit)
  // â˜… ENTERPRISE B2B MULTI-TENANT FIX:
  // Store CVs in a tenant-isolated path. Do not use public URLs for PII data.
  let secureFileKey = null;
  if (body.resume_base64 && body.resume_filename) {
    try {
      const base64Data = body.resume_base64.split(",")[1] || body.resume_base64;
      const binaryStr = atob(base64Data);
      const fileBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        fileBytes[i] = binaryStr.charCodeAt(i);
      }
      
      const fileExt = body.resume_filename.split('.').pop() || 'pdf';
      // Isolate by tenant_id and job_id to prevent naming collisions and enforce strict RLS
      secureFileKey = `${ctx.tenantId}/${body.job_id}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      
      const uploadRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/hr-documents/${secureFileKey}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "apikey": env.SUPABASE_SERVICE_KEY,
          "Content-Type": "application/pdf",
          "x-upsert": "true"
        },
        body: fileBytes
      });
      
      if (uploadRes.ok) {
        // Store as a private storage path reference, NOT a public URL
        body.resume_url = `private://hr-documents/${secureFileKey}`;
      } else {
        console.error("Worker upload error:", await uploadRes.text());
      }
    } catch(e) {
      console.error("Worker upload exception:", e);
    }
    delete body.resume_base64;
    delete body.resume_filename;
  }

  // 1. Fetch Job Listing to check for Auto-Shortlist / requirements
  const jobRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/jobs?id=eq.${body.job_id}&select=*`,
    null,
    false,
    ctx.tenantId,
  );
  const [job] = await jobRes.json();

  let match_score = null;
  let status = "applied";
  let ai_summary = "";

  // 2. AI Resume Parsing & Scoring (if resume_text is available and env.AI exists)
  if (body.resume_text && job && env.AI) {
    const prompt = `You are an expert ATS AI. Compare the candidate's resume to the job description.
Job Title: ${job.title}
Job Desc: ${job.description || job.department}
Resume: ${body.resume_text}

Calculate a match score out of 100 based on skills, experience, and requirements fit. 
Return ONLY valid JSON in format: {"match_score": 85, "reason": "Brief 1-sentence reason"}`;

    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      });
      const cleaned = result.response.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleaned);
      match_score = analysis.match_score || null;
      ai_summary = analysis.reason;

      // We assume job_applications has a JSONB metadata or similar, but to be perfectly safe,
      // we'll append the ai_summary to the resume_text or note field if metadata isn't strictly defined.
      body.resume_text =
        `[AI Score: ${match_score}/100 - ${ai_summary}]\n\n` + body.resume_text;
    } catch (e) {
      console.warn("AI parsing failed:", e);
    }
  }

  // 3. Auto-Shortlist / Auto-Reject Logic
  let autoInterview = false;
  let autoRejected = false;
  let interviewToken = "";
  // Check if job has auto_shortlist enabled (database flag on jobs table)
  // Falls back to true by default for AI-first automation pipeline
  const autoEnabled = job?.auto_shortlist !== false;
  // Configurable rejection threshold â€” jobs can set auto_reject_threshold (default: 40)
  const rejectThreshold = job?.auto_reject_threshold ?? 40;

  if (autoEnabled && match_score !== null) {
    if (match_score >= 70) {
      // HIGH SCORE â†’ Auto-shortlist to interview stage
      status = "interview";
      autoInterview = true;
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < 32; i++) {
        interviewToken += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } else if (match_score < rejectThreshold) {
      // LOW SCORE â†’ Auto-reject with notification
      status = "rejected";
      autoRejected = true;
    }
    // MIDDLE SCORE (rejectThreshold..69) â†’ stays as "applied" for manual review
  }

  // Preserve resume_text for the candidate profile drawer
  const storedResumeText = body.resume_text || null;

  // Explicitly whitelist only columns that exist on the job_applications table.
  // Using ...sanitize(body) caused PGRST204 errors when unknown fields
  // (e.g. client_id, candidate_skills, source) leaked into the INSERT payload.
  const insertPayload = {
    candidate_name:   (body.candidate_name || '').trim().slice(0, 500),
    candidate_email:  (body.candidate_email || '').trim().slice(0, 500),
    job_id:           body.job_id,
    status,
    match_score:      match_score,
    ai_summary:       ai_summary || null,
    resume_text:      storedResumeText,
    resume_url:       body.resume_url || null,
    applied_at:       new Date().toISOString(),
    tenant_id:        ctx.tenantId,
  };

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/job_applications",
    insertPayload,
    false,
    ctx.tenantId,
  );
  const [app] = await res.json();

  // 4. Auto-Schedule Interview execution
  if (autoInterview && app) {
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 7 day expiry
    const intvPayload = {
      application_id: app.id,
      candidate_name: app.candidate_name,
      candidate_email: app.candidate_email,
      job_id: job.id,
      token: interviewToken,
      token_type: "single",
      interview_type: "ai_voice",
      interview_role: job.title,
      interview_level: "auto",
      status: "pending",
      company_id: ctx.tenantId,
      question_count: 5,
      interview_language: "en",
      max_attempts: 1,
      attempts_used: 0,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    try {
      const intvRes = await sbFetch(
        env,
        "POST",
        "/rest/v1/interviews",
        intvPayload,
        false,
        ctx.tenantId,
      );
      if (!intvRes.ok) {
        const errBody = await intvRes.text().catch(() => "unknown");
        console.error("[ATS] Interview insert failed:", intvRes.status, errBody);
        autoInterview = false; // Mark as not scheduled so frontend shows correct state
      }
    } catch (intvErr) {
      console.error("[ATS] Interview scheduling exception:", intvErr.message);
      autoInterview = false;
    }

    const baseUrl = env.FRONTEND_URL || "https://simpaticohr.github.io";
    const meetingLink = `${baseUrl}/interview/proctored-room.html?token=${interviewToken}`;

    try {
      await sendEmail(env, {
        to: app.candidate_email,
        subject: `Interview Invitation â€” ${job.title} at SimpaticoHR`,
        html: `<div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Interview Invitation ðŸŽ‰</h1>
      <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">You've been shortlisted by our AI screening</p>
    </div>
    <div style="padding:32px 24px;">
      <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${app.candidate_name}</strong>,</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">Congratulations! Your profile scored <strong>${match_score}%</strong> against the <strong>${job.title}</strong> role requirements. You've been automatically shortlisted for a preliminary AI interview.</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:0 0 24px;">
        <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Position</td><td style="padding:6px 0;font-weight:600;">${job.title}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Department</td><td style="padding:6px 0;font-weight:600;">${job.department || "General"}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Format</td><td style="padding:6px 0;font-weight:600;">AI Voice Interview (Proctored)</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Duration</td><td style="padding:6px 0;font-weight:600;">~20 minutes</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Deadline</td><td style="padding:6px 0;font-weight:600;">Within 7 days</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${meetingLink}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Start Your Interview â†’</a>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>Tips:</strong> Use Chrome or Edge Â· Ensure good lighting Â· Use a quiet room Â· Have your camera and microphone ready
      </div>
    </div>
    <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">Â© ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd Â· <a href="https://simpaticohr.in" style="color:#4f46e5;text-decoration:none;">simpaticohr.in</a></p>
    </div>
  </div>
</div>`,
      });
    } catch (e) {
      console.warn("[ATS] Auto-shortlist email failed:", e.message);
    }
  }

  // 5. Auto-Reject Notification Email
  if (autoRejected && app) {
    try {
      await sendEmail(env, {
        to: app.candidate_email,
        subject: `Application Update â€” ${job.title}`,
        html: `<div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Application Update</h1>
    </div>
    <div style="padding:32px 24px;">
      <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${app.candidate_name || 'there'}</strong>,</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">Thank you for your interest in the <strong>${job.title}</strong> position. After careful review, we've decided to move forward with other candidates whose qualifications more closely match our current requirements.</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">We encourage you to apply for future openings that match your skills and experience. Your profile has been added to our talent pool for consideration.</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">Best regards,<br/><strong>SimpaticoHR Recruitment Team</strong></p>
    </div>
    <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">Â© ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd</p>
    </div>
  </div>
</div>`,
      });
    } catch (e) {
      console.warn("[ATS] Auto-reject email failed:", e.message);
    }
    await audit(env, ctx, "application.auto_rejected", "job_applications", app.id, {
      match_score,
      reject_threshold: rejectThreshold,
    }).catch(() => {});
  }

  await dispatchWebhook(env, ctx.tenantId, "application.received", {
    application_id: app.id,
    job_id: body.job_id,
    auto_shortlisted: autoInterview,
    auto_rejected: autoRejected,
    match_score,
  });
  return apiResponse(
    { application: app, auto_scheduled: autoInterview, auto_rejected: autoRejected, match_score },
    HTTP.CREATED,
  );
}

async function handleListApplications(request, env, ctx, _, url) {
  // No strict role check â€” tenant isolation enforced by sbFetch tenant_id filter
  const jobId = url.searchParams.get("job_id");
  const status = url.searchParams.get("status");
  let qp = `select=*,jobs(title,department)&order=created_at.desc`;
  if (jobId) qp += `&job_id=eq.${jobId}`;
  if (status) qp += `&status=eq.${status}`;
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/job_applications?${qp}`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ applications: await res.json() });
}

async function handleUpdateApplication(request, env, ctx, [id]) {
  const body = await safeJson(request);

  // Only allow safe fields to be patched
  const allowed = [
    "status",
    "updated_at",
    "notes",
    "ai_score",
    "interview_token",
  ];
  const patch = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError("No valid fields to update");
  }

  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/job_applications?id=eq.${id}`,
    patch,
    false,
    ctx.tenantId,
  );

  // Handle non-OK responses from Supabase (4xx range)
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(
      `[handleUpdateApplication] Supabase PATCH failed (${res.status}):`,
      errText,
    );
    throw new AppError(
      `Failed to update application: ${errText}`,
      res.status >= 500 ? HTTP.SERVER_ERROR : HTTP.BAD_REQUEST,
      "DB_ERROR",
    );
  }

  const result = await res.json();
  const app = Array.isArray(result) ? result[0] : result;

  await audit(env, ctx, "application.update", "job_applications", id, {
    status: body.status,
  }).catch((e) => console.warn("Audit failed:", e));
  return apiResponse({ application: app || { id, ...patch } });
}

// â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleListNotifications(request, env, ctx, _, url) {
  requireAuth(ctx);
  const unreadOnly = url.searchParams.get("unread") === "true";
  let qp = `select=*&employee_id=eq.${ctx.actorId}&order=created_at.desc&limit=50`;
  if (unreadOnly) qp += "&read_at=is.null";
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/notifications?${qp}`,
    null,
    false,
    ctx.tenantId,
  );
  return apiResponse({ notifications: await res.json() });
}

async function handleMarkNotificationRead(request, env, ctx, [id]) {
  requireAuth(ctx);
  await sbFetch(
    env,
    "PATCH",
    `/rest/v1/notifications?id=eq.${id}`,
    { read_at: new Date().toISOString() },
    false,
    ctx.tenantId,
  );
  return new Response(null, { status: HTTP.NO_CONTENT, headers: CORS_HEADERS });
}

// â”€â”€ AI Intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleInterviewQuestion(request, env, ctx) {
  // requireAuth(ctx);
  const { messages, token } = await safeJson(request);
  if (!Array.isArray(messages))
    throw new ValidationError("messages array required");

  // We could fetch the JD again here using the token,
  // but for efficiency we trust the system prompt built by the frontend
  // which already has the JD. We just need to make sure the AI prioritizes it.

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: messages, // Frontend provides the FULL system prompt + history
    max_tokens: 600,
    temperature: 0.7,
  });

  await audit(env, ctx, "interview.ai_question", "interviews", null, {
    token_hint: token?.slice(0, 8),
  });
  return apiResponse({ response: result.response });
}

async function handleExpenseOCR(request, env, ctx) {
  requireAuth(ctx);
  const { receipt_text } = await safeJson(request);
  if (!receipt_text) throw new ValidationError("receipt_text required");

  const prompt = `You are an AI expense parser. Given the following raw text extracted from a receipt, identify the vendor name, the total amount, the currency (e.g. USD, EUR, INR), the date (YYYY-MM-DD), and categorize the expense (one of: travel, meals, office_supplies, software, general).
If you cannot find a value, return null for that field.
Receipt Text:
"""
${receipt_text}
"""
Return ONLY valid JSON (no markdown, no backticks) in this exact format:
{"vendor": "Vendor Name", "amount": 120.50, "currency": "USD", "date": "2024-05-10", "category": "meals"}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });

  try {
    const text = result.response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return apiResponse({ parsed });
  } catch (e) {
    throw new AppError(
      "Failed to parse receipt with AI",
      HTTP.SERVER_ERROR,
      "PARSE_ERROR",
      result.response,
    );
  }
}

async function handleAIChat(request, env, ctx) {
  // requireAuth(ctx);
  const { messages } = await safeJson(request);
  if (!Array.isArray(messages) || !messages.length)
    throw new ValidationError("messages array required");

  let ragContext = "";
  if (env.VECTORIZE) {
    try {
      const lastMsg = messages.at(-1).content;
      const emb = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
        text: [lastMsg],
      });
      const rag = await env.VECTORIZE.query(emb.data[0], {
        topK: 4,
        returnMetadata: true,
        filter: { tenant_id: ctx.tenantId },
      });
      ragContext = rag.matches
        .filter((m) => m.score > 0.7)
        .map((m) => m.metadata.text)
        .join("\n---\n");
    } catch (e) {
      console.warn("RAG query failed:", e.message);
    }
  }

  const systemMsg = {
    role: "system",
    content: `You are Simpatico, a world-class enterprise HR AI assistant.
Tenant: ${ctx.tenantId} | Actor: ${ctx.actorEmail || "system"} | Role: ${ctx.actorRole}
${ragContext ? `Policy & Knowledge Context:\n${ragContext}` : ""}
Be precise, professional, and actionable. Cite sources when using context. Never fabricate HR data.`,
  };

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [systemMsg, ...messages],
    max_tokens: 2048,
  });
  await audit(env, ctx, "ai.chat", "ai_sessions", null, {
    turns: messages.length,
  });
  return apiResponse({
    response: result.response,
    model: "llama-3.1-8b-instruct",
    tokens_hint: result.usage,
  });
}

async function handleAIChatStream(request, env, ctx) {
  requireAuth(ctx);
  const { messages } = await safeJson(request);
  if (!env.AI) throw new ServiceUnavailableError("AI");

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encode = (v) => new TextEncoder().encode(v);

  const systemMsg = {
    role: "system",
    content: `You are Simpatico HR AI. Tenant: ${ctx.tenantId}. Be helpful, concise, and accurate.`,
  };

  (async () => {
    try {
      const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [systemMsg, ...messages],
        max_tokens: 2048,
        stream: true,
      });
      for await (const chunk of stream) {
        await writer.write(encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      await writer.write(encode("data: [DONE]\n\n"));
    } catch (e) {
      await writer.write(
        encode(`data: ${JSON.stringify({ error: e.message })}\n\n`),
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handleATSGenerator(request, env, ctx) {
  const { query } = await safeJson(request);
  if (!query) throw new ValidationError("query is required");
  if (!env.AI) throw new ServiceUnavailableError("AI");

  const systemPrompt = `You are an enterprise ATS automation expert. Given a description, output ONLY valid JSON (no markdown, no backticks) for a recruiting automation rule.
Schema:
{
  "name": "short rule name",
  "desc": "one sentence description",
  "trigger": "one of: app_received|app_viewed|resume_parsed|stage_moved|stage_stalled|sla_breached|interview_scheduled|interview_completed|interview_noshow|interview_feedback|assessment_sent|assessment_completed|assessment_scored|offer_extended|offer_accepted|offer_declined|candidate_rejected|candidate_withdrawn|job_published|referral_submitted|source_linkedin|schedule_daily|schedule_weekly",
  "cond_dept": "department or empty",
  "cond_level": "junior|mid|senior|exec or empty",
  "cond_score": "number threshold or empty",
  "cond_stage": "stage key or empty",
  "actions": [{"type": "send_email|send_sms|send_slack|move_stage|reject_candidate|shortlist|schedule_interview|send_assessment|assign_recruiter|notify_hiring_manager|create_task|trigger_webhook|update_ats|generate_offer|sync_hris|add_to_talent_pool|send_nps", "target": "target", "msg": "message"}]
}
Include 2-4 logical actions. Keep it practical for enterprise HR.`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    max_tokens: 1024,
  });

  try {
    const text = result.response.replace(/```json|```/g, "").trim();
    const rule = JSON.parse(text);
    return apiResponse({ rule });
  } catch (e) {
    throw new AppError(
      "Failed to parse AI-generated rule",
      HTTP.SERVER_ERROR,
      "PARSE_ERROR",
      result.response,
    );
  }
}

async function handleGenerateAssessment(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "admin",
    "superadmin",
    "employer",
    "company_admin",
    "hr_manager",
  );

  let body;
  try {
    body = await request.json();
  } catch (err) {
    throw new ValidationError("Failed to parse request JSON: " + err.message);
  }
  const {
    job_title,
    department,
    tech_stack,
    culture,
    difficulty,
    question_count = 5,
  } = body;

  if (!job_title) {
    throw new ValidationError(
      "job_title is required. Body received: " + JSON.stringify(body),
    );
  }

  try {
    // Build detailed prompt for AI
    const prompt = `Design a highly specific, proctored assessment quiz for a ${difficulty || "mid-level"} ${job_title}${department ? ` in ${department}` : ""}${tech_stack ? ` specializing in ${tech_stack}` : ""}.

Generate ${question_count} technical questions that:
1. Accurately assess core competencies for this role
2. Include both multiple-choice (MCQ) and short-answer types
3. Have clear correct answers and grading rubrics for AI evaluation
4. Test real-world problem-solving, not just theory

${culture ? `Company culture: ${culture}. Incorporate questions that assess alignment with our values.` : ""}

CRITICAL: Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "assessment_title": "string",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "A",
      "scoring_rubric": "How to grade this question"
    }
  ]
}`;

    const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    if (!aiResponse?.response) {
      throw new Error("AI returned empty response");
    }

    // Parse AI response - remove markdown code blocks if present
    let responseText = aiResponse.response.trim();
    responseText = responseText
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .replace(/^```\n?/, "")
      .trim();

    // Attempt to parse JSON
    let assessment;
    try {
      assessment = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[assessment] JSON parse failed:", {
        error: parseError.message,
        rawResponse: responseText.substring(0, 200),
      });
      throw new Error(
        `AI returned invalid JSON: ${parseError.message}. Please try again.`,
      );
    }

    // Validate assessment structure
    if (
      !assessment.assessment_title ||
      typeof assessment.assessment_title !== "string"
    ) {
      throw new Error("Assessment missing or invalid title field");
    }

    if (
      !Array.isArray(assessment.questions) ||
      assessment.questions.length === 0
    ) {
      throw new Error(
        `Assessment has no questions (got ${assessment.questions?.length || 0}). AI may not have generated properly.`,
      );
    }

    // Validate each question
    assessment.questions.forEach((q, idx) => {
      if (!q.question || !q.type) {
        throw new Error(
          `Question ${idx + 1} missing required fields (question, type)`,
        );
      }
      if (
        q.type === "mcq" &&
        (!Array.isArray(q.options) || q.options.length === 0)
      ) {
        throw new Error(`MCQ question ${idx + 1} has no options`);
      }
      if (!q.correct_answer) {
        throw new Error(`Question ${idx + 1} missing correct_answer`);
      }
    });

    return apiResponse({
      assessment,
      generated_at: new Date().toISOString(),
      question_count: assessment.questions.length,
    });
  } catch (error) {
    console.error("[assessment] Generation error:", {
      job_title,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    // Distinguish between validation, AI, and system errors
    if (error.message.includes("JSON")) {
      return apiResponse(
        { error: `Assessment generation failed: ${error.message}` },
        HTTP.SERVER_ERROR,
        { code: "AI_PARSE_ERROR", retryable: true },
      );
    }

    if (
      error.message.includes("missing") ||
      error.message.includes("invalid")
    ) {
      return apiResponse(
        { error: `Invalid assessment structure: ${error.message}` },
        HTTP.SERVER_ERROR,
        { code: "ASSESSMENT_VALIDATION_ERROR", retryable: true },
      );
    }

    return apiResponse(
      { error: error.message || "Assessment generation failed" },
      HTTP.SERVER_ERROR,
      { code: "AI_SERVICE_ERROR" },
    );
  }
}

async function handleGenerateCourse(request, env, ctx) {
  requireAuth(ctx);
  const { title } = await safeJson(request);
  if (!title) throw new ValidationError("title required");
  
  const prompt = `You are an expert Corporate Trainer and LMS AI. Generate a professional course outline for a corporate training course titled "${title}". 
Return ONLY valid JSON with these fields:
{"description": "A compelling 2-3 sentence overview of what employees will learn...", "duration_hours": 2.5}`;
  
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });
  
  const cleaned = result.response.replace(/```json|```/g, "").trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    data = { description: result.response.substring(0, 200), duration_hours: 1.0 };
  }
  return apiResponse(data);
}

async function handleSaveAssessment(request, env, ctx) {
  requireRole(
    ctx,
    "hr",
    "admin",
    "superadmin",
    "employer",
    "company_admin",
    "hr_manager",
  );

  const body = await safeJson(request);
  if (!body.assessment_title)
    throw new ValidationError("assessment_title is required");

  const payload = {
    ...body,
    tenant_id: ctx.tenantId,
    created_by_id: ctx.actorId,
    status: "draft",
  };

  const res = await withCircuitBreaker(env, "supabase", () =>
    sbFetch(env, "POST", "/rest/v1/assessments", payload, false, ctx.tenantId),
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new AppError(
      `Assessment save failed (Supabase): ${errText}`,
      res.status >= 500 ? HTTP.SERVER_ERROR : HTTP.BAD_REQUEST,
      "DB_ERROR",
    );
  }

  const saved = await res.json();
  return apiResponse(saved[0] || saved, HTTP.CREATED);
}

async function handleEmployeeInsight(request, env, ctx) {
  requireRole(ctx, "manager", "hr", "admin", "superadmin");
  const { employee_id } = await safeJson(request);
  if (!employee_id) throw new ValidationError("employee_id required");

  const [empRes, reviewRes, leaveRes, enrollRes] = await Promise.all([
    sbFetch(
      env,
      "GET",
      `/rest/v1/employees?id=eq.${employee_id}&select=*`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/performance_reviews?employee_id=eq.${employee_id}&select=rating,comments&order=submitted_at.desc&limit=3`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/leave_requests?employee_id=eq.${employee_id}&select=leave_type,days,status&order=created_at.desc&limit=5`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/training_enrollments?employee_id=eq.${employee_id}&select=status,training_courses(title)&limit=5`,
      null,
      false,
      ctx.tenantId,
    ),
  ]);

  const [emp] = await empRes.json();
  const reviews = await reviewRes.json();
  const leaves = await leaveRes.json();
  const enrollments = await enrollRes.json();

  const prompt = `Analyse this employee profile and generate a structured JSON insight report.
Employee: ${JSON.stringify(emp)}
Last 3 Reviews: ${JSON.stringify(reviews)}
Recent Leave History: ${JSON.stringify(leaves)}
Training Enrollments: ${JSON.stringify(enrollments)}
Return ONLY valid JSON: {"summary": "...", "strengths": ["..."], "risks": ["..."], "recommendations": ["..."], "engagement_score": 0-100}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
  });
  const cleaned = result.response.replace(/```json|```/g, "").trim();

  let insight;
  try {
    insight = JSON.parse(cleaned);
  } catch {
    insight = { summary: result.response };
  }

  return apiResponse({ employee_id, insight });
}

async function handleSentimentAnalysis(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const { text, context: feedbackCtx } = await safeJson(request);
  if (!text) throw new ValidationError("text required");

  const prompt = `Analyse the sentiment and tone of this employee feedback. Return ONLY valid JSON with keys: sentiment (positive/neutral/negative), confidence (0-1), themes (string[]), risk_flags (string[]), recommended_action (string).
Context: ${feedbackCtx || "general"}
Text: "${text}"`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });
  const cleaned = result.response.replace(/```json|```/g, "").trim();
  let analysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    analysis = { raw: result.response };
  }

  return apiResponse({ analysis });
}

async function handleGenerateJD(request, env, ctx) {
  // requireRole(ctx, 'hr', 'admin', 'superadmin');
  const {
    title,
    department,
    experience,
    skills,
    tone = "professional",
  } = await safeJson(request);
  if (!title || !department)
    throw new ValidationError("title and department required");

  const prompt = `You are a world-class talent acquisition specialist. Write a compelling, inclusive, bias-free job description.
Role: ${title} | Department: ${department} | Experience: ${experience || "unspecified"} | Key Skills: ${skills || "unspecified"} | Tone: ${tone}
Structure: Overview â†’ Responsibilities (5-7 bullets) â†’ Requirements (must-have vs nice-to-have) â†’ Benefits â†’ Diversity statement.
Use engaging, modern language. Avoid jargon. Max 500 words.`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 700,
  });
  return apiResponse({
    jd: result.response,
    generated_at: new Date().toISOString(),
  });
}
async function handleInterviewEmail(request, env) {
  try {
    const data = await request.json();

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Simpatico HR <hr@ats.simpaticohr.in>",
        to: data.candidateEmail,
        subject: `Interview Invitation: ${data.position} at Simpatico`,
        html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #1f2937;">
                        <h2 style="color: #4f46e5;">Interview Invitation</h2>
                        <p>Hi ${data.candidateName},</p>
                        <p>You have been invited to an interview for the <strong>${data.position}</strong> role.</p>
                        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="margin-bottom: 8px;"><strong>ðŸ“… Date:</strong> ${data.date}</li>
                                <li style="margin-bottom: 8px;"><strong>â° Time:</strong> ${data.startTime}</li>
                                <li><strong>ðŸ“ Mode:</strong> ${data.mode.toUpperCase()}</li>
                            </ul>
                        </div>
                        ${data.meetingLink ? `<p><strong>Link/Location:</strong> <a href="${data.meetingLink}" style="color: #4f46e5;">${data.meetingLink}</a></p>` : ""}
                        <p>Best regards,<br>Simpatico HR Team</p>
                    </div>
                `,
      }),
    });

    if (!resendResponse.ok) throw new Error("Resend API rejected the request");

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }
}
async function handleOnboardingChecklist(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const { role, department } = await safeJson(request);
  if (!role || !department)
    throw new ValidationError("role and department required");

  const prompt = `Generate a JSON array of exactly 10 onboarding tasks for a ${role} in the ${department} department at a modern tech company.
Categories: hr, it, compliance, social, training.
Format: [{"title": "...", "category": "...", "due_days": 1, "priority": "high|medium|low"}]
Return ONLY valid JSON array, no markdown.`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
  });
  const cleaned = result.response.replace(/```json|```/g, "").trim();

  let tasks;
  try {
    tasks = JSON.parse(cleaned);
  } catch {
    throw new AppError(
      "AI returned invalid JSON",
      HTTP.SERVER_ERROR,
      "AI_PARSE_ERROR",
    );
  }

  return apiResponse({ tasks, role, department });
}

// â”€â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleAnalyticsSummary(request, env, ctx) {
  requireAuth(ctx);
  const cacheKey = `analytics:summary:${ctx.tenantId}`;

  const summary = await withCache(env, cacheKey, 120, async () => {
    const [empR, leaveR, jobsR, reviewR, onboardR] = await Promise.all([
      sbFetch(
        env,
        "GET",
        "/rest/v1/employees?select=id,status",
        null,
        false,
        ctx.tenantId,
      ),
      sbFetch(
        env,
        "GET",
        "/rest/v1/leave_requests?status=eq.pending&select=id",
        null,
        false,
        ctx.tenantId,
      ),
      sbFetch(
        env,
        "GET",
        "/rest/v1/jobs?status=eq.open&select=id",
        null,
        false,
        ctx.tenantId,
      ),
      sbFetch(
        env,
        "GET",
        "/rest/v1/performance_reviews?select=rating",
        null,
        false,
        ctx.tenantId,
      ),
      sbFetch(
        env,
        "GET",
        "/rest/v1/onboarding_records?stage=eq.in_progress&select=id",
        null,
        false,
        ctx.tenantId,
      ),
    ]);

    const emps = await empR.json();
    const leaves = await leaveR.json();
    const jobs = await jobsR.json();
    const reviews = await reviewR.json();
    const onboards = await onboardR.json();

    const byStatus = emps.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {});
    const avgRating = reviews.length
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)
      : null;

    return {
      total_headcount: emps.length,
      active_employees: byStatus.active || 0,
      on_leave: byStatus.on_leave || 0,
      onboarding: byStatus.onboarding || 0,
      pending_leaves: leaves.length,
      active_recruitments: jobs.length,
      active_onboarding: onboards.length,
      avg_performance_rating: avgRating,
      timestamp: new Date().toISOString(),
    };
  });

  return apiResponse(summary);
}

async function handleAnalyticsReport(request, env, ctx, _, url) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const days = Math.min(parseInt(url.searchParams.get("days") || "90"), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const fmt = url.searchParams.get("format") || "json";

  const [eRes, lRes, pRes, rRes] = await Promise.all([
    sbFetch(
      env,
      "GET",
      `/rest/v1/employees?select=first_name,last_name,status,job_title,department,start_date`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/leave_requests?created_at=gte.${since}&select=*,employees(first_name,last_name)`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/payslips?select=period,gross_pay,net_pay,employees(first_name,last_name)`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/performance_reviews?created_at=gte.${since}&select=rating,employees(first_name,last_name)`,
      null,
      false,
      ctx.tenantId,
    ),
  ]);

  const employees = eRes.ok ? await eRes.json() : [];
  const leaves = lRes.ok ? await lRes.json() : [];
  const payroll = pRes.ok ? await pRes.json() : [];
  const reviews = rRes.ok ? await rRes.json() : [];

  if (fmt === "csv") {
    const rows = [
      [
        "REPORT_TYPE",
        "ENTITY_NAME",
        "ATTRIBUTE_1",
        "ATTRIBUTE_2",
        "NUMERIC_VAL",
        "STATUS",
      ],
      ...employees.map((e) => [
        "STAFF",
        `${e.first_name} ${e.last_name}`,
        e.job_title,
        e.department || "",
        e.start_date || "",
        e.status,
      ]),
      ...leaves.map((l) => [
        "LEAVE",
        `${l.employees?.first_name} ${l.employees?.last_name}`,
        l.leave_type,
        l.from_date,
        l.days,
        l.status,
      ]),
      ...payroll.map((p) => [
        "PAYROLL",
        `${p.employees?.first_name} ${p.employees?.last_name}`,
        p.period,
        "NET",
        p.net_pay,
        "PAID",
      ]),
      ...reviews.map((r) => [
        "REVIEW",
        `${r.employees?.first_name} ${r.employees?.last_name}`,
        "RATING",
        "",
        r.rating,
        "COMPLETED",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    return new Response(csv, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="Simpatico_Report_${new Date().toISOString().split("T")[0]}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return apiResponse({
    employees,
    leaves,
    payroll,
    reviews,
    period_days: days,
    generated_at: new Date().toISOString(),
  });
}

async function handleHeadcountTrend(request, env, ctx, _, url) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const months = Math.min(parseInt(url.searchParams.get("months") || "12"), 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/employees?start_date=gte.${since.toISOString().split("T")[0]}&select=start_date,status`,
    null,
    false,
    ctx.tenantId,
  );
  const data = await res.json();

  const byMonth = {};
  for (const emp of data) {
    const m = emp.start_date?.slice(0, 7);
    if (m) byMonth[m] = (byMonth[m] || 0) + 1;
  }

  const trend = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hires]) => ({ month, hires }));
  return apiResponse({ trend, period_months: months });
}

async function handleAttritionReport(request, env, ctx) {
  requireRole(ctx, "hr", "admin", "superadmin");
  const [activeRes, inactiveRes] = await Promise.all([
    sbFetch(
      env,
      "GET",
      `/rest/v1/employees?status=eq.active&select=id`,
      null,
      false,
      ctx.tenantId,
    ),
    sbFetch(
      env,
      "GET",
      `/rest/v1/employees?status=eq.inactive&select=id,deactivated_at`,
      null,
      false,
      ctx.tenantId,
    ),
  ]);

  const active = await activeRes.json();
  const inactive = await inactiveRes.json();
  const total = active.length + inactive.length;
  const rate = total ? ((inactive.length / total) * 100).toFixed(2) : "0.00";

  return apiResponse({
    active: active.length,
    inactive: inactive.length,
    total,
    attrition_rate_pct: parseFloat(rate),
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 15.  SUPABASE HELPER  (tenant-scoped)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function sbFetch(
  env,
  method,
  path,
  body,
  countOnly = false,
  tenantId = "default",
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    throw new ServiceUnavailableError("Database");

  // â”€â”€ TENANT ISOLATION: Only inject tenant filter for tables that have tenant_id â”€â”€
  // Tables without tenant_id: job_applications, jobs, interviews, employees (core schema)
  // We use service_role key which bypasses RLS, so tenant isolation is opt-in per table
  let finalPath = path;
  const TENANT_AWARE_TABLES = [
    "leave_requests",
    "payroll_runs",
    "payslips",
    "employee_salaries",
    "payroll_deductions",
    "training_courses",
    "training_enrollments",
    "onboarding_records",
    "onboarding_tasks",
    "performance_reviews",
    "performance_goals",
    "goals",
    "notifications",
    "audit_logs",
    "employee_documents",
    "hr_policies",
  ];
  if (method === "GET" && tenantId && tenantId !== "default") {
    const tableName = (path.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (tableName && TENANT_AWARE_TABLES.includes(tableName)) {
      const separator = finalPath.includes("?") ? "&" : "?";
      // Most tables use `tenant_id` as their multi-tenant column
      finalPath += `${separator}tenant_id=eq.${tenantId}`;
    }
  }

  const url = `${env.SUPABASE_URL}${finalPath}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantId,
  };

  if (method === "POST") headers["Prefer"] = "return=representation";
  if (method === "PATCH") headers["Prefer"] = "return=representation";
  if (countOnly) headers["Prefer"] = "count=exact";

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(url, opts);

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    throw new AppError(
      `Database error: ${err}`,
      response.status >= 500 ? HTTP.SERVER_ERROR : response.status,
      "DB_ERROR",
    );
  }

  if (countOnly) {
    const range = response.headers.get("content-range");
    return { count: range ? parseInt(range.split("/")[1]) || 0 : 0 };
  }

  return response;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 16.  EMAIL HELPER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set â€” email suppressed");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Simpatico HR <hr@ats.simpaticohr.in>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo || undefined,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Email send failed [${subject}]:`, errorText);
    throw new AppError(`Email delivery failed: ${errorText}`, 500, "EMAIL_ERROR");
  }
  return res;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Â§ 16.5 WHATSAPP AUTOMATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleWhatsAppNotification(request, env, ctx) {
  const body = await safeJson(request);
  const { phone, message } = body;

  if (!phone) throw new ValidationError("Phone number is required");

  // If credentials are not set, return simulated success to trigger wa.me fallback
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    console.warn("WHATSAPP_TOKEN not set - triggering wa.me frontend link.");
    return apiResponse({ success: true, method: "fallback_wame" });
  }

  const res = await fetch(`https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/[^0-9]/g, ""),
      type: "text",
      text: { body: message }
    })
  });

  if (!res.ok) {
    throw new AppError(`WhatsApp API Error: ${await res.text()}`, 500, "WA_ERROR");
  }

  return apiResponse({ success: true, method: "api" });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 17.  UTILITY FUNCTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

function sanitize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = v.trim().slice(0, 10000);
    else out[k] = v;
  }
  return out;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ 18.  EMAIL TEMPLATES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function welcomeEmailHtml(firstName, empNum) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:40px;text-align:center">
          <h1 style="color:white;margin:0;font-size:28px;font-weight:700">Welcome to the Team! ðŸŽ‰</h1>
        </td></tr>
        <tr><td style="padding:40px">
          <p style="font-size:16px;color:#374151">Hi <strong>${firstName}</strong>,</p>
          <p style="font-size:15px;color:#6b7280;line-height:1.6">We're thrilled to have you on board. Your HR account has been provisioned and you're ready to get started.</p>
          <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #6366f1">
            <p style="margin:0;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Employee ID</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;font-family:monospace">${empNum}</p>
          </div>
          <p style="font-size:15px;color:#6b7280">Log in to your dashboard to complete your onboarding checklist.</p>
          <div style="text-align:center;margin-top:32px">
            <a href="${"https://app.simpaticohr.in"}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px">Go to Dashboard â†’</a>
          </div>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">Â© ${new Date().getFullYear()} Simpatico HR. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function payslipEmailHtml(ps) {
  const currency = ps.currency || 'USD';
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px;text-align:center">
          <h2 style="color:white;margin:0">Payslip â€” ${ps.period}</h2>
        </td></tr>
        <tr><td style="padding:32px">
          <p>Hi <strong>${ps.employees?.first_name || "there"}</strong>, your payslip for <strong>${ps.period}</strong> is ready.</p>
          <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
            <tr style="background:#f9fafb"><td style="border-bottom:1px solid #e5e7eb;color:#6b7280">Gross Pay</td><td style="border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${currency} ${Number(ps.gross_pay || 0).toLocaleString()}</td></tr>
            <tr><td style="border-bottom:1px solid #e5e7eb;color:#6b7280">Deductions</td><td style="border-bottom:1px solid #e5e7eb;text-align:right;color:#ef4444">-${currency} ${Number(ps.deductions_total || 0).toLocaleString()}</td></tr>
            <tr style="background:#f0fdf4"><td style="font-weight:700;font-size:16px">Net Pay</td><td style="text-align:right;font-weight:700;font-size:18px;color:#16a34a">${currency} ${Number(ps.net_pay || 0).toLocaleString()}</td></tr>
          </table>
          <p style="font-size:13px;color:#9ca3af;margin-top:24px">Pay Date: <strong>${ps.pay_date || "N/A"}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
 * â•‘  REQUIRED CLOUDFLARE BINDINGS (wrangler.toml)                              â•‘
 * â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£
 * â•‘  Secrets (wrangler secret put):                                             â•‘
 * â•‘    SUPABASE_URL          â€” Supabase project URL                             â•‘
 * â•‘    SUPABASE_SERVICE_KEY  â€” Supabase service role key                        â•‘
 * â•‘    JWT_SECRET            â€” HMAC-SHA256 secret for JWT verification           â•‘
 * â•‘    RESEND_API_KEY        â€” Resend email API key                              â•‘
 * â•‘    WEBHOOK_SECRET        â€” HMAC secret for outbound webhook signatures       â•‘
 * â•‘    R2_PUBLIC_URL         â€” Public base URL for R2 bucket                    â•‘
 * â•‘    EMAIL_FROM            â€” Sender address (optional, has default)            â•‘
 * â•‘                                                                             â•‘
 * â•‘  KV Namespace:  HR_KV   (rate limiting, idempotency, circuit breaker)       â•‘
 * â•‘  R2 Bucket:     HR_BUCKET (avatars, documents)                              â•‘
 * â•‘  AI Binding:    AI       (Workers AI)                                       â•‘
 * â•‘  Vectorize:     VECTORIZE (semantic search index)                           â•‘
 * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */ // â”€â”€ ADD THIS ROUTE to your ROUTES declarations (Â§12) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// route('POST', '/interviews/schedule', handleScheduleInterviewEmail);

// â”€â”€ ADD THIS HANDLER (paste into Â§ 14) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleScheduleInterviewEmail(request, env, ctx) {
  const body = await safeJson(request);

  const {
    candidateName,
    candidateEmail,
    position,
    round,
    date,
    startTime,
    endTime,
    interviewer,
    mode,
    meetingLink,
    notes,
    interviewLink,
    token, // From frontend: unique string for the candidate
    interviewerEmail, // optional â€” cc the interviewer if provided
  } = body;

  if (!candidateName || !candidateEmail || !position || !date || !startTime) {
    throw new ValidationError(
      "candidateName, candidateEmail, position, date, startTime are required",
    );
  }

  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString(
    "en-IN",
    { weekday: "long", day: "2-digit", month: "long", year: "numeric" },
  );

  const formattedStart = formatTimeStr(startTime);
  const formattedEnd = formatTimeStr(endTime);

  const modeLabel =
    {
      video: "ðŸ“¹ Video Call",
      inperson: "ðŸ¢ In-Person",
      phone: "ðŸ“ž Phone Call",
      proctored: "ðŸ”’ Proctored (AI-Monitored)",
    }[mode] || mode;

  let meetingSection = "";
  if (interviewLink && token) {
    meetingSection = `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Access Room</td>
           <td style="padding:8px 0;font-weight:600;font-size:14px;"><a href="${interviewLink}" style="color:#4f46e5;text-decoration:none;background:#e0e7ff;padding:6px 12px;border-radius:6px;">Join Proctored Room</a></td></tr>
           <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Access Token</td>
           <td style="padding:8px 0;font-weight:600;font-size:14px;"><code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;color:#111827;letter-spacing:1px;user-select:all;">${token}</code></td></tr>`;
  } else if (meetingLink) {
    meetingSection = `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Link</td>
           <td style="padding:8px 0;font-weight:600;font-size:14px;"><a href="${meetingLink}" style="color:#4f46e5;">Join Meeting</a></td></tr>`;
  }

  const notesSection = notes
    ? `<div style="margin-top:20px;background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;font-size:14px;color:#92400e;">
        <strong>ðŸ“ Notes:</strong> ${notes}
       </div>`
    : "";

  const candidateHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">Interview Scheduled ðŸŽ‰</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">You have been invited for an interview</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="font-size:16px;color:#374151;">Hi <strong>${candidateName}</strong>,</p>
          <p style="font-size:15px;color:#6b7280;line-height:1.6;">
            We're pleased to invite you for an interview at <strong>Simpatico</strong>. Please find the details below.
          </p>

          <div style="background:#f9fafb;border-radius:10px;padding:24px;margin:24px 0;border:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:180px;">Position</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${position}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Round</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${round}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Date</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${formattedDate}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Time</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${formattedStart} â€“ ${formattedEnd}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Mode</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${modeLabel}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Interviewer</td>
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${interviewer}</td></tr>
              ${meetingSection}
            </table>
          </div>

          ${
            mode === "proctored"
              ? `
          <div style="background:#ede9fe;border-left:4px solid #7c3aed;padding:14px 16px;border-radius:6px;margin-bottom:20px;font-size:14px;color:#5b21b6;">
            <strong>ðŸ”’ This is a Proctored Interview.</strong><br>
            Your session will be AI-monitored. Please ensure your camera and microphone are working, and take the interview from a quiet, well-lit location.
          </div>`
              : ""
          }

          ${notesSection}

          <p style="font-size:14px;color:#6b7280;margin-top:24px;line-height:1.6;">
            If you need to reschedule or have any questions, please reply to this email or contact our HR team.
          </p>

          <p style="font-size:15px;color:#374151;margin-top:20px;">Best of luck! ðŸ™Œ<br><strong>Simpatico HR Team</strong></p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Â© ${new Date().getFullYear()} Simpatico HR Â· interviews@simpaticohr.in</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send to candidate
  await sendEmail(env, {
    to: candidateEmail,
    subject: `Interview Scheduled: ${position} â€” ${formattedDate}`,
    html: candidateHtml,
  });

  // Optionally CC interviewer
  if (interviewerEmail) {
    await sendEmail(env, {
      to: interviewerEmail,
      subject: `[Action Required] You are interviewing ${candidateName} â€” ${formattedDate}`,
      html: candidateHtml.replace(
        `Hi <strong>${candidateName}</strong>`,
        `Hi <strong>${interviewer}</strong>, you have an upcoming interview with <strong>${candidateName}</strong>`,
      ),
    });
  }

  await audit(env, ctx, "interview.email_sent", "interviews", null, {
    candidateEmail,
    position,
  });

  return apiResponse({ sent: true, to: candidateEmail });
}

// Helper used inside this handler only
function formatTimeStr(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ REGISTRATION & WELCOME EMAIL HANDLERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function handleCompanyRegister(request, env, ctx) {
  const body = await safeJson(request);
  const {
    name,
    email,
    contact_email,
    industry,
    company_size,
    website,
    subscription_plan,
    admin_user_id,
    admin_name,
    admin_phone,
    slug,
  } = body;

  if (!name || !email) throw new ValidationError("name and email are required");

  // Insert company using service_role key (bypasses RLS)
  const compRes = await sbFetch(
    env,
    "POST",
    "/rest/v1/companies",
    {
      name,
      email,
      contact_email: contact_email || email,
      industry: industry || null,
      company_size: company_size || null,
      website: website || null,
      subscription_plan: subscription_plan || "trial",
      slug:
        slug ||
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
          "-" +
          Date.now().toString(36),
      is_active: true,
    },
    false,
    "default",
  );

  if (!compRes.ok) {
    const errText = await compRes.text();
    throw new AppError(
      `Failed to create company: ${errText}`,
      HTTP.SERVER_ERROR,
      "DB_ERROR",
    );
  }

  const companies = await compRes.json();
  const company = Array.isArray(companies) ? companies[0] : companies;

  // If admin_user_id provided, create user profile
  if (admin_user_id && company?.id) {
    try {
      await sbFetch(
        env,
        "POST",
        "/rest/v1/users",
        {
          auth_id: admin_user_id,
          full_name: admin_name || "Admin",
          email,
          phone: admin_phone || null,
          role: "company_admin",
          company_id: company.id,
          is_active: true,
        },
        false,
        "default",
      );
    } catch (e) {
      console.warn(
        "[handleCompanyRegister] User profile insert failed:",
        e.message,
      );
    }
  }

  // Await the welcome email so Cloudflare doesn't terminate the thread early
  try {
    await sendEmail(env, {
      to: email,
      subject: `Welcome to SimpaticoHR, ${admin_name || "Team"}! ðŸŽ‰`,
      html: registrationWelcomeHtml(admin_name || "there", name, "company"),
    });
  } catch (e) {
    console.warn("[handleCompanyRegister] Welcome email failed:", e);
  }

  return apiResponse(
    { company_id: company?.id, company_name: name, status: "active" },
    HTTP.CREATED,
  );
}

async function handleWelcomeEmail(request, env, ctx) {
  const { email, name, company_name, type } = await safeJson(request);

  if (!email || !name) throw new ValidationError("email and name are required");

  const subject =
    type === "company"
      ? `Welcome to SimpaticoHR, ${name}! Your company is ready ðŸš€`
      : `Welcome to SimpaticoHR, ${name}! ðŸŽ‰`;

  await sendEmail(env, {
    to: email,
    subject,
    html: registrationWelcomeHtml(
      name,
      company_name || "SimpaticoHR",
      type || "candidate",
    ),
  });

  return apiResponse({ sent: true, to: email });
}

function registrationWelcomeHtml(name, companyName, type) {
  const greeting =
    type === "company"
      ? `Your company <strong>${companyName}</strong> has been registered on SimpaticoHR.`
      : `You've successfully registered on SimpaticoHR as a candidate.`;

  const nextSteps =
    type === "company"
      ? `<li style="margin-bottom:8px">Post your first job opening (1 included in free trial)</li>
         <li style="margin-bottom:8px">Configure your hiring pipeline</li>
         <li style="margin-bottom:8px">Invite your HR team members</li>
         <li style="margin-bottom:8px">Run an AI Proctored Interview (1 included in free trial)</li>
         <li style="margin-top:16px; color:#b91c1c;"><em>Note: Your free trial includes 1 job post and 1 interview, and is valid for 2 days.</em></li>`
      : `<li>Complete your profile</li><li>Upload your latest resume</li><li>Browse job openings</li><li>Prepare with AI mock interviews</li>`;

  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
      <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
        <div style="background:linear-gradient(135deg,#1E40AF,#3B82F6);padding:32px 24px;text-align:center;">
          <h1 style="color:#fff;font-size:24px;margin:0;font-weight:800;">Welcome to SimpaticoHR</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">India's AI-Powered Recruitment Platform</p>
        </div>
        <div style="padding:32px 24px;">
          <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">${greeting}</p>
          <p style="font-size:14px;color:#4b5563;font-weight:600;margin:0 0 12px;">Here's what to do next:</p>
          <ul style="font-size:14px;color:#4b5563;line-height:2;padding-left:20px;margin:0 0 24px;">${nextSteps}</ul>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://simpaticohr.in/platform/login.html" style="display:inline-block;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Go to Dashboard â†’</a>
          </div>
        </div>
        <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="font-size:12px;color:#94a3b8;margin:0;">Â© ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd Â· <a href="https://simpaticohr.in" style="color:#3B82F6;text-decoration:none;">simpaticohr.in</a></p>
        </div>
      </div>
    </div>`;
}
// ============================================================
// CANDIDATE ASSESSMENT WORKFLOW API HANDLERS
// Add these routes to simpatico-ats.js
// ============================================================

// ROUTES to add to router configuration:
// route('POST',   '/candidates/:id/assessments/:assessmentId/assign',  handleAssignAssessment);
// route('POST',   '/candidates/:id/assessments/:assessmentId/submit',  handleSubmitAssessment);
// route('GET',    '/candidates/:id/assessments',                       handleGetCandidateAssessments);
// route('POST',   '/assessments/:assessmentId/score',                  handleScoreAssessment);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Assign assessment to candidate
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleAssignAssessment(request, env, ctx) {
  requireRole(ctx, 'hr', 'hr_manager', 'company_admin', 'admin', 'superadmin');
  
  const { id: candidateId, assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  
  if (!candidateId || !assessmentId) {
    return apiResponse({ error: 'candidateId and assessmentId required' }, HTTP.BAD_REQUEST);
  }

  try {
    const res = await sbFetch(env, 'POST', '/rest/v1/candidate_assessments', {
      assessment_id: assessmentId,
      candidate_id: candidateId,
      status: 'assigned',
      company_id: ctx.tenantId,
      responses: {}
    }, false, ctx.tenantId);

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to assign assessment');

    return apiResponse({ assignment: data[0] });
  } catch (error) {
    console.error('[assessment] Assign error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Submit candidate responses to assessment
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleSubmitAssessment(request, env, ctx) {
  // Candidates can submit their own assessments
  const { id: candidateId, assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  const { responses } = body;

  if (!candidateId || !assessmentId || !responses) {
    return apiResponse({ error: 'candidateId, assessmentId, and responses required' }, HTTP.BAD_REQUEST);
  }

  try {
    // Fetch the candidate_assessments record
    const getRes = await sbFetch(
      env,
      'GET',
      `/rest/v1/candidate_assessments?assessment_id=eq.${assessmentId}&candidate_id=eq.${candidateId}&select=*`,
      null,
      false,
      ctx.tenantId
    );
    const getDataList = await getRes.json();
    if (!getRes.ok || !getDataList[0]) {
      return apiResponse({ error: 'Assessment assignment not found' }, HTTP.NOT_FOUND);
    }

    const assignment = getDataList[0];

    // Update with responses and mark as completed
    const updateRes = await sbFetch(
      env,
      'PATCH',
      `/rest/v1/candidate_assessments?id=eq.${assignment.id}`,
      {
        responses: responses,
        status: 'completed',
        completed_at: new Date().toISOString()
      },
      false,
      ctx.tenantId
    );

    if (!updateRes.ok) throw new Error('Failed to save responses');

    return apiResponse({
      message: 'Assessment submitted successfully',
      id: assignment.id
    });
  } catch (error) {
    console.error('[assessment] Submit error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Get candidate's assessments
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleGetCandidateAssessments(request, env, ctx) {
  const { id: candidateId } = ctx.params;
  
  if (!candidateId) {
    return apiResponse({ error: 'candidateId required' }, HTTP.BAD_REQUEST);
  }

  try {
    const res = await sbFetch(
      env,
      'GET',
      `/rest/v1/candidate_assessments?candidate_id=eq.${candidateId}&select=*,assessments(id,assessment_title,difficulty)&order=assigned_at.desc`,
      null,
      false,
      ctx.tenantId
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch assessments');

    return apiResponse({ assessments: data });
  } catch (error) {
    console.error('[assessment] Get assessments error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Score candidate's assessment using AI
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleScoreAssessment(request, env, ctx) {
  requireRole(ctx, 'hr', 'hr_manager', 'company_admin', 'admin', 'superadmin');
  
  const { assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  const { candidateId, responses } = body;

  if (!assessmentId || !candidateId || !responses) {
    return apiResponse({ error: 'assessmentId, candidateId, and responses required' }, HTTP.BAD_REQUEST);
  }

  try {
    // Fetch the assessment to get questions and rubrics
    const assessRes = await sbFetch(
      env,
      'GET',
      `/rest/v1/assessments?id=eq.${assessmentId}&select=*`,
      null,
      false,
      ctx.tenantId
    );
    const assessmentData = await assessRes.json();
    if (!assessRes.ok || !assessmentData[0]) {
      return apiResponse({ error: 'Assessment not found' }, HTTP.NOT_FOUND);
    }

    const assessment = assessmentData[0];
    const questions = assessment.questions || [];

    // Build AI scoring prompt
    const scoringPrompt = `Score the following assessment responses.

Assessment: ${assessment.assessment_title}

Questions and Rubrics:
${questions.map((q, idx) => `
Q${idx + 1}: ${q.question}
Type: ${q.type}
Correct Answer: ${q.correct_answer}
Scoring Rubric: ${q.scoring_rubric}
Candidate Answer: ${responses[q.id] || 'Not answered'}
`).join('\n')}

For each question, provide:
1. Is the answer correct? (yes/no)
2. Score (0-100)
3. Brief feedback

Then provide a total score (0-100) for the entire assessment.

Return as JSON:
{
  "question_scores": [
    { "question_id": "q1", "correct": true, "score": 100, "feedback": "..." }
  ],
  "total_score": 85,
  "summary": "Overall assessment summary"
}`;

    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: scoringPrompt }],
      max_tokens: 1500
    });

    if (!aiResponse?.response) {
      throw new Error('AI scoring failed');
    }

    // Parse AI scoring response
    let scoreResponse = aiResponse.response.trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    let scores;
    try {
      scores = JSON.parse(scoreResponse);
    } catch (e) {
      console.error('[assessment] Score parsing failed:', e.message);
      throw new Error('Failed to parse AI scoring: ' + e.message);
    }

    // Update candidate_assessments with score
    const updateRes = await sbFetch(
      env,
      'PATCH',
      `/rest/v1/candidate_assessments?assessment_id=eq.${assessmentId}&candidate_id=eq.${candidateId}`,
      {
        score: scores.total_score,
        status: 'scored'
      },
      false,
      ctx.tenantId
    );

    if (!updateRes.ok) throw new Error('Failed to save score');

    return apiResponse({
      score: scores.total_score,
      feedback: scores.summary,
      details: scores.question_scores
    });
  } catch (error) {
    console.error('[assessment] Scoring error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Â§ CLIENT INTERVIEW MANAGEMENT HANDLERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function handleListClientInterviews(request, env, ctx, _, url) {
  requireAuth(ctx);
  const companyId = url.searchParams.get("company_id") || ctx.tenantId;
  const status = url.searchParams.get("status");
  let qp = `select=*&order=created_at.desc&limit=50`;
  if (status) qp += `&status=eq.${status}`;
  if (companyId && companyId !== "default") qp += `&company_id=eq.${companyId}`;

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/interviews?${qp}`,
    null,
    false,
    ctx.tenantId,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to list interviews: ${errText}`, res.status, "DB_ERROR");
  }
  return apiResponse({ interviews: await res.json() });
}

async function handleCreateInterview(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);

  if (!body.candidate_name || !body.candidate_email) {
    throw new ValidationError("candidate_name and candidate_email are required");
  }

  const token = body.token || Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 32);

  const payload = {
    candidate_name: body.candidate_name,
    candidate_email: body.candidate_email,
    candidate_phone: body.candidate_phone || null,
    interview_role: body.interview_role || body.position || "General",
    interview_level: body.interview_level || body.round || "screening",
    interview_type: body.interview_type || "human_live",
    token_type: body.token_type || "custom",
    token,
    status: body.status || "scheduled",
    job_id: body.job_id || null,
    company_id: body.company_id || ctx.tenantId,
    question_count: body.question_count || 5,
    max_attempts: body.max_attempts || 1,
    created_at: new Date().toISOString(),
    expires_at: body.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const res = await sbFetch(
    env,
    "POST",
    "/rest/v1/interviews",
    payload,
    false,
    ctx.tenantId,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to create interview: ${errText}`, res.status, "DB_ERROR");
  }
  const [interview] = await res.json();

  await audit(env, ctx, "interview.create", "interviews", interview?.id, {
    candidate_email: body.candidate_email,
    role: body.interview_role || body.position,
  });

  return apiResponse({ interview, token }, HTTP.CREATED);
}

async function handleValidateInterview(request, env, ctx) {
  const { token } = await safeJson(request);
  if (!token) throw new ValidationError("token is required");

  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/interviews?token=eq.${encodeURIComponent(token)}&select=*`,
    null,
    false,
    ctx.tenantId,
  );
  const interviews = await res.json();
  const interview = interviews?.[0];

  if (!interview) {
    return apiResponse({ valid: false, reason: "Interview not found" }, HTTP.NOT_FOUND);
  }

  if (interview.status === "completed") {
    return apiResponse({ valid: false, reason: "Interview already completed" });
  }

  if (interview.expires_at && new Date(interview.expires_at) < new Date()) {
    return apiResponse({ valid: false, reason: "Interview link has expired" });
  }

  if (interview.max_attempts && interview.attempts_used >= interview.max_attempts) {
    return apiResponse({ valid: false, reason: "Maximum attempts reached" });
  }

  return apiResponse({
    valid: true,
    interview: {
      id: interview.id,
      candidate_name: interview.candidate_name,
      interview_role: interview.interview_role,
      interview_level: interview.interview_level,
      interview_type: interview.interview_type,
      question_count: interview.question_count,
      status: interview.status,
    },
  });
}

async function handleSubmitInterview(request, env, ctx) {
  const body = await safeJson(request);
  const { token, responses, score, feedback } = body;

  if (!token) throw new ValidationError("token is required");

  const getRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/interviews?token=eq.${encodeURIComponent(token)}&select=*`,
    null,
    false,
    ctx.tenantId,
  );
  const interviews = await getRes.json();
  const interview = interviews?.[0];

  if (!interview) throw new NotFoundError("Interview");

  const updatePayload = {
    status: "completed",
    attempts_used: (interview.attempts_used || 0) + 1,
    completed_at: new Date().toISOString(),
  };

  if (score !== undefined) updatePayload.score = score;
  if (feedback) updatePayload.feedback = feedback;

  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/interviews?id=eq.${interview.id}`,
    updatePayload,
    false,
    ctx.tenantId,
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to submit interview: ${errText}`, res.status, "DB_ERROR");
  }

  await audit(env, ctx, "interview.submit", "interviews", interview.id, {
    score,
    candidate: interview.candidate_email,
  });

  return apiResponse({ submitted: true, interview_id: interview.id });
}
