// Environment-art feature flag (Phase 2 Higgsfield kit).
//   ?env=phase2   → new city blocks + props (persisted)
//   ?env=legacy   → original house scenery (persisted; the default)
//   ?crossings=1  → additionally the tunnel + station (NOT persisted; gated
//                   separately until clearance checks pass — see CLEARANCE.md)
const KEY = 'cv-envart';

function detect(): 'legacy' | 'phase2' {
    try {
        const q = new URLSearchParams(location.search).get('env');
        if (q === 'phase2' || q === 'legacy') {
            localStorage.setItem(KEY, q);
            return q;
        }
        if (localStorage.getItem(KEY) === 'phase2') return 'phase2';
    } catch {}
    return 'legacy';
}

export const ENV_ART = detect();
export const CROSSINGS = (() => {
    try { return new URLSearchParams(location.search).get('crossings') === '1'; } catch { return false; }
})();
