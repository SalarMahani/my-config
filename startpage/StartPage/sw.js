// Privileged API broker.
//
// chrome.bookmarks, chrome.history and chrome.downloads are not exposed to content
// scripts -- those only get chrome.storage and chrome.runtime.sendMessage -- so every
// read of them happens here and travels back over a message.

// Bumped by hand when something in here changes shape. Content scripts reload with
// the page, but this worker only reloads when the extension does -- so "I edited
// sw.js and nothing changed" is almost always a stale worker, not a bug. Open the
// service worker console from chrome://extensions and read this line to be sure.
const SW_VERSION = "2026-09-03 downloads+recent30";
console.log("StartPage service worker", SW_VERSION);

const DAY = 86400000;
const CACHE_TTL = 5 * 60 * 1000;

// chrome.history.getVisits is one call per URL, so a busy week would mean
// thousands of round trips. Cap the number of URLs we expand into individual
// visits and tell the UI when the cap was hit, rather than quietly under-reporting.
const URL_CAP = 600;
const CHUNK = 40;

// How many entries "Pick up where you left off" gets. It was 12 while the hour-of-day
// heatmap sat above it; removing that freed ~410px, and a row is ~27px.
const RECENT = 30;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String((err && err.message) || err) }));
  return true; // keep the channel open for the async reply
});

async function handle(msg) {
  switch (msg && msg.type) {
    case "bookmarks":
      return { roots: await getBookmarks() };
    case "tidyLoose":
      return await tidyLoose();
    case "moveNodes":
      return await moveNodes(msg.ids, msg.parentId);
    case "trashNodes":
      return await trashNodes(msg.ids);
    case "removeNodes":
      return await removeNodes(msg.ids);
    case "reorder":
      return await reorder(msg.id, msg.delta);
    case "activity":
      return await getActivity(msg.force);
    case "downloads":
      return { items: await getDownloads() };
    case "downloadIcons":
      return { icons: await getIcons(msg.ids) };
    case "revealDownload":
      return await revealDownload(msg.id);
    case "deleteDownloadFile":
      return await deleteDownloadFile(msg.id);
    case "eraseDownload":
      return await eraseDownload(msg.id);
    default:
      throw new Error("unknown message type: " + JSON.stringify(msg && msg.type));
  }
}

/* ---------------------------------------------------------------- bookmarks */

function prune(node) {
  const out = { id: node.id, title: node.title || "" };
  // parentId and index are what undo restores to; unmodifiable marks nodes the
  // editing UI must refuse (Chrome sets it on managed bookmarks).
  if (node.parentId) out.parentId = node.parentId;
  if (typeof node.index === "number") out.index = node.index;
  if (node.unmodifiable) out.unmodifiable = node.unmodifiable;
  if (node.url) out.url = node.url;
  if (node.children) out.children = node.children.map(prune);
  return out;
}

async function getBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  // tree[0] is the invisible root; its children are "Bookmarks bar", "Other
  // bookmarks" and "Mobile bookmarks".
  return (tree[0].children || []).map(prune);
}

/* -------------------------------------------------------------- tidy loose */

// Bookmarks bar and Other bookmarks. Mobile bookmarks is left alone.
const BAR_ID = "1";
const LOOSE_ROOTS = [BAR_ID, "302"];

// Move every link sitting directly at a root -- filed in no folder at all -- into a
// single "extra" folder on the bookmarks bar.
//
// This edits the user's real bookmarks and empties Chrome's bookmarks strip, so it
// runs only from an explicit, confirmed button press, never on page load.
// Find a folder by name directly on the bookmarks bar, or make one. Shared by the
// "extra" tidy and by trash, so neither can end up with a duplicate on a repeat run.
async function findOrCreate(title) {
  const bar = await chrome.bookmarks.getSubTree(BAR_ID);
  const existing = ((bar[0] && bar[0].children) || []).find(
    (c) => !c.url && (c.title || "").trim().toLowerCase() === title,
  );
  return existing || chrome.bookmarks.create({ parentId: BAR_ID, title });
}

async function tidyLoose() {
  // Re-read the tree rather than trusting ids the panel captured when it rendered;
  // bookmarks may have changed in between.
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children || [];

  const loose = [];
  for (const root of roots) {
    if (!LOOSE_ROOTS.includes(root.id)) continue;
    for (const child of root.children || []) {
      if (child.url) loose.push(child.id);
    }
  }
  if (!loose.length) return { moved: 0, attempted: 0, folderId: null };

  const folder = await findOrCreate("extra");

  // Sequentially, so the moved links keep their original relative order.
  let moved = 0;
  const failed = [];
  for (const id of loose) {
    try {
      await chrome.bookmarks.move(id, { parentId: folder.id });
      moved++;
    } catch (err) {
      failed.push(id);
    }
  }

  return { moved, attempted: loose.length, failed: failed.length, folderId: folder.id };
}

/* ------------------------------------------------------------------ editing */

// Chrome refuses to move or remove these, so the UI must never offer to.
const PROTECTED = new Set([BAR_ID, "302", "340"]);

// Everything here is expressed as a move, including delete -- which is why undo is
// uniform: put each node back at the {parentId, index} recorded before the write.
async function snapshot(ids) {
  const nodes = await chrome.bookmarks.get(ids).catch(() => []);
  return nodes.map((n) => ({ id: n.id, parentId: n.parentId, index: n.index }));
}

function refuse(reason) {
  return { moved: 0, failed: 0, refused: reason };
}

async function guard(ids) {
  for (const id of ids) {
    if (PROTECTED.has(id)) return "Bookmarks bar, Other and Mobile cannot be moved";
  }
  const nodes = await chrome.bookmarks.get(ids).catch(() => []);
  for (const n of nodes) {
    if (n.unmodifiable) return `"${n.title}" is managed and cannot be changed`;
  }
  return null;
}

// True if `parentId` is `id` itself or sits underneath it. Chrome rejects such a
// move anyway, but catching it here produces a usable message instead of an error.
async function isSelfOrDescendant(id, parentId) {
  let cursor = parentId;
  while (cursor) {
    if (cursor === id) return true;
    const [node] = await chrome.bookmarks.get(cursor).catch(() => []);
    if (!node || !node.parentId) return false;
    cursor = node.parentId;
  }
  return false;
}

async function moveNodes(ids, parentId) {
  if (!ids || !ids.length) return refuse("nothing to paste");
  const bad = await guard(ids);
  if (bad) return refuse(bad);

  const [target] = await chrome.bookmarks.get(parentId).catch(() => []);
  if (!target || target.url) return refuse("the paste target is not a folder");

  for (const id of ids) {
    if (await isSelfOrDescendant(id, parentId)) {
      return refuse("a folder cannot be moved inside itself");
    }
  }

  const undo = await snapshot(ids);
  let moved = 0;
  let failed = 0;
  // Sequentially, so the pasted items keep their relative order.
  for (const id of ids) {
    try { await chrome.bookmarks.move(id, { parentId }); moved++; }
    catch { failed++; }
  }
  return { moved, failed, undo, targetTitle: target.title };
}

async function trashNodes(ids) {
  if (!ids || !ids.length) return refuse("nothing to delete");
  const bad = await guard(ids);
  if (bad) return refuse(bad);

  const folder = await findOrCreate("trash");
  for (const id of ids) {
    if (await isSelfOrDescendant(id, folder.id)) {
      return refuse("that folder already contains trash");
    }
  }

  const undo = await snapshot(ids);
  let moved = 0;
  let failed = 0;
  for (const id of ids) {
    try { await chrome.bookmarks.move(id, { parentId: folder.id }); moved++; }
    catch { failed++; }
  }
  return { moved, failed, undo, targetTitle: "trash" };
}

// The only genuinely destructive path. The UI reaches it solely from inside trash.
async function removeNodes(ids) {
  if (!ids || !ids.length) return refuse("nothing to remove");
  const bad = await guard(ids);
  if (bad) return refuse(bad);

  let removed = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      // remove() only accepts bookmarks and EMPTY folders.
      if (node.url) await chrome.bookmarks.remove(id);
      else await chrome.bookmarks.removeTree(id);
      removed++;
    } catch { failed++; }
  }
  return { removed, failed, undo: null };
}

// Nudge one node up or down inside its own folder.
async function reorder(id, delta) {
  if (PROTECTED.has(id)) return refuse("that folder cannot be reordered");

  const [node] = await chrome.bookmarks.get(id).catch(() => []);
  if (!node) return refuse("no such bookmark");
  if (node.unmodifiable) return refuse("that bookmark is managed");

  const siblings = await chrome.bookmarks.getChildren(node.parentId);
  const from = siblings.findIndex((s) => s.id === id);
  const to = from + delta;
  if (to < 0 || to >= siblings.length) return refuse("already at the end");

  const undo = [{ id, parentId: node.parentId, index: from }];

  // Known Chrome quirk: moving to a HIGHER index within the same parent lands one
  // short of the index asked for, because the node is removed before reinsertion.
  // Firefox does not do this. Compensate, then verify -- this is buggy ground and
  // the behaviour could change, so do not trust the arithmetic alone.
  await chrome.bookmarks.move(id, { index: delta > 0 ? to + 1 : to });

  const after = await chrome.bookmarks.getChildren(node.parentId);
  const landed = after.findIndex((s) => s.id === id);
  if (landed !== to) {
    await chrome.bookmarks.move(id, { index: landed > to ? to : to + 1 });
  }

  const final = await chrome.bookmarks.getChildren(node.parentId);
  return { moved: 1, failed: 0, undo, index: final.findIndex((s) => s.id === id) };
}

/* ----------------------------------------------------------------- activity */

async function getActivity(force) {
  if (!force) {
    const { activityCache } = await chrome.storage.local.get("activityCache");
    if (activityCache && Date.now() - activityCache.builtAt < CACHE_TTL) {
      return Object.assign({}, activityCache, { cached: true });
    }
  }
  const data = await buildActivity();
  await chrome.storage.local.set({ activityCache: data });
  return data;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function buildActivity() {
  const now = Date.now();
  const weekStart = now - 7 * DAY;

  const items = await chrome.history.search({
    text: "",
    startTime: weekStart,
    endTime: now,
    maxResults: 10000,
  });
  items.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));

  const considered = items.slice(0, URL_CAP);
  const truncated = items.length > URL_CAP;

  // Expand each URL into its individual visits, so hour-of-day is real rather
  // than inferred from lastVisitTime.
  const visits = [];
  for (let i = 0; i < considered.length; i += CHUNK) {
    const chunk = considered.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((it) => chrome.history.getVisits({ url: it.url }).catch(() => [])),
    );
    results.forEach((visitList, j) => {
      for (const v of visitList) {
        if (v.visitTime >= weekStart && v.visitTime <= now) {
          visits.push({ t: v.visitTime, url: chunk[j].url, title: chunk[j].title || "" });
        }
      }
    });
  }

  return {
    builtAt: now,
    truncated,
    urlsConsidered: considered.length,
    urlsTotal: items.length,
    topDomains: topDomains(visits),
    today: todayCounters(visits, now),
    recent: items.slice(0, RECENT).map((it) => ({
      url: it.url,
      title: it.title || it.url,
      lastVisitTime: it.lastVisitTime,
    })),
  };
}

function topDomains(visits) {
  const counts = new Map();
  for (const v of visits) {
    const d = domainOf(v.url);
    if (!d) continue;
    const entry = counts.get(d) || { domain: d, count: 0, sampleUrl: v.url };
    entry.count++;
    counts.set(d, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function todayCounters(visits, now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();

  const todays = visits.filter((v) => v.t >= startMs);
  const domains = new Set();
  for (const v of todays) {
    const d = domainOf(v.url);
    if (d) domains.add(d);
  }

  // The week window is exactly 7 days, so the divisor is a constant.
  return {
    pages: todays.length,
    domains: domains.size,
    weekAveragePerDay: Math.round(visits.length / 7),
  };
}

/* ---------------------------------------------------------------- downloads */

// DownloadItem.filename is the full local path. The panel wants the two halves
// separately, and "~" rather than the literal home directory -- the rows are narrow
// and /home/albos is the same eleven characters on every one of them.
const HOME = "/home/albos";

function splitPath(filename) {
  const path = filename || "";
  const cut = path.lastIndexOf("/");
  const dir = cut < 0 ? "" : path.slice(0, cut);
  return {
    name: cut < 0 ? path : path.slice(cut + 1),
    dir: dir === HOME ? "~" : dir.startsWith(HOME + "/") ? "~" + dir.slice(HOME.length) : dir,
  };
}

// `exists` is deliberately passed through as Chrome reports it, stale or not.
// Chrome does not watch the filesystem: calling search() is itself what schedules
// the existence check, and the corrected value only shows up on a LATER search.
// That is why the panel searches again shortly after its first render rather than
// trusting this first answer.
async function getDownloads() {
  // limit:0 means "all". Leaving it out does NOT -- DownloadQuery.limit defaults to
  // 1000, which would silently truncate a long history with nothing to show for it.
  const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 0 });
  return items.map((it) => {
    const { name, dir } = splitPath(it.filename);
    return {
      id: it.id,
      filename: it.filename || "",
      name,
      dir,
      exists: it.exists !== false,
      state: it.state,
      bytes: it.bytesReceived || it.fileSize || 0,
      total: it.totalBytes || 0,
      startTime: it.startTime,
      url: it.finalUrl || it.url || "",
      mime: it.mime || "",
      error: it.error || null,
    };
  });
}

// One IPC and one file stat per icon, so the panel asks only for the rows that have
// actually been scrolled into view, in batches. A file that has since been deleted
// makes this reject; that id comes back null and the row simply renders without an
// icon, which is the whole point -- it is the missing icon that says "file is gone".
async function getIcons(ids) {
  const wanted = (ids || []).slice();
  const out = {};
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((id) =>
        chrome.downloads.getFileIcon(id, { size: 32 }).catch(() => null)),
    );
    chunk.forEach((id, j) => { out[id] = results[j] || null; });
  }
  return out;
}

// show() hands the path to the desktop's file manager. On this machine that is
// Dolphin, via a user-level org.freedesktop.FileManager1 D-Bus service -- Chrome
// itself has no say in which file manager is used. See docs/startpage-guide.md.
//
// There is deliberately no "open with the default app" alongside this.
// chrome.downloads.open() demands a user gesture, and the activation does NOT
// survive runtime.sendMessage into a service worker -- Chrome answers "User gesture
// required", which was measured, not assumed. Nothing inside an extension can
// supply one from a keypress on a page, so opening would need a native messaging
// host running xdg-open. Not worth a second moving part; Dolphin opens files.
async function revealDownload(id) {
  const [item] = await chrome.downloads.search({ id });
  if (!item) return { error: "no such download" };
  if (item.exists === false) return { error: "that file is no longer on disk" };
  chrome.downloads.show(id);   // returns void, and never reports failure
  return { ok: true, name: splitPath(item.filename).name };
}

// Drops the history entry and leaves the file alone -- the ✕ on Chrome's own
// downloads page. Irreversible in the sense that Chrome cannot recreate an entry,
// but it costs nothing on disk, which is why this one does not ask first and
// deleteDownloadFile does.
async function eraseDownload(id) {
  const [item] = await chrome.downloads.search({ id });
  if (!item) return { error: "no such download" };
  // Name it before erasing: after the erase there is nothing left to look up.
  const name = splitPath(item.filename).name || item.finalUrl || "that entry";
  const erased = await chrome.downloads.erase({ id });
  if (!erased || !erased.length) return { error: "chrome kept that entry" };
  return { ok: true, name };
}

// Deletes the real file. The confirm() is in the panel. This leaves the history
// entry in place with exists:false, which is already how a missing file renders --
// so the row stays put and simply loses its icon.
async function deleteDownloadFile(id) {
  const [item] = await chrome.downloads.search({ id });
  if (!item) return { error: "no such download" };
  if (item.exists === false) return { error: "that file is already gone" };
  try {
    await chrome.downloads.removeFile(id);
    return { ok: true, name: splitPath(item.filename).name };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}
