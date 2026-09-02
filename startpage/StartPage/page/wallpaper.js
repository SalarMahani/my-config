// Wallpaper switching.
//
// Keys were picked against Vimium's actual default mappings (read from
// background_scripts/commands.js), since Vimium is live on this page and consumes
// any key it binds. "." and "," are free, and mirror the $mod+. / $mod+, workspace
// cycling in the sway config. "w" is free too. Avoid r (reload), W (moveTabToNewWindow),
// / (find mode) and the digits (Vimium count prefixes).

(function () {
  "use strict";

  const KEY = "wallpaperIndex";
  const list = globalThis.SP_WALLPAPERS || [];
  const bg = document.getElementById("bg");
  const hint = document.getElementById("wallpaper-hint");

  if (!list.length) {
    if (hint) hint.textContent = "No wallpapers indexed - run tools/index-wallpapers.sh";
    return;
  }

  const stored = SPState.read(KEY, 0);
  let index = Number.isInteger(stored) ? wrap(stored) : 0;
  let userChanged = false;

  function wrap(n) {
    return ((n % list.length) + list.length) % list.length;
  }

  function apply(n, save) {
    index = wrap(n);
    const entry = list[index];
    const src = entry.src;

    // Decode first so the browser paints from cache rather than flashing.
    const img = new Image();
    img.onload = img.onerror = () => {
      bg.style.backgroundImage = 'url("' + src + '")';
      bg.classList.add("loaded");
      // Zen mode drops the scrim, so on a light wallpaper the page switches to
      // dark text rather than putting an overlay back over the image. Measured
      // per image by tools/index-wallpapers.sh.
      document.documentElement.classList.toggle("sp-light-bg", entry.light === true);
      preload(index + 1);
    };
    img.src = src;

    if (save) SPState.write(KEY, index);
    if (hint) hint.textContent = index + 1 + " / " + list.length;
  }

  function preload(n) {
    const img = new Image();
    img.src = list[wrap(n)].src;
  }

  // The extension reads chrome.storage asynchronously; adopt what it reports only
  // if the user has not already picked something in the meantime.
  SPState.onRemote((state) => {
    const n = state[KEY];
    if (!userChanged && Number.isInteger(n) && wrap(n) !== index) {
      apply(n, false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || SPState.isTyping(e.target)) return;

    let next = null;
    if (e.key === ".") next = index + 1;
    else if (e.key === ",") next = index - 1;
    else if (e.key === "w") next = Math.floor(Math.random() * list.length);
    if (next === null) return;

    e.preventDefault();
    userChanged = true;
    apply(next, true);
  });

  apply(index, false);
})();
