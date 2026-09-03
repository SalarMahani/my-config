// The downloads view.
//
// Not a third panel: "q" swaps the whole column over to downloads and back, so a
// long history gets the width and height the bookmark and activity panels would
// otherwise be competing for on a 1366x768 screen.
//
// "q" is the last single key Vimium leaves alone. Its defaults claim
// j k h l G d u r R p P i v V f F / n N * # o O T b B H L K J ^ W t x X m ` ?,
// z/g/y are prefixes, digits are count prefixes -- and c/s/w/e/a/./, are already
// ours. Nothing else was available.
//
// chrome.downloads exists only in sw.js, exactly like bookmarks and history, so
// every call here goes out over a message.

SP.whenReady(() => {
  const mount = document.getElementById("downloads");
  if (!mount) return;

  const DAY = 86400000;
  const VIEW = "sp-dl";
  const root = document.documentElement;

  let items = [];            // newest first, as sw.js returned them
  let query = "";
  let cursorId = null;       // survives a re-render: focus is restored by id
  let loaded = false;        // the panel is hidden until "q", so load lazily
  let recheckDone = false;
  let focusOnRender = false; // entering the view focuses the cursor once data lands

  // id -> data URL, or null once known to be unavailable. Keyed by STRING id:
  // sw.js returns an object, so its numeric keys arrive as strings anyway.
  const icons = new Map();

  let statusEl, filterEl, listEl, observer = null;
  let statusTimer = null, iconTimer = null, pending = [];

  build();

  /* ------------------------------------------------------------------ shell */

  // Built once, not per render: re-rendering the list must not blow away the
  // filter box the user is typing into.
  function build() {
    statusEl = SP.el("span", { class: "sp-status" });

    filterEl = SP.el("input", {
      class: "sp-filter",
      type: "search",
      placeholder: "Filter downloads — press s",
      autocomplete: "off",
      spellcheck: "false",
    });
    filterEl.addEventListener("input", () => {
      query = filterEl.value.trim().toLowerCase();
      renderList();
    });
    filterEl.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      filterEl.value = "";
      query = "";
      renderList();
      filterEl.blur();
    });

    listEl = SP.el("div", { class: "sp-dl-list" });

    mount.appendChild(SP.el("div", { class: "sp-panel-head" }, [
      SP.el("h2", { text: "Downloads" }),
      statusEl,
      SP.el("div", { class: "sp-head-tools" }, [
        SP.el("button", {
          class: "sp-refresh",
          type: "button",
          title: "Search again — this is also what re-checks which files still exist",
          text: "Refresh",
          onclick: () => load(false),
        }),
        filterEl,
      ]),
    ]));
    mount.appendChild(listEl);

    attachNavigation();
  }

  /* ------------------------------------------------------------------- data */

  function load(quiet) {
    if (!quiet) mount.setAttribute("aria-busy", "true");
    return SP.send("downloads")
      .then((data) => {
        if (!data || data.error) throw new Error((data && data.error) || "no response");
        loaded = true;
        items = data.items || [];
        renderList();

        // chrome does not watch the filesystem: calling search() is what SCHEDULES
        // the existence check, and the corrected `exists` only appears on a later
        // search. One follow-up is what turns a stale icon into no icon.
        if (!recheckDone) {
          recheckDone = true;
          setTimeout(() => { if (SP.visible(mount)) load(true); }, 1200);
        }
      })
      .catch((err) => status(String((err && err.message) || err), true))
      .finally(() => mount.removeAttribute("aria-busy"));
  }

  const byId = (id) => items.find((it) => String(it.id) === String(id)) || null;

  function filtered() {
    if (!query) return items;
    return items.filter((it) =>
      it.name.toLowerCase().includes(query) || it.dir.toLowerCase().includes(query));
  }

  /* -------------------------------------------------------------- rendering */

  function renderList() {
    // Read this BEFORE emptying the list. Clearing detaches the focused row, which
    // moves activeElement to <body> -- so asking afterwards always says "no", and
    // every background refresh would silently drop the cursor out of the list.
    const hadFocus = listEl.contains(document.activeElement) || focusOnRender;
    focusOnRender = false;

    if (observer) { observer.disconnect(); observer = null; }
    listEl.textContent = "";

    const shown = filtered();
    if (!shown.length) {
      listEl.appendChild(SP.el("p", {
        class: "sp-note",
        text: !loaded ? "Loading…" : items.length ? "Nothing matches that filter." : "No downloads yet.",
      }));
      restStatus();
      return;
    }

    let group = null;
    for (const it of shown) {
      const label = groupLabel(it.startTime);
      if (label !== group) {
        group = label;
        listEl.appendChild(SP.el("div", { class: "sp-dl-group", text: label }));
      }
      listEl.appendChild(row(it));
    }

    restoreCursor(hadFocus);
    observeRows();
    restStatus();
  }

  function row(it) {
    const key = String(it.id);
    // icons.get() === null means getFileIcon refused, which in practice means the
    // file is not there. undefined means we have simply not asked yet.
    const here = it.exists && it.state === "complete" && icons.get(key) !== null;
    const url = icons.get(key);

    const iconEl = here
      ? SP.el("button", {
          class: "sp-dl-icon",
          type: "button",
          tabindex: "-1",
          title: "Show in Dolphin — " + it.filename,
        }, [url ? SP.el("img", { src: url, alt: "" }) : null])
      : SP.el("span", { class: "sp-dl-icon sp-dl-icon-blank" });

    const meta = [it.dir, size(it.bytes), clock(it.startTime)].filter(Boolean).join(" · ");
    const label = tag(it);

    return SP.el("div", {
      class: "sp-dl-row" + (here ? "" : " sp-dl-gone"),
      tabindex: "-1",
      "data-id": key,
    }, [
      iconEl,
      SP.el("div", { class: "sp-dl-body" }, [
        SP.el("button", {
          class: "sp-dl-name",
          type: "button",
          tabindex: "-1",
          title: here ? "Show in Dolphin — " + it.filename : it.filename,
          text: it.name || it.url || "(unnamed)",
        }),
        SP.el("div", { class: "sp-dl-meta" }, [
          SP.el("span", { text: meta }),
          label ? SP.el("span", { class: "sp-dl-tag", text: label }) : null,
        ]),
      ]),
      SP.el("button", {
        class: "sp-dl-erase",
        type: "button",
        tabindex: "-1",
        title: "Remove from the list (x) — the file is not touched",
        text: "✕",
      }),
    ]);
  }

  function tag(it) {
    if (it.state === "in_progress") return "downloading";
    if (it.state === "interrupted") return "failed";
    if (!it.exists) return "removed";
    return null;
  }

  function groupLabel(startTime) {
    const d = new Date(startTime);
    if (isNaN(d.getTime())) return "Unknown date";
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const back = Math.round((midnight.getTime() - day.getTime()) / DAY);
    if (back === 0) return "Today";
    if (back === 1) return "Yesterday";
    if (d.getFullYear() === new Date().getFullYear()) {
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    }
    return d.toISOString().slice(0, 10);
  }

  function size(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 || n >= 10 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
  }

  function clock(startTime) {
    const d = new Date(startTime);
    return isNaN(d.getTime())
      ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  /* ------------------------------------------------------------- lazy icons */

  // getFileIcon is one IPC and one file stat each, so asking for every row up front
  // does not scale to a long history. Ask only for rows that have actually been
  // scrolled into view, coalesced into one message per batch.
  function observeRows() {
    const candidates = rows().filter((r) => {
      const it = byId(r.dataset.id);
      return it && it.exists && it.state === "complete" && !icons.has(String(it.id));
    });
    if (!candidates.length) return;

    if (typeof IntersectionObserver !== "function") {
      queueIcons(candidates.map((r) => r.dataset.id));
      return;
    }

    observer = new IntersectionObserver((entries) => {
      const ids = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const id = entry.target.dataset.id;
        if (!icons.has(id)) ids.push(id);
      }
      if (ids.length) queueIcons(ids);
    }, { root: listEl, rootMargin: "200px" });

    for (const r of candidates) observer.observe(r);
  }

  function queueIcons(ids) {
    for (const id of ids) pending.push(id);
    if (iconTimer) return;
    iconTimer = setTimeout(() => {
      const batch = pending;
      pending = [];
      iconTimer = null;
      requestIcons(batch);
    }, 50);
  }

  function requestIcons(ids) {
    if (!ids.length) return;
    SP.send("downloadIcons", { ids: ids.map(Number) })
      .then((data) => {
        if (!data || !data.icons) return;
        for (const [id, url] of Object.entries(data.icons)) {
          icons.set(String(id), url);
          applyIcon(String(id), url);
        }
      })
      .catch(() => { /* the rows just stay iconless */ });
  }

  function applyIcon(id, url) {
    const rowEl = listEl.querySelector('.sp-dl-row[data-id="' + id + '"]');
    const holder = rowEl && rowEl.querySelector(".sp-dl-icon");
    if (!holder) return;
    // No icon means the file is gone: drop the button, so there is nothing to
    // click, which is what makes the empty slot read as "not on disk".
    if (!url) {
      holder.replaceWith(SP.el("span", { class: "sp-dl-icon sp-dl-icon-blank" }));
      rowEl.classList.add("sp-dl-gone");
      return;
    }
    holder.textContent = "";
    holder.appendChild(SP.el("img", { src: url, alt: "" }));
  }

  /* ------------------------------------------------------------------ focus */

  const rows = () => [...listEl.querySelectorAll(".sp-dl-row")];

  function focusRow(rowEl) {
    if (!rowEl) return;
    for (const r of rows()) r.tabIndex = -1;
    rowEl.tabIndex = 0;
    rowEl.focus();
    rowEl.scrollIntoView({ block: "nearest" });
    cursorId = rowEl.dataset.id;
  }

  // Roving tabindex: one tab stop for the whole list, so Tab does not walk every
  // download. `had` is measured by the caller before the rows were destroyed --
  // re-focus only if the list really had it, so a refresh cannot steal focus from
  // the filter box.
  function restoreCursor(had) {
    const all = rows();
    if (!all.length) return;
    const target = all.find((r) => r.dataset.id === cursorId) || all[0];
    for (const r of all) r.tabIndex = -1;
    target.tabIndex = 0;
    cursorId = target.dataset.id;
    if (had) { target.focus(); target.scrollIntoView({ block: "nearest" }); }
  }

  /* --------------------------------------------------------------- actions */

  function act(type, it, done) {
    SP.send(type, { id: Number(it.id) })
      .then((r) => {
        if (!r || r.error) { status((r && r.error) || "no response", true); return; }
        done(r);
      })
      .catch((err) => status(String((err && err.message) || err), true));
  }

  // The only way out of this panel to the file itself. There is no "open with the
  // default app" beside it: chrome.downloads.open() demands a user gesture, and the
  // activation does not survive runtime.sendMessage into the service worker --
  // Chrome answers "User gesture required". Measured, not assumed. Dolphin opens
  // files, so a native messaging host running xdg-open was not worth the moving part.
  const reveal = (it) => act("revealDownload", it, (r) => status("shown " + r.name + " in Dolphin"));

  function del(it) {
    if (!it.exists) { status("that file is already gone", true); return; }
    const ok = confirm(
      "Delete this file from disk?\n\n" + it.filename +
      "\n\nThis is not the bookmark trash — there is no undo.");
    if (!ok) return;
    act("deleteDownloadFile", it, (r) => {
      icons.delete(String(it.id));
      // After the refresh, not before: load() ends in restStatus(), which would
      // wipe the confirmation the moment it appeared.
      load(true).then(() => status("deleted " + r.name));
    });
  }

  // Removing a row moves the cursor to where the eye already is -- the row that
  // takes its place, or the one above if it was last. Falling back to the top of
  // the list, which is what restoreCursor() does for an id that no longer exists,
  // would throw away the position after every single removal.
  function erase(it) {
    const all = rows();
    const at = all.findIndex((r) => r.dataset.id === String(it.id));
    const next = all[at + 1] || all[at - 1] || null;
    const nextId = next ? next.dataset.id : null;
    const keepFocus = listEl.contains(document.activeElement);

    act("eraseDownload", it, (r) => {
      icons.delete(String(it.id));
      cursorId = nextId;
      // The focused row is about to be detached, so hand the focus forward.
      focusOnRender = keepFocus;
      load(true).then(() => status("removed " + r.name + " from the list"));
    });
  }

  function copyPath(it) {
    const text = it.filename;
    if (!text) { status("that download has no path", true); return; }
    const ok = () => status("copied " + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, () => {
        if (fallbackCopy(text)) ok(); else status("could not copy", true);
      });
      return;
    }
    if (fallbackCopy(text)) ok(); else status("could not copy", true);
  }

  // navigator.clipboard can still be refused even on file://, which is a secure
  // context. execCommand works from inside the keydown that asked for the copy.
  // select() moves focus, so put it back or the next j/k goes nowhere.
  function fallbackCopy(text) {
    const was = document.activeElement;
    const ta = SP.el("textarea", { class: "sp-dl-clip" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let done = false;
    try { done = document.execCommand("copy"); } catch { done = false; }
    ta.remove();
    if (was && was.focus) was.focus();
    return done;
  }

  /* ------------------------------------------------------------- navigation */

  function navKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return null;
    switch (e.key) {
      case "ArrowDown": case "j": return 1;
      case "ArrowUp":   case "k": return -1;
      default: return null;
    }
  }

  function attachNavigation() {
    // Clicking focuses as well as acting. Without that, "click a row, then press d"
    // silently does nothing, because the keys only fire while the list has focus.
    listEl.addEventListener("click", (e) => {
      const rowEl = e.target.closest && e.target.closest(".sp-dl-row");
      if (!rowEl) return;
      const it = byId(rowEl.dataset.id);
      if (!it) return;
      focusRow(rowEl);
      if (e.target.closest(".sp-dl-erase")) erase(it);
      else if (e.target.closest(".sp-dl-icon") || e.target.closest(".sp-dl-name")) reveal(it);
    });

    // Bound to the list, not to document: these keys only act while focus is
    // actually inside it, so page/scroll.js keeps j/k everywhere else.
    listEl.addEventListener("keydown", (e) => {
      const rowEl = e.target.closest && e.target.closest(".sp-dl-row");
      if (!rowEl) return;
      const it = byId(rowEl.dataset.id);
      if (!it) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (query) { filterEl.value = ""; query = ""; renderList(); }
        else rowEl.blur();
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); reveal(it); return; }
      if (e.key === "c" && e.ctrlKey) { e.preventDefault(); copyPath(it); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "p") { e.preventDefault(); copyPath(it); return; }
      // "x" removes the row, "d" removes the file. Different blast radius, so they
      // are different keys and only one of them asks first. Delete is the alias
      // that works without Vimium's pass-through rule.
      if (e.key === "x" || e.key === "Delete") { e.preventDefault(); erase(it); return; }
      if (e.key === "d") { e.preventDefault(); del(it); return; }

      const all = rows();
      if (e.key === "Home") { e.preventDefault(); focusRow(all[0]); return; }
      if (e.key === "End")  { e.preventDefault(); focusRow(all[all.length - 1]); return; }

      const step = navKey(e);
      if (step === null) return;
      e.preventDefault();
      const at = all.indexOf(rowEl);
      focusRow(all[Math.min(all.length - 1, Math.max(0, at + step))]);
    });

    // "q" swaps the view. Zen hides every panel including this one, so do not
    // switch into a view that is not on screen; "c" comes back out of zen into
    // whichever view was showing.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "q" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (SP.isTyping(e.target)) return;
      if (root.classList.contains("sp-zen")) return;
      e.preventDefault();
      toggle(!root.classList.contains(VIEW));
    });

    // The way back in after Escape. "e" and "a" are the bookmark panel's two pane
    // entry keys, and its handler bails while its panel is hidden -- so in this view
    // both are free, and both land here because there is only one pane to enter.
    // Without this, Escape is a one-way door: the list is the only thing on screen,
    // so blurring leaves nothing to drive, and Vimium's "f" hints the row buttons,
    // which act on a file instead of putting the cursor on it.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "e" && e.key !== "a") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (SP.isTyping(e.target)) return;
      if (!SP.visible(mount)) return;
      if (listEl.contains(e.target)) return;   // already inside; let j/k have it
      e.preventDefault();
      const target = rows().find((r) => r.dataset.id === cursorId) || rows()[0];
      if (target) focusRow(target);
    });

    // "s" focuses the filter, mirroring the bookmark panel's. Both are bound at the
    // document level and each bails when its own panel is hidden -- exactly one of
    // the two is ever on screen, so there is no ordering dependency between them.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "s" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (SP.isTyping(e.target)) return;
      if (!SP.visible(mount)) return;
      e.preventDefault();
      filterEl.focus();
      filterEl.select();
    });

    // Covers files deleted, or downloads made, while this tab sat in the background.
    window.addEventListener("focus", () => { if (SP.visible(mount)) load(true); });
  }

  function toggle(on) {
    root.classList.toggle(VIEW, on);
    if (!on) {
      if (listEl.contains(document.activeElement)) document.activeElement.blur();
      return;
    }
    // `exists` goes stale while the view is away, and the panel is not loaded at
    // all until the first time it is opened. The rows for the first entry do not
    // exist yet, so hand the focus to the render that load() is about to trigger.
    focusOnRender = true;
    load(loaded);
    const target = rows().find((r) => r.dataset.id === cursorId) || rows()[0];
    if (target) focusRow(target);
  }

  /* ---------------------------------------------------------------- status */

  function status(text, warn) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("sp-status-warn", Boolean(warn));
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(restStatus, 4000);
  }

  // What the status line says when nothing has just happened.
  function restStatus() {
    clearTimeout(statusTimer);
    statusEl.classList.remove("sp-status-warn");
    if (!loaded) { statusEl.textContent = ""; return; }
    const gone = items.filter((it) => !it.exists).length;
    const shown = filtered().length;
    const total = items.length;
    const count = query ? shown + " of " + total : String(total);
    statusEl.textContent =
      count + (total === 1 && !query ? " download" : " downloads") +
      (gone ? " · " + gone + " no longer on disk" : "");
  }
});
