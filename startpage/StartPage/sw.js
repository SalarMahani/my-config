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
    case "activity":
      return await getActivity(msg.force);
    default:
      throw new Error("unknown message type: " + JSON.stringify(msg && msg.type));
  }
}

/* ---------------------------------------------------------------- bookmarks */

function prune(node) {
  const out = { id: node.id, title: node.title || "" };
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

  // Reuse an existing "extra" rather than making a second one on a repeat run.
  const bar = roots.find((r) => r.id === BAR_ID);
  const existing = (bar ? bar.children || [] : []).find(
    (c) => !c.url && (c.title || "").trim().toLowerCase() === "extra",
  );
  const folder = existing || await chrome.bookmarks.create({
    parentId: BAR_ID,
    title: "extra",
  });

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
