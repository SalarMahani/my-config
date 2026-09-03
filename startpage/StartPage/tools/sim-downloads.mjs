// Run sw.js's downloads handlers against a stubbed chrome.downloads.
//
//   node tools/sim-downloads.mjs
//
// The case this exists for cannot be exercised in a real browser without wrecking
// real state: getFileIcon REJECTS for a file that is no longer on disk. A missing
// icon is the whole feature, so one rejection must come back as null for that id and
// leave the rest of the batch alone -- not fail the batch, not throw.
//
// (There is no open() case here because there is no open handler. Chrome refuses
// downloads.open() without a user gesture, which a service worker reached by
// runtime.sendMessage never has -- verified in the browser, not assumed.)
import fs from "node:fs";

let ITEMS, listener;
let iconCalls = 0;
let shown = [];

// Chrome hands back the full local path, an ISO startTime, and an `exists` flag
// that may be stale -- search() is what schedules the check.
function seed() {
  iconCalls = 0;
  shown = [];
  ITEMS = [
    { id: 1, filename: "/home/albos/Downloads/cv.pdf", exists: true,
      state: "complete", bytesReceived: 2202009, totalBytes: 2202009,
      startTime: "2026-09-03T09:12:00.000Z", finalUrl: "https://example.com/cv.pdf",
      mime: "application/pdf" },
    { id: 2, filename: "/home/albos/Downloads/gone.txt", exists: false,
      state: "complete", bytesReceived: 1024, totalBytes: 1024,
      startTime: "2026-09-02T18:40:00.000Z", finalUrl: "https://example.com/gone.txt",
      mime: "text/plain" },
    { id: 3, filename: "/home/albos/Downloads/half.iso", exists: true,
      state: "in_progress", bytesReceived: 500, totalBytes: 9000,
      startTime: "2026-09-03T10:00:00.000Z", finalUrl: "https://example.com/half.iso",
      mime: "application/octet-stream" },
    { id: 4, filename: "/srv/elsewhere/report.odt", exists: true,
      state: "complete", bytesReceived: 40000, totalBytes: 40000,
      startTime: "2026-08-30T08:00:00.000Z", finalUrl: "https://example.com/r.odt",
      mime: "application/vnd.oasis.opendocument.text" },
    // No extension, and a name that needs no path split at all.
    { id: 5, filename: "/home/albos/Downloads/README", exists: true,
      state: "complete", bytesReceived: 900, totalBytes: 900,
      startTime: "2026-08-30T07:00:00.000Z", finalUrl: "https://example.com/README",
      mime: "text/plain" },
  ];
}

const find = (id) => ITEMS.find((it) => it.id === id) || null;

let REMOVE_ERROR = null;

globalThis.chrome = {
  runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  bookmarks: {},
  history: {},
  downloads: {
    async search(q) {
      if (q && q.id !== undefined) return ITEMS.filter((it) => it.id === q.id).map((x) => ({ ...x }));
      const out = ITEMS.map((x) => ({ ...x }));
      out.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      return out;
    },
    async getFileIcon(id) {
      iconCalls++;
      const it = find(id);
      // This is what Chrome actually does for a file that is not there.
      if (!it || !it.exists) throw new Error("Download must exist");
      return "data:image/png;base64,ICON" + id;
    },
    show(id) { shown.push(id); },
    async removeFile(id) {
      if (REMOVE_ERROR) throw new Error(REMOVE_ERROR);
      find(id).exists = false;
    },
  },
};

new Function(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"))();

const send = (msg) => new Promise((resolve) => listener(msg, null, resolve));
const ok = (c) => (c ? "PASS" : "**FAIL**");
let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${ok(cond)}  ${label}${detail ? "  — " + detail : ""}`);
}

/* ------------------------------------------------------------------ listing */

console.log("=== listing ===");
seed();
{
  const { items } = await send({ type: "downloads" });
  const by = Object.fromEntries(items.map((it) => [it.id, it]));

  check("newest first", items.map((it) => it.id).join(",") === "3,1,2,4,5",
        items.map((it) => it.id).join(","));
  check("name split off the path", by[1].name === "cv.pdf", by[1].name);
  check("home collapsed to ~", by[1].dir === "~/Downloads", by[1].dir);
  check("a path outside home is left alone", by[4].dir === "/srv/elsewhere", by[4].dir);
  check("extensionless name survives", by[5].name === "README", by[5].name);
  check("exists passed through as false", by[2].exists === false, String(by[2].exists));
  check("in-progress state kept", by[3].state === "in_progress", by[3].state);
  check("bytes reported", by[1].bytes === 2202009, String(by[1].bytes));
}

console.log("\n=== a download Chrome has no path for ===");
{
  ITEMS = [{ id: 9, filename: "", exists: false, state: "interrupted",
             bytesReceived: 0, startTime: "2026-09-01T00:00:00.000Z",
             finalUrl: "https://example.com/x", error: "NETWORK_FAILED" }];
  const { items } = await send({ type: "downloads" });
  check("empty path does not throw", items.length === 1);
  check("name is empty, not undefined", items[0].name === "", JSON.stringify(items[0].name));
  check("dir is empty, not undefined", items[0].dir === "", JSON.stringify(items[0].dir));
  check("error carried through", items[0].error === "NETWORK_FAILED", items[0].error);
}

/* -------------------------------------------------------------------- icons */

console.log("\n=== icons ===");
seed();
{
  const { icons } = await send({ type: "downloadIcons", ids: [1, 2, 4] });
  check("one rejection does not fail the batch", Object.keys(icons).length === 3,
        Object.keys(icons).join(","));
  check("present file gets a data URL", icons[1] === "data:image/png;base64,ICON1", icons[1]);
  check("missing file gets null, not a throw", icons[2] === null, String(icons[2]));
  check("the rest of the batch survives", icons[4] === "data:image/png;base64,ICON4", icons[4]);
}

seed();
{
  await send({ type: "downloadIcons", ids: [] });
  check("an empty batch calls nothing", iconCalls === 0, String(iconCalls));
  const r = await send({ type: "downloadIcons", ids: undefined });
  check("a missing ids list is not fatal", r && r.icons && !Object.keys(r.icons).length);
}

seed();
{
  // The panel batches by viewport, so a batch bigger than sw.js's CHUNK must still
  // come back whole rather than being silently truncated at the chunk boundary.
  ITEMS = Array.from({ length: 95 }, (_, i) => ({
    id: i + 1, filename: `/home/albos/Downloads/f${i}.txt`, exists: i % 10 !== 0,
    state: "complete", bytesReceived: 10, startTime: "2026-09-03T09:00:00.000Z",
    finalUrl: "https://example.com/f", mime: "text/plain",
  }));
  const ids = ITEMS.map((it) => it.id);
  const { icons } = await send({ type: "downloadIcons", ids });
  const nulls = ids.filter((id) => icons[id] === null).length;
  check("every id in a 95-wide batch answered", Object.keys(icons).length === 95,
        String(Object.keys(icons).length));
  check("the 10 missing files came back null", nulls === 10, String(nulls));
}

/* ------------------------------------------------------------------ reveal */

console.log("\n=== reveal ===");
seed();
{
  const r = await send({ type: "revealDownload", id: 1 });
  check("reveals an existing file", r.ok === true && shown.join(",") === "1", shown.join(","));
  check("reports the name back", r.name === "cv.pdf", r.name);

  const gone = await send({ type: "revealDownload", id: 2 });
  check("refuses a file that is gone", /no longer on disk/.test(gone.error || ""), gone.error);
  check("and does not call show()", shown.join(",") === "1", shown.join(","));

  const missing = await send({ type: "revealDownload", id: 404 });
  check("refuses an unknown id", /no such download/.test(missing.error || ""), missing.error);
}

/* ------------------------------------------------------------------ delete */

console.log("\n=== delete from disk ===");
seed();
{
  const r = await send({ type: "deleteDownloadFile", id: 1 });
  check("removes the file", r.ok === true && find(1).exists === false);
  check("names what it deleted", r.name === "cv.pdf", r.name);

  const again = await send({ type: "deleteDownloadFile", id: 1 });
  check("refuses a second delete", /already gone/.test(again.error || ""), again.error);

  // The entry must survive with exists:false -- that is the state the row renders
  // as "removed", and it is what makes delete look identical to a manual rm.
  const { items } = await send({ type: "downloads" });
  check("the history entry stays, without its icon",
        items.some((it) => it.id === 1 && it.exists === false));
}

seed();
{
  REMOVE_ERROR = "Download must be complete";
  const r = await send({ type: "deleteDownloadFile", id: 1 });
  REMOVE_ERROR = null;
  check("a refused delete returns {error}", /must be complete/.test(r.error || ""),
        JSON.stringify(r));
  check("and leaves the item alone", find(1).exists === true);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
