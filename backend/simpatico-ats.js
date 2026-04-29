/**
 * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
 * â•‘          SIMPATICO HR  —  ENTERPRISE PLATFORM ENGINE  v5.0                 â•‘
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
  "https://simpaticohr.github.io",
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
// § 7b. BYOK AI LAYER — Custom Provider Routing
// ═════════════════════════════════════════════════════════════════════════════════════

// In-memory cache for AI config per tenant (refreshes every 5 min)
const _aiConfigCache = {};
const AI_CONFIG_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches the company's custom AI configuration from the companies table.
 * Returns { provider, apiKey, baseUrl, model } or null if using platform default.
 */
async function getCompanyAIConfig(env, tenantId) {
  if (!tenantId || tenantId === "default") return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;

  // Check in-memory cache first
  const cached = _aiConfigCache[tenantId];
  if (cached && (Date.now() - cached._ts) < AI_CONFIG_TTL_MS) {
    return cached.config;
  }

  try {
    const url = `${env.SUPABASE_URL}/rest/v1/companies?select=ai_provider,ai_api_key,ai_base_url,ai_model&or=(id.eq.${tenantId},tenant_id.eq.${tenantId})&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!res.ok) {
      console.warn("[BYOK] Failed to fetch company AI config:", res.status);
      return null;
    }
    const rows = await res.json();
    const row = rows?.[0];

    let config = null;
    if (row && row.ai_provider && row.ai_provider !== "cloudflare" && row.ai_api_key) {
      config = {
        provider: row.ai_provider,       // openai | anthropic | kimi | gemini | deepseek | custom | other
        apiKey: row.ai_api_key,
        baseUrl: row.ai_base_url || null,
        model: row.ai_model || null,
      };
    } else if (row && row.ai_provider === "cloudflare" && row.ai_model) {
      // Cloudflare with a specific model selected (not default)
      config = {
        provider: "cloudflare",
        cfModel: row.ai_model,           // e.g. @cf/meta/llama-3.3-70b-instruct-fp8-fast
      };
    }

    _aiConfigCache[tenantId] = { config, _ts: Date.now() };
    return config;
  } catch (err) {
    console.warn("[BYOK] AI config lookup error:", err.message);
    return null;
  }
}

/**
 * Resolves the correct base URL and model for a given provider config.
 */
function resolveProviderDefaults(cfg) {
  const p = cfg.provider;
  let baseUrl = cfg.baseUrl;
  let model = cfg.model;

  if (p === "openai") {
    baseUrl = baseUrl || "https://api.openai.com/v1";
    model = model || "gpt-4o-mini";
  } else if (p === "anthropic") {
    baseUrl = baseUrl || "https://api.anthropic.com/v1";
    model = model || "claude-3-haiku-20240307";
  } else if (p === "kimi") {
    baseUrl = baseUrl || "https://api.moonshot.cn/v1";
    model = model || "kimi-k2-0520";
  } else if (p === "gemini") {
    baseUrl = baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
    model = model || "gemini-2.5-flash";
  } else if (p === "deepseek") {
    baseUrl = baseUrl || "https://api.deepseek.com/v1";
    model = model || "deepseek-chat";
  }
  // custom / other: user must supply both

  return { baseUrl, model };
}

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 * Works for OpenAI, vLLM, LiteLLM, Ollama, and most custom providers.
 */
async function callExternalLLM(cfg, messages, maxTokens, stream = false) {
  const { baseUrl, model } = resolveProviderDefaults(cfg);

  if (!baseUrl || !model) {
    throw new AppError(
      "Custom AI provider requires base_url and model to be set",
      HTTP.BAD_REQUEST,
      "AI_CONFIG_INCOMPLETE",
    );
  }

  const isAnthropic = cfg.provider === "anthropic" && baseUrl.includes("anthropic.com");

  if (isAnthropic) {
    // Anthropic uses a different API shape
    const systemMsg = messages.find(m => m.role === "system");
    const userMsgs = messages.filter(m => m.role !== "system");

    const body = {
      model,
      max_tokens: maxTokens || 1024,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: userMsgs,
      ...(stream ? { stream: true } : {}),
    };

    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new AppError(
        `Anthropic API error (${res.status}): ${errText.substring(0, 200)}`,
        HTTP.UNAVAILABLE,
        "CUSTOM_AI_ERROR",
      );
    }

    if (stream) return res.body;

    const data = await res.json();
    return {
      response: data.content?.[0]?.text || "",
      usage: data.usage || null,
    };
  }

  // OpenAI-compatible endpoint (OpenAI, vLLM, custom, other)
  const chatUrl = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const body = {
    model,
    messages,
    max_tokens: maxTokens || 1024,
    ...(stream ? { stream: true } : {}),
  };

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new AppError(
      `Custom AI API error (${res.status}): ${errText.substring(0, 200)}`,
      HTTP.UNAVAILABLE,
      "CUSTOM_AI_ERROR",
    );
  }

  if (stream) return res.body;

  const data = await res.json();
  return {
    response: data.choices?.[0]?.message?.content || "",
    usage: data.usage || null,
  };
}

/**
 * Universal LLM runner — checks for BYOK config, routes accordingly.
 * Drop-in replacement for env.AI.run("@cf/meta/llama-3.1-8b-instruct", opts).
 * Returns { response: string, usage?: object }
 */
const CF_DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CF_LIGHT_MODEL   = "@cf/meta/llama-3.1-8b-instruct";

async function runLLM(env, tenantId, messages, maxTokens = 1024) {
  const aiConfig = await getCompanyAIConfig(env, tenantId);

  if (aiConfig && aiConfig.provider === "cloudflare") {
    // Cloudflare with a user-selected model
    if (!env.AI) throw new ServiceUnavailableError("AI");
    const cfModel = aiConfig.cfModel || CF_DEFAULT_MODEL;
    console.log(`[CF-AI] Using Cloudflare model: ${cfModel}`);
    return await env.AI.run(cfModel, { messages, max_tokens: maxTokens });
  }

  if (aiConfig) {
    console.log(`[BYOK] Using custom AI: provider=${aiConfig.provider}, model=${aiConfig.model || "(default)"}`);
    return await callExternalLLM(aiConfig, messages, maxTokens, false);
  }

  // Fallback: Cloudflare Workers AI (default model)
  if (!env.AI) throw new ServiceUnavailableError("AI");
  return await env.AI.run(CF_DEFAULT_MODEL, { messages, max_tokens: maxTokens });
}

/**
 * Universal LLM streaming runner — BYOK-aware.
 * Returns a ReadableStream for SSE consumption.
 */
async function runLLMStream(env, tenantId, messages, maxTokens = 2048) {
  const aiConfig = await getCompanyAIConfig(env, tenantId);

  if (aiConfig && aiConfig.provider === "cloudflare") {
    if (!env.AI) throw new ServiceUnavailableError("AI");
    const cfModel = aiConfig.cfModel || CF_DEFAULT_MODEL;
    console.log(`[CF-AI-Stream] Using Cloudflare model: ${cfModel}`);
    return await env.AI.run(cfModel, { messages, max_tokens: maxTokens, stream: true });
  }

  if (aiConfig) {
    console.log(`[BYOK-Stream] Using custom AI: provider=${aiConfig.provider}`);
    return await callExternalLLM(aiConfig, messages, maxTokens, true);
  }

  // Fallback: Cloudflare Workers AI streaming (default model)
  if (!env.AI) throw new ServiceUnavailableError("AI");
  return await env.AI.run(CF_DEFAULT_MODEL, { messages, max_tokens: maxTokens, stream: true });
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
// § 9b. SLACK INTEGRATION
// Posts formatted messages to a tenant's configured Slack Incoming Webhook URL.
// Webhook URL is stored on the companies table (slack_webhook_url column).
// ═════════════════════════════════════════════════════════════════════════════════════

async function dispatchSlack(env, tenantId, message, channel) {
  try {
    // Fetch tenant's Slack webhook URL from companies table
    const companyRes = await sbFetch(
      env,
      "GET",
      `/rest/v1/companies?id=eq.${tenantId}&select=slack_webhook_url,company_name`,
      null,
      false,
      tenantId,
    );
    const [company] = await companyRes.json();
    if (!company?.slack_webhook_url) {
      console.log(`[SLACK] No webhook URL configured for tenant ${tenantId}`);
      return { success: false, reason: "no_webhook_url" };
    }

    const slackPayload = {
      text: message,
      username: "SimpaticoHR",
      icon_emoji: ":briefcase:",
    };
    if (channel) slackPayload.channel = channel;

    const res = await fetch(company.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!res.ok) {
      console.warn(`[SLACK] Webhook failed (${res.status}) for tenant ${tenantId}`);
      return { success: false, reason: `http_${res.status}` };
    }

    console.log(`[SLACK] Message sent for tenant ${tenantId}: ${message.slice(0, 60)}...`);
    return { success: true };
  } catch (e) {
    console.warn("[SLACK] Dispatch error:", e.message);
    return { success: false, reason: e.message };
  }
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

// Health & Meta (Trigger GH Action)
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
route("POST", "/ai/hr-automation-generator", handleHRAutomationGenerator);
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

// ── Super Admin (Role-Protected) ──
route("GET", "/admin/verify", handleAdminVerify);
route("GET", "/admin/stats", handleAdminStats);
route("GET", "/admin/companies", handleAdminListCompanies);
route("GET", "/admin/users", handleAdminListUsers);
route("GET", "/admin/jobs", handleAdminListJobs);
route("GET", "/admin/audit-logs", handleAdminAuditLogs);
route("POST", "/admin/test-email", handleAdminTestEmail);

// ── Attendance ──
route("POST", "/attendance/clock-in", handleClockIn);
route("POST", "/attendance/clock-out", handleClockOut);
route("GET", "/attendance/records", handleListAttendance);
route("GET", "/attendance/summary", handleAttendanceSummary);

// ── Billing & Subscriptions ──
route("POST", "/billing/create-order", handleCreateOrder);
route("POST", "/billing/verify-payment", handleVerifyPayment);
route("POST", "/billing/paddle-webhook", handlePaddleWebhook);
route("GET", "/billing/subscription", handleGetSubscription);
route("POST", "/billing/cancel", handleCancelSubscription);
route("GET", "/billing/transactions", handleListTransactions);

// ═════════════════════════════════════════════════════════════════════════════════════
// § 13.  MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULED EVENT HANDLER — Server-Side Automation Engine
  // Processes time-based triggers: schedule_daily, schedule_weekly,
  // sla_breached, probation_ending, birthday, work_anniversary
  // Configure in wrangler.toml:
  //   [triggers]
  //   crons = ["0 8 * * *"]   # daily at 08:00 UTC
  // ═══════════════════════════════════════════════════════════════════════════
  async scheduled(event, env, execCtx) {
    console.log(`[CRON] Scheduled event fired: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`);

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      console.error("[CRON] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
      return;
    }

    try {
      // 1. Fetch all active scheduled automation rules across all tenants
      const scheduledTriggers = ["schedule_daily", "schedule_weekly", "sla_breached", "probation_ending", "birthday", "work_anniversary"];
      const triggerFilter = scheduledTriggers.map(t => `trigger.eq.${t}`).join(",");
      const rulesRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/automation_rules?enabled=eq.true&or=(${triggerFilter})&select=*`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );

      if (!rulesRes.ok) {
        console.error("[CRON] Failed to fetch automation rules:", rulesRes.status);
        return;
      }

      const rules = await rulesRes.json();
      if (!rules.length) {
        console.log("[CRON] No active scheduled rules found.");
        return;
      }

      // Determine if today is a weekly trigger day (Monday)
      const today = new Date(event.scheduledTime);
      const isMonday = today.getUTCDay() === 1;

      console.log(`[CRON] Processing ${rules.length} scheduled rule(s). isMonday=${isMonday}`);

      let processed = 0;
      let failed = 0;

      for (const rule of rules) {
        try {
          // Skip weekly rules if it's not Monday
          if (rule.trigger === "schedule_weekly" && !isMonday) continue;

          const tenantId = rule.tenant_id || rule.company_id || "default";
          const actions = rule.actions || [];
          const actionResults = [];

          // Execute each action during cron run
          for (const action of actions) {
            try {
              switch (action.type) {
                case 'send_email':
                  if (action.target && !action.target.includes('{')) {
                    await sendEmail(env, {
                      to: action.target,
                      subject: `[Scheduled] ${rule.name}`,
                      html: `<p>${action.msg || rule.desc || rule.name}</p>`,
                    });
                    actionResults.push('send_email:success');
                  } else {
                    actionResults.push('send_email:skipped');
                  }
                  break;
                case 'send_slack':
                  await dispatchSlack(env, tenantId, action.msg || rule.name, action.target);
                  actionResults.push('send_slack:success');
                  break;
                default:
                  actionResults.push(`${action.type}:dispatched`);
              }
            } catch (actErr) {
              actionResults.push(`${action.type}:failed`);
              console.warn(`[CRON] Action ${action.type} failed:`, actErr.message);
            }
          }

          const actionSummary = actionResults.join(", ");

          // Log the execution
          const logEntry = {
            rule_name: rule.name,
            trigger: rule.trigger,
            module: rule.module || "system",
            status: actionResults.some(r => r.includes('failed')) ? "partial" : "success",
            detail: `[CRON] ${actionSummary}`,
            target_id: "scheduled",
            action_taken: actionSummary,
            created_at: new Date().toISOString(),
            ts: new Date().toISOString(),
            tenant_id: tenantId,
          };

          // Insert execution log
          await fetch(`${env.SUPABASE_URL}/rest/v1/automation_logs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify(logEntry),
          });

          // Increment run_count on the rule
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/automation_rules?id=eq.${rule.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: env.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                run_count: (rule.run_count || 0) + 1,
                last_run_at: new Date().toISOString(),
              }),
            },
          );

          processed++;
          console.log(`[CRON] Executed: "${rule.name}" (${rule.trigger}) for tenant ${tenantId}`);
        } catch (ruleErr) {
          failed++;
          console.error(`[CRON] Rule "${rule.name}" failed:`, ruleErr.message);
        }
      }

      console.log(`[CRON] Complete. Processed: ${processed}, Failed: ${failed}, Skipped: ${rules.length - processed - failed}`);
    } catch (err) {
      console.error("[CRON] Scheduled handler error:", err.stack || err.message);
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
    subject: `Welcome to the Team, ${body.first_name}!`,
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
Be specific, professional, growth-oriented, and 150-200 words. Avoid clichés.`;

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 400);
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
  
  // Fetch payslip data with employee details
  const res = await sbFetch(
    env,
    "GET",
    `/rest/v1/payslips?id=eq.${payslipId}&select=*,employees(first_name,last_name,job_title,departments(name))&limit=1`,
    null,
    false,
    ctx.tenantId,
  );
  const data = await res.json();
  const payslip = data?.[0];
  if (!payslip) throw new NotFoundError("Payslip");

  // Fetch company details
  let companyName = "Simpatico HR Enterprise";
  try {
    const compRes = await sbFetch(
      env,
      "GET",
      `/rest/v1/companies?id=eq.${ctx.tenantId}&select=name&limit=1`,
      null,
      false,
      ctx.tenantId,
    );
    if (compRes.ok) {
      const compData = await compRes.json();
      if (compData?.[0]?.name) companyName = compData[0].name;
    }
  } catch (e) {
    console.warn("Could not fetch company name for payslip");
  }
  
  // Generate PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { width, height } = page.getSize();
  const colorDark = rgb(0.1, 0.1, 0.1);
  const colorGray = rgb(0.4, 0.4, 0.4);
  const colorBrand = rgb(0.15, 0.25, 0.45);
  const empName = `${payslip.employees?.first_name || ""} ${payslip.employees?.last_name || ""}`.trim();
  const period = payslip.period || "Unknown Period";

  // Resolve currency: payslip → employee_salaries fallback → default
  let currencyCode = payslip.currency;
  if (!currencyCode && payslip.employee_id) {
    try {
      const salRes = await sbFetch(env, "GET", `/rest/v1/employee_salaries?employee_id=eq.${payslip.employee_id}&select=currency&order=created_at.desc&limit=1`, null, false, ctx.tenantId);
      const [sal] = await salRes.json();
      if (sal && sal.currency) currencyCode = sal.currency;
    } catch (e) { /* ignore */ }
  }
  currencyCode = currencyCode || "INR";

  // Map currency code to symbol for PDF display
  const currencySymbols = { INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3", AED: "AED ", CAD: "CA$", AUD: "A$", SGD: "S$", NZD: "NZ$" };
  const currencySym = currencySymbols[currencyCode] || (currencyCode + " ");
  
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
  const formatAmt = (amt) => `${currencySym}${Number(amt).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  
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

  // Fallback for older payslips that were generated before the currency column was added
  if (!ps.currency && ps.employee_id) {
    try {
      const salRes = await sbFetch(env, "GET", `/rest/v1/employee_salaries?employee_id=eq.${ps.employee_id}&select=currency&order=created_at.desc&limit=1`, null, false, ctx.tenantId);
      const [sal] = await salRes.json();
      if (sal && sal.currency) ps.currency = sal.currency;
    } catch (e) {
      console.warn("Could not fetch fallback currency for payslip:", e.message);
    }
  }

  const email = ps.employees?.email;
  if (!email || !email.includes('@')) {
    throw new ValidationError(`Cannot send payslip: Employee has no valid email address.`);
  }

  await sendEmail(env, {
    to: email,
    subject: `Your Payslip for ${ps.period}`,
    html: payslipEmailHtml(ps),
  });
  // Update status — wrapped in try-catch so email success is not lost
  // if DB schema is out of sync (e.g. missing sent_at column)
  try {
    await sbFetch(
      env,
      "PATCH",
      `/rest/v1/payslips?id=eq.${id}`,
      { status: "sent", sent_at: new Date().toISOString() },
      false,
      ctx.tenantId,
    );
  } catch (patchErr) {
    // Retry with minimal payload if sent_at column doesn't exist yet
    console.warn("[payroll] Payslip PATCH failed, retrying without sent_at:", patchErr.message);
    try {
      await sbFetch(
        env,
        "PATCH",
        `/rest/v1/payslips?id=eq.${id}`,
        { status: "sent" },
        false,
        ctx.tenantId,
      );
    } catch (retryErr) {
      console.error("[payroll] Payslip status update failed entirely:", retryErr.message);
    }
  }
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
    `/rest/v1/payslips?period=eq.${period}&status=neq.sent&select=*,employees(email,first_name)`,
    null,
    false,
    ctx.tenantId,
  );
  const pss = await res.json();

  // Fallback for older payslips that were generated before the currency column was added
  for (const ps of pss) {
    if (!ps.currency && ps.employee_id) {
      try {
        const salRes = await sbFetch(env, "GET", `/rest/v1/employee_salaries?employee_id=eq.${ps.employee_id}&select=currency&order=created_at.desc&limit=1`, null, false, ctx.tenantId);
        const [sal] = await salRes.json();
        if (sal && sal.currency) ps.currency = sal.currency;
      } catch (e) {
        // Ignore fallback errors to prevent blocking the bulk send
      }
    }
  }

  const sent = await Promise.allSettled(
    pss.map((ps) =>
      sendEmail(env, {
        to: ps.employees.email,
        subject: `Your Payslip for ${ps.period}`,
        html: payslipEmailHtml(ps),
      }),
    ),
  );
  // Update status — wrapped in try-catch for schema resilience
  try {
    await sbFetch(
      env,
      "PATCH",
      `/rest/v1/payslips?period=eq.${period}`,
      { status: "sent", sent_at: new Date().toISOString() },
      false,
      ctx.tenantId,
    );
  } catch (patchErr) {
    console.warn("[payroll] Bulk payslip PATCH failed, retrying without sent_at:", patchErr.message);
    try {
      await sbFetch(
        env,
        "PATCH",
        `/rest/v1/payslips?period=eq.${period}`,
        { status: "sent" },
        false,
        ctx.tenantId,
      );
    } catch (retryErr) {
      console.error("[payroll] Bulk payslip status update failed entirely:", retryErr.message);
    }
  }
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

  // Accept status from frontend (open, draft, closed) — default to "open"
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
  // No strict role check — tenant isolation enforced by sbFetch
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

  // ★ DUPLICATE APPLICATION CHECK
  // Prevent the same candidate from applying to the same job multiple times
  try {
    const dupCheck = await sbFetch(
      env,
      "GET",
      `/rest/v1/job_applications?job_id=eq.${body.job_id}&candidate_email=eq.${encodeURIComponent(body.candidate_email)}&select=id,status,match_score`,
      null,
      false,
      ctx.tenantId,
    );
    const existing = await dupCheck.json();
    if (Array.isArray(existing) && existing.length > 0) {
      const prev = existing[0];
      // Allow re-application only if previously rejected (second chance)
      if (prev.status !== 'rejected') {
        return apiResponse(
          { error: { message: `You have already applied to this position (Status: ${prev.status}). Application ID: ${prev.id}` }, duplicate: true, existing_application: prev },
          409,
        );
      }
      console.log(`[ATS] Re-application allowed for previously rejected candidate: ${body.candidate_email}`);
    }
  } catch (e) {
    console.warn("[ATS] Duplicate check failed (proceeding):", e.message);
  }

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
  if (body.resume_text && job) {
    const prompt = `You are an expert ATS AI. Compare the candidate's resume to the job description.
Job Title: ${job.title}
Job Desc: ${job.description || job.department}
Resume: ${body.resume_text}

Calculate a match score out of 100 based on skills, experience, and requirements fit.
Also extract the candidate's top skills (max 8) from their resume.
Return ONLY valid JSON in format: {"match_score": 85, "reason": "Brief 1-sentence reason", "skills": ["JavaScript", "React", "Node.js"]}`;

    try {
      const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 400);
      const cleaned = result.response.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleaned);
      match_score = analysis.match_score || null;
      ai_summary = analysis.reason;
      // Extract skills from AI response (comma-separated for DB storage)
      if (Array.isArray(analysis.skills) && analysis.skills.length > 0) {
        body._extracted_skills = analysis.skills.slice(0, 8).join(", ");
      }

      // Append the ai_summary to the resume_text for the candidate profile drawer
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
  // Configurable rejection threshold — jobs can set auto_reject_threshold (default: 40)
  const rejectThreshold = job?.auto_reject_threshold ?? 40;

  if (autoEnabled && match_score !== null) {
    if (match_score >= 70) {
      // HIGH SCORE &rarr; Auto-shortlist to interview stage
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
    source:           body.source || null,
    candidate_skills: body._extracted_skills || body.candidate_skills || null,
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
        subject: `Interview Invitation - ${job.title} at SimpaticoHR`,
        html: `<div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Interview Invitation</h1>
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
        <a href="${meetingLink}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Start Your Interview &rarr;</a>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>Tips:</strong> Use Chrome or Edge &middot; Ensure good lighting &middot; Use a quiet room &middot; Have your camera and microphone ready
      </div>
    </div>
    <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd &middot; <a href="https://simpaticohr.in" style="color:#4f46e5;text-decoration:none;">simpaticohr.in</a></p>
    </div>
  </div>
</div></body></html>`,
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
        subject: `Application Update - ${job.title}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5f7;"><div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
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
      <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd</p>
    </div>
  </div>
</div></body></html>`,
      });
    } catch (e) {
      console.warn("[ATS] Auto-reject email failed:", e.message);
    }
    await audit(env, ctx, "application.auto_rejected", "job_applications", app.id, {
      match_score,
      reject_threshold: rejectThreshold,
    }).catch(() => {});
  }

  // 6. Application Confirmation Email (for mid-score / manual-review candidates)
  // Candidates who are NOT auto-shortlisted or auto-rejected get a confirmation email
  if (!autoInterview && !autoRejected && app) {
    try {
      await sendEmail(env, {
        to: app.candidate_email,
        subject: `Application Received - ${job?.title || 'Open Position'}`,
        html: `<div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
    <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Application Received &#10003;</h1>
      <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">We're reviewing your profile</p>
    </div>
    <div style="padding:32px 24px;">
      <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${app.candidate_name || 'there'}</strong>,</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">Thank you for applying to the <strong>${job?.title || 'open position'}</strong> role. We've received your application and our team is currently reviewing it.</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">You'll hear from us within <strong>5 business days</strong> with an update on your application status. If shortlisted, we'll reach out to schedule the next steps.</p>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#166534;line-height:1.6;">
        <strong>What happens next?</strong> Our AI screening system and recruiting team will evaluate your profile against the role requirements. Strong matches are fast-tracked to interviews.
      </div>
    </div>
    <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd &middot; <a href="https://simpaticohr.in" style="color:#4f46e5;text-decoration:none;">simpaticohr.in</a></p>
    </div>
  </div>
</div>`,
      });
    } catch (e) {
      console.warn("[ATS] Confirmation email failed:", e.message);
    }
  }

  await dispatchWebhook(env, ctx.tenantId, "application.received", {
    application_id: app.id,
    job_id: body.job_id,
    auto_shortlisted: autoInterview,
    auto_rejected: autoRejected,
    match_score,
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. SERVER-SIDE AUTOMATION: Evaluate 'app_received' rules
  //    This ensures automations fire even when no user has the
  //    ATS dashboard open (e.g., candidates applying via careers page)
  // ═══════════════════════════════════════════════════════════════
  try {
    const rulesRes = await sbFetch(
      env,
      "GET",
      `/rest/v1/automation_rules?enabled=eq.true&trigger=eq.app_received&module=eq.ats&select=*`,
      null,
      false,
      ctx.tenantId,
    );
    const rules = await rulesRes.json();

    if (Array.isArray(rules) && rules.length > 0) {
      console.log(`[ATS-AUTO] Evaluating ${rules.length} app_received rule(s) for tenant ${ctx.tenantId}`);

      for (const rule of rules) {
        try {
          // Check conditions
          if (rule.cond_score && match_score !== null && match_score < parseInt(rule.cond_score)) {
            continue; // Score below threshold, skip
          }
          if (rule.cond_stage && status !== rule.cond_stage) {
            continue; // Stage mismatch, skip
          }

          const actions = rule.actions || [];
          const results = [];

          for (const action of actions) {
            switch (action.type) {
              case 'send_email':
                // Email is already handled by the auto-shortlist/reject/confirmation flow above
                results.push({ type: 'send_email', status: 'skipped', detail: 'Handled by built-in email flow' });
                break;

              case 'move_stage':
                if (action.target && action.target !== status) {
                  await sbFetch(env, "PATCH", `/rest/v1/job_applications?id=eq.${app.id}`, { status: action.target }, false, ctx.tenantId);
                  results.push({ type: 'move_stage', status: 'success', detail: `Moved to ${action.target}` });
                } else {
                  results.push({ type: 'move_stage', status: 'skipped', detail: 'Already in target stage' });
                }
                break;

              case 'shortlist':
                if (status !== 'screening') {
                  await sbFetch(env, "PATCH", `/rest/v1/job_applications?id=eq.${app.id}`, { status: 'screening' }, false, ctx.tenantId);
                  results.push({ type: 'shortlist', status: 'success', detail: 'Moved to screening' });
                }
                break;

              case 'reject_candidate':
                if (status !== 'rejected') {
                  await sbFetch(env, "PATCH", `/rest/v1/job_applications?id=eq.${app.id}`, { status: 'rejected' }, false, ctx.tenantId);
                  results.push({ type: 'reject_candidate', status: 'success', detail: 'Auto-rejected by rule' });
                }
                break;

              case 'send_slack': {
                const slackMsg = (action.msg || '').replace(/\{candidate\.name\}/g, app.candidate_name || 'Candidate')
                  .replace(/\{job\.title\}/g, job?.title || 'Open Position')
                  .replace(/\{match_score\}/g, match_score || 'N/A');
                const slackResult = await dispatchSlack(env, ctx.tenantId, slackMsg, action.target);
                results.push({ type: 'send_slack', status: slackResult.success ? 'success' : 'skipped', detail: slackResult.success ? 'Slack sent' : 'Slack: ' + slackResult.reason });
                break;
              }

              case 'notify_hiring_manager':
              case 'create_task':
                // Log as dispatched — these will be routed to the task/notification system
                await dispatchWebhook(env, ctx.tenantId, `automation.${action.type}`, {
                  rule_name: rule.name,
                  application_id: app.id,
                  target: action.target,
                  message: action.msg,
                });
                results.push({ type: action.type, status: 'success', detail: action.msg || action.type });
                break;

              default:
                results.push({ type: action.type, status: 'dispatched', detail: action.msg || action.type });
            }
          }

          // Log execution
          const logEntry = {
            rule_name: rule.name,
            trigger: 'app_received',
            module: 'ats',
            status: 'success',
            detail: `[SERVER] ${results.map(r => r.type + ':' + r.status).join(', ')}`,
            target_id: app.id,
            action_taken: results.map(r => r.detail).join(' | '),
            created_at: new Date().toISOString(),
            ts: new Date().toISOString(),
            tenant_id: ctx.tenantId,
          };
          await sbFetch(env, "POST", "/rest/v1/automation_logs", logEntry, false, ctx.tenantId);

          // Update run count
          await sbFetch(env, "PATCH", `/rest/v1/automation_rules?id=eq.${rule.id}`, {
            run_count: (rule.run_count || 0) + 1,
            last_run_at: new Date().toISOString(),
          }, false, ctx.tenantId);

          console.log(`[ATS-AUTO] Rule "${rule.name}" executed for application ${app.id}`);
        } catch (ruleErr) {
          console.warn(`[ATS-AUTO] Rule "${rule.name}" failed:`, ruleErr.message);
        }
      }
    }
  } catch (autoErr) {
    console.warn("[ATS-AUTO] Server-side automation evaluation failed:", autoErr.message);
  }

  return apiResponse(
    { application: app, auto_scheduled: autoInterview, auto_rejected: autoRejected, match_score },
    HTTP.CREATED,
  );
}

async function handleListApplications(request, env, ctx, _, url) {
  // No strict role check — tenant isolation enforced by sbFetch tenant_id filter
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
    "match_score",
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

  // ★ MANUAL REJECTION EMAIL
  // When a recruiter manually rejects a candidate, send a professional notification
  if (body.status === 'rejected' && app) {
    try {
      // Fetch the job title for a personalized email
      let jobTitle = 'the position';
      if (app.job_id) {
        const jobRes = await sbFetch(env, "GET", `/rest/v1/jobs?id=eq.${app.job_id}&select=title`, null, false, ctx.tenantId);
        const [jobInfo] = await jobRes.json();
        if (jobInfo?.title) jobTitle = jobInfo.title;
      }
      await sendEmail(env, {
        to: app.candidate_email,
        subject: `Application Update - ${jobTitle}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5f7;"><div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin:0 16px;">
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Application Update</h1>
    </div>
    <div style="padding:32px 24px;">
      <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${app.candidate_name || 'there'}</strong>,</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">Thank you for your interest in the <strong>${jobTitle}</strong> position. After careful review, we've decided to move forward with other candidates whose qualifications more closely match our current requirements.</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">We encourage you to apply for future openings that match your skills and experience.</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">Best regards,<br/><strong>SimpaticoHR Recruitment Team</strong></p>
    </div>
    <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd</p>
    </div>
  </div>
</div></body></html>`,
      });
      console.log(`[ATS] Manual rejection email sent to ${app.candidate_email}`);
    } catch (emailErr) {
      console.warn("[ATS] Manual rejection email failed:", emailErr.message);
    }
  }

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
  // requireAuth(ctx);  -- candidates are unauthenticated
  const { messages, token, max_tokens } = await safeJson(request);
  if (!Array.isArray(messages))
    throw new ValidationError("messages array required");

  // Resolve tenant: prefer X-Tenant-ID header, fallback to interview token lookup
  let tenantId = ctx.tenantId;
  if ((!tenantId || tenantId === "default") && token && env.SUPABASE_URL) {
    try {
      const ivRes = await sbFetch(env, "GET",
        `/rest/v1/interviews?token=eq.${encodeURIComponent(token)}&select=company_id&limit=1`,
        null, false, "default");
      if (ivRes.ok) {
        const rows = await ivRes.json();
        if (rows?.[0]?.company_id) tenantId = rows[0].company_id;
      }
    } catch (e) { console.warn("[interview] tenant lookup failed:", e.message); }
  }

  // Use tenant's custom AI if configured (BYOK), otherwise use platform default (70B)
  // This enables enterprise customers to use GPT-4o, Claude, Gemini etc. for interviews
  const maxTok = Math.min(Math.max(parseInt(max_tokens) || 600, 100), 2048);
  const result = await runLLM(env, tenantId, messages, maxTok);

  await audit(env, ctx, "interview.ai_question", "interviews", null, {
    token_hint: token?.slice(0, 8),
    tenant_resolved: tenantId,
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

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 300);

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

  const result = await runLLM(env, ctx.tenantId, [systemMsg, ...messages], 2048);
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
      const stream = await runLLMStream(env, ctx.tenantId, [systemMsg, ...messages], 2048);
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

  const result = await runLLM(env, ctx.tenantId, [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ], 1024);

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

async function handleHRAutomationGenerator(request, env, ctx) {
  const { query } = await safeJson(request);
  if (!query) throw new ValidationError("query is required");
  if (!env.AI) throw new ServiceUnavailableError("AI");

  const systemPrompt = `You are an enterprise HR automation expert. Given a description, output ONLY valid JSON (no markdown, no backticks) for an HR workflow automation rule.
Schema:
{
  "name": "short rule name",
  "desc": "one sentence description",
  "trigger": "one of: employee_joined|employee_offboarded|leave_submitted|leave_approved|probation_ending|work_anniversary|birthday|performance_due|schedule",
  "cond_dept": "department filter or empty",
  "cond_level": "junior|mid|senior|exec or empty",
  "actions": [{"type": "send_email|send_slack|create_task|auto_approve|update_status|assign_manager|trigger_webhook|generate_doc|add_to_calendar|send_reminder", "target": "target email or channel", "msg": "message content"}]
}
Include 2-3 logical actions. Keep it practical for enterprise HR operations.
Examples of good rules:
- On employee_joined: send welcome email + create onboarding task + assign buddy
- On leave_submitted: auto-approve if days <= 2 + notify manager
- On probation_ending: create review task + send reminder to manager
- On birthday: send celebration email + add to calendar`;

  const result = await runLLM(env, ctx.tenantId, [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ], 1024);

  try {
    const text = result.response.replace(/```json|```/g, "").trim();
    const rule = JSON.parse(text);
    // Enforce module tag
    rule.module = "hr";
    return apiResponse({ rule });
  } catch (e) {
    throw new AppError(
      "Failed to parse AI-generated HR rule",
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

  // Check AI binding availability
  if (!env.AI) {
    throw new ServiceUnavailableError("AI");
  }

  const userPrompt = `Design a highly specific, proctored assessment quiz for a ${difficulty || "mid-level"} ${job_title}${department ? ` in ${department}` : ""}${tech_stack ? ` specializing in ${tech_stack}` : ""}.

Generate exactly ${question_count} technical questions that:
1. Accurately assess core competencies for this role
2. Include both multiple-choice (MCQ) and short-answer types
3. Have clear correct answers and grading rubrics for AI evaluation
4. Test real-world problem-solving, not just theory
${culture ? `\nCompany culture: ${culture}. Incorporate questions that assess alignment with our values.` : ""}

Return ONLY valid JSON in this exact format (no markdown, no code fences, no extra text):
{
  "assessment_title": "Title Here",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "Your question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "scoring_rubric": "How to grade this question"
    },
    {
      "id": "q2",
      "type": "short_answer",
      "question": "Your question text",
      "correct_answer": "Expected answer or key points",
      "scoring_rubric": "How to grade this question"
    }
  ]
}`;

  let aiResponse;
  try {
    aiResponse = await runLLM(env, ctx.tenantId, [
      {
        role: "system",
        content: "You are a JSON-only assessment generator. You MUST respond with valid JSON only. No markdown, no code blocks, no explanatory text. Just pure JSON.",
      },
      { role: "user", content: userPrompt },
    ], 3000);
  } catch (aiErr) {
    console.error("[assessment] AI.run() failed:", aiErr.message);
    throw new AppError(
      "AI service temporarily unavailable. Please try again in a moment.",
      HTTP.UNAVAILABLE,
      "AI_SERVICE_ERROR",
    );
  }

  if (!aiResponse?.response) {
    throw new AppError(
      "AI returned an empty response. Please try again.",
      HTTP.SERVER_ERROR,
      "AI_EMPTY_RESPONSE",
    );
  }

  // Robust JSON extraction from AI response
  let responseText = aiResponse.response.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  responseText = responseText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();

  // If there's still non-JSON text, try to extract the JSON object
  if (!responseText.startsWith("{")) {
    const jsonStart = responseText.indexOf("{");
    const jsonEnd = responseText.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      responseText = responseText.substring(jsonStart, jsonEnd + 1);
    }
  }

  let assessment;
  try {
    assessment = JSON.parse(responseText);
  } catch (parseError) {
    console.error("[assessment] JSON parse failed:", {
      error: parseError.message,
      rawResponse: responseText.substring(0, 500),
    });
    throw new AppError(
      "AI returned invalid JSON. Please try generating again.",
      HTTP.SERVER_ERROR,
      "AI_PARSE_ERROR",
    );
  }

  // Validate and normalize assessment structure
  if (!assessment.assessment_title || typeof assessment.assessment_title !== "string") {
    // Auto-generate a title if missing
    assessment.assessment_title = `${difficulty || "Mid-Level"} ${job_title} Assessment`;
  }

  if (!Array.isArray(assessment.questions) || assessment.questions.length === 0) {
    throw new AppError(
      "AI did not generate any questions. Please try again with different parameters.",
      HTTP.SERVER_ERROR,
      "AI_NO_QUESTIONS",
    );
  }

  // Lenient validation: fix up questions rather than failing hard
  assessment.questions = assessment.questions.map((q, idx) => {
    // Ensure required fields exist
    if (!q.id) q.id = `q${idx + 1}`;
    if (!q.type) q.type = Array.isArray(q.options) ? "mcq" : "short_answer";
    if (!q.question && q.text) q.question = q.text; // common AI alias

    // For MCQs, ensure options exist
    if (q.type === "mcq" && (!Array.isArray(q.options) || q.options.length === 0)) {
      q.type = "short_answer"; // Downgrade to short answer if no options
      delete q.options;
    }

    // Don't require correct_answer for short-answer (rubric is enough)
    if (!q.correct_answer && q.type === "short_answer") {
      q.correct_answer = q.scoring_rubric || "See rubric for grading criteria";
    }

    return q;
  });

  // Filter out any questions that still lack a question text
  assessment.questions = assessment.questions.filter((q) => q.question);

  if (assessment.questions.length === 0) {
    throw new AppError(
      "AI generated malformed questions. Please try again.",
      HTTP.SERVER_ERROR,
      "AI_MALFORMED_QUESTIONS",
    );
  }

  return apiResponse({
    assessment,
    generated_at: new Date().toISOString(),
    question_count: assessment.questions.length,
  });
}

async function handleGenerateCourse(request, env, ctx) {
  requireAuth(ctx);
  const { title } = await safeJson(request);
  if (!title) throw new ValidationError("title required");
  
  const prompt = `You are an expert Corporate Trainer and LMS AI. Generate a professional course outline for a corporate training course titled "${title}". 
Return ONLY valid JSON with these fields:
{"description": "A compelling 2-3 sentence overview of what employees will learn...", "duration_hours": 2.5}`;
  
  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 300);
  
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

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 600);
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

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 300);
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

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 700);
  return apiResponse({
    jd: result.response,
    generated_at: new Date().toISOString(),
  });
}
async function handleInterviewEmail(request, env) {
  try {
    const data = await request.json();

    await sendEmail(env, {
      to: data.candidateEmail,
      subject: `Interview Invitation: ${data.position} at Simpatico`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Interview Invitation</h2>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="font-size:16px;color:#374151;">Hi <strong>${data.candidateName}</strong>,</p>
        <p style="font-size:15px;color:#6b7280;line-height:1.6;">You have been invited to an interview for the <strong>${data.position}</strong> role.</p>
        <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:24px 0;border:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
            <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Date</td><td style="padding:8px 0;font-weight:600;">${data.date}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;font-weight:600;">${data.startTime}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Mode</td><td style="padding:8px 0;font-weight:600;">${(data.mode || '').toUpperCase()}</td></tr>
          </table>
        </div>
        ${data.meetingLink ? `<div style="text-align:center;margin:24px 0;"><a href="${data.meetingLink}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Join Meeting</a></div>` : ""}
        <p style="font-size:14px;color:#6b7280;line-height:1.6;">If you need to reschedule, please reply to this email.</p>
        <p style="font-size:15px;color:#374151;">Best regards,<br><strong>Simpatico HR Team</strong></p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Simpatico HR</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
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

  const result = await runLLM(env, ctx.tenantId, [{ role: "user", content: prompt }], 600);
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

// ——————————————————————————————————————————————————————————————————————————————————————————————————
// § 15.  SUPABASE HELPER  (tenant-scoped)
// ——————————————————————————————————————————————————————————————————————————————————————————————————

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
    // Core HR
    "employees",
    "departments",
    // Recruitment
    "jobs",
    "job_applications",
    "interviews",
    // Leave & Attendance
    "leave_requests",
    "attendance_records",
    // Payroll
    "payroll_runs",
    "payslips",
    "employee_salaries",
    "payroll_deductions",
    "expenses",
    "employee_expenses",
    // Training
    "training_courses",
    "training_enrollments",
    // Onboarding & Offboarding
    "onboarding_records",
    "onboarding_tasks",
    "offboarding_records",
    "offboarding_tasks",
    // Performance
    "performance_reviews",
    "performance_goals",
    "review_cycles",
    "goals",
    // Surveys
    "pulse_surveys",
    "pulse_survey_responses",
    // Documents & Policies
    "employee_documents",
    "hr_policies",
    // Admin & System
    "notifications",
    "audit_logs",
    "hr_tickets",
    "automation_rules",
    "automation_logs",
    // Billing
    "subscriptions",
    "payment_transactions",
  ];
  // Inject tenant_id filter for GET, PATCH, and DELETE to prevent cross-tenant access
  if (["GET", "PATCH", "DELETE"].includes(method) && tenantId && tenantId !== "default") {
    const tableName = (path.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (tableName && TENANT_AWARE_TABLES.includes(tableName)) {
      const separator = finalPath.includes("?") ? "&" : "?";
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

async function sendEmail(env, { to, subject, html, replyTo, tags }) {
  if (!env.RESEND_API_KEY) {
    console.error("[sendEmail] RESEND_API_KEY not set — cannot send email to:", to);
    throw new AppError("Email service not configured (RESEND_API_KEY missing)", 503, "EMAIL_NOT_CONFIGURED");
  }

  // ── Ensure proper DOCTYPE + charset wrapping for deliverability ──
  let finalHtml = html;
  if (!finalHtml.includes('<!DOCTYPE') && !finalHtml.includes('<!doctype')) {
    finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5f7;">${finalHtml}</body></html>`;
  }

  // ── Generate plain-text fallback (improves spam score significantly) ──
  const text = finalHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©')
    .replace(/&#?\w+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const fromAddr = env.EMAIL_FROM || "Simpatico HR <hr@ats.simpaticohr.in>";

  const payload = {
    from: fromAddr,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: finalHtml,
    text,
    reply_to: replyTo || undefined,
    headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),   // Prevent threading/dedup issues
    },
  };

  // Resend supports tags for tracking
  if (tags && Array.isArray(tags)) {
    payload.tags = tags;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// § 18.  EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

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
          <h1 style="color:white;margin:0;font-size:28px;font-weight:700">Welcome to the Team! 🎉</h1>
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
            <a href="${"https://app.simpaticohr.in"}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px">Go to Dashboard &rarr;</a>
          </div>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">&copy; ${new Date().getFullYear()} Simpatico HR. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function payslipEmailHtml(ps) {
  const currencyCode = ps.currency || 'USD';
  let currencySym = currencyCode;
  if (currencyCode === 'INR') currencySym = '₹';
  else if (currencyCode === 'USD') currencySym = '$';
  else if (currencyCode === 'EUR') currencySym = '€';
  else if (currencyCode === 'GBP') currencySym = '£';
  else currencySym = currencyCode + ' ';

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px;text-align:center">
          <h2 style="color:white;margin:0">Payslip — ${ps.period}</h2>
        </td></tr>
        <tr><td style="padding:32px">
          <p>Hi <strong>${ps.employees?.first_name || "there"}</strong>, your payslip for <strong>${ps.period}</strong> is ready.</p>
          <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
            <tr style="background:#f9fafb"><td style="border-bottom:1px solid #e5e7eb;color:#6b7280">Gross Pay</td><td style="border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${currencySym}${Number(ps.gross_pay || 0).toLocaleString()}</td></tr>
            <tr><td style="border-bottom:1px solid #e5e7eb;color:#6b7280">Deductions</td><td style="border-bottom:1px solid #e5e7eb;text-align:right;color:#ef4444">-${currencySym}${Number(ps.deductions_total || 0).toLocaleString()}</td></tr>
            <tr style="background:#f0fdf4"><td style="font-weight:700;font-size:16px">Net Pay</td><td style="text-align:right;font-weight:700;font-size:18px;color:#16a34a">${currencySym}${Number(ps.net_pay || 0).toLocaleString()}</td></tr>
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
 * â•‘    SUPABASE_URL          — Supabase project URL                             â•‘
 * â•‘    SUPABASE_SERVICE_KEY  — Supabase service role key                        â•‘
 * â•‘    JWT_SECRET            — HMAC-SHA256 secret for JWT verification           â•‘
 * â•‘    RESEND_API_KEY        — Resend email API key                              â•‘
 * â•‘    WEBHOOK_SECRET        — HMAC secret for outbound webhook signatures       â•‘
 * â•‘    R2_PUBLIC_URL         — Public base URL for R2 bucket                    â•‘
 * â•‘    EMAIL_FROM            — Sender address (optional, has default)            â•‘
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
    interviewerEmail, // optional — cc the interviewer if provided
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
      video: "Video Call",
      inperson: "In-Person",
      phone: "Phone Call",
      proctored: "Proctored (AI-Monitored)",
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
        <strong>Notes:</strong> ${notes}
       </div>`
    : "";

  const candidateHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">Interview Scheduled</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">You have been invited for an interview</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="font-size:16px;color:#374151;">Hi <strong>${candidateName}</strong>,</p>
          <p style="font-size:15px;color:#6b7280;line-height:1.6;">
            We&#39;re pleased to invite you for an interview at <strong>Simpatico</strong>. Please find the details below.
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
                  <td style="padding:8px 0;font-weight:600;font-size:14px;">${formattedStart} - ${formattedEnd}</td></tr>
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
            <strong>This is a Proctored Interview.</strong><br>
            Your session will be AI-monitored. Please ensure your camera and microphone are working, and take the interview from a quiet, well-lit location.
          </div>`
              : ""
          }

          ${notesSection}

          <p style="font-size:14px;color:#6b7280;margin-top:24px;line-height:1.6;">
            If you need to reschedule or have any questions, please reply to this email or contact our HR team.
          </p>

          <p style="font-size:15px;color:#374151;margin-top:20px;">Best of luck!<br><strong>Simpatico HR Team</strong></p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Simpatico HR &middot; interviews@simpaticohr.in</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send to candidate
  console.log(`[interview-email] Sending interview invite to ${candidateEmail} for ${position}`);
  let candidateSent = false;
  let interviewerSent = false;
  let emailError = null;

  try {
    await sendEmail(env, {
      to: candidateEmail,
      subject: `Interview Scheduled: ${position} - ${formattedDate}`,
      html: candidateHtml,
    });
    candidateSent = true;
    console.log(`[interview-email] Candidate email sent to ${candidateEmail}`);
  } catch (emailErr) {
    emailError = emailErr.message || 'Failed to send candidate email';
    console.error(`[interview-email] Candidate email failed:`, emailErr.message);
  }

  // Optionally CC interviewer
  if (interviewerEmail) {
    try {
      await sendEmail(env, {
        to: interviewerEmail,
        subject: `[Action Required] You are interviewing ${candidateName} - ${formattedDate}`,
        html: candidateHtml.replace(
          `Hi <strong>${candidateName}</strong>`,
          `Hi <strong>${interviewer}</strong>, you have an upcoming interview with <strong>${candidateName}</strong>`,
        ),
      });
      interviewerSent = true;
      console.log(`[interview-email] Interviewer email sent to ${interviewerEmail}`);
    } catch (intEmailErr) {
      console.error(`[interview-email] Interviewer email failed:`, intEmailErr.message);
    }
  }

  // If the candidate email failed entirely, return an error so the frontend knows
  if (!candidateSent) {
    throw new AppError(
      emailError || 'Interview email delivery failed',
      500,
      'EMAIL_ERROR'
    );
  }

  await audit(env, ctx, "interview.email_sent", "interviews", null, {
    candidateEmail,
    position,
    candidateSent,
    interviewerSent,
  });

  return apiResponse({ sent: true, to: candidateEmail, candidateSent, interviewerSent });
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
      subject: `Welcome to SimpaticoHR, ${admin_name || "Team"}!`,
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
      ? `Welcome to SimpaticoHR, ${name}! Your company is ready 🚀`
      : `Welcome to SimpaticoHR, ${name}! 🎉`;

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
          <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">India&#39;s AI-Powered Recruitment Platform</p>
        </div>
        <div style="padding:32px 24px;">
          <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">${greeting}</p>
          <p style="font-size:14px;color:#4b5563;font-weight:600;margin:0 0 12px;">Here's what to do next:</p>
          <ul style="font-size:14px;color:#4b5563;line-height:2;padding-left:20px;margin:0 0 24px;">${nextSteps}</ul>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://simpaticohr.in/platform/login.html" style="display:inline-block;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Go to Dashboard &rarr;</a>
          </div>
        </div>
        <div style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} SimpaticoHR Consultancy Pvt Ltd &middot; <a href="https://simpaticohr.in" style="color:#3B82F6;text-decoration:none;">simpaticohr.in</a></p>
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

    const aiResponse = await runLLM(env, ctx.tenantId, [{ role: 'user', content: scoringPrompt }], 1500);

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

// ═════════════════════════════════════════════════════════════════════════════════════
// § ADMIN — Server-Side Protected Super Admin Handlers
// ═════════════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/verify — Verify the caller is a super_admin/company_admin.
 * The frontend should call this on load instead of trusting localStorage.
 */
async function handleAdminVerify(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin", "company_admin");
  await audit(env, ctx, "admin.verify", "admin", null, { ip: ctx.ip });
  return apiResponse({
    verified: true,
    role: ctx.actorRole,
    email: ctx.actorEmail,
    actor_id: ctx.actorId,
  });
}

/**
 * GET /admin/stats — Platform-wide statistics (cross-tenant).
 */
async function handleAdminStats(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin");

  async function countTable(env, table) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${table}?select=id`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            Prefer: "count=exact",
            "Range-Unit": "items",
            Range: "0-0",
          },
        },
      );
      const range = res.headers.get("Content-Range") || "";
      const match = range.match(/\/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  const [companies, users, jobs, applications, interviews, employees] =
    await Promise.all([
      countTable(env, "companies"),
      countTable(env, "users"),
      countTable(env, "jobs"),
      countTable(env, "job_applications"),
      countTable(env, "interviews"),
      countTable(env, "employees"),
    ]);

  return apiResponse({
    companies,
    users,
    jobs,
    applications,
    interviews,
    employees,
  });
}

/**
 * GET /admin/companies — List all companies (cross-tenant, super_admin only).
 */
async function handleAdminListCompanies(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin");

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/companies?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) throw new AppError("Failed to fetch companies", res.status);
  const data = await res.json();
  return apiResponse(data);
}

/**
 * GET /admin/users — List all users (cross-tenant, super_admin only).
 */
async function handleAdminListUsers(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin");

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) throw new AppError("Failed to fetch users", res.status);
  const data = await res.json();
  return apiResponse(data);
}

/**
 * GET /admin/jobs — List all jobs across tenants (super_admin only).
 */
async function handleAdminListJobs(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin");

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/jobs?select=*,companies(name)&order=created_at.desc`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) throw new AppError("Failed to fetch jobs", res.status);
  const data = await res.json();
  return apiResponse(data);
}

/**
 * GET /admin/audit-logs — Read real audit logs from DB (super_admin only).
 */
async function handleAdminAuditLogs(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin");

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const action = url.searchParams.get("action");

  let query = `/rest/v1/audit_logs?select=*&order=timestamp.desc&limit=${limit}`;
  if (action && action !== "all") {
    query += `&action=eq.${encodeURIComponent(action)}`;
  }

  const res = await fetch(`${env.SUPABASE_URL}${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!res.ok) {
    // Table may not exist yet — return empty
    return apiResponse([]);
  }
  const data = await res.json();
  return apiResponse(data);
}

/**
 * POST /admin/test-email — Actually send a test email via Resend (super_admin only).
 */
async function handleAdminTestEmail(request, env, ctx) {
  requireRole(ctx, "super_admin", "superadmin", "company_admin");

  const body = await safeJson(request);
  const to = body.to || ctx.actorEmail;
  if (!to) throw new ValidationError("Email address required");

  await sendEmail(env, {
    to,
    subject: "SimpaticoHR - Test Email",
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#fff;border-radius:16px;border:1px solid #E5E7EB;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#10B981,#059669);display:inline-flex;align-items:center;justify-content:center;font-size:24px;">&#10003;</div>
        </div>
        <h2 style="font-size:20px;font-weight:700;color:#0F172A;text-align:center;margin:0 0 8px;">Email System Working</h2>
        <p style="font-size:14px;color:#6B7280;text-align:center;margin:0 0 24px;">Your SimpaticoHR email configuration is active and operational.</p>
        <div style="background:#F9FAFB;border-radius:10px;padding:16px;font-size:13px;color:#374151;">
          <div><strong>Sent by:</strong> ${ctx.actorEmail || "Super Admin"}</div>
          <div><strong>Tenant:</strong> ${ctx.tenantId}</div>
          <div><strong>Timestamp:</strong> ${new Date().toISOString()}</div>
          <div><strong>Worker Version:</strong> ${VERSION}</div>
        </div>
      </div>
    `,
  });

  await audit(env, ctx, "admin.test_email", "admin", null, { to });
  return apiResponse({ sent: true, to });
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § ATTENDANCE — Clock In / Clock Out / Records
// ═════════════════════════════════════════════════════════════════════════════════════

/**
 * POST /attendance/clock-in — Record a clock-in event.
 */
async function handleClockIn(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  const employee_id = body.employee_id;
  if (!employee_id) throw new ValidationError("employee_id required");

  const today = new Date().toISOString().split("T")[0];

  // Check if already clocked in today without clock-out
  const checkRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/attendance_records?employee_id=eq.${employee_id}&date=eq.${today}&check_out=is.null&select=id`,
    null,
    false,
    ctx.tenantId,
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (existing.length > 0) {
      throw new AppError("Already clocked in today. Please clock out first.", 409, "ALREADY_CLOCKED_IN");
    }
  }

  const record = {
    employee_id,
    date: today,
    check_in: new Date().toISOString(),
    status: "present",
    tenant_id: ctx.tenantId,
  };

  const res = await sbFetch(env, "POST", "/rest/v1/attendance_records", record, false, ctx.tenantId);
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to record clock-in: ${errText}`, res.status, "DB_ERROR");
  }

  await audit(env, ctx, "attendance.clock_in", "attendance_records", employee_id, { date: today });
  return apiResponse({ clocked_in: true, date: today, check_in: record.check_in });
}

/**
 * POST /attendance/clock-out — Record a clock-out event.
 */
async function handleClockOut(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  const employee_id = body.employee_id;
  if (!employee_id) throw new ValidationError("employee_id required");

  const today = new Date().toISOString().split("T")[0];

  // Find today's open record
  const checkRes = await sbFetch(
    env,
    "GET",
    `/rest/v1/attendance_records?employee_id=eq.${employee_id}&date=eq.${today}&check_out=is.null&select=*&limit=1`,
    null,
    false,
    ctx.tenantId,
  );
  if (!checkRes.ok) throw new AppError("Failed to query attendance", checkRes.status, "DB_ERROR");

  const records = await checkRes.json();
  if (records.length === 0) {
    throw new AppError("No active clock-in found for today.", 404, "NO_CLOCK_IN");
  }

  const record = records[0];
  const checkOut = new Date().toISOString();
  const checkIn = new Date(record.check_in);
  const hoursWorked = ((new Date(checkOut) - checkIn) / 3600000).toFixed(2);

  const res = await sbFetch(
    env,
    "PATCH",
    `/rest/v1/attendance_records?id=eq.${record.id}`,
    { check_out: checkOut, hours_worked: parseFloat(hoursWorked) },
    false,
    ctx.tenantId,
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new AppError(`Failed to record clock-out: ${errText}`, res.status, "DB_ERROR");
  }

  await audit(env, ctx, "attendance.clock_out", "attendance_records", employee_id, { date: today, hours_worked: hoursWorked });
  return apiResponse({ clocked_out: true, date: today, check_out: checkOut, hours_worked: parseFloat(hoursWorked) });
}

/**
 * GET /attendance/records — List attendance records (filterable by employee_id, date range).
 */
async function handleListAttendance(request, env, ctx) {
  requireAuth(ctx);
  const url = new URL(request.url);
  const employee_id = url.searchParams.get("employee_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  let query = `/rest/v1/attendance_records?select=*,employees(first_name,last_name)&order=date.desc&limit=${limit}`;
  if (employee_id) query += `&employee_id=eq.${employee_id}`;
  if (from) query += `&date=gte.${from}`;
  if (to) query += `&date=lte.${to}`;

  const res = await sbFetch(env, "GET", query, null, false, ctx.tenantId);
  if (!res.ok) throw new AppError("Failed to fetch attendance records", res.status, "DB_ERROR");

  const data = await res.json();
  return apiResponse(data);
}

/**
 * GET /attendance/summary — Get attendance summary for an employee or all employees.
 */
async function handleAttendanceSummary(request, env, ctx) {
  requireAuth(ctx);
  const url = new URL(request.url);
  const employee_id = url.searchParams.get("employee_id");
  const month = url.searchParams.get("month"); // YYYY-MM format

  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const from = `${targetMonth}-01`;
  const lastDay = new Date(parseInt(targetMonth.split("-")[0]), parseInt(targetMonth.split("-")[1]), 0).getDate();
  const to = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;

  let query = `/rest/v1/attendance_records?select=*&date=gte.${from}&date=lte.${to}&order=date.asc`;
  if (employee_id) query += `&employee_id=eq.${employee_id}`;

  const res = await sbFetch(env, "GET", query, null, false, ctx.tenantId);
  if (!res.ok) throw new AppError("Failed to fetch attendance summary", res.status, "DB_ERROR");

  const records = await res.json();

  // Aggregate
  const byEmployee = {};
  for (const r of records) {
    if (!byEmployee[r.employee_id]) {
      byEmployee[r.employee_id] = { present: 0, absent: 0, late: 0, total_hours: 0 };
    }
    const e = byEmployee[r.employee_id];
    if (r.status === "present") e.present++;
    else if (r.status === "absent") e.absent++;
    else if (r.status === "late") e.late++;
    e.total_hours += r.hours_worked || 0;
  }

  return apiResponse({
    month: targetMonth,
    total_records: records.length,
    by_employee: byEmployee,
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════
// § BILLING — Cashfree (Domestic) + Paddle (International)
// ═════════════════════════════════════════════════════════════════════════════════════

const PLAN_PRICING = {
  starter: {
    monthly: { inr: 4999, usd: 59 },
    annual:  { inr: 49990, usd: 590 },
  },
  professional: {
    monthly: { inr: 14999, usd: 179 },
    annual:  { inr: 149990, usd: 1790 },
  },
  enterprise: {
    monthly: { inr: 0, usd: 0 }, // custom
    annual:  { inr: 0, usd: 0 },
  },
};

/**
 * POST /billing/create-order — Create a Cashfree payment order (domestic INR).
 * Body: { plan, billing_cycle, customer_name, customer_email, customer_phone }
 */
async function handleCreateOrder(request, env, ctx) {
  requireAuth(ctx);
  const body = await safeJson(request);
  const { plan, billing_cycle = "monthly", customer_name, customer_email, customer_phone } = body;

  if (!plan || !PLAN_PRICING[plan]) throw new ValidationError("Invalid plan");
  if (!customer_email) throw new ValidationError("customer_email required");

  const pricing = PLAN_PRICING[plan][billing_cycle];
  if (!pricing || !pricing.inr) throw new ValidationError("Invalid billing cycle or plan");

  const companyId = ctx.tenantId;
  const orderId = `SIMP_${plan.toUpperCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const cfApiBase = env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

  // Create Cashfree Order
  const cfRes = await fetch(`${cfApiBase}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": env.CASHFREE_APP_ID,
      "x-client-secret": env.CASHFREE_SECRET_KEY,
      "x-api-version": "2023-08-01",
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: pricing.inr,
      order_currency: "INR",
      customer_details: {
        customer_id: companyId,
        customer_name: customer_name || ctx.actorEmail,
        customer_email: customer_email,
        customer_phone: customer_phone || "9999999999",
      },
      order_meta: {
        return_url: `${env.FRONTEND_URL || "https://simpaticohr.github.io"}/platform/payment-success.html?order_id={order_id}`,
        notify_url: `${env.WORKER_URL || "https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev"}/billing/verify-payment`,
      },
      order_note: `SimpaticoHR ${plan} plan (${billing_cycle})`,
      order_tags: {
        plan: plan,
        billing_cycle: billing_cycle,
        company_id: companyId,
      },
    }),
  });

  const cfData = await cfRes.json();
  if (!cfRes.ok) {
    console.error("[Cashfree] Order creation failed:", JSON.stringify(cfData));
    throw new AppError(`Cashfree order failed: ${cfData.message || "Unknown error"}`, 502, "CASHFREE_ERROR");
  }

  // Record the pending transaction
  await sbFetch(env, "POST", "/rest/v1/payment_transactions", {
    company_id: companyId,
    gateway: "cashfree",
    gateway_order_id: orderId,
    amount: pricing.inr,
    currency: "INR",
    status: "pending",
    plan: plan,
    billing_cycle: billing_cycle,
    metadata: { cashfree_order: cfData },
  }, false, companyId);

  await audit(env, ctx, "billing.order_created", "payment_transactions", orderId, {
    plan, billing_cycle, amount: pricing.inr,
  });

  return apiResponse({
    order_id: orderId,
    payment_session_id: cfData.payment_session_id,
    cf_order_id: cfData.cf_order_id,
    order_amount: pricing.inr,
    order_currency: "INR",
    gateway: "cashfree",
    environment: env.CASHFREE_ENV || "sandbox",
  });
}

/**
 * POST /billing/verify-payment — Verify Cashfree payment and activate subscription.
 * Body: { order_id }
 */
async function handleVerifyPayment(request, env, ctx) {
  const body = await safeJson(request);
  const { order_id } = body;
  if (!order_id) throw new ValidationError("order_id required");

  const cfApiBase = env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

  // Verify payment with Cashfree
  const cfRes = await fetch(`${cfApiBase}/orders/${order_id}`, {
    headers: {
      "x-client-id": env.CASHFREE_APP_ID,
      "x-client-secret": env.CASHFREE_SECRET_KEY,
      "x-api-version": "2023-08-01",
    },
  });

  const cfOrder = await cfRes.json();
  if (!cfRes.ok) {
    throw new AppError("Failed to verify order with Cashfree", 502, "CASHFREE_VERIFY_ERROR");
  }

  const isPaid = cfOrder.order_status === "PAID";
  const plan = cfOrder.order_tags?.plan || "starter";
  const billingCycle = cfOrder.order_tags?.billing_cycle || "monthly";
  const companyId = cfOrder.order_tags?.company_id || cfOrder.customer_details?.customer_id;

  // Update transaction record
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/payment_transactions?gateway_order_id=eq.${order_id}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: isPaid ? "paid" : "failed",
        gateway_payment_id: cfOrder.cf_order_id,
        payment_method: cfOrder.payment_method || "cashfree",
        metadata: { cashfree_response: cfOrder },
      }),
    },
  );

  if (isPaid) {
    // Activate subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === "annual" ? 12 : 1));

    // Upsert subscription
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/subscriptions?company_id=eq.${companyId}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        company_id: companyId,
        plan: plan,
        status: "active",
        gateway: "cashfree",
        gateway_subscription_id: cfOrder.cf_order_id,
        amount: cfOrder.order_amount,
        currency: "INR",
        billing_cycle: billingCycle,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      }),
    });

    // Update company plan
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ subscription_plan: plan }),
      },
    );
  }

  if (ctx.actorEmail || ctx.actorId) {
    await audit(env, ctx, isPaid ? "billing.payment_success" : "billing.payment_failed", "payment_transactions", order_id, {
      plan, amount: cfOrder.order_amount, status: cfOrder.order_status,
    });
  }

  return apiResponse({
    verified: true,
    paid: isPaid,
    plan: isPaid ? plan : null,
    order_status: cfOrder.order_status,
  });
}

/**
 * POST /billing/paddle-webhook — Handle Paddle webhook events (international).
 * Paddle sends: subscription.created, subscription.updated, transaction.completed, etc.
 */
async function handlePaddleWebhook(request, env, ctx) {
  const rawBody = await request.text();

  // Verify Paddle webhook signature (if secret is set)
  if (env.PADDLE_WEBHOOK_SECRET) {
    const signature = request.headers.get("Paddle-Signature") || "";
    const ts = signature.match(/ts=(\d+)/)?.[1];
    const h1 = signature.match(/h1=([a-f0-9]+)/)?.[1];

    if (ts && h1) {
      const signedPayload = `${ts}:${rawBody}`;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.PADDLE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
      const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (computed !== h1) {
        console.error("[Paddle] Webhook signature mismatch");
        return new Response("Invalid signature", { status: 401 });
      }
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = event.event_type;
  const data = event.data;
  console.log(`[Paddle] Webhook: ${eventType}`, JSON.stringify(data).substring(0, 500));

  if (eventType === "transaction.completed") {
    const companyId = data.custom_data?.company_id;
    const plan = data.custom_data?.plan || "professional";
    const billingCycle = data.custom_data?.billing_cycle || "monthly";

    if (companyId) {
      // Record transaction
      await fetch(`${env.SUPABASE_URL}/rest/v1/payment_transactions`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          company_id: companyId,
          gateway: "paddle",
          gateway_order_id: data.id,
          gateway_payment_id: data.checkout?.id || data.id,
          amount: parseFloat(data.details?.totals?.total || 0) / 100,
          currency: data.currency_code || "USD",
          status: "paid",
          plan: plan,
          billing_cycle: billingCycle,
          payment_method: "paddle",
          metadata: { paddle_event: event },
        }),
      });
    }
  }

  if (eventType === "subscription.created" || eventType === "subscription.updated") {
    const companyId = data.custom_data?.company_id;
    const plan = data.custom_data?.plan || "professional";

    if (companyId) {
      const paddleStatus = data.status; // active, paused, canceled
      const mappedStatus = paddleStatus === "active" ? "active" :
                           paddleStatus === "paused" ? "paused" :
                           paddleStatus === "canceled" ? "cancelled" : "active";

      // Upsert subscription
      await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?company_id=eq.${companyId}`, {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      });

      await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          company_id: companyId,
          plan: plan,
          status: mappedStatus,
          gateway: "paddle",
          gateway_subscription_id: data.id,
          gateway_customer_id: data.customer_id,
          currency: data.currency_code || "USD",
          billing_cycle: data.billing_cycle?.interval === "year" ? "annual" : "monthly",
          current_period_start: data.current_billing_period?.starts_at,
          current_period_end: data.current_billing_period?.ends_at,
        }),
      });

      // Update company plan
      await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ subscription_plan: plan }),
      });
    }
  }

  if (eventType === "subscription.canceled") {
    const companyId = data.custom_data?.company_id;
    if (companyId) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?company_id=eq.${companyId}`, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString() }),
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
  });
}

/**
 * GET /billing/subscription — Get current subscription status.
 */
async function handleGetSubscription(request, env, ctx) {
  requireAuth(ctx);
  const companyId = ctx.tenantId;

  const res = await sbFetch(
    env, "GET",
    `/rest/v1/subscriptions?company_id=eq.${companyId}&select=*&limit=1`,
    null, false, companyId,
  );

  if (!res.ok) return apiResponse({ subscription: null, plan: "trial" });
  const subs = await res.json();

  if (subs.length === 0) {
    return apiResponse({ subscription: null, plan: "trial", status: "trial" });
  }

  return apiResponse({
    subscription: subs[0],
    plan: subs[0].plan,
    status: subs[0].status,
    expires: subs[0].current_period_end,
  });
}

/**
 * POST /billing/cancel — Cancel current subscription.
 */
async function handleCancelSubscription(request, env, ctx) {
  requireRole(ctx, "company_admin", "companyadmin", "super_admin", "superadmin");
  const companyId = ctx.tenantId;

  // Get current subscription
  const subRes = await sbFetch(
    env, "GET",
    `/rest/v1/subscriptions?company_id=eq.${companyId}&select=*&limit=1`,
    null, false, companyId,
  );

  if (!subRes.ok) throw new AppError("Failed to fetch subscription", 500);
  const subs = await subRes.json();
  if (subs.length === 0) throw new AppError("No active subscription found", 404);

  const sub = subs[0];

  // If Paddle subscription, cancel via Paddle API
  if (sub.gateway === "paddle" && sub.gateway_subscription_id && env.PADDLE_API_KEY) {
    const paddleBase = env.PADDLE_ENV === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

    await fetch(`${paddleBase}/subscriptions/${sub.gateway_subscription_id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ effective_from: "next_billing_period" }),
    });
  }

  // Update local subscription
  await sbFetch(
    env, "PATCH",
    `/rest/v1/subscriptions?id=eq.${sub.id}`,
    { status: "cancelled", cancelled_at: new Date().toISOString() },
    false, companyId,
  );

  await audit(env, ctx, "billing.subscription_cancelled", "subscriptions", sub.id, {
    plan: sub.plan, gateway: sub.gateway,
  });

  return apiResponse({ cancelled: true, effective_until: sub.current_period_end });
}

/**
 * GET /billing/transactions — List payment transaction history.
 */
async function handleListTransactions(request, env, ctx) {
  requireAuth(ctx);
  const companyId = ctx.tenantId;

  const res = await sbFetch(
    env, "GET",
    `/rest/v1/payment_transactions?company_id=eq.${companyId}&select=*&order=created_at.desc&limit=50`,
    null, false, companyId,
  );

  if (!res.ok) return apiResponse([]);
  const data = await res.json();
  return apiResponse(data);
}
