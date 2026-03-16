/**
 * ai-assistant.js — Simpatico HR Platform
 * Fixed: no streaming, uses window.SimpaticoDB
 */

function sb() { return window.SimpaticoDB || null; }

const AI_CONFIG = {
  workerUrl: window.WORKER_URL || 'https://evalis-ai.simpaticohrconsultancy.workers.dev',
};

let conversations       = [];
let currentConvId       = null;
let messages            = [];
let activeContexts      = new Set(['employees']);
let isStreaming         = false;
let currentUserInitials = 'U';

document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  loadConversations();
});

async function loadUser() {
  const client = sb(); if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      currentUserInitials = user.email?.slice(0,2).toUpperCase() || 'U';
      const el = document.getElementById('user-avatar');
      if (el) el.textContent = currentUserInitials;
    }
  } catch(e) { console.warn('loadUser:', e.message); }
}

async function authHeaders() {
  try {
    const client = sb(); if (!client) return {};
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token || localStorage.getItem('simpatico_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    const token = localStorage.getItem('simpatico_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

function loadConversations() {
  try {
    const stored = localStorage.getItem('hr-ai-conversations');
    conversations = stored ? JSON.parse(stored) : [];
  } catch { conversations = []; }
  renderConversationList();
}

function saveConversations() {
  try { localStorage.setItem('hr-ai-conversations', JSON.stringify(conversations.slice(0,50))); } catch {}
}

function renderConversationList() {
  const container = document.getElementById('chat-history'); if (!container) return;
  if (!conversations.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--hr-text-muted);font-size:13px">No conversations yet</div>';
    return;
  }
  container.innerHTML = conversations.map(c => `
    <div class="ai-history-item ${c.id === currentConvId ? 'active' : ''}" onclick="loadConversation('${c.id}')">
      <div class="hi-title">${escHtml(c.title || 'New conversation')}</div>
      <div class="hi-date">${new Date(c.updated_at).toLocaleDateString()}</div>
    </div>`).join('');
}

function loadConversation(id) {
  const conv = conversations.find(c => c.id === id); if (!conv) return;
  currentConvId = id;
  messages = conv.messages || [];
  document.getElementById('chat-title').textContent = conv.title || 'HR AI Assistant';
  renderMessages();
  renderConversationList();
}

window.newChat = function() {
  currentConvId = null; messages = [];
  document.getElementById('chat-title').textContent = 'HR AI Assistant';
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'flex';
  const mc = document.getElementById('messages-container');
  if (mc) Array.from(mc.children).forEach(c => { if (c.id !== 'welcome-screen') c.remove(); });
  renderConversationList();
};

// ── Send message (NO streaming) ──
window.sendMessage = async function() {
  const input = document.getElementById('ai-input');
  const text  = input?.value.trim();
  if (!text || isStreaming) return;

  input.value = ''; autoResize(input);

  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
  messages.push(userMsg);
  appendMessageEl(userMsg);

  if (!currentConvId) {
    currentConvId = crypto.randomUUID?.() || `conv-${Date.now()}`;
    conversations.unshift({ id: currentConvId, title: text.slice(0,50), messages: [], updated_at: new Date().toISOString() });
    document.getElementById('chat-title').textContent = text.slice(0,50);
  }

  const typingId = showTyping();
  isStreaming = true;
  const btn = document.getElementById('send-btn');
  if (btn) btn.disabled = true;

  try {
    const systemContext = await buildHRContext();
    const headers = await authHeaders();

    const response = await fetch(`${AI_CONFIG.workerUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        messages: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
        system:   systemContext,
        contexts: [...activeContexts],
        stream:   false,
      }),
    });

    removeTyping(typingId);

    // Read body ONCE as text, then parse
    const rawText = await response.text();
    let result = {};
    try { result = JSON.parse(rawText); } catch { result = { response: rawText }; }

    const aiText = result.response || result.content || result.error || 'Sorry, I could not get a response.';
    const assistantMsg = { role: 'assistant', content: aiText, timestamp: new Date().toISOString() };
    messages.push(assistantMsg);
    appendMessageEl(assistantMsg);

  } catch (err) {
    removeTyping(typingId);
    const errorMsg = {
      role: 'assistant',
      content: `I couldn't connect to the AI service.\n\n\`Error: ${err.message}\``,
      timestamp: new Date().toISOString()
    };
    messages.push(errorMsg);
    appendMessageEl(errorMsg);
  } finally {
    isStreaming = false;
    if (btn) btn.disabled = false;
    const conv = conversations.find(c => c.id === currentConvId);
    if (conv) { conv.messages = messages; conv.updated_at = new Date().toISOString(); }
    saveConversations();
    renderConversationList();
    scrollToBottom();
  }
};

async function buildHRContext() {
  const client = sb(); if (!client) return defaultSystemPrompt();
  const contextParts = [];
  try {
    if (activeContexts.has('employees')) {
      const { data } = await client.from('employees').select('status').limit(200);
      const active = (data||[]).filter(e=>e.status==='active').length;
      contextParts.push(`Workforce: ${active} active employees out of ${(data||[]).length} total.`);
    }
    if (activeContexts.has('payroll')) {
      const month = new Date().toISOString().slice(0,7);
      const { data } = await client.from('payslips').select('net_pay').like('period',`${month}%`);
      const total = (data||[]).reduce((s,p)=>s+(p.net_pay||0),0);
      if (total) contextParts.push(`Payroll this month: ₹${Math.round(total).toLocaleString()}.`);
    }
    if (activeContexts.has('leave')) {
      const { data } = await client.from('leave_requests').select('status').eq('status','pending');
      contextParts.push(`${(data||[]).length} leave requests pending approval.`);
    }
  } catch(e) { console.warn('Context error:', e.message); }

  return `${defaultSystemPrompt()}\n\n## Live HR Data\n${contextParts.length ? contextParts.join('\n') : 'No live data yet — tables may not be set up.'}\n\nToday: ${new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`;
}

function defaultSystemPrompt() {
  return `You are an expert HR AI assistant for Simpatico HR Platform. You help with HR management, workforce analytics, payroll, performance management, training, compliance, and HR best practices. Be professional, concise, and actionable. Format responses with markdown.`;
}

function markdownToHtml(text) {
  return (text||'')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="font-size:14px;font-weight:600;margin:10px 0 4px;color:var(--hr-primary)">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 style="font-size:15px;font-weight:700;margin:12px 0 6px">$1</h3>')
    .replace(/^# (.+)$/gm,   '<h2 style="font-size:17px;font-weight:700;margin:14px 0 8px">$1</h2>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:3px 0">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    .replace(/\n/g, '<br>');
}

function appendMessageEl(msg, streaming=false) {
  const container = document.getElementById('messages-container'); if (!container) return null;
  const isUser = msg.role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `ai-msg ${isUser ? 'user' : 'assistant'}`;
  wrap.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  wrap.innerHTML = `
    <div class="msg-avatar ${isUser ? 'user-av' : 'ai-av'}">${isUser ? currentUserInitials : '✦'}</div>
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
  container.appendChild(wrap); scrollToBottom();
  return id;
}

function removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

function renderMessages() {
  const container = document.getElementById('messages-container'); if (!container) return;
  container.innerHTML = '';
  if (!messages.length) {
    const w = document.createElement('div'); w.id = 'welcome-screen'; w.className = 'ai-welcome';
    w.innerHTML = `<div style="color:var(--hr-text-muted);font-size:14px">Start typing below.</div>`;
    container.appendChild(w); return;
  }
  messages.forEach(m => appendMessageEl(m));
}

function scrollToBottom() { const c = document.getElementById('messages-container'); if (c) c.scrollTop = c.scrollHeight; }

window.toggleContext = function(ctx) {
  const btn = document.getElementById(`ctx-${ctx}`);
  if (activeContexts.has(ctx)) { activeContexts.delete(ctx); btn?.classList.remove('active'); }
  else { activeContexts.add(ctx); btn?.classList.add('active'); }
};

window.suggest = function(text) {
  const input = document.getElementById('ai-input');
  if (input) { input.value = text; autoResize(input); input.focus(); }
};

window.handleKey = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

window.autoResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
};

window.clearChat = function() {
  if (!confirm('Clear this conversation?')) return;
  messages = [];
  if (currentConvId) { conversations = conversations.filter(c => c.id !== currentConvId); currentConvId = null; saveConversations(); }
  newChat();
};

window.exportChat = function() {
  if (!messages.length) { showToast('No messages to export', 'info'); return; }
  const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n---\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `hr-chat-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  showToast('Chat exported', 'success');
};

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

window.showToast = (msg, type='info') => {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div'); t.className = `hr-toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3800);
};
