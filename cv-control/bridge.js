// GameBridge — converts gesture events into the synthetic key presses the
// game already understands (handlekeys.js reads event.keyCode on document).

export const KEYS = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };

// Modern browsers ignore keyCode in the KeyboardEvent constructor (it's a
// deprecated read-only property), so we re-define the getter before dispatch.
export function pressKey(keyCode, target = document) {
    const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    target.dispatchEvent(ev);
}

export class GameBridge {
    constructor({ target = document, onKey = null } = {}) {
        this.target = target;
        this.onKey = onKey; // optional observer for logging/UI
    }

    _press(keyCode) {
        pressKey(keyCode, this.target);
        if (this.onKey) this.onKey(keyCode);
    }

    // Feed the event array returned by GestureInterpreter.update().
    handle(events) {
        for (const ev of events) {
            if (ev.type === "lane") {
                const steps = ev.to - ev.from;
                const key = steps > 0 ? KEYS.RIGHT : KEYS.LEFT;
                for (let i = 0; i < Math.abs(steps); i++) this._press(key);
            } else if (ev.type === "jump") {
                this._press(KEYS.UP);
            } else if (ev.type === "duck") {
                this._press(KEYS.DOWN);
            }
            // duck_end needs no key: the game ends its own duck animation.
        }
    }
}
