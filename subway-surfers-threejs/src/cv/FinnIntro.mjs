/** DOM-only welcome screen. Import finn-presentation.css once. No game loop. */
export function createFinnIntro({ host, artUrl, onStart, onDismiss = () => {}, ready = true }) {
  if (!host || typeof onStart !== 'function') throw new TypeError('host and onStart are required');
  let disposed = false, starting = false, enabled = Boolean(ready), previousFocus;
  const root = document.createElement('section');
  root.className = 'frp-intro';
  root.setAttribute('aria-label', 'Welcome to Finn Run');
  root.hidden = true;
  root.innerHTML = `
    <div class="frp-art" aria-hidden="true"><img alt="" decoding="async" draggable="false"></div>
    <div class="frp-content">
      <p class="frp-kicker"><span aria-hidden="true">↗</span> YOUR NEXT RUN STARTS HERE</p>
      <h1 class="frp-title">FINN <span>RUN</span></h1>
      <p class="frp-tagline">YOUR MOVES. FINN RUNS.</p>
      <div class="frp-credits">
        <p class="frp-credit"><span class="frp-credit-label">Created by</span><strong>Steeve A. Celestin</strong></p>
        <p class="frp-credit frp-credit-club"><img class="frp-club-logo" src="/assets/images/mdc-robotics-logo.jpeg" alt="" decoding="async" draggable="false"><span><span class="frp-credit-label">With</span><strong>MDC AI and Robotics Club</strong></span></p>
      </div>
      <button class="frp-start" type="button"><span>LET’S RUN</span><span aria-hidden="true">↗</span></button>
      <p class="frp-status" role="status" aria-live="polite"></p>
      <details class="frp-how"><summary>How to play</summary><ol><li>Choose Body Control or Hand Control in the camera panel.</li><li>Follow the camera prompts to calibrate.</li><li>Collect coins and dodge obstacles using your selected controls.</li></ol></details>
      <button class="frp-dismiss" type="button">Go to game controls <span aria-hidden="true">→</span></button>
      <div class="frp-rule" aria-hidden="true"></div>
      <p class="frp-footer">ONE CITY. YOUR NEXT HIGH SCORE.</p>
    </div>`;
  const image = root.querySelector('img'), start = root.querySelector('.frp-start');
  const status = root.querySelector('.frp-status'), dismiss = root.querySelector('.frp-dismiss');
  const hide = ({ restoreFocus = false } = {}) => {
    if (disposed) return;
    root.hidden = true;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
  };
  function updateReady() {
    start.disabled = !enabled || starting;
    start.querySelector('span').textContent = enabled ? 'LET’S RUN' : 'GETTING READY…';
    status.textContent = enabled ? '' : 'Loading the game. Controls are still available.';
  }
  function begin() {
    if (disposed || starting || !enabled || root.hidden) return;
    starting = true;
    start.disabled = true;
    hide();
    // Synchronous invocation preserves the button's user-activation context.
    try {
      Promise.resolve(onStart()).then(() => {
        if (!disposed) { starting = false; updateReady(); }
      }, recover);
    } catch (error) { recover(error); }
  }
  function recover(error) {
    if (disposed) return;
    starting = false;
    root.hidden = false;
    updateReady();
    status.textContent = 'Could not start. Try again or open the game controls.';
    start.focus();
    console.error('Finn intro start callback failed:', error);
  }
  function leave() { hide({ restoreFocus: true }); onDismiss(); }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); leave(); }
  }
  function artFailed() { root.classList.add('frp-no-art'); }
  image.addEventListener('error', artFailed);
  if (artUrl) image.src = artUrl; else artFailed();
  start.addEventListener('click', begin);
  dismiss.addEventListener('click', leave);
  root.addEventListener('keydown', onKey);
  host.append(root);
  updateReady();
  return {
    element: root,
    show({ focus = true } = {}) {
      if (disposed || starting) return;
      previousFocus = document.activeElement;
      root.hidden = false;
      if (focus) (enabled ? start : dismiss).focus({ preventScroll: true });
    },
    hide,
    setReady(value) { if (!disposed) { enabled = Boolean(value); updateReady(); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      image.removeEventListener('error', artFailed);
      start.removeEventListener('click', begin);
      dismiss.removeEventListener('click', leave);
      root.removeEventListener('keydown', onKey);
      root.remove();
    }
  };
}
