/* ============================================
   EVALIS AI — SHARED JAVASCRIPT ENGINE v2.0
   ============================================ */

// --- Navbar scroll effect ---
window.addEventListener('scroll', () => {
    const nav = document.querySelector('nav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
});

// --- Mobile Menu Toggle ---
function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.classList.toggle('open');
}

// --- Scroll Reveal ---
function initReveal() {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('active'), i * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    reveals.forEach(el => observer.observe(el));
}

// --- Counter Animation ---
function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count'));
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 2000;
        const start = performance.now();
        function update(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(target * eased) + suffix;
            if (progress < 1) requestAnimationFrame(update);
        }
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                requestAnimationFrame(update);
                observer.unobserve(el);
            }
        });
        observer.observe(el);
    });
}

// --- Particle Background ---
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null };

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.1;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
            if (mouse.x && mouse.y) {
                const dx = mouse.x - this.x, dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    this.x -= dx * 0.01;
                    this.y -= dy * 0.01;
                }
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99, 102, 241, ${this.opacity})`;
            ctx.fill();
        }
    }

    const count = Math.min(80, Math.floor(window.innerWidth / 15));
    for (let i = 0; i < count; i++) particles.push(new Particle());

    function connectParticles() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(99, 102, 241, ${0.08 * (1 - dist / 150)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        connectParticles();
        requestAnimationFrame(animate);
    }
    animate();
}

// --- AI Chatbot Widget ---
function initChatbot() {
    const widget = document.querySelector('.ai-chat-widget');
    if (!widget) return;
    const btn = widget.querySelector('.ai-chat-btn');
    const panel = widget.querySelector('.chat-panel');
    const input = widget.querySelector('.chat-input-area input');
    const sendBtn = widget.querySelector('.chat-input-area button');
    const messages = widget.querySelector('.chat-messages');

    btn.addEventListener('click', () => panel.classList.toggle('open'));

    const responses = {
        'hello': 'Hello! Welcome to Evalis AI 👋 How can I help you today?',
        'hi': 'Hi there! Looking for AI services, web development, or SaaS solutions?',
        'services': 'We offer: AI Data Services, Web & App Development, SaaS Platform Development, AI Integration, and more! Visit our Services page for details.',
        'pricing': 'Our pricing is project-based. Contact us for a custom quote tailored to your needs!',
        'contact': 'Reach us at info@evalisai.com or WhatsApp +919544842260. We reply within 24 hours!',
        'web': 'We build stunning, modern websites with Next.js, React, and cutting-edge tech. From landing pages to full-stack platforms!',
        'app': 'We develop mobile and web applications using React Native, Flutter, and progressive web technologies.',
        'saas': 'We architect and build complete SaaS platforms — from MVP to enterprise scale. Multi-tenant, secure, and scalable.',
        'ai': 'We integrate AI into your business: custom chatbots, automation, data analysis, LLM integration, and intelligent workflows.',
        'default': "Thanks for your interest! I can help with info about our services, pricing, or connect you with our team. Try asking about 'services', 'pricing', 'web development', 'AI', or 'SaaS'."
    };

    function addMessage(text, isUser) {
        const div = document.createElement('div');
        div.style.cssText = `padding:10px 14px;border-radius:12px;margin-bottom:8px;font-size:0.85rem;max-width:85%;line-height:1.5;
            ${isUser ? 'background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.3);margin-left:auto;color:#c7d2fe;' 
                     : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);color:#94a3b8;'}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    function getResponse(input) {
        const lower = input.toLowerCase();
        for (const [key, val] of Object.entries(responses)) {
            if (key !== 'default' && lower.includes(key)) return val;
        }
        return responses['default'];
    }

    function send() {
        const text = input.value.trim();
        if (!text) return;
        addMessage(text, true);
        input.value = '';
        setTimeout(() => addMessage(getResponse(text), false), 600);
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

// --- Typing Effect ---
function typeWriter(element, texts, speed = 80, pause = 2000) {
    if (!element) return;
    let textIndex = 0, charIndex = 0, isDeleting = false;
    function type() {
        const current = texts[textIndex];
        element.textContent = current.substring(0, charIndex);
        if (!isDeleting && charIndex < current.length) {
            charIndex++;
            setTimeout(type, speed);
        } else if (!isDeleting) {
            setTimeout(() => { isDeleting = true; type(); }, pause);
        } else if (charIndex > 0) {
            charIndex--;
            setTimeout(type, speed / 2);
        } else {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
            setTimeout(type, 300);
        }
    }
    type();
}

// --- Smooth scroll for anchor links ---
document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a) {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
});

// --- Initialize everything on DOM ready ---
document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    animateCounters();
    initParticles();
    initChatbot();
});
