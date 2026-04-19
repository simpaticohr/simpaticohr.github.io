/**
 * interview-enhancements.js — Simpatico HR Elite Interview Platform
 * Adds: Code Editor (Monaco), Rich Results Scorecard, Face Detection
 */

// ══════════════════════════════════════════════════════════════════
// 1. CODE EDITOR MODULE
// ══════════════════════════════════════════════════════════════════
const CodeEditor = {
    editor: null,
    isVisible: false,
    currentLanguage: 'javascript',
    currentChallenge: null,
    startTime: null,
    submissions: [],

    LANGUAGES: {
        javascript: { label: 'JavaScript', monacoId: 'javascript', icon: 'fab fa-js-square', color: '#f7df1e' },
        python:     { label: 'Python',     monacoId: 'python',     icon: 'fab fa-python',    color: '#3776ab' },
        typescript: { label: 'TypeScript', monacoId: 'typescript', icon: 'fas fa-code',      color: '#3178c6' },
        sql:        { label: 'SQL',        monacoId: 'sql',        icon: 'fas fa-database',  color: '#e48e00' },
        java:       { label: 'Java',       monacoId: 'java',       icon: 'fab fa-java',      color: '#ed8b00' },
    },

    CHALLENGES: {
        easy: [
            {
                title: 'Array Sum',
                description: 'Write a function that takes an array of numbers and returns their sum.',
                starterCode: { javascript: '// Write your solution\nfunction arraySum(nums) {\n  \n}\n\n// Test\nconsole.log(arraySum([1, 2, 3, 4, 5])); // Expected: 15' },
                testCases: [{ input: '[1,2,3,4,5]', expected: '15' }],
            },
            {
                title: 'Reverse String',
                description: 'Write a function that reverses a string without using built-in reverse.',
                starterCode: { javascript: '// Write your solution\nfunction reverseString(str) {\n  \n}\n\n// Test\nconsole.log(reverseString("hello")); // Expected: "olleh"' },
                testCases: [{ input: '"hello"', expected: '"olleh"' }],
            },
        ],
        medium: [
            {
                title: 'Two Sum',
                description: 'Given an array of integers and a target, return indices of two numbers that add up to the target.',
                starterCode: { javascript: '// Write your solution\nfunction twoSum(nums, target) {\n  \n}\n\n// Test\nconsole.log(twoSum([2, 7, 11, 15], 9)); // Expected: [0, 1]' },
                testCases: [{ input: '[2,7,11,15], 9', expected: '[0,1]' }],
            },
            {
                title: 'Valid Parentheses',
                description: 'Given a string containing just (){}[], determine if the input string is valid.',
                starterCode: { javascript: '// Write your solution\nfunction isValid(s) {\n  \n}\n\n// Test\nconsole.log(isValid("()[]{}")); // Expected: true\nconsole.log(isValid("(]"));     // Expected: false' },
                testCases: [{ input: '"()[]{}"', expected: 'true' }],
            },
        ],
        hard: [
            {
                title: 'LRU Cache',
                description: 'Design a data structure that follows the Least Recently Used (LRU) cache eviction policy.',
                starterCode: { javascript: '// Implement LRU Cache\nclass LRUCache {\n  constructor(capacity) {\n    \n  }\n  \n  get(key) {\n    \n  }\n  \n  put(key, value) {\n    \n  }\n}\n\n// Test\nconst cache = new LRUCache(2);\ncache.put(1, 1);\ncache.put(2, 2);\nconsole.log(cache.get(1)); // 1\ncache.put(3, 3);\nconsole.log(cache.get(2)); // -1' },
                testCases: [],
            },
        ],
    },

    async init() {
        // Monaco is loaded via CDN in the HTML
        if (typeof monaco === 'undefined') {
            console.warn('[CodeEditor] Monaco not loaded yet');
            return;
        }
        const container = document.getElementById('monacoContainer');
        if (!container) return;

        this.editor = monaco.editor.create(container, {
            value: '// Your code here\n',
            language: 'javascript',
            theme: 'vs-dark',
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            minimap: { enabled: false },
            padding: { top: 16 },
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            suggestOnTriggerCharacters: true,
            tabSize: 2,
            wordWrap: 'on',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
        });

        // Custom dark theme matching interview UI
        monaco.editor.defineTheme('interview-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c792ea' },
                { token: 'string', foreground: 'c3e88d' },
                { token: 'number', foreground: 'f78c6c' },
                { token: 'type', foreground: 'ffcb6b' },
            ],
            colors: {
                'editor.background': '#0f0f1a',
                'editor.foreground': '#e2e8f0',
                'editorCursor.foreground': '#6366f1',
                'editor.lineHighlightBackground': '#1a1a2e',
                'editorLineNumber.foreground': '#475569',
                'editor.selectionBackground': '#6366f140',
                'editor.inactiveSelectionBackground': '#6366f120',
            },
        });
        monaco.editor.setTheme('interview-dark');
        console.log('[CodeEditor] Initialized');
    },

    show(challenge) {
        this.currentChallenge = challenge;
        this.startTime = Date.now();
        this.isVisible = true;

        const panel = document.getElementById('codeEditorPanel');
        const videoSection = document.querySelector('.video-section');
        if (panel) panel.classList.add('visible');
        if (videoSection) videoSection.classList.add('split');

        // Set challenge info
        const titleEl = document.getElementById('codeTitle');
        const descEl = document.getElementById('codeDescription');
        if (titleEl) titleEl.textContent = challenge.title;
        if (descEl) descEl.textContent = challenge.description;

        // Set starter code
        const lang = this.currentLanguage;
        const code = challenge.starterCode?.[lang] || challenge.starterCode?.javascript || '// Write your solution\n';
        if (this.editor) {
            const model = this.editor.getModel();
            monaco.editor.setModelLanguage(model, this.LANGUAGES[lang]?.monacoId || 'javascript');
            this.editor.setValue(code);
            this.editor.focus();
        }

        // Update language selector
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    },

    hide() {
        this.isVisible = false;
        const panel = document.getElementById('codeEditorPanel');
        const videoSection = document.querySelector('.video-section');
        if (panel) panel.classList.remove('visible');
        if (videoSection) videoSection.classList.remove('split');
    },

    toggle() {
        if (this.isVisible) this.hide();
        else {
            // Show with a default challenge if none active
            if (!this.currentChallenge) {
                this.show(this.CHALLENGES.medium[0]);
            } else {
                this.show(this.currentChallenge);
            }
        }
    },

    getCode() {
        return this.editor ? this.editor.getValue() : '';
    },

    setLanguage(lang) {
        this.currentLanguage = lang;
        if (this.editor && this.LANGUAGES[lang]) {
            const model = this.editor.getModel();
            monaco.editor.setModelLanguage(model, this.LANGUAGES[lang].monacoId);
        }
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    },

    async submitCode() {
        const code = this.getCode();
        const elapsed = Math.round((Date.now() - (this.startTime || Date.now())) / 1000);
        
        const submission = {
            challenge: this.currentChallenge?.title || 'Unknown',
            language: this.currentLanguage,
            code,
            timeSeconds: elapsed,
            timestamp: Date.now(),
            lineCount: code.split('\n').length,
            charCount: code.length,
        };

        this.submissions.push(submission);

        // Visual feedback
        const btn = document.getElementById('codeSubmitBtn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> Submitted!';
            btn.style.background = 'var(--success)';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                btn.style.background = '';
            }, 2000);
        }

        // Add to proctoring log
        if (typeof addProcLog === 'function') {
            addProcLog('info', `Code submitted: ${submission.challenge} (${elapsed}s, ${submission.lineCount} lines)`);
        }

        return submission;
    },

    getSubmissions() {
        return this.submissions;
    },
};

// ══════════════════════════════════════════════════════════════════
// 2. RICH RESULTS SCREEN
// ══════════════════════════════════════════════════════════════════
const ResultsRenderer = {
    render(score, violations, engine, trust, codeSubmissions) {
        const skills = engine?.skillsCovered || {};
        const strong = engine?.strongAreas || [];
        const weak = engine?.weakAreas || [];
        const totalQuestions = engine?.questionCount || 0;
        const phases = engine?.history?.map(h => h.meta?.phase).filter(Boolean) || [];
        const uniquePhases = [...new Set(phases)];

        // Calculate category scores
        const skillEntries = Object.entries(skills);
        const avgScore = skillEntries.length > 0
            ? Math.round(skillEntries.reduce((s, [, v]) => s + v.score, 0) / skillEntries.length)
            : score;

        const trustGrade = trust >= 90 ? 'A+' : trust >= 75 ? 'A' : trust >= 60 ? 'B' : trust >= 40 ? 'C' : 'D';
        const overallGrade = avgScore >= 85 ? 'Excellent' : avgScore >= 70 ? 'Strong' : avgScore >= 50 ? 'Moderate' : avgScore >= 30 ? 'Developing' : 'Needs Improvement';
        const gradeColor = avgScore >= 85 ? '#10b981' : avgScore >= 70 ? '#22d3ee' : avgScore >= 50 ? '#f59e0b' : '#ef4444';

        // Build skills radar data for CSS-only radar chart
        const skillChartHTML = skillEntries.length > 0 ? skillEntries.slice(0, 8).map(([name, data]) => {
            const barColor = data.score >= 70 ? '#10b981' : data.score >= 40 ? '#f59e0b' : '#ef4444';
            return `<div class="result-skill-row">
                <span class="result-skill-name">${this.escHtml(name)}</span>
                <div class="result-skill-bar">
                    <div class="result-skill-fill" style="width:${data.score}%;background:${barColor}"></div>
                </div>
                <span class="result-skill-score" style="color:${barColor}">${data.score}%</span>
            </div>`;
        }).join('') : '<div style="color:var(--text-muted);text-align:center;padding:20px">No skills assessed</div>';

        // Code submissions section
        const codeHTML = (codeSubmissions && codeSubmissions.length > 0) ? `
            <div class="result-section">
                <h3 class="result-section-title"><i class="fas fa-code"></i> Coding Challenges</h3>
                ${codeSubmissions.map(s => `
                    <div class="result-code-item">
                        <div class="result-code-header">
                            <span class="result-code-name">${this.escHtml(s.challenge)}</span>
                            <span class="result-code-lang">${s.language}</span>
                        </div>
                        <div class="result-code-stats">
                            <span><i class="fas fa-clock"></i> ${Math.floor(s.timeSeconds / 60)}m ${s.timeSeconds % 60}s</span>
                            <span><i class="fas fa-file-code"></i> ${s.lineCount} lines</span>
                        </div>
                    </div>
                `).join('')}
            </div>` : '';

        return `
        <div class="results-screen">
            <div class="results-container">
                <!-- Header -->
                <div class="results-header">
                    <div class="results-check-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h1 class="results-title">Interview Complete</h1>
                    <p class="results-subtitle">Thank you for your time. Your performance has been recorded and will be reviewed by our hiring team.</p>
                </div>

                <!-- Score Ring -->
                <div class="results-score-ring">
                    <svg viewBox="0 0 120 120" class="score-svg">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
                        <circle cx="60" cy="60" r="52" fill="none" stroke="${gradeColor}" stroke-width="8"
                            stroke-dasharray="${Math.round(326.7 * avgScore / 100)} 326.7"
                            stroke-linecap="round" transform="rotate(-90 60 60)"
                            class="score-circle-animated"/>
                    </svg>
                    <div class="score-inner">
                        <div class="score-number">${avgScore}</div>
                        <div class="score-label">${overallGrade}</div>
                    </div>
                </div>

                <!-- Stats Grid -->
                <div class="results-stats-grid">
                    <div class="result-stat-card">
                        <div class="result-stat-icon" style="color:#6366f1"><i class="fas fa-comments"></i></div>
                        <div class="result-stat-value">${totalQuestions}</div>
                        <div class="result-stat-label">Questions</div>
                    </div>
                    <div class="result-stat-card">
                        <div class="result-stat-icon" style="color:#22d3ee"><i class="fas fa-layer-group"></i></div>
                        <div class="result-stat-value">${uniquePhases.length}</div>
                        <div class="result-stat-label">Phases</div>
                    </div>
                    <div class="result-stat-card">
                        <div class="result-stat-icon" style="color:${trust >= 75 ? '#10b981' : '#f59e0b'}"><i class="fas fa-shield-alt"></i></div>
                        <div class="result-stat-value">${trustGrade}</div>
                        <div class="result-stat-label">Trust</div>
                    </div>
                    <div class="result-stat-card">
                        <div class="result-stat-icon" style="color:${violations > 3 ? '#ef4444' : '#10b981'}"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="result-stat-value">${violations}</div>
                        <div class="result-stat-label">Flags</div>
                    </div>
                </div>

                <!-- Skills Breakdown -->
                <div class="result-section">
                    <h3 class="result-section-title"><i class="fas fa-chart-bar"></i> Skills Assessment</h3>
                    <div class="result-skills-chart">${skillChartHTML}</div>
                </div>

                <!-- Strengths & Areas for Growth -->
                <div class="results-two-col">
                    <div class="result-section result-section-green">
                        <h3 class="result-section-title"><i class="fas fa-star" style="color:#10b981"></i> Strengths</h3>
                        ${strong.length > 0
                            ? strong.map(s => `<div class="result-tag green">${this.escHtml(s)}</div>`).join('')
                            : '<div style="color:var(--text-muted);font-size:13px">Will be evaluated by the hiring team</div>'}
                    </div>
                    <div class="result-section result-section-amber">
                        <h3 class="result-section-title"><i class="fas fa-arrow-up" style="color:#f59e0b"></i> Growth Areas</h3>
                        ${weak.length > 0
                            ? weak.map(s => `<div class="result-tag amber">${this.escHtml(s)}</div>`).join('')
                            : '<div style="color:var(--text-muted);font-size:13px">No specific areas flagged</div>'}
                    </div>
                </div>

                ${codeHTML}

                <!-- Footer -->
                <div class="results-footer">
                    <p>Your interviewer will review this session and follow up within 2-3 business days.</p>
                    <button class="results-close-btn" onclick="window.close()">
                        <i class="fas fa-times"></i> Close Window
                    </button>
                </div>
            </div>
        </div>`;
    },

    escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    },
};

// ══════════════════════════════════════════════════════════════════
// 3. FACE DETECTION (Lightweight via Canvas Analysis)
// ══════════════════════════════════════════════════════════════════
const FaceMonitor = {
    canvas: null,
    ctx: null,
    interval: null,
    lastFaceDetected: true,
    consecutiveMisses: 0,
    MAX_MISSES: 5,

    init(videoElement) {
        if (!videoElement) return;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 160;
        this.canvas.height = 120;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.interval = setInterval(() => this.check(videoElement), 3000);
        console.log('[FaceMonitor] Started');
    },

    check(video) {
        if (!video || video.readyState < 2) return;
        this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;

        // Skin-tone pixel detection (heuristic face detection)
        let skinPixels = 0;
        const totalPixels = this.canvas.width * this.canvas.height;
        // Sample center region (where face should be)
        const cx = Math.floor(this.canvas.width / 2);
        const cy = Math.floor(this.canvas.height / 2);
        const radius = 40;
        
        for (let y = Math.max(0, cy - radius); y < Math.min(this.canvas.height, cy + radius); y++) {
            for (let x = Math.max(0, cx - radius); x < Math.min(this.canvas.width, cx + radius); x++) {
                const i = (y * this.canvas.width + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                // Broad skin-tone detection (works across skin colors)
                if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 10 && Math.abs(r - b) > 15) {
                    skinPixels++;
                }
            }
        }

        const skinRatio = skinPixels / (Math.PI * radius * radius);
        const faceDetected = skinRatio > 0.15; // At least 15% skin tones in center

        // Also check for total brightness (very dark = covered camera)
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
            totalBrightness += data[i] + data[i + 1] + data[i + 2];
        }
        const avgBrightness = totalBrightness / (data.length / 16) / 3;
        const cameraCovered = avgBrightness < 15;

        const camStatus = document.getElementById('selfCamStatus');
        const selfCam = document.getElementById('selfCam');

        if (cameraCovered) {
            this.consecutiveMisses++;
            if (camStatus) { camStatus.className = 'self-cam-status warn'; camStatus.textContent = 'Covered!'; }
            if (selfCam) selfCam.className = 'self-cam face-warn';
            if (this.consecutiveMisses >= this.MAX_MISSES && typeof trust !== 'undefined') {
                trust = Math.max(0, trust - 8);
                if (typeof updateTrust === 'function') updateTrust();
                if (typeof addProcLog === 'function') addProcLog('danger', 'Camera appears covered');
                if (typeof showToast === 'function') showToast('danger', '⚠️ Camera appears covered');
                this.consecutiveMisses = 0;
            }
        } else if (!faceDetected) {
            this.consecutiveMisses++;
            if (camStatus) { camStatus.className = 'self-cam-status warn'; camStatus.textContent = 'No Face'; }
            if (selfCam) selfCam.className = 'self-cam face-warn';
            if (this.consecutiveMisses >= this.MAX_MISSES && typeof trust !== 'undefined') {
                trust = Math.max(0, trust - 5);
                if (typeof updateTrust === 'function') updateTrust();
                if (typeof addProcLog === 'function') addProcLog('warn', 'Face not detected');
                this.consecutiveMisses = 0;
            }
        } else {
            this.consecutiveMisses = 0;
            if (camStatus) { camStatus.className = 'self-cam-status ok'; camStatus.textContent = 'Face OK'; }
            if (selfCam) selfCam.className = 'self-cam face-ok';
        }
    },

    stop() {
        if (this.interval) clearInterval(this.interval);
    },
};

// ══════════════════════════════════════════════════════════════════
// 4. EXPOSE TO GLOBAL SCOPE
// ══════════════════════════════════════════════════════════════════
window.CodeEditor = CodeEditor;
window.ResultsRenderer = ResultsRenderer;
window.FaceMonitor = FaceMonitor;
