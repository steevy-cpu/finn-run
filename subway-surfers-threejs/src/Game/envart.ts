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
// Phase 6 Finn material experiment: ?finnPolish=original|soft|shaped
// (persisted); anything else falls back to original here, at the URL layer.
export type FinnPolishMode = 'original' | 'soft' | 'shaped';
export const FINN_POLISH: FinnPolishMode = (() => {
    const valid = (v: string | null): v is FinnPolishMode => v === 'original' || v === 'soft' || v === 'shaped';
    try {
        const q = new URLSearchParams(location.search).get('finnPolish');
        if (q !== null) {
            const m = valid(q) ? q : 'original';
            localStorage.setItem('cv-finn-polish', m);
            return m;
        }
        const saved = localStorage.getItem('cv-finn-polish');
        if (valid(saved)) return saved;
    } catch {}
    return 'original';
})();

export const CROSSINGS = (() => {
    try { return new URLSearchParams(location.search).get('crossings') === '1'; } catch { return false; }
})();
