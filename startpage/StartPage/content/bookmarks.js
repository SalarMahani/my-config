// The bookmark panel: a folder rail on the left, the selected folder's links as a
// multi-column grid on the right.
//
// This replaced a collapsible tree. The tree was the wrong shape for the data: 414
// of the 439 links sit at depth 1-3, so the hierarchy is shallow and wide, and a
// single indented column on a 1366x768 screen showed about 14 rows at a time.
// A rail plus a grid puts anything two clicks away and uses the full width.

SP.whenReady(() => {
  const mount = document.getElementById("bookmarks");
  if (!mount) return;

  const SEL_KEY = "selectedFolder";
  const EXP_KEY = "expandedFolders";
  const LOOSE_ROOTS = ["1", "302"];   // Bookmarks bar, Other bookmarks

  let roots = [];
  const byId = new Map();             // id -> { node, parentId, path[] }
  let selected = null;
  let expanded = {};                  // id -> bool
  let query = "";

  let railEl, contentEl, filterEl, headEl;

  load();

  function load() {
    Promise.all([
      SP.send("bookmarks"),
      chrome.storage.local.get([SEL_KEY, EXP_KEY]),
    ]).then(([res, stored]) => {
      if (!res || res.error) throw new Error((res && res.error) || "no response");
      roots = res.roots;
      expanded = stored[EXP_KEY] || {};
      buildIndex();
      selected = byId.has(stored[SEL_KEY]) ? stored[SEL_KEY] : firstRootId();
      render();
    }).catch((err) => SP.fail(mount, err));
  }

  /* ------------------------------------------------------------- the index */

  function buildIndex() {
    byId.clear();
    const walk = (node, parentId, path) => {
      if (node.url) return;
      byId.set(node.id, { node, parentId, path });
      for (const child of node.children || []) {
        walk(child, node.id, path.concat(folderName(node)));
      }
    };
    for (const root of roots) walk(root, null, []);
  }

  const folderName = (n) => (n.title || "").trim() || "(untitled)";

  function countLinks(node) {
    if (node.url) return 1;
    return (node.children || []).reduce((n, c) => n + countLinks(c), 0);
  }

  function firstRootId() {
    const r = roots.find((x) => countLinks(x) > 0);
    return r ? r.id : null;
  }

  // Links filed at a root with no folder of their own.
  function looseCount() {
    let n = 0;
    for (const root of roots) {
      if (!LOOSE_ROOTS.includes(root.id)) continue;
      n += (root.children || []).filter((c) => c.url).length;
    }
    return n;
  }

  function allLinks() {
    const out = [];
    const walk = (node, path) => {
      for (const child of node.children || []) {
        if (child.url) out.push({ node: child, path });
        else walk(child, path.concat(folderName(child)));
      }
    };
    for (const root of roots) walk(root, [folderName(root)]);
    return out;
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    mount.textContent = "";

    filterEl = SP.el("input", {
      class: "sp-filter",
      type: "search",
      placeholder: "Filter all bookmarks — press s",
      autocomplete: "off",
      spellcheck: "false",
    });
    filterEl.addEventListener("input", () => {
      query = filterEl.value.trim().toLowerCase();
      renderContent();
    });
    filterEl.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      filterEl.value = "";
      query = "";
      renderContent();
      filterEl.blur();
    });

    headEl = SP.el("div", { class: "sp-panel-head" }, [
      SP.el("h2", { text: "Bookmarks" }),
      SP.el("div", { class: "sp-head-tools" }, [tidyButton(), filterEl]),
    ]);

    railEl = SP.el("div", { class: "sp-rail" });
    contentEl = SP.el("div", { class: "sp-content" });

    mount.appendChild(headEl);
    mount.appendChild(SP.el("div", { class: "sp-bm" }, [railEl, contentEl]));

    renderRail();
    renderContent();
    attachNavigation();

    // "s" is free in Vimium's default mappings; "/" is not -- it opens find mode.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "s" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (SPTyping(e.target)) return;
      // Zen mode hides this panel; do not focus an input the user cannot see.
      if (document.documentElement.classList.contains("sp-zen")) return;
      e.preventDefault();
      filterEl.focus();
      filterEl.select();
    });

    // "e" -> folder rail, "a" -> link grid. a/e/q are the only free letters left:
    // Vimium reserves j k h l G d u r R p P i v V f F / n N * # o O T b B H L K J
    // ^ W t x X m ` ?, and c/s/w/./, are already ours.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "e" && e.key !== "a") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (SPTyping(e.target)) return;
      if (document.documentElement.classList.contains("sp-zen")) return;
      e.preventDefault();
      if (e.key === "e") focusRailRow(currentRailRow());
      else focusLink(gridLinks()[0]);
    });
  }

  const SPTyping = (t) => Boolean(t && (
    t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));

  /* ------------------------------------------------------------------ rail */

  function renderRail() {
    railEl.textContent = "";
    for (const root of roots) {
      if (countLinks(root) === 0) continue;   // Mobile bookmarks is empty
      addRailRow(root, 0);
    }
  }

  function addRailRow(node, depth) {
    const subfolders = (node.children || []).filter((c) => !c.url);
    // Roots start expanded: a rail showing two collapsed rows tells you nothing,
    // and seeing the folders is the entire point of it.
    const isOpen = Object.prototype.hasOwnProperty.call(expanded, node.id)
      ? expanded[node.id] === true
      : depth === 0;

    const row = SP.el("div", {
      class: "sp-rail-row" + (node.id === selected ? " selected" : ""),
      "data-depth": String(depth),
      "data-id": node.id,
      // Roving tabindex: -1 keeps rows reachable by script without making Tab walk
      // all 44 of them. focusRailRow() promotes the current one to 0.
      tabindex: "-1",
      title: folderName(node),
    });

    // The twisty expands without selecting, so the rail can be explored without
    // losing what is currently shown on the right.
    if (subfolders.length) {
      const twisty = SP.el("button", {
        class: "sp-twisty" + (isOpen ? " open" : ""),
        type: "button",
        "aria-label": isOpen ? "Collapse" : "Expand",
        text: "▸",
      });
      twisty.addEventListener("click", (e) => {
        e.stopPropagation();
        setExpanded(node.id, !isOpen);
      });
      row.appendChild(twisty);
    } else {
      row.appendChild(SP.el("span", { class: "sp-twisty sp-twisty-empty" }));
    }

    row.appendChild(SP.el("span", { class: "sp-rail-name", text: folderName(node) }));
    row.appendChild(SP.el("span", {
      class: "sp-rail-count",
      text: String(countLinks(node)),
    }));

    row.addEventListener("click", () => selectFolder(node.id));

    railEl.appendChild(row);

    if (isOpen) {
      for (const sub of subfolders) addRailRow(sub, depth + 1);
    }
  }

  /* --------------------------------------------------------------- content */

  function renderContent() {
    contentEl.textContent = "";
    contentEl.scrollTop = 0;
    if (query) { renderSearch(); return rove(); }

    const entry = byId.get(selected);
    if (!entry) {
      contentEl.appendChild(SP.el("p", { class: "sp-note", text: "Nothing selected." }));
      return;
    }
    const node = entry.node;
    const direct = (node.children || []).filter((c) => c.url);
    const subfolders = (node.children || []).filter((c) => !c.url);

    contentEl.appendChild(SP.el("div", { class: "sp-crumb" }, [
      SP.el("span", { class: "sp-crumb-path", text: entry.path.concat(folderName(node)).join(" › ") }),
      SP.el("span", { class: "sp-crumb-count", text: countLinks(node) + " links" }),
    ]));

    if (direct.length) contentEl.appendChild(linkGrid(direct));

    // Subfolders are shown inline as labelled groups rather than forcing a
    // drill-down, so selecting ALL shows all 199 organised in one place.
    for (const sub of subfolders) {
      if (countLinks(sub) === 0) continue;
      const links = collect(sub);
      contentEl.appendChild(SP.el("h3", { class: "sp-group" }, [
        SP.el("span", { text: folderName(sub) }),
        SP.el("span", { class: "sp-group-count", text: String(links.length) }),
      ]));
      contentEl.appendChild(linkGrid(links));
    }

    if (!direct.length && !subfolders.length) {
      contentEl.appendChild(SP.el("p", { class: "sp-note", text: "This folder is empty." }));
    }
    rove();
  }

  // Only the first link is a tab stop; the rest are script-focusable only.
  function rove() {
    gridLinks().forEach((a, i) => { a.tabIndex = i === 0 ? 0 : -1; });
  }

  // Every link at or below a node, flattened.
  function collect(node) {
    const out = [];
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.url) out.push(c); else walk(c);
      }
    };
    walk(node);
    return out;
  }

  function linkGrid(nodes) {
    const grid = SP.el("div", { class: "sp-grid" });
    for (const n of nodes) grid.appendChild(SP.link(n.url, n.title));
    return grid;
  }

  function renderSearch() {
    const hits = allLinks().filter(({ node }) =>
      (node.title || "").toLowerCase().includes(query) ||
      (node.url || "").toLowerCase().includes(query));

    contentEl.appendChild(SP.el("div", { class: "sp-crumb" }, [
      SP.el("span", { class: "sp-crumb-path", text: "Search: " + filterEl.value.trim() }),
      SP.el("span", { class: "sp-crumb-count", text: hits.length + " matches" }),
    ]));

    if (!hits.length) {
      contentEl.appendChild(SP.el("p", { class: "sp-note", text: "No bookmarks match." }));
      return;
    }

    const grid = SP.el("div", { class: "sp-grid" });
    for (const hit of hits) {
      const link = SP.link(hit.node.url, hit.node.title);
      // Where it lives matters once results span every folder.
      link.appendChild(SP.el("span", { class: "sp-hit-path", text: hit.path.join(" › ") }));
      grid.appendChild(link);
    }
    contentEl.appendChild(grid);
  }


  /* ---------------------------------------------------- keyboard navigation */

  // Driven by real DOM focus rather than a global key grab: the arrow handlers live
  // on the two panes, so they only fire when focus is actually inside one and the
  // page scrolls normally everywhere else. Nothing here races Vimium's own listener.
  //
  // Arrows and hjkl are accepted interchangeably. Arrows work as-is -- Vimium binds
  // none of them. hjkl reach the page only once Vimium is given a pass-through rule
  // for this URL (Options -> Excluded URLs and keys), since it binds them to scroll.

  function navKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return null;
    switch (e.key) {
      case "ArrowDown":  case "j": return "down";
      case "ArrowUp":    case "k": return "up";
      case "ArrowLeft":  case "h": return "left";
      case "ArrowRight": case "l": return "right";
      default: return null;
    }
  }

  const railRows  = () => [...railEl.querySelectorAll(".sp-rail-row")];
  const gridLinks = () => [...contentEl.querySelectorAll(".sp-link")];

  function focusRailRow(row) {
    if (!row) return;
    for (const r of railRows()) r.tabIndex = -1;
    row.tabIndex = 0;
    row.focus();
    row.scrollIntoView({ block: "nearest" });
    selectFolder(row.dataset.id);   // live preview as the cursor moves
  }

  function focusLink(link) {
    if (!link) return;
    for (const a of gridLinks()) a.tabIndex = -1;
    link.tabIndex = 0;
    link.focus();
    link.scrollIntoView({ block: "nearest" });
  }

  function selectFolder(id) {
    if (!id || id === selected) return;
    selected = id;
    chrome.storage.local.set({ [SEL_KEY]: selected });
    // Re-tag rather than re-render the rail: renderRail() would destroy focus.
    for (const r of railRows()) r.classList.toggle("selected", r.dataset.id === id);
    renderContent();
  }

  function setExpanded(id, want) {
    expanded[id] = want;
    chrome.storage.local.set({ [EXP_KEY]: expanded });
    renderRail();
    // The rail was rebuilt, so the old node is gone -- find the row again by id.
    const again = railRows().find((r) => r.dataset.id === id);
    if (again) { again.tabIndex = 0; again.focus(); again.scrollIntoView({ block: "nearest" }); }
  }

  const currentRailRow = () =>
    railEl.querySelector(".sp-rail-row.selected") || railRows()[0];

  function hasSubfolders(id) {
    const entry = byId.get(id);
    return Boolean(entry && (entry.node.children || []).some((c) => !c.url));
  }

  function isExpanded(id, depth) {
    return Object.prototype.hasOwnProperty.call(expanded, id)
      ? expanded[id] === true
      : depth === 0;
  }

  // Called from render(), once railEl and contentEl actually exist.
  function attachNavigation() {
  railEl.addEventListener("keydown", (e) => {
    const row = e.target.closest && e.target.closest(".sp-rail-row");
    if (!row) return;

    if (e.key === "Escape") { row.blur(); e.preventDefault(); return; }
    if (e.key === "Enter")  { selectFolder(row.dataset.id); e.preventDefault(); return; }
    if (e.key === "Tab" && !e.shiftKey) { focusLink(gridLinks()[0]); e.preventDefault(); return; }

    const dir = navKey(e);
    if (!dir) return;
    e.preventDefault();

    const rows = railRows();
    const i = rows.indexOf(row);
    const id = row.dataset.id;
    const depth = Number(row.dataset.depth);

    if (dir === "down") focusRailRow(rows[i + 1]);
    else if (dir === "up") focusRailRow(rows[i - 1]);
    else if (dir === "right") {
      if (hasSubfolders(id) && !isExpanded(id, depth)) setExpanded(id, true);
      else focusLink(gridLinks()[0]);
    } else {
      if (hasSubfolders(id) && isExpanded(id, depth)) setExpanded(id, false);
      else {
        // Walk back to the nearest shallower row -- the parent folder.
        for (let n = i - 1; n >= 0; n--) {
          if (Number(rows[n].dataset.depth) < depth) { focusRailRow(rows[n]); break; }
        }
      }
    }
  });

  contentEl.addEventListener("keydown", (e) => {
    const link = e.target.closest && e.target.closest(".sp-link");
    if (!link) return;

    if (e.key === "Escape") { link.blur(); e.preventDefault(); return; }
    if (e.key === "Enter" && e.ctrlKey) {
      window.open(link.href, "_blank");
      e.preventDefault();
      return;
    }

    const dir = navKey(e);
    if (!dir) return;
    e.preventDefault();

    const all = gridLinks();
    const i = all.indexOf(link);

    if (dir === "right") focusLink(all[i + 1]);
    else if (dir === "left") {
      if (i === 0) focusRailRow(currentRailRow());
      else focusLink(all[i - 1]);
    } else {
      focusLink(verticalNeighbour(link, dir === "down" ? 1 : -1));
    }
  });
  }

  // Vertical movement is geometric, not index arithmetic. The grid is
  // repeat(auto-fill, ...) so the column count changes with width, and .sp-content
  // holds several separate .sp-grid blocks split by .sp-group headings -- so
  // "index +/- columnCount" would be wrong at every group boundary and on the
  // ragged last row of each block. Find the nearest row line in the direction of
  // travel, then the link in it closest horizontally.
  function verticalNeighbour(current, step) {
    const rect = current.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;

    const ahead = gridLinks().filter((el) => {
      const b = el.getBoundingClientRect();
      return step > 0 ? b.top > rect.top + 2 : b.top < rect.top - 2;
    });
    if (!ahead.length) return null;

    const tops = ahead.map((el) => el.getBoundingClientRect().top);
    const line = step > 0 ? Math.min(...tops) : Math.max(...tops);

    let best = null;
    let bestDistance = Infinity;
    for (const el of ahead) {
      const b = el.getBoundingClientRect();
      if (Math.abs(b.top - line) > 2) continue;
      const d = Math.abs(b.left + b.width / 2 - centre);
      if (d < bestDistance) { bestDistance = d; best = el; }
    }
    return best;
  }

  /* ------------------------------------------------------- tidy loose links */

  function tidyButton() {
    const n = looseCount();
    if (!n) return null;

    const btn = SP.el("button", {
      class: "sp-tidy",
      type: "button",
      title: "Move links that are filed in no folder into a new \"extra\" folder",
      text: "Tidy " + n + " loose → extra",
    });

    btn.addEventListener("click", () => {
      // This edits real bookmarks and empties Chrome's bookmarks strip, so it is
      // never silent -- it is a click plus a confirmation.
      const ok = window.confirm(
        "Move " + n + " loose bookmarks into a folder called \"extra\"?\n\n" +
        "These are the links filed directly in Bookmarks bar and Other bookmarks. " +
        "Chrome's bookmarks strip under the address bar will become empty, since " +
        "those links are what fill it.\n\nThis changes your real bookmarks.");
      if (!ok) return;

      btn.disabled = true;
      btn.textContent = "Moving…";
      SP.send("tidyLoose").then((res) => {
        if (!res || res.error) throw new Error((res && res.error) || "no response");
        load();   // refetch the tree and redraw with "extra" in place
      }).catch((err) => {
        btn.disabled = false;
        btn.textContent = "Failed — retry";
        console.error("tidyLoose failed:", err);
      });
    });

    return btn;
  }
});
