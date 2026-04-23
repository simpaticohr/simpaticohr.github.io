
// ── navigateTo stub ──────────────────────────────────────────────────────────
// shared-utils.js loads next and its window.onerror catches any ReferenceError.
// This stub ensures navigateTo() exists immediately so onclick attributes never
// throw. Any call before DOMContentLoaded is queued and replayed by the real fn.
window.navigateTo = function(sectionId, navEl) {
    window._navigatePending = { sectionId: sectionId, navEl: navEl };
};
// ─────────────────────────────────────────────────────────────────────────────
