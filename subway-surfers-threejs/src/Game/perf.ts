// Low-power profile for weak hardware (Raspberry Pi class). Enable with
// `?lowpower=1` in the URL (persisted) or `?lowpower=0` to switch back.
// Trades visual polish for frame rate: no shadows, no antialiasing, 1x
// pixel ratio, a smaller camera feed and half-rate pose inference.
const KEY = 'cv-lowpower';

function detect(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('lowpower');
        if (q !== null) {
            const on = q !== '0' && q !== 'false';
            localStorage.setItem(KEY, on ? '1' : '0');
            return on;
        }
        if (localStorage.getItem(KEY) === '1') return true;
    } catch {}
    // Auto: ARM Linux boards (Pi) identify as Linux + armv7l/aarch64.
    return /Linux (armv7l|aarch64)/.test(navigator.userAgent);
}

export const LOW_POWER = detect();
