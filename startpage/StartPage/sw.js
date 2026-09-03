// Privileged API broker.
//
// chrome.bookmarks and chrome.history are not exposed to content scripts -- those
// only get chrome.storage and chrome.runtime.sendMessage -- so every read of them
// happens here and travels back over a message.

const DAY = 86400000;
const CACHE_TTL = 5 * 60 * 1000;

// chrome.history.getVisits is one call per URL, so a busy week would mean
// thousands of round trips. Cap the number of URLs we expand into individual
// visits and tell the UI when the cap was hit, rather than quietly under-reporting.
const URL_CAP = 600;
const CHUNK = 40;

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
    heatmap: heatmap(visits),
    today: todayCounters(visits, now),
    recent: items.slice(0, 12).map((it) => ({
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

// 7 rows (Sun..Sat) x 24 columns, counting visits per cell.
function heatmap(visits) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const v of visits) {
    const d = new Date(v.t);
    grid[d.getDay()][d.getHours()]++;
  }
  return grid;
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
