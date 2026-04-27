// ===== 360° INTERVIEW REVIEW MODULE =====
// Modern multi-evaluator feedback system for holistic candidate assessment

var REVIEW_360_KEY = 'simpatico_360_reviews';
var R360_COMPETENCIES = [
    'Technical Skills', 'Communication', 'Problem Solving', 'Leadership',
    'Teamwork', 'Adaptability', 'Domain Knowledge', 'Cultural Fit',
    'Initiative', 'Time Management', 'Creativity', 'Decision Making'
];
var R360_ROLES = [
    { key: 'manager', label: 'Hiring Manager', icon: 'fas fa-user-tie', color: '#4f46e5' },
    { key: 'peer', label: 'Peer', icon: 'fas fa-user-group', color: '#0ea5e9' },
    { key: 'lead', label: 'Team Lead', icon: 'fas fa-star', color: '#f59e0b' },
    { key: 'cross', label: 'Cross-functional', icon: 'fas fa-arrows-turn-right', color: '#10b981' },
    { key: 'hr', label: 'HR', icon: 'fas fa-heart', color: '#ec4899' },
    { key: 'skip', label: 'Skip-Level', icon: 'fas fa-arrow-up-right-dots', color: '#8b5cf6' }
];
var r360EvalCount = 0;

function load360Reviews() { return JSON.parse(localStorage.getItem(REVIEW_360_KEY) || '[]'); }
function save360Reviews(r) { localStorage.setItem(REVIEW_360_KEY, JSON.stringify(r)); }

function open360ReviewModal() {
    r360EvalCount = 0;
    document.getElementById('r360CandidateName').value = '';
    document.getElementById('r360Deadline').value = '';
    document.getElementById('r360EvaluatorsList').innerHTML = '';

    // Populate position dropdown from jobs
    var sel = document.getElementById('r360Position');
    sel.innerHTML = '<option value="">Select Position</option>';
    ((window.appData && appData.jobs) || []).forEach(function(j) {
        sel.innerHTML += '<option>' + escapeHtml(j.title) + '</option>';
    });

    // Render competency chips with defaults pre-selected
    var defaults = ['Technical Skills', 'Communication', 'Problem Solving', 'Leadership', 'Teamwork', 'Cultural Fit'];
    document.getElementById('r360CompetenciesList').innerHTML = R360_COMPETENCIES.map(function(c) {
        var on = defaults.includes(c);
        return '<button type="button" class="r360-comp-chip ' + (on ? 'selected' : '') + '" ' +
            'onclick="this.classList.toggle(\'selected\');' +
            'this.style.borderColor=this.classList.contains(\'selected\')?\'#7c3aed\':\'#d1d5db\';' +
            'this.style.background=this.classList.contains(\'selected\')?\'#f5f3ff\':\'white\';' +
            'this.style.color=this.classList.contains(\'selected\')?\'#7c3aed\':\'#6b7280\';" ' +
            'style="padding:6px 14px;border-radius:20px;border:1.5px solid ' + (on ? '#7c3aed' : '#d1d5db') +
            ';background:' + (on ? '#f5f3ff' : 'white') +
            ';font-size:0.82rem;font-weight:500;cursor:pointer;transition:all .15s;color:' +
            (on ? '#7c3aed' : '#6b7280') + ';">' + c + '</button>';
    }).join('');

    // Add 2 default evaluator rows
    add360Evaluator();
    add360Evaluator();
    new bootstrap.Modal(document.getElementById('review360Modal')).show();
}

function add360Evaluator() {
    r360EvalCount++;
    var i = r360EvalCount;
    var opts = R360_ROLES.map(function(r) {
        return '<option value="' + r.key + '">' + r.label + '</option>';
    }).join('');

    document.getElementById('r360EvaluatorsList').insertAdjacentHTML('beforeend',
        '<div class="r360-eval-row" id="r360E' + i + '" style="display:grid;grid-template-columns:1fr 1fr 140px 32px;gap:8px;align-items:center;margin-bottom:8px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">' +
        '<input type="text" class="form-control-custom" placeholder="Name" style="font-size:0.84rem;" data-field="name">' +
        '<input type="email" class="form-control-custom" placeholder="Email" style="font-size:0.84rem;" data-field="email">' +
        '<select class="form-control-custom" style="font-size:0.84rem;" data-field="role">' + opts + '</select>' +
        '<button type="button" onclick="document.getElementById(\'r360E' + i + '\').remove()" ' +
        'style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:1rem;" title="Remove">' +
        '<i class="fas fa-times"></i></button></div>'
    );
}

function create360Review() {
    var candidate = document.getElementById('r360CandidateName').value.trim();
    var position = document.getElementById('r360Position').value;
    var deadline = document.getElementById('r360Deadline').value;
    if (!candidate || !position) { showToast('Fill candidate name and position', 'warning'); return; }

    // Collect evaluators
    var evaluators = [];
    document.querySelectorAll('.r360-eval-row').forEach(function(row) {
        var n = row.querySelector('[data-field="name"]').value.trim();
        var e = row.querySelector('[data-field="email"]').value.trim();
        var r = row.querySelector('[data-field="role"]').value;
        if (n) evaluators.push({ name: n, email: e, role: r, status: 'pending', scores: {} });
    });
    if (evaluators.length < 2) { showToast('Add at least 2 evaluators', 'warning'); return; }

    // Collect selected competencies
    var competencies = [];
    document.querySelectorAll('.r360-comp-chip.selected').forEach(function(c) {
        competencies.push(c.textContent.trim());
    });
    if (competencies.length < 3) { showToast('Select at least 3 competencies', 'warning'); return; }

    var review = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        candidate: candidate, position: position, deadline: deadline,
        evaluators: evaluators, competencies: competencies,
        status: 'active', created_at: new Date().toISOString()
    };

    var all = load360Reviews();
    all.unshift(review);
    save360Reviews(all);
    bootstrap.Modal.getInstance(document.getElementById('review360Modal')).hide();
    render360Reviews();
    showToast('360\u00b0 Review created for ' + candidate, 'success');
}

function render360Reviews() {
    var revs = load360Reviews();
    var listEl = document.getElementById('review360List');
    var emptyEl = document.getElementById('review360EmptyState');
    if (!listEl) return;

    if (!revs.length) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = revs.map(function(r) {
        var tot = r.evaluators.length;
        var dn = r.evaluators.filter(function(e) { return e.status === 'completed'; }).length;
        var pct = tot ? Math.round(dn / tot * 100) : 0;
        var sc = r.status === 'completed' ? '#10b981' : '#7c3aed';
        var sl = r.status === 'completed' ? 'Completed' : 'In Progress';

        // Evaluator pills
        var pills = r.evaluators.map(function(ev) {
            var ri = R360_ROLES.find(function(x) { return x.key === ev.role; }) || R360_ROLES[0];
            var dc = ev.status === 'completed' ? '#10b981' : '#cbd5e1';
            return '<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;' +
                'background:' + ri.color + '12;border:1px solid ' + ri.color + '30;font-size:0.76rem;font-weight:500;">' +
                '<span style="width:6px;height:6px;border-radius:50%;background:' + dc + ';flex-shrink:0;"></span>' +
                '<i class="' + ri.icon + '" style="font-size:0.65rem;color:' + ri.color + ';"></i> ' +
                escapeHtml(ev.name) + '</div>';
        }).join('');

        // Scorecard for completed reviews
        var scoreHtml = '';
        if (dn > 0) {
            var avgs = {};
            r.competencies.forEach(function(c) { avgs[c] = []; });
            r.evaluators.forEach(function(ev) {
                if (ev.status === 'completed' && ev.scores) {
                    Object.keys(ev.scores).forEach(function(k) {
                        if (avgs[k]) avgs[k].push(ev.scores[k]);
                    });
                }
            });
            scoreHtml = '<div class="r360sc" style="display:none;margin-top:12px;">' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">';
            r.competencies.forEach(function(c) {
                var v = avgs[c] || [];
                var avg = v.length ? Math.round(v.reduce(function(a, b) { return a + b; }, 0) / v.length) : 0;
                var bc = avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444';
                scoreHtml += '<div style="font-size:0.78rem;">' +
                    '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">' +
                    '<span style="color:#64748b;">' + c + '</span>' +
                    '<span style="font-weight:700;color:' + bc + ';">' + avg + '%</span></div>' +
                    '<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + avg + '%;background:' + bc + ';border-radius:3px;transition:width .5s;"></div>' +
                    '</div></div>';
            });
            scoreHtml += '</div></div>';
        }

        // Build the card
        return '<div class="card" style="margin-bottom:14px;border-left:4px solid ' + sc + ';">' +
            '<div class="card-body" style="padding:18px 20px;">' +
            // Header row
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
            '<div><h5 style="margin:0 0 4px;font-weight:700;font-size:1rem;">' + escapeHtml(r.candidate) + '</h5>' +
            '<div style="font-size:0.84rem;color:#64748b;">' + escapeHtml(r.position) +
            (r.deadline ? ' \u00b7 Due ' + formatDate(r.deadline) : '') + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:0.75rem;font-weight:600;color:' + sc + ';padding:3px 10px;border-radius:20px;background:' + sc + '15;">' + sl + '</span>' +
            '<button class="btn-sm-action delete" onclick="delete360Review(\'' + r.id + '\')"><i class="fas fa-trash"></i></button>' +
            '</div></div>' +
            // Progress bar
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
            '<div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + sc + ';border-radius:3px;"></div></div>' +
            '<span style="font-size:0.78rem;font-weight:600;color:' + sc + ';white-space:nowrap;">' + dn + '/' + tot + ' evaluators</span></div>' +
            // Evaluator pills
            '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + pills + '</div>' +
            // Action buttons
            (dn > 0 ? '<button class="btn-outline-custom" style="margin-top:12px;font-size:0.8rem;padding:5px 14px;" ' +
                'onclick="var s=this.nextElementSibling;s.style.display=s.style.display===\'none\'?\'block\':\'none\';">' +
                '<i class="fas fa-chart-bar me-1"></i>Toggle Scorecard</button>' + scoreHtml : '') +
            (dn === 0 ? '<button class="btn-outline-custom" style="margin-top:12px;font-size:0.8rem;padding:5px 14px;" ' +
                'onclick="simulate360Feedback(\'' + r.id + '\')">' +
                '<i class="fas fa-wand-magic-sparkles me-1"></i>Simulate Feedback</button>' : '') +
            '</div></div>';
    }).join('');
}

function delete360Review(id) {
    if (!confirm('Delete this 360\u00b0 review?')) return;
    save360Reviews(load360Reviews().filter(function(r) { return r.id !== id; }));
    render360Reviews();
    showToast('360\u00b0 Review deleted');
}

function simulate360Feedback(id) {
    var revs = load360Reviews();
    var rev = revs.find(function(r) { return r.id === id; });
    if (!rev) return;
    rev.evaluators.forEach(function(ev) {
        ev.status = 'completed';
        ev.scores = {};
        rev.competencies.forEach(function(c) {
            ev.scores[c] = Math.floor(Math.random() * 40) + 55; // 55-94 range
        });
    });
    rev.status = 'completed';
    save360Reviews(revs);
    render360Reviews();
    showToast('Simulated feedback for all evaluators', 'success');
}

// Hook into switchInterviewTab to render 360 reviews when tab is activated
(function() {
    var orig = window.switchInterviewTab;
    if (typeof orig === 'function') {
        window.switchInterviewTab = function(tab, el) {
            orig(tab, el);
            if (tab === '360review') render360Reviews();
        };
    } else {
        document.addEventListener('click', function(e) {
            if (e.target.closest('[data-tab="360review"]')) {
                setTimeout(render360Reviews, 50);
            }
        });
    }
})();

// ===== 360° ROOM CAMERA (QR Code + Secondary Camera) =====
function show360QRCode() {
    var token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var baseUrl = window.location.origin;
    var roomUrl = baseUrl + '/room-camera.html?token=' + token;

    var container = document.getElementById('qr360Container');
    var canvas = document.getElementById('qr360Canvas');
    var linkEl = document.getElementById('qr360Link');
    var directLink = document.getElementById('qr360DirectLink');

    // Generate QR code using qrcode-generator library
    if (typeof qrcode !== 'undefined') {
        var qr = qrcode(0, 'M');
        qr.addData(roomUrl);
        qr.make();
        canvas.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
        // Make SVG fill container
        var svg = canvas.querySelector('svg');
        if (svg) {
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.maxWidth = '200px';
        }
    } else {
        // Fallback: show link-only
        canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7c3aed;font-size:0.8rem;"><i class="fas fa-qrcode" style="font-size:3rem;"></i></div>';
    }

    linkEl.textContent = roomUrl;
    directLink.href = roomUrl;
    container.style.display = 'block';

    // Store the token
    window._room360Token = token;
    if (window.showToast) showToast('QR code generated! Candidate can scan to start room camera.', 'success');
}

function copy360Link() {
    var linkEl = document.getElementById('qr360Link');
    if (!linkEl) return;
    navigator.clipboard.writeText(linkEl.textContent).then(function() {
        if (window.showToast) showToast('Room camera link copied!', 'success');
    }).catch(function() {
        // Fallback
        var ta = document.createElement('textarea');
        ta.value = linkEl.textContent;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (window.showToast) showToast('Room camera link copied!', 'success');
    });
}
