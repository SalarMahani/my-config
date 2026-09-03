// Run sw.js's editing handlers against a stubbed chrome.bookmarks.
//
//   node tools/sim-bookmarks.mjs
//
// The point of the stub is that it can reproduce Chrome's real move() quirk: moving
// to a HIGHER index within the same parent lands one short of the index asked for,
// because the node is removed before being reinserted. Firefox does not do this.
// Every reorder case runs twice -- once against the quirky model and once against
// the correct one -- so the compensation in sw.js is proven to converge either way,
// which a stub that only implements one of them could never show.
import fs from "node:fs";

let QUIRK = true;
let TREE, listener;

function seed() {
  const mk = (id, title, url, children) => ({ id, title, url, children });
  TREE = [{
    id: "0", title: "", children: [
      { id: "1", title: "Bookmarks bar", children: [
        { id: "10", title: "ALL", children: [
          { id: "100", title: "GERMAN", children: [
            mk("1000", "a", "https://a"), mk("1001", "b", "https://b"),
            mk("1002", "c", "https://c"), mk("1003", "d", "https://d"),
          ] },
          { id: "101", title: "MOVIE", children: [mk("1010", "m", "https://m")] },
        ] },
        { id: "11", title: "tools", children: [mk("110", "t", "https://t")] },
      ] },
      { id: "302", title: "Other bookmarks", children: [mk("3020", "o", "https://o")] },
      { id: "340", title: "Mobile bookmarks", children: [] },
    ],
  }];
  reindexAll();
}

function walk(nodes, fn, parent) {
  for (const n of nodes) { fn(n, parent); if (n.children) walk(n.children, fn, n); }
}
function reindexAll() {
  walk(TREE, (n, p) => { if (p) { n.parentId = p.id; n.index = p.children.indexOf(n); } });
}
function find(id) {
  let hit = null;
  walk(TREE, (n, p) => { if (n.id === id) hit = { node: n, parent: p }; });
  return hit;
}
const clone = (n) => JSON.parse(JSON.stringify(n));

globalThis.chrome = {
  runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  bookmarks: {
    async get(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      const out = list.map((id) => find(id)).filter(Boolean).map((h) => clone(h.node));
      if (!out.length) throw new Error("not found");
      return out;
    },
    async getChildren(id) {
      const h = find(id);
      return (h && h.node.children ? h.node.children : []).map(clone);
    },
    async getSubTree(id) { const h = find(id); return h ? [clone(h.node)] : []; },
    async getTree() { return clone(TREE); },
    async create({ parentId, title }) {
      const p = find(parentId);
      const node = { id: "n" + Math.random().toString(36).slice(2, 7), title, children: [] };
      p.node.children.push(node);
      reindexAll();
      return clone(node);
    },
    async move(id, dest) {
      const h = find(id);
      if (!h) throw new Error("not found");
      const from = h.parent.children;
      const sameParent = !dest.parentId || dest.parentId === h.parent.id;
      const target = sameParent ? h.parent : find(dest.parentId).node;
      const oldIndex = from.indexOf(h.node);

      from.splice(oldIndex, 1);
      let index = dest.index;
      if (index == null || index > target.children.length) index = target.children.length;
      // Chrome's quirk: the requested index is interpreted against the list AFTER
      // removal, so a downward move within one parent lands one short.
      else if (QUIRK && sameParent && index > oldIndex) index = index - 1;
      target.children.splice(index, 0, h.node);
      reindexAll();
      return clone(h.node);
    },
    async remove(id) {
      const h = find(id);
      if (h.node.children && h.node.children.length) throw new Error("folder not empty");
      h.parent.children.splice(h.parent.children.indexOf(h.node), 1);
      reindexAll();
    },
    async removeTree(id) {
      const h = find(id);
      h.parent.children.splice(h.parent.children.indexOf(h.node), 1);
      reindexAll();
    },
  },
};

new Function(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"))();

const send = (msg) => new Promise((resolve) => listener(msg, null, resolve));
const names = (id) => (find(id).node.children || []).map((c) => c.title).join(",");
const ok = (c) => (c ? "PASS" : "**FAIL**");
let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${ok(cond)}  ${label}${detail ? "  — " + detail : ""}`);
}

console.log("=== reorder, against BOTH index models ===");
for (const quirk of [true, false]) {
  QUIRK = quirk;
  seed();
  console.log(`\n  chrome index quirk: ${quirk ? "ON (real Chrome)" : "OFF (correct)"}`);
  await send({ type: "reorder", id: "1000", delta: 1 });
  check("move 'a' down one", names("100") === "b,a,c,d", names("100"));
  await send({ type: "reorder", id: "1000", delta: 1 });
  check("move 'a' down again", names("100") === "b,c,a,d", names("100"));
  await send({ type: "reorder", id: "1000", delta: -1 });
  check("move 'a' back up", names("100") === "b,a,c,d", names("100"));
  await send({ type: "reorder", id: "1001", delta: -1 });   // 'b' to the top
  const atTop = await send({ type: "reorder", id: "1001", delta: -1 });
  check("refuses past the top", /already at the end/.test(atTop.refused || ""),
        atTop.refused || "NOT REFUSED");
  const last = names("100").split(",").pop();
  const bottom = await send({
    type: "reorder",
    id: find("100").node.children.at(-1).id, delta: 1,
  });
  check("refuses past the bottom", /already at the end/.test(bottom.refused || ""),
        bottom.refused || "NOT REFUSED");
  check("order unchanged by refusals", names("100").split(",").pop() === last, names("100"));
}

QUIRK = true;
console.log("\n=== cut / paste ===");
seed();
let res = await send({ type: "moveNodes", ids: ["1000", "1001"], parentId: "101" });
check("2 links moved into MOVIE", res.moved === 2 && names("101") === "m,a,b", names("101"));
check("order preserved", names("101") === "m,a,b");
check("source lost exactly 2", names("100") === "c,d", names("100"));
check("undo snapshot captured", res.undo.length === 2 && res.undo[0].parentId === "100");

console.log("\n=== undo restores parent ===");
for (const u of res.undo) await send({ type: "moveNodes", ids: [u.id], parentId: u.parentId });
check("both links back in GERMAN", names("100").includes("a") && names("100").includes("b"), names("100"));

console.log("\n=== delete moves to trash, never removes ===");
seed();
res = await send({ type: "trashNodes", ids: ["1000"] });
check("reports 1 moved", res.moved === 1);
const trash = find("1").node.children.find((c) => c.title === "trash");
check("trash folder created on the bar", Boolean(trash));
check("the link is inside it", Boolean(trash && trash.children.some((c) => c.id === "1000")));
check("it is NOT gone from the tree", Boolean(find("1000")));

console.log("\n=== real removal (only reachable from inside trash) ===");
res = await send({ type: "removeNodes", ids: ["1000"] });
check("removed", res.removed === 1 && !find("1000"));
seed();
res = await send({ type: "removeNodes", ids: ["10"] });
check("removeTree used for a non-empty folder", res.removed === 1 && !find("10"));

console.log("\n=== every link carries the folder it lives in ===");
// content/bookmarks.js tags each rendered link with dataset.parent, taken straight
// from this payload, and paste targets that. byId holds FOLDERS only, so if prune()
// ever dropped parentId there would be no way to notice: paste would silently fall
// back to the breadcrumb folder, which is exactly the bug this replaced.
seed();
{
  const { roots } = await send({ type: "bookmarks" });
  const links = [];
  const walk = (n) => { for (const c of n.children || []) { if (c.url) links.push(c); else walk(c); } };
  for (const r of roots) walk(r);
  const missing = links.filter((l) => !l.parentId);
  check("the payload has links at all", links.length === 7, String(links.length));
  check("every one names its parent folder", missing.length === 0,
        missing.map((l) => l.title).join(",") || "none missing");
  const a = links.find((l) => l.title === "a");
  check("and names the right one", a && a.parentId === "100", a && a.parentId);
}

console.log("\n=== a link moved between sibling subfolders ===");
// Viewing ALL lists GERMAN's and MOVIE's links inline as separate groups, so this
// is the move the user makes with the cursor on a link in the OTHER group -- the
// case that used to land everything in ALL instead, because paste always targeted
// the breadcrumb folder rather than the folder under the cursor.
seed();
{
  const r = await send({ type: "moveNodes", ids: ["1000"], parentId: "101" });
  check("reports the real destination", r.targetTitle === "MOVIE", r.targetTitle);
  check("lands in the sibling subfolder", names("101") === "m,a", names("101"));
  check("leaves the source subfolder", names("100") === "b,c,d", names("100"));
  check("does not touch the shared parent",
        (find("10").node.children || []).map((c) => c.title).join(",") === "GERMAN,MOVIE",
        (find("10").node.children || []).map((c) => c.title).join(","));
  check("undo restores the original folder and index",
        r.undo.length === 1 && r.undo[0].parentId === "100" && r.undo[0].index === 0,
        JSON.stringify(r.undo));
}

console.log("\n=== guards ===");
seed();
for (const [label, msg, expect] of [
  ["cutting Bookmarks bar", { type: "moveNodes", ids: ["1"], parentId: "11" }, /cannot be moved/],
  ["cutting Other bookmarks", { type: "trashNodes", ids: ["302"] }, /cannot be moved/],
  ["folder into its own child", { type: "moveNodes", ids: ["10"], parentId: "100" }, /inside itself/],
  ["pasting into a link", { type: "moveNodes", ids: ["110"], parentId: "1000" }, /not a folder/],
  ["pasting nothing", { type: "moveNodes", ids: [], parentId: "11" }, /nothing to paste/],
  ["reordering a root", { type: "reorder", id: "1", delta: 1 }, /cannot be reordered/],
]) {
  const r = await send(msg);
  check(label + " refuses", expect.test(r.refused || ""), r.refused || "NOT REFUSED");
}
check("tree untouched by refusals", names("100") === "a,b,c,d", names("100"));

console.log("\n=== find-or-create does not duplicate ===");
seed();
await send({ type: "trashNodes", ids: ["1000"] });
await send({ type: "trashNodes", ids: ["1001"] });
const trashes = find("1").node.children.filter((c) => c.title === "trash");
check("exactly one trash folder", trashes.length === 1, String(trashes.length));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
