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
| `manifest.json` | MV3. Permissions: `bookmarks`, `history`, `topSites`, `favicon`, `storage`, `downloads` |
| `icons/fire-*.png` | The extension icon (16/32/48/128, generated from `fire-512.png`) and the page favicon |
| `newtab.html` / `newtab.js` | The stub Chrome actually opens; redirects the tab to the file:// page |
| `sw.js` | Service worker — the **only** place `chrome.bookmarks` / `chrome.history` / `chrome.downloads` exist |
| | It logs `SW_VERSION` on startup. **Content scripts reload with the page; this does not** — it reloads only when the extension does, so "I edited `sw.js` and nothing changed" is almost always a stale worker. Read that line in the service worker console to be sure. |
| `content/bridge.js` | `SP` helpers, favicons, and the page↔extension `postMessage` bridge |
| `content/bookmarks.js` | Folder rail + link grid, and the keyboard navigation |
| `content/activity.js` | KPI tiles, top-sites bars, recent list |
| `content/downloads.js` | The downloads view — the `q` toggle, the list, and its navigation |
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
which is why the navigation uses them. That left `a`, `e` and `q` free — and the
downloads view has now taken `q`, so **there are no free single keys left.** Anything
new needs a modifier, or a pass-through rule ("Freeing `hjkl`" below).

| Key | Does |
|---|---|
| `.` / `,` | next / previous wallpaper (mirroring sway's `$mod+.` / `$mod+,`) |
| `w` | random wallpaper |
| `c` | zen mode — hide the panels, leaving wallpaper, clock and dates |
| `s` | focus the bookmark filter (`/` is Vimium's find mode) |
| `e` / `a` | focus the folder rail / the link grid |
| `A` | focus "Pick up where you left off" in the Activity panel |
| `q` | swap between the normal panels and the downloads view |
| `↓↑←→` or `hjkl` | navigate within whichever pane has focus |
| `f` | Vimium link hints, as everywhere else |

In the rail: `↓↑` move (the right pane previews live), `→` expands or enters the
grid, `←` collapses or goes to the parent. In the grid: `←→` step through links,
`↑↓` move between visual rows, `Ctrl+Enter` opens in a new tab, `←` on the first
link returns to the rail. `Escape` leaves.

### Editing

| Action | Always | Vim set |
|---|---|---|
| mark / unmark | `Space` | `v` |
| mark everything in view | `Ctrl+A` | — |
| cut | `Ctrl+X` | `x` |
| paste into the folder in the breadcrumb | `Ctrl+V` | `p` |
| delete (moves to a `trash` folder) | `Delete` | `d` |
| reorder within the folder | `Ctrl+↑` / `Ctrl+↓` | same |
| undo | `Ctrl+Z` | same |

With nothing marked, an operation acts on whatever has the cursor. `Escape` clears
marks first and only leaves the pane once there are none.

**Delete never removes anything** — it moves into a `trash` folder on the bookmarks
bar. The Chrome API has no undo, and Chrome's own Ctrl+Z will not bring back
something deleted through it, so everything here is a move and therefore reversible.
Real removal happens only when you are *inside* trash, and asks first.

Bookmarks bar, Other bookmarks and Mobile bookmarks cannot be moved or deleted —
Chrome forbids it, and the panel refuses with a message rather than failing quietly.

### The recent list

"Pick up where you left off" holds 30 entries (`RECENT` in `sw.js`). At ~27px each
that is ~810px, which would leave the Activity panel taller than the bookmark panel
above it — so `.sp-recent` is a bounded scroller (`clamp(320px, 52vh, 560px)`), about
a dozen visible and the rest a scroll away.

`A` puts the cursor in it, then `j`/`k` or `↓`/`↑` move, `Home`/`End` jump, `Enter`
opens and `Escape` leaves. The key is **shifted** because every unshifted single key
on this page is spoken for; Vimium binds no bare `A`.

Its links stay **normally tabbable** — unlike the bookmark panes, which use a roving
tabindex. That is deliberate and predates the navigation: `j`/`k` works regardless of
how focus arrived, so there was no reason to take Tab away.

`.sp-recent` is in `page/scroll.js`'s `PANES`, or `j`/`k` inside it would move the
cursor *and* scroll the page.

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

### The downloads view

`q` swaps the whole column over to downloads and back. It is a **view, not a third
panel**: bookmarks and activity are hidden outright, so a long history gets the full
width and height rather than a slot under two other panels. The clock header stays —
at `3rem` it costs almost nothing and it keeps an anchor on the page.

Zen mode (`c`) still wins: it hides `.panels` outright, downloads included. So `q`
does nothing while zen is on, and `c` comes back out into whichever view was showing.

| Key | Does |
|---|---|
| `q` | enter / leave the downloads view |
| `e` or `a` | put the cursor back in the list |
| `j` `k` or `↓` `↑` | move down / up a column |
| `h` `l` or `←` `→` | step back / forward in order |
| `Home` / `End` | first / last row (`G` is Vimium's, `gg` is a prefix) |
| `Enter` | show the file in Dolphin |
| `x` or `Delete` | remove the row from the list — the file is not touched |
| `d` | delete the file from disk, behind a `confirm()` |
| `Ctrl+C` or `p` | copy the full path |
| `s` | focus the filter |
| `Escape` | clear the filter, else leave the list |

With the mouse: **clicking the icon or the name shows the file in Dolphin.** Clicking
also *focuses* the row — without that, "click a row, then press `d`" would silently do
nothing, since the keys only fire while the list has focus.

**There is deliberately no "open with the default app."** `chrome.downloads.open()`
demands a user gesture, and the activation does not survive `runtime.sendMessage` into
the service worker — Chrome answers `User gesture required`. That was measured in the
browser, not assumed. Nothing inside an extension can supply a gesture from a keypress
on a page, so opening a file would need a native messaging host running `xdg-open`.
Not worth a second moving part, given Dolphin is one keystroke away and opens files.

**`x` removes the row, `d` removes the file.** Different blast radius, so they are
different keys, and only `d` asks first — a history entry costs nothing on disk, which
is also why Chrome's own row has a ✕ and no confirmation. Removing a row moves the
cursor onto the one that takes its place (or the one above, if it was last) rather
than jumping back to the top.

`Escape` blurs the list, which is useful — but the list is the only thing on screen in
this view, so there is nothing else to drive once you are out of it. **`e` or `a` puts
the cursor back.** Both work, because there is only one pane here to enter, and the
bookmark panel's `e`/`a` handler bails while its own panel is hidden. Vimium's `f` is
not the way back: it hints the row's buttons, which act on a file rather than putting
the cursor on it.

`d`, `p`, `x` and `v` only arrive if Vimium's pass-through keys are extended past
`hjkl` ("Freeing `hjkl`" above). `Ctrl+C`, `Enter` and the arrows work regardless, so the view is fully
usable without touching Vimium's options.

#### Keys that two panels share

`bookmarks.js` and `downloads.js` both bind `s`, and both bind `e`/`a`, at the
document level. Each bails when *its own* panel is off screen, via `SP.visible(mount)`
— which tests `offsetParent`, so it covers zen mode and the downloads view at once.
Exactly one of the two panels is ever visible, so there is no ordering dependency
between the listeners, and the same key means the same *kind* of thing in both views:
`s` filters, `e`/`a` enter the list. **Use `SP.visible()` for any future global hotkey**; testing for the
`sp-zen` class specifically is what this replaced, and it was already wrong the
moment a second way to hide a panel existed.

`page/scroll.js`'s `PANES` gained `.sp-dl-list` for the same reason — without it,
`j`/`k` inside the list would move the cursor *and* scroll the page.

`SP.verticalNeighbour()` in `bridge.js` is shared by the bookmark grid and this one.
Both are `auto-fill`, so the column count changes with the window, and both are split
into blocks by headings — `index ± columnCount` would be wrong at every block boundary
and on each block's ragged last row. `h`/`l` step in document order; `j`/`k` go by
geometry, which is also what carries the cursor from the end of one day into the next.

#### Showing a file in Dolphin — the part that is not in this repo

`chrome.downloads.show()` calls `org.freedesktop.FileManager1.ShowItems`, falling
back to `xdg-open` on the parent directory. **Chrome has no say in which file manager
answers.** On a stock Fedora install that is Nautilus: it owns the
`org.freedesktop.FileManager1` bus name, and Dolphin registers its own separate
`org.kde.dolphin.FileManager1` instead, so Dolphin is never reached.

Pointing that name at Dolphin is a machine-level change, and lives **outside the
dotfiles repo** (`~/.local/share/dbus-1/` is not one of the tracked paths). To
redo it on a new machine:

```bash
mkdir -p ~/.local/share/dbus-1/services
cat > ~/.local/share/dbus-1/services/org.freedesktop.FileManager1.service <<'EOF'
[D-BUS Service]
Name=org.freedesktop.FileManager1
Exec=/usr/bin/dolphin --daemon
EOF

xdg-mime default org.kde.dolphin.desktop inode/directory
dbus-send --session --dest=org.freedesktop.DBus / org.freedesktop.DBus.ReloadConfig
```

⚠️ **Omit the `SystemdService=` line** that Fedora's packaged
`org.kde.dolphin.FileManager1.service` carries — it names `plasma-dolphin.service`,
which does not exist outside Plasma. The user-level file wins over `/usr/share`
because `XDG_DATA_HOME` sorts first. A file manager already running keeps the name
until it exits, so this only takes effect for the next activation.

Verify without involving Chrome at all:

```bash
dbus-send --session --print-reply --dest=org.freedesktop.FileManager1 \
  /org/freedesktop/FileManager1 org.freedesktop.FileManager1.ShowItems \
  array:string:"file:///home/albos/Downloads/somefile" string:""
```

Dolphin should open with that file **selected** — `ShowItems` maps to
`dolphin --select`. This is also a machine-wide change: every app's "show in folder"
now goes to Dolphin.

#### Why it is a grid, and how tall it is

The list is **one grid block per day** — a full-width `.sp-dl-group` heading, then
that day's rows flowing into `.sp-dl-grid`, which is `repeat(auto-fill, minmax(340px,
1fr))`. At the 1240px shell width that comes out at three columns; a narrow window
falls back to one on its own.

This exists because of measured numbers, not taste. The history here holds **995
downloads over 174 days**, and seven days of it is 22 downloads plus 7 headings. Rows
were ~46px on two lines, the list was ~450px, so about ten rows fitted — two days.
One-line rows (~25px) and three columns bring seven days into ~432px.

Most days here hold only one or two downloads, so the **headings, not the rows, are
the dominant cost** — seven of them are a third of the used height. That is why they
are deliberately small, and why making them heavier is expensive.

⚠️ **The height is flex, not `calc()`.** `html.sp-dl .shell` is a `height:100vh` flex
column, `.panels` is `flex:1; min-height:0`, and `.sp-dl-list` takes what is left.
The original `height: clamp(320px, calc(100vh - 210px), 900px)` was a guess at the
height of everything above the list, and it guessed ~140px low — so the list was
taller than its own room and **the page scrolled as well as the list**. Do not put a
fixed height back; add to the flex column instead.

#### Read the focus before emptying the list

`renderList()` measures `listEl.contains(document.activeElement)` **at the top**, not
next to where it is used. Clearing the list detaches the focused row, which moves
`activeElement` to `<body>` — so asking afterwards always answers "no", and every
background refresh would silently drop the cursor out of the list while the user was
navigating. The measured value is passed into `restoreCursor()`.

An operation that *removes* the focused row has to hand the focus forward explicitly
(`focusOnRender`), because by the time the next render runs there is nothing left to
read it from.

#### `exists` is lazy, and that is why there is a second search

Chrome does not watch the filesystem. Per the API contract, **calling `search()` is
what schedules the existence check**, and the corrected `exists` only appears on a
*later* search. Trusting the first answer is exactly the bug where a deleted file
keeps its icon until the next reload.

So the panel searches again on: a single follow-up ~1200 ms after the first render,
`window` focus, entering the view with `q`, and the Refresh button. There is no
`chrome.downloads.onChanged` push — that would need `tabs.sendMessage` and a tab
lookup, and re-running `search()` is cheaper and covers the same ground.

#### Icons are fetched lazily, per visible row

`chrome.downloads.getFileIcon()` is one IPC and one file stat each, so asking for
every row up front does not scale to a long history. `downloads.js` observes the rows
with an `IntersectionObserver` and asks only for the ones scrolled into view,
coalesced into one `downloadIcons` message per 50 ms batch.

**`getFileIcon` rejects for a file that is not there**, which is the second half of
the missing-icon behaviour: that id comes back `null`, the row drops its icon button
entirely and gains `.sp-dl-gone`. One rejection must never fail the batch — see
`tools/sim-downloads.mjs`.

#### Testing it

```bash
node ~/StartPage/tools/sim-downloads.mjs
```

Runs `sw.js`'s handlers against a stubbed `chrome.downloads`, in the same shape as
`sim-bookmarks.mjs`. It covers the thing a browser cannot be made to show without
wrecking real state: that a `getFileIcon` rejection becomes `null` for that id alone,
leaving the rest of the batch intact.

## 4. Troubleshooting

**New tab shows the extension's setup stub, not the page** — file access is off, or
`TARGET` in `newtab.js` does not match where `~/StartPage` really is.

**Panels are empty** — the content script did not run. Its match pattern in
`manifest.json` must equal the page's URL exactly, and file access must be on.

**Nautilus opens instead of Dolphin** — a file manager already holding the
`org.freedesktop.FileManager1` bus name keeps it until it exits. Check the owner with
`dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus
org.freedesktop.DBus.GetNameOwner string:org.freedesktop.FileManager1`, then "Showing a file in Dolphin" in §3.

**Every row has an icon, including deleted files** — the follow-up search has not
landed. Press Refresh; `exists` is only corrected on a *later* `search()` than the
one that scheduled the check.
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
