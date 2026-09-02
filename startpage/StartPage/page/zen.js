// Zen mode: hide the panels, leaving the wallpaper, the clock and the dates.
//
// "c" (clean) is used because Vimium is live on this page and eats any key it
// binds. Free single letters are a/c/e/q -- "z" would read better but Vimium
// treats it as a prefix (zi, zo, z0, zH, zL), so a bare "z" never arrives.

(function () {
  "use strict";

  const KEY = "zenMode";
  const root = document.documentElement;

  let zen = SPState.read(KEY, false) === true;
  let userChanged = false;

  function apply(on) {
    zen = Boolean(on);
    root.classList.toggle("sp-zen", zen);
  }

  // The extension is the real store; adopt what it reports unless the user has
  // already toggled in the meantime.
  SPState.onRemote((state) => {
    if (userChanged) return;
    if (typeof state[KEY] === "boolean") apply(state[KEY]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "c" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (SPState.isTyping(e.target)) return;

    e.preventDefault();
    userChanged = true;
    apply(!zen);
    SPState.write(KEY, zen);
  });

  apply(zen);
})();
