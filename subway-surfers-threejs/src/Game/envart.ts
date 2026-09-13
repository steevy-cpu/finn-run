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

// Phase 4 interface redesign: ?ui=phase4|original (persisted in cv-ui).
// Default original until a look is chosen. Applied as <html data-ui="…">
// so the redesign is a scoped stylesheet over the SAME DOM — nothing else
// (game state, other flags, settings) depends on it.
export type UiMode = 'original' | 'phase4';
export const UI_MODE: UiMode = (() => {
    try {
        const q = new URLSearchParams(location.search).get('ui');
        if (q !== null) {
            const m: UiMode = q === 'phase4' ? 'phase4' : 'original';
            localStorage.setItem('cv-ui', m);
            return m;
        }
        if (localStorage.getItem('cv-ui') === 'phase4') return 'phase4';
    } catch {}
    return 'original';
})();

// Phase 7 Arturo pursuer: ?arturo=1|0 (persisted in cv-arturo, default off).
// ?arturoModel=/assets/… (NOT persisted, dev/test only) points the pursuer
// at another same-origin GLB — used by the e2e lifecycle checks with a
// labelled stand-in until the real arturo.glb exists.
export const PURSUER = (() => {
    try {
        const q = new URLSearchParams(location.search).get('arturo');
        if (q === '1' || q === '0') localStorage.setItem('cv-arturo', q);
        return localStorage.getItem('cv-arturo') === '1';
    } catch { return false; }
})();
export const PURSUER_URL = (() => {
    const fallback = '/assets/glb/arturo.glb';
    try {
        const q = new URLSearchParams(location.search).get('arturoModel');
        return q && /^\/assets\/[\w\-./]+\.glb$/.test(q) ? q : fallback;
    } catch { return fallback; }
})();
