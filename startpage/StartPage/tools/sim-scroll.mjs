// Run page/scroll.js for real against a stub DOM, driving requestAnimationFrame by
// hand. requestAnimationFrame is throttled in headless Chrome (it stalls after ~3
// frames), so the scroll animation cannot be verified end-to-end in a browser.
//
//   node tools/sim-scroll.mjs
import fs from "node:fs";

let scrollY = 0, scrollX = 0;
const listeners = {};
const queue = [];

globalThis.SPState = { isTyping: () => false };
globalThis.document = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  documentElement: { scrollHeight: 5000, scrollWidth: 1366 },
};
globalThis.window = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  get scrollX() { return scrollX; },
  get scrollY() { return scrollY; },
  innerHeight: 660, innerWidth: 1366,
  scrollTo: (x, y) => { scrollX = x; scrollY = y; },
};
globalThis.requestAnimationFrame = (fn) => queue.push(fn);

new Function(fs.readFileSync(new URL("../page/scroll.js", import.meta.url), "utf8"))();

const fire = (type, ev) => (listeners[type] || []).forEach((fn) => fn(ev));
const down = (key, repeat = false) => fire("keydown", {
  key, repeat, ctrlKey: 0, altKey: 0, metaKey: 0, shiftKey: 0,
  target: { closest: () => null }, preventDefault() {},
});
const up = (key) => fire("keyup", { key });

let t = 0;
function frames(n) {                       // advance n frames of 16ms
  for (let i = 0; i < n && queue.length; i++) { t += 16; queue.shift()(t); }
}
function settle() {                        // run to a natural stop
  let guard = 0;
  while (queue.length && guard++ < 2000) { t += 16; queue.shift()(t); }
  return guard;
}
const reset = () => { scrollY = 0; scrollX = 0; queue.length = 0; };
const ok = (cond) => (cond ? "PASS" : "**FAIL**");

console.log("SPEED check: 0.95 px/ms => 15.2 px per 16ms frame\n");

reset();
down("j"); frames(3);
console.log("=== tap: 3 frames then release ===");
const mid = scrollY;
up("j"); settle();
console.log(`  after 48ms held: ${mid.toFixed(1)}  (15.2/frame => ~45.6)`);
console.log(`  final: ${Math.round(scrollY)} (want 60, the minimum step)  ${ok(Math.round(scrollY) === 60)}`);

reset();
down("j"); frames(1); up("j"); settle();
console.log("\n=== very short tap: 1 frame ===");
console.log(`  final: ${Math.round(scrollY)} (want 60)  ${ok(Math.round(scrollY) === 60)}`);

reset();
down("j");
frames(40);                                 // ~640ms held, no repeat events at all
const heldDist = scrollY;
up("j"); settle();
console.log("\n=== hold for 40 frames (~640ms), NO auto-repeat events ===");
console.log(`  travelled while held: ${Math.round(heldDist)} (want ~608 = 40*15.2)  ${ok(heldDist > 500)}`);
console.log(`  continuous, no stall: ${ok(heldDist > 500)}  <-- this is the stutter fix`);

reset();
down("j"); frames(2); down("j", true); down("j", true); frames(2);
const withRepeats = scrollY;
up("j"); settle();
console.log("\n=== auto-repeat events must not disturb the animation ===");
console.log(`  after 4 frames w/ repeats: ${Math.round(withRepeats)} (want ~61 = 4*15.2)  ${ok(Math.abs(withRepeats - 60.8) < 1)}`);

reset();
down("j"); frames(10); down("k"); frames(2); up("k"); settle();
console.log("\n=== reversing direction mid-scroll ===");
console.log(`  ended above the 144px mark: ${Math.round(scrollY)}  ${ok(scrollY < 144)}`);

reset();
scrollY = 10; down("k"); settle();
console.log("\n=== clamps ===");
console.log(`  k near top: ${Math.round(scrollY)} (want 0)  ${ok(Math.round(scrollY) === 0)}`);
reset();
scrollY = 4330; down("j"); settle();        // max = 5000 - 660 = 4340
console.log(`  j near bottom: ${Math.round(scrollY)} (want 4340)  ${ok(Math.round(scrollY) === 4340)}`);

reset();
down("j"); frames(2); fire("blur", {}); const n = settle();
console.log("\n=== window blur with the key still down ===");
console.log(`  stops rather than scrolling forever: ${ok(n < 2000)} (${n} frames to settle)`);
