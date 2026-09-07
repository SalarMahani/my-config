// The shortcuts view.
//
// This used to be the footer's key legend, which had grown to ten <kbd> entries on
// one line and still only listed the *global* keys -- nothing about editing
// bookmarks, navigating a pane, or what Vimium still owns. A reference wants the
// whole column, so it is a view like downloads rather than a third panel, on the
// same mechanism: one class on <html> swaps what is on screen.
//
// Page-side, like clock/zen/wallpaper/scroll: it needs no chrome.* API at all.
//
// "Shift+S" for shortcuts, and like Shift+C and Shift+I it needs no Vimium
// pass-through rule at all -- Vimium binds no bare "S". Unshifted "s" is the filter
// in both panels, and both test the literal "s", so the two never collide.
//
// Shift+K was tried first and dropped: Vimium binds "K" to nextTab, so it would only
// have worked once "K" was passed through, and then it would have cost next-tab on
// this page. A key that costs another key is the wrong trade for a help screen.

(function () {
  "use strict";

  const VIEW = "sp-keys";
  const root = document.documentElement;
  const mount = document.getElementById("shortcuts");
  if (!mount) return;

  // Every key on this page, grouped by where it applies. This list is the reference
  // now that the footer is not, so it covers the panes as well as the globals.
  const GROUPS = [
    ["Page", [
      [".", "next wallpaper"],
      [",", "previous wallpaper"],
      ["w", "random wallpaper"],
      ["c", "zen mode — wallpaper, clock and dates only"],
      ["q", "downloads view"],
      ["Shift+S", "this list"],
      ["j / k", "scroll the page"],
    ]],

    ["Bookmarks", [
      ["e", "focus the folder rail"],
      ["a", "focus the link grid"],
      ["s", "filter every bookmark"],
      ["↓↑←→ / hjkl", "navigate inside the focused pane"],
      ["Enter", "in the rail: show that folder"],
      ["Ctrl+Enter", "open the link in a new tab"],
      ["Escape", "clear marks, then leave the pane"],
    ]],

    ["Editing bookmarks", [
      ["Space / v", "mark or unmark"],
      ["Ctrl+A", "mark everything in view"],
      ["Ctrl+X / Shift+C", "cut"],
      ["Ctrl+V / p", "paste into the folder holding the cursor"],
      ["Shift+I", "new folder, in the folder holding the cursor"],
      ["Delete / d", "delete — moves to a trash folder"],
      ["Ctrl+↑ / Ctrl+↓", "reorder within the folder"],
      ["Ctrl+Z", "undo — a create is not undone this way"],
    ]],

    ["Downloads", [
      ["q", "enter or leave the view"],
      ["e / a", "put the cursor back in the list"],
      ["j / k", "down or up a column"],
      ["h / l", "back or forward in order"],
      ["Home / End", "first or last row"],
      ["Enter", "show the file in Dolphin"],
      ["Shift+C / Delete", "remove the row — the file is not touched"],
      ["d", "delete the file from disk — asks first"],
      ["Ctrl+C / p", "copy the full path"],
      ["s", "filter"],
      ["Escape", "clear the filter, else leave the list"],
    ]],

    ["Activity", [
      ["Shift+A", "focus “Pick up where you left off”"],
      ["j / k", "move through it"],
    ]],

    ["Vimium — still its keys", [
      ["f", "link hints"],
      ["/", "find on the page"],
      ["x", "close the tab"],
      ["gg / G", "top or bottom of the page"],
      ["J / K", "previous / next tab"],
    ]],
  ];

  // "Ctrl+X / Shift+C" -> alternatives split on " / ", combos split on "+", every
  // piece its own <kbd>. Nothing here is a literal "+" key; one would need escaping.
  function keysEl(spec) {
    const wrap = document.createElement("span");
    wrap.className = "sp-keys-keys";
    spec.split(" / ").forEach((alt, i) => {
      if (i) wrap.appendChild(document.createTextNode(" / "));
      alt.split("+").forEach((part, j) => {
        if (j) wrap.appendChild(document.createTextNode("+"));
        const kbd = document.createElement("kbd");
        kbd.textContent = part;
        wrap.appendChild(kbd);
      });
    });
    return wrap;
  }

  // Static, and about forty rows: there is nothing worth deferring. The downloads
  // panel loads lazily because opening it costs a downloads.search().
  function render() {
    const grid = document.createElement("div");
    grid.className = "sp-keys-grid";

    for (const [title, rows] of GROUPS) {
      const group = document.createElement("section");
      group.className = "sp-keys-group";

      const head = document.createElement("h3");
      head.textContent = title;
      group.appendChild(head);

      for (const [spec, what] of rows) {
        const row = document.createElement("div");
        row.className = "sp-keys-row";
        row.appendChild(keysEl(spec));
        const desc = document.createElement("span");
        desc.className = "sp-keys-what";
        desc.textContent = what;
        row.appendChild(desc);
        group.appendChild(row);
      }
      grid.appendChild(group);
    }

    mount.textContent = "";
    mount.appendChild(grid);
  }

  // Toggling drops the downloads class rather than ignoring it, so the two view
  // classes are mutually exclusive by construction and not by luck. downloads.js
  // does the same in the other direction.
  function toggle(on) {
    root.classList.toggle(VIEW, on);
    if (on) root.classList.remove("sp-dl");
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (SPState.isTyping(e.target)) return;

    if (e.key === "S") {
      // Zen hides .panels outright, this view included, so do not switch into
      // something that is not on screen. Same rule as the downloads view's "q".
      if (root.classList.contains("sp-zen")) return;
      e.preventDefault();
      toggle(!root.classList.contains(VIEW));
      return;
    }

    if (e.key === "Escape" && root.classList.contains(VIEW)) {
      e.preventDefault();
      toggle(false);
    }
  });

  render();
})();
