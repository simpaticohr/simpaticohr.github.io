/**
 * ai-assistant.js — Simpatico HR Platform
 * AI chat: Cloudflare AI (llama-3.1-8b) + Vectorize RAG + live Supabase HR context injection
 */

// ── Use existing Supabase client ──
function sb() {
  return window.SimpaticoDB || null;
}

const AI_CONFIG = {
  workerUrl: window.WORKER_URL || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
};

// ── State ──
let conversations       = [];
let currentConvId       = null;
let messages            = [];
let activeContexts      = new Set(['employees']);
let isStreaming         = false;
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

// ── Auth headers: defer to shared-utils if loaded ──
function authHeaders() {
  if (typeof window.authHeaders === 'function' && window.authHeaders !== authHeaders) {
    return window.authHeaders();
  }
  let token = localStorage.getItem('simpatico_token') || localStorage.getItem('sb-token') || '';
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        try { token = JSON.parse(localStorage.getItem(k)).access_token; } catch(e){}
      }
    }
  }
  return token ? { 'Authorization': 'Bearer ' + token } : {};
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
    Array.from(msgContainer.children).forEach(c => {
      if (!c.id || c.id !== 'welcome-screen') c.remove();
    });
  }
  renderConversationList();
};

// ── Send message (Updated for v5.0 Enterprise Engine) ──
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
    // 1. Build the HR context and Auth headers
    const systemContext = await buildHRContext();
    const headers = await authHeaders();

    // 2. Format the messages for the v5.0 Worker
    const apiMessages = [
      { role: 'system', content: systemContext },
      ...messages.slice(-12).map(m => ({ role: m.role, content: m.content }))
    ];

    // 3. Ensure we use the correct Config URL
    const targetUrl = window.SIMPATICO_CONFIG?.workerUrl || AI_CONFIG.workerUrl;

    // 4. Fetch the data
    const response = await fetch(`${targetUrl}/ai/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Tenant-ID': typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN',
        ...headers 
      },
      body: JSON.stringify({ messages: apiMessages }),
    });

    // 5. Read the response exactly ONCE
    const responseText = await response.text();
    removeTyping(typingId);

    if (!response.ok) {
      throw new Error(`Worker Error: ${response.status} - ${responseText}`);
    }

    // 6. Safely parse the JSON and extract the AI's reply
    const data = JSON.parse(responseText);
    const aiReply = data.data ? data.data.response : data.response;

    // 7. Add AI message to UI
    const assistantMsg = { role: 'assistant', content: aiReply || 'No response.', timestamp: new Date().toISOString() };
    messages.push(assistantMsg);
    
    const el = appendMessageEl(assistantMsg);
    const bubble = el?.querySelector('.msg-bubble');
    if (bubble) bubble.innerHTML = markdownToHtml(assistantMsg.content);

  } catch (err) {
    removeTyping(typingId);
    console.error(err);
    const errorMsg = {
      role: 'assistant',
      content: `I couldn't connect to the AI service. Please check your Cloudflare Worker configuration.\n\n\`Error: ${err.message}\``,
      timestamp: new Date().toISOString()
    };
    messages.push(errorMsg);
    
    const el = appendMessageEl(errorMsg);
    const bubble = el?.querySelector('.msg-bubble');
    if (bubble) bubble.innerHTML = markdownToHtml(errorMsg.content);
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
// ── Context builder — TENANT ISOLATED ──
async function buildHRContext() {
  const client = sb();
  if (!client) return defaultSystemPrompt();
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;

  const contextParts = [];

  try {
    if (activeContexts.has('employees')) {
      let q = client.from('employees').select('status').limit(200);
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      const active = (data||[]).filter(e=>e.status==='active').length;
      const total  = (data||[]).length;
      contextParts.push(`Current workforce: ${active} active employees out of ${total} total.`);
    }

    if (activeContexts.has('payroll')) {
      const month = new Date().toISOString().slice(0,7);
      let q = client.from('payslips').select('net_pay').like('period', `${month}%`);
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      const total = (data||[]).reduce((s,p)=>s+(p.net_pay||0),0);
      contextParts.push(`Current month payroll (net): ₹${Math.round(total).toLocaleString()}.`);
    }

    if (activeContexts.has('performance')) {
      let q = client.from('performance_reviews').select('score').not('score','is',null).limit(100);
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      const scores = (data||[]).map(r=>r.score);
      const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
      if (avg) contextParts.push(`Average performance score: ${avg}/100 across ${scores.length} reviews.`);
    }

    if (activeContexts.has('training')) {
      let q = client.from('training_enrollments').select('status').limit(300);
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      const all  = (data||[]).length;
      const done = (data||[]).filter(e=>e.status==='completed').length;
      contextParts.push(`Training: ${done}/${all} enrollments completed (${all>0?Math.round(done/all*100):0}%).`);
    }

    if (activeContexts.has('leave')) {
      let q = client.from('leave_requests').select('status').eq('status','pending');
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      contextParts.push(`Leave requests: ${(data||[]).length} pending approval.`);
    }
    if (activeContexts.has('jobs')) {
      let q = client.from('jobs').select('status, is_active').limit(100);
      if (cid) q = q.eq('company_id', cid);
      const { data } = await q;
      const all  = (data||[]).length;
      const active = (data||[]).filter(j=>j.is_active || j.status==='active').length;
      contextParts.push(`Job Postings: ${active} active jobs out of ${all} total jobs. Provide features to post, edit and preview jobs through ATS.`);
    }
  } catch(e) {
    console.warn('Context build error:', e);
  }

  return `${defaultSystemPrompt()}

## Live HR Data Context
${contextParts.length ? contextParts.join('\n') : 'No live data available yet.'}

Today's date: ${new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}.
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

// ── Markdown renderer ──
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
    .replace(/\n/g, '<br>');
}

// ── DOM helpers ──
function appendMessageEl(msg, streaming=false) {
  const container = document.getElementById('messages-container'); if (!container) return null;
  const isUser = msg.role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `ai-msg ${isUser ? 'user' : 'assistant'}`;
  wrap.id = `msg-${Date.now()}`;
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
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

function escHtml(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s).replace(/\n/g,'<br>');
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

if (typeof window.showToast === 'undefined') {
  window.showToast = (msg, type='info') => {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
    c.appendChild(t); setTimeout(()=>t.remove(),3800);
  };
}

// setText fallback
if (typeof window.setText === 'undefined') {
  window.setText = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
}

// ── Speech Recognition ──
let recognition;
let isRecording = false;

window.toggleVoice = function() {
  if (isRecording) {
    if (recognition) recognition.stop();
    return;
  }
  
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    window.showToast?.('Voice recognition not supported in this browser.', 'err');
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  
  const micBtn = document.getElementById('mic-btn');
  const input = document.getElementById('ai-input');
  
  recognition.onstart = function() {
    isRecording = true;
    if (micBtn) {
      micBtn.style.color = '#ef4444';
      micBtn.style.borderColor = '#ef4444';
    }
    input.placeholder = 'Listening...';
  };
  
  recognition.onresult = function(event) {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript) {
      input.value = (input.value + ' ' + finalTranscript).trim();
      autoResize(input);
    }
  };
  
  recognition.onerror = function(event) {
    console.error('Speech error:', event.error);
    window.showToast?.('Voice error: ' + event.error, 'err');
    stopRecording();
  };
  
  recognition.onend = function() {
    stopRecording();
    if (input.value.trim().length > 0) {
      sendMessage();
    }
  };
  
  function stopRecording() {
    isRecording = false;
    if (micBtn) {
      micBtn.style.color = 'var(--hr-text-primary)';
      micBtn.style.borderColor = 'var(--hr-border)';
    }
    input.placeholder = 'Ask anything or use Voice Command to access job postings and innovative tech...';
  }
  
  try {
    recognition.start();
  } catch (e) {
    console.error(e);
  }
};
