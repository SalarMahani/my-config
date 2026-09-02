# StartPage — the Chrome new tab

`~/StartPage` → `startpage/StartPage` in this repo. An **unpacked MV3 Chrome
extension** that replaces the new tab with a personal panel: wallpaper, clock,
Gregorian + Shamsi dates, the real Chrome bookmark tree, and a browsing-activity
report. No build step, no dependencies, no package manager — edit a file and hit
reload on the card at `chrome://extensions`.

## 1. The shape of it, and why

The page itself lives at `file:///home/albos/StartPage/index.html`, and the
extension **redirects the new tab to it**. That indirection is the one thing to
understand before changing anything here.

- Chrome's content-script match patterns accept only `http`, `https` and `file` —
  never `chrome-extension://`. Vimium matches `<all_urls>`.
- So a page served from the extension's own origin would be **invisible to Vimium**.
- Keeping the page on `file://` is what lets Vimium keep working on it.
- But a `file://` page has **no `chrome.*` APIs at all**, so bookmarks and history
  are fetched by the service worker and rendered into the page by a content script.

| File | Role |
|---|---|
| `manifest.json` | MV3. Permissions: `bookmarks`, `history`, `topSites`, `favicon`, `storage` |
| `newtab.html` / `newtab.js` | The stub Chrome actually opens; redirects the tab to the file:// page |
| `sw.js` | Service worker — the **only** place `chrome.bookmarks` / `chrome.history` exist |
| `content/bridge.js` | `SP` helpers, favicons, and the page↔extension `postMessage` bridge |
| `content/bookmarks.js` | Folder rail + link grid, and the keyboard navigation |
| `content/activity.js` | KPI tiles, top-sites bars, a 7×24 heatmap, recent list |
| `content/panels.css` | Styling for everything the content script renders |
| `page/*.js` | Clock, wallpaper, zen mode, page scrolling — need no permissions |
| `wallpapers.js` | **Generated.** Run `tools/index-wallpapers.sh` after adding or removing images |

Two constraints follow from being on `file://`:

- **No ES modules on the page side.** `file://` is an opaque origin and module
  scripts are fetched with CORS, so `<script type="module">` fails. Classic
  `<script src>` only; the content script's files share one scope, like Vimium's own.
- **No `fetch()` of local files**, for the same reason — hence a *generated*
  `wallpapers.js` rather than a JSON index read at runtime.

## 2. Setting it up on a new machine

Cloning the repo gets you the code. Chrome still needs telling about it.

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   `~/StartPage`.
2. On the new card → **Details** → turn on **Allow access to file URLs**.
   **Without this nothing works** — neither the redirect nor the content script.
3. **Remove any other new-tab extension.** Only one may override the new tab.
4. Put some images in `startpage/StartPage/wallpaper-picutes/` and run:
   ```bash
   ~/StartPage/tools/index-wallpapers.sh
   ```
   The images are not tracked (88M, and nothing names a specific file). Without
   them the page just says "No wallpapers indexed" and carries on.

⚠️ **Two files hardcode `/home/albos`** and must name the real path of `~/StartPage`
on a new machine: the content-script match in `manifest.json`, and `TARGET` in
`newtab.js`. This is the repo's usual portability wart — see README §8.

Then open a new tab and press `f`. If Vimium's link hints appear over the bookmark
links, the whole design is working.

## 3. Keys

Vimium is live on this page and eats any key it binds. Its reserved single keys:

```
j k h l G d u r R p P i v V f F / n N * # o O T b B H L K J ^ W t x X m ` ?
```

`z`, `g` and `y` are **prefixes** (`zi`, `gg`, `yy`), so a bare press never arrives,
and digits are count prefixes. Arrows, Tab, Enter, Escape and Space are unbound —
which is why the navigation uses them. That left `a`, `e` and `q` free; `q` still is.

| Key | Does |
|---|---|
| `.` / `,` | next / previous wallpaper (mirroring sway's `$mod+.` / `$mod+,`) |
| `w` | random wallpaper |
| `c` | zen mode — hide the panels, leaving wallpaper, clock and dates |
| `s` | focus the bookmark filter (`/` is Vimium's find mode) |
| `e` / `a` | focus the folder rail / the link grid |
| `↓↑←→` or `hjkl` | navigate within whichever pane has focus |
| `f` | Vimium link hints, as everywhere else |

In the rail: `↓↑` move (the right pane previews live), `→` expands or enters the
grid, `←` collapses or goes to the parent. In the grid: `←→` step through links,
`↑↓` move between visual rows, `Ctrl+Enter` opens in a new tab, `←` on the first
link returns to the rail. `Escape` leaves.

### Freeing `hjkl` (optional)

`hjkl` reach the page only if Vimium is told to pass them through. Vimium Options →
**Excluded URLs and keys**:

```
Pattern:  file:///home/albos/StartPage/*
Keys:     hjkl
```

A non-empty key list keeps Vimium enabled on the page and passes only those keys, so
`f` still works. Without the rule the arrows do everything anyway.

**`page/scroll.js` is the other half of this rule.** `passKeys` is matched per URL,
not per focus, so the rule hands `hjkl` to the page *everywhere on it* — including
outside the bookmark panel, where `j`/`k` would otherwise just stop scrolling.
`page/scroll.js` puts that back: it scrolls while the key is physically **down**,
never off key auto-repeat (driving it off auto-repeat puts the OS repeat delay
between the first step and the rest, which reads as the scroll stuttering).

## 4. Troubleshooting

**New tab shows the extension's setup stub, not the page** — file access is off, or
`TARGET` in `newtab.js` does not match where `~/StartPage` really is.

**Panels are empty** — the content script did not run. Its match pattern in
`manifest.json` must equal the page's URL exactly, and file access must be on.
Check the page console *and* the content-script context (the dropdown in DevTools),
and `sw.js` via the card's "service worker" link.

**Vimium keys do nothing on the page** — the page is not on `file://`. Check the
address bar; it must be `file:///home/albos/StartPage/index.html`.

**A wallpaper shows as a blank background** — `wallpapers.js` is stale, listing a
file that has since been deleted. Re-run `tools/index-wallpapers.sh`; it must be run
after *removing* images, not only after adding them.

**Scrolling stutters or feels wrong** — the speed is one constant at the top of
`page/scroll.js`. `requestAnimationFrame` is throttled in headless Chrome, so the
animation cannot be tested there; `node ~/StartPage/tools/sim-scroll.mjs` runs the
real file against a stub DOM with hand-driven frames instead.
