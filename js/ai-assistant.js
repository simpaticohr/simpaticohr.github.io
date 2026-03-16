/**
 * ai-assistant.js — Simpatico HR Platform
 * AI chat: Cloudflare AI (llama-3.1-8b) + Vectorize RAG + live Supabase HR context injection
 */

const AI_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(AI_CONFIG.supabaseUrl, AI_CONFIG.supabaseKey); return _sb; }
  return null;
}

// ── State ──
let conversations    = [];
let currentConvId    = null;
let messages         = [];
let activeContexts   = new Set(['employees']);
let isStreaming       = false;
let currentUserInitials = 'U';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  loadConversations();
});

async function loadUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    currentUserInitials = user.email?.slice(0,2).toUpperCase() || 'U';
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = currentUserInitials;
  }
}

// ── Conversations ──
function loadConversations() {
  const stored = localStorage.getItem('hr-ai-conversations');
  conversations = stored ? JSON.parse(stored) : [];
  renderConversationList();
}

function saveConversations() {
  localStorage.setItem('hr-ai-conversations', JSON.stringify(conversations.slice(0, 50)));
}

function renderConversationList() {
  const container = document.getElementById('chat-history'); if (!container) return;
  if (conversations.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--hr-text-muted);font-size:13px">No conversations yet</div>';
    return;
  }
  container.innerHTML = conversations.map(c => `
    <div class="ai-history-item ${c.id === currentConvId ? 'active' : ''}" onclick="loadConversation('${c.id}')">
      <div class="hi-title">${c.title || 'New conversation'}</div>
      <div class="hi-date">${new Date(c.updated_at).toLocaleDateString()}</div>
    </div>`).join('');
}

function loadConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  currentConvId = id;
  messages = conv.messages || [];
  document.getElementById('chat-title').textContent = conv.title || 'HR AI Assistant';
  renderMessages();
  renderConversationList();
}

window.newChat = function() {
  currentConvId = null;
  messages = [];
  document.getElementById('chat-title').textContent = 'HR AI Assistant';
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'flex';
  const msgContainer = document.getElementById('messages-container');
  if (msgContainer) {
    // Remove non-welcome messages
    Array.from(msgContainer.children).forEach(c => {
      if (!c.id || c.id !== 'welcome-screen') c.remove();
    });
  }
  renderConversationList();
};

// ── Send message ──
window.sendMessage = async function() {
  const input = document.getElementById('ai-input');
  const text  = input?.value.trim();
  if (!text || isStreaming) return;

  // Clear input
  input.value = ''; autoResize(input);

  // Hide welcome
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
  messages.push(userMsg);
  appendMessageEl(userMsg);

  // Create/update conversation
  if (!currentConvId) {
    currentConvId = crypto.randomUUID?.() || `conv-${Date.now()}`;
    conversations.unshift({ id: currentConvId, title: text.slice(0,50), messages: [], updated_at: new Date().toISOString() });
    document.getElementById('chat-title').textContent = text.slice(0,50);
  }

  // Show typing indicator
  const typingId = showTyping();
  isStreaming = true;
  const btn = document.getElementById('send-btn');
  if (btn) btn.disabled = true;

  try {
    // Build context-enriched system prompt
    const systemContext = await buildHRContext();

    // Call Cloudflare Worker which proxies to Cloudflare AI + Vectorize
    const response = await fetch(`${AI_CONFIG.workerUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        messages: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
        system:   systemContext,
        contexts: [...activeContexts],
        stream:   true,
      }),
    });

    removeTyping(typingId);

    // Handle streaming response
    if (response.ok && response.body) {
      const assistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
      messages.push(assistantMsg);
      const el = appendMessageEl(assistantMsg, true);
      const bubble = el?.querySelector('.msg-bubble');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE chunks
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              full += data.text;
              assistantMsg.content = full;
              if (bubble) bubble.innerHTML = markdownToHtml(full);
              scrollToBottom();
            }
          } catch { /* partial chunk */ }
        }
      }

      // Fallback: if no streaming, read as JSON
      if (!full) {
        const result = await response.json();
        full = result.response || result.content || 'No response.';
        assistantMsg.content = full;
        if (bubble) bubble.innerHTML = markdownToHtml(full);
      }

    } else {
      // Non-streaming fallback
      removeTyping(typingId);
      const result = await response.json();
      const assistantMsg = { role: 'assistant', content: result.response || result.error || 'Sorry, I encountered an error.', timestamp: new Date().toISOString() };
      messages.push(assistantMsg);
      appendMessageEl(assistantMsg);
    }

  } catch (err) {
    removeTyping(typingId);
    const errorMsg = { role: 'assistant', content: `I couldn't connect to the AI service. Please check your Cloudflare Worker configuration.\n\n\`Error: ${err.message}\``, timestamp: new Date().toISOString() };
    messages.push(errorMsg);
    appendMessageEl(errorMsg);
  } finally {
    isStreaming = false;
    if (btn) btn.disabled = false;
    // Save to local storage
    const conv = conversations.find(c => c.id === currentConvId);
    if (conv) { conv.messages = messages; conv.updated_at = new Date().toISOString(); }
    saveConversations();
    renderConversationList();
    scrollToBottom();
  }
};

// ── Context builder: pulls live data from Supabase to inject into prompt ──
async function buildHRContext() {
  const client = sb();
  if (!client) return defaultSystemPrompt();

  const contextParts = [];

  if (activeContexts.has('employees')) {
    const { data } = await client.from('employees').select('status').limit(200);
    const active = (data||[]).filter(e=>e.status==='active').length;
    const total  = (data||[]).length;
    contextParts.push(`Current workforce: ${active} active employees out of ${total} total.`);
  }

  if (activeContexts.has('payroll')) {
    const month = new Date().toISOString().slice(0,7);
    const { data } = await client.from('payslips').select('net_pay').like('period', `${month}%`);
    const total = (data||[]).reduce((s,p)=>s+(p.net_pay||0),0);
    contextParts.push(`Current month payroll (net): $${Math.round(total).toLocaleString()}.`);
  }

  if (activeContexts.has('performance')) {
    const { data } = await client.from('performance_reviews').select('score').not('score','is',null).limit(100);
    const scores = (data||[]).map(r=>r.score);
    const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    if (avg) contextParts.push(`Average performance score: ${avg}/100 across ${scores.length} reviews.`);
  }

  if (activeContexts.has('training')) {
    const { data } = await client.from('training_enrollments').select('status').limit(300);
    const all   = (data||[]).length;
    const done  = (data||[]).filter(e=>e.status==='completed').length;
    contextParts.push(`Training: ${done}/${all} enrollments completed (${all>0?Math.round(done/all*100):0}%).`);
  }

  if (activeContexts.has('leave')) {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await client.from('leave_requests').select('status').eq('status','pending');
    contextParts.push(`Leave requests: ${(data||[]).length} pending approval.`);
  }

  return `${defaultSystemPrompt()}

## Live HR Data Context
${contextParts.join('\n')}

Today's date: ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}.
Always answer based on the live data provided. Be concise, professional, and actionable.`;
}

function defaultSystemPrompt() {
  return `You are an expert HR AI assistant for Simpatico HR Platform. You have deep knowledge of:
- Human Resources management, employment law, and HR best practices
- Workforce analytics, performance management, and talent development
- Payroll, compensation, and benefits
- Employee onboarding, training, and development
- Compliance, leave management, and HR operations

You can analyze HR data, generate documents (policies, templates, letters), provide strategic guidance, and answer HR-related questions. Format responses clearly using markdown. Be professional, empathetic, and evidence-based.`;
}

// ── Markdown renderer (simple) ──
function markdownToHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="font-family:var(--hr-font-display);font-size:14px;font-weight:600;margin:12px 0 6px;color:var(--hr-primary)">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 style="font-family:var(--hr-font-display);font-size:15px;font-weight:700;margin:14px 0 6px">$1</h3>')
    .replace(/^# (.+)$/gm,   '<h2 style="font-family:var(--hr-font-display);font-size:17px;font-weight:700;margin:16px 0 8px">$1</h2>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (m) => m.startsWith('<') ? m : m)
    .replace(/\n/g, '<br>');
}

// ── DOM helpers ──
function appendMessageEl(msg, streaming=false) {
  const container = document.getElementById('messages-container'); if (!container) return null;
  const isUser = msg.role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `ai-msg ${isUser ? 'user' : 'assistant'}`;
  wrap.id = `msg-${Date.now()}`;

  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const avatarLabel = isUser ? currentUserInitials : '✦';

  wrap.innerHTML = `
    <div class="msg-avatar ${isUser ? 'user-av' : 'ai-av'}">${avatarLabel}</div>
    <div>
      <div class="msg-bubble">${isUser ? escHtml(msg.content) : markdownToHtml(msg.content || (streaming ? '…' : ''))}</div>
      <div class="msg-time">${time}</div>
    </div>`;

  container.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function showTyping() {
  const container = document.getElementById('messages-container'); if (!container) return null;
  const id = `typing-${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg assistant'; wrap.id = id;
  wrap.innerHTML = `<div class="msg-avatar ai-av">✦</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  container.appendChild(wrap);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

function renderMessages() {
  const container = document.getElementById('messages-container'); if (!container) return;
  container.innerHTML = '';
  if (messages.length === 0) {
    const welcome = document.createElement('div');
    welcome.id = 'welcome-screen';
    welcome.className = 'ai-welcome';
    welcome.innerHTML = `<div style="color:var(--hr-text-muted);font-size:14px">This conversation is empty. Start typing below.</div>`;
    container.appendChild(welcome);
    return;
  }
  messages.forEach(m => appendMessageEl(m));
}

function scrollToBottom() {
  const c = document.getElementById('messages-container');
  if (c) c.scrollTop = c.scrollHeight;
}

// ── Context toggles ──
window.toggleContext = function(ctx) {
  const btn = document.getElementById(`ctx-${ctx}`);
  if (activeContexts.has(ctx)) { activeContexts.delete(ctx); btn?.classList.remove('active'); }
  else { activeContexts.add(ctx); btn?.classList.add('active'); }
};

// ── Suggested prompt ──
window.suggest = function(text) {
  const input = document.getElementById('ai-input');
  if (input) { input.value = text; autoResize(input); input.focus(); }
};

// ── Keyboard handler ──
window.handleKey = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

window.autoResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
};

// ── Clear & Export ──
window.clearChat = function() {
  if (!confirm('Clear this conversation?')) return;
  messages = [];
  if (currentConvId) {
    conversations = conversations.filter(c => c.id !== currentConvId);
    currentConvId = null;
    saveConversations();
  }
  newChat();
};

window.exportChat = function() {
  if (messages.length === 0) { showToast('No messages to export', 'info'); return; }
  const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n---\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `hr-chat-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  showToast('Chat exported', 'success');
};

function authHeaders() {
  const token = sb()?.auth?.session()?.access_token || localStorage.getItem('sb-token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
window.showToast = (msg, type='info') => {
  const c=document.getElementById('toasts'); if(!c) return;
  const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3800);
};
