// Page scrolling with j/k/h/l outside the bookmark panes.
//
// The Vimium pass-through rule for this URL (Options -> Excluded URLs and keys,
// keys "hjkl") hands those keys to the page *unconditionally* -- passKeys is matched
// per URL, and there is no way to scope it to "only while the bookmark panel has
// focus". Inside the panes that is what we want. Everywhere else it meant j/k simply
// stopped scrolling, because Vimium had handed them over and nothing caught them.
//
// Vimium still owns d, u, gg and G here -- those were never passed through.
//
// Motion follows Vimium's scroller.js: while the key is physically DOWN the page
// scrolls continuously at a constant speed; on release it stops, having travelled at
// least one step. Crucially it does NOT drive off key auto-repeat -- doing that puts
// the OS repeat delay (~400ms) between the first step and the rest, which reads as
// the scroll stuttering to a halt and starting again.

(function () {
  "use strict";

  const SPEED = 0.95;       // px per ms while the key is down
  const STEP = 60;          // minimum travel for a quick tap, Vimium's default
  const PANES = ".sp-rail, .sp-content, .sp-dl-list";

  const MOVES = { j: [0, 1], k: [0, -1], h: [-1, 0], l: [1, 0] };

  let dir = null;           // unit direction of the current press
  let heldKey = null;       // the key currently down, or null
  let travelled = 0;        // px moved since this press began

  // The animated position is tracked as our own floats. Re-reading window.scrollY
  // each frame feeds rounded integers back in, and a sub-pixel step can then round
  // away to nothing and stall the loop.
  let curX = 0;
  let curY = 0;
  let frame = null;
  let lastTs = null;

  const maxX = () => Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const clamp = (v, hi) => Math.max(0, Math.min(v, hi));

  function startPress(move, key) {
    dir = move;
    heldKey = key;
    travelled = 0;
    if (frame === null) {
      curX = window.scrollX;
      curY = window.scrollY;
      lastTs = null;
      frame = requestAnimationFrame(step);
    }
  }

  function stop() {
    frame = null;
    lastTs = null;
    dir = null;
  }

  function step(ts) {
    // Clamped: after a stall (background tab, a throttled frame) an unclamped
    // elapsed would teleport the page instead of scrolling it.
    const elapsed = lastTs === null ? 16 : Math.min(ts - lastTs, 50);
    lastTs = ts;

    const wanted = SPEED * elapsed;
    // Free-running while the key is down; once released, finish the step and stop.
    const move = heldKey ? wanted : Math.min(wanted, STEP - travelled);

    if (move <= 0) {
      window.scrollTo(Math.round(curX), Math.round(curY));
      stop();
      return;
    }

    const nextX = clamp(curX + dir[0] * move, maxX());
    const nextY = clamp(curY + dir[1] * move, maxY());

    // Ran into the top or bottom of the page: nothing more to give.
    if (nextX === curX && nextY === curY) {
      stop();
      return;
    }

    curX = nextX;
    curY = nextY;
    travelled += move;
    window.scrollTo(curX, curY);
    frame = requestAnimationFrame(step);
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    const move = MOVES[e.key];
    if (!move) return;
    if (SPState.isTyping(e.target)) return;

    // Inside a pane these keys navigate; that pane's own handler owns them.
    if (e.target && e.target.closest && e.target.closest(PANES)) return;

    e.preventDefault();
    // Auto-repeats are ignored on purpose: the animation is already running and
    // keeps running until keyup. This is what removes the repeat-delay stutter.
    if (e.repeat && heldKey === e.key) return;
    startPress(move, e.key);
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === heldKey) heldKey = null;
  });

  // A keyup can be missed if the window loses focus mid-press; without this the
  // page would keep scrolling on its own.
  window.addEventListener("blur", () => { heldKey = null; });
})();
