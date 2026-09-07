# Clipboard — history and constants

**Your version:** cliphist 2.0.0 · rofi 2.0.0 · wl-clipboard 2.2.1 · Fedora 44
**Config:** four files, none of them a config file —
`~/.config/sway/scripts/clip-watch.sh`, `~/.config/sway/scripts/clip-menu.sh`,
`~/.config/sway/scripts/clip-const.sh`, and `~/.config/rofi/clipboard.rasi`,
all → `~/dotfiles/`

Wayland has no clipboard *manager*. The protocol hands ownership of the
clipboard to one window at a time, and when that window replaces the contents
the previous value is simply gone — there is nowhere it was kept. Plasma had
Klipper built in; sway ships nothing.

This adds the missing half: a recorder that stores every copy, and a picker on
**`$mod+v`** that puts an old one back.

It then adds a second thing the history cannot do. cliphist keeps the last 750
entries and dedupes, so anything you want *permanently* to hand — an email
address, a postal address, an ssh one-liner — eventually falls off the end. So
the same popup has a second view of **constants**: text you saved on purpose,
which never expires. `Tab` swaps between the two.

---

## Table of Contents

1. [The two halves](#1-the-two-halves)
2. [The recorder — `clip-watch.sh`](#2-the-recorder--clip-watchsh)
3. [The picker — `clip-menu.sh`](#3-the-picker--clip-menush)
4. [Constants — `clip-const.sh`](#4-constants--clip-constsh)
5. [Keys](#5-keys)
6. [The theme](#6-the-theme)
7. [Where it all lives](#7-where-it-all-lives)
8. [Secrets](#8-secrets)
9. [Common changes](#9-common-changes)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. The two halves

Nothing here is one program. Four cooperate, and knowing which is which
explains every failure mode below. (The constants in
[section 4](#4-constants--clip-constsh) use only the last of them — they are
plain files, so `cliphist` is not involved at all.)

| Program | Package | Role |
|---|---|---|
| `wl-paste` | `wl-clipboard` | **Watches** the clipboard and pipes each new value out |
| `cliphist` | `cliphist` | **Stores** what it is piped, and reads it back |
| `rofi` | `rofi` | **Displays** the list — the same launcher as `$mod+space` |
| `wl-copy` | `wl-clipboard` | **Puts** the chosen entry back on the clipboard |

```
   you copy something
          │
          ├───────────────────────────────────┐
          ▼                                   ▼  $mod+c
   wl-paste --watch                     clip-const.sh pin
   (clip-watch.sh, sway §6)                   │
          │                                   ▼
   cliphist store                  ~/.local/share/clip-constants/*.txt
          │                                   │
          ▼                                   │
   ~/.cache/cliphist/db                       │
          │                                   │
          │   History view   ◄───  Tab  ───►  Constants view
          └──────────────►  rofi -dmenu  ◄────────────┘
                            (clip-menu.sh, $mod+v)
                                   │
                                   ▼
                                wl-copy
```

The recorder runs from login to logout. The picker runs for as long as the
popup is on screen and then exits — there is no daemon of ours.

**It does not paste.** Enter makes the entry current; the next `Ctrl+V` in
whatever window you were in gets it. Synthesising a keystroke into another
window would need a separate tool (`wtype`) and is not worth the moving part.

---

## 2. The recorder — `clip-watch.sh`

Started from the sway config §6:

```
exec_always $scripts/clip-watch.sh
```

The script is three lines of work:

```bash
pkill -f 'wl-paste --watch cliphist' 2>/dev/null

wl-paste --type text  --watch cliphist store &
wl-paste --type image --watch cliphist store &
```

### Why two processes

`wl-paste --watch` watches **one mime family per process**. `--type text`
catches everything copied out of an editor, a terminal or a browser;
`--type image` catches a `grimshot` screenshot. Both feed the same database, so
the picker shows one merged history in copy order.

Drop the image line and nothing breaks — a copied screenshot is just gone the
moment you copy something else.

Neither watches the **primary selection** (the middle-click one), which is
deliberate: every mouse drag over text would otherwise become a history entry.

### Why `exec_always`, and why it kills first

`exec_always` re-runs on every `$mod+Shift+c`. Without the `pkill`, each reload
would leave the old pair running and add two more, so a single copy would be
stored three or four times. Same shape as `waybar-restart.sh` and the `mako`
line beside it.

Restarting costs nothing: the history is on disk, not in these processes.

This is also the **opposite** of the `swayidle` trap that costs the most time
in this config — swayidle is on a plain `exec`, so a reload does *not* apply
changes to it. Here a reload does. No `pkill` dance needed.

### ⚠️ Why it is a script and not a one-liner

The obvious inline version is a trap:

```
# DO NOT DO THIS
exec_always sh -c 'pkill -f "wl-paste --watch cliphist"; wl-paste ...'
```

`pkill -f` matches the **whole command line**, and the wrapper shell's own
command line contains that pattern. It kills its own parent before starting
anything. A script's command line is just its path, which the pattern does not
match.

For exactly the same reason the file is called **`clip-watch.sh`** and not
`cliphist-watch.sh`. Renaming it to anything containing `cliphist` would
reintroduce the self-match.

---

## 3. The picker — `clip-menu.sh`

Bound in §7.6:

```
bindsym $mod+v exec $scripts/clip-menu.sh
```

The core is one pipeline:

```bash
cliphist list | rofi -dmenu | cliphist decode | wl-copy
```

`cliphist list` emits one line per entry, `<id><TAB><preview>`. rofi returns
the line you chose, and `cliphist decode` parses the id off the front and
writes the original bytes back out — text or image, whichever it was.

Three things wrap that pipeline:

- **A loop.** Deleting an entry re-opens the list instead of dismissing it, so
  several can be cleared in one visit.
- **A `view` variable.** The same loop generates either list —
  `cliphist list` or `clip-const.sh list` — and `Tab` flips it. Both lists emit
  the same `<key><TAB><preview>` shape, which is what lets one
  `-display-columns 2` and one set of key handlers serve both.
- **An empty-history check.** An empty rofi box gives no hint why it is empty,
  so the script substitutes a single row saying so. A *row* and not the
  notify-and-exit this once was: exiting would also take away the `Tab` that
  reaches the constants, which is the one view that still has something in it.

### Exit codes are the control flow

rofi returns `0` for Enter, `1` for Escape, and `10 + (N-1)` for
`-kb-custom-N`. That is why the script sets `set -uo pipefail` but deliberately
**not** `-e`: `set -e` would abort the moment you pressed Escape.

| Code | Key | History view | Constants view |
|---|---|---|---|
| 0 | `Enter` | copy the entry, leave | copy the constant — or, on the last row, make a new one |
| 1 | `Escape` | leave | leave |
| 10 | `Ctrl+Delete` | delete the entry, loop | delete the constant after a confirm, loop |
| 11 | `Ctrl+Shift+Delete` | wipe the history after a confirm | ignored |
| 12 | `Tab` | → constants | → history |
| 13 | `Ctrl+e` | ignored | edit the constant, loop |

### The two synthetic rows

Neither `+ New constant…` nor "History is empty" is a real entry, so both carry
a key column (`+new`, `+info`) that a real one never can — a cliphist key is
digits, a constant's key is an absolute path. Every handler checks for them
before acting.

`+ New constant…` is deliberately the **last** row of its list. As the only row
it explains an empty store; once there are constants it never steals the
default selection from them.

### `-display-columns 2`

Hides the key column — a numeric id, or a constant's file path — which is
noise. It affects the **display only**: the value rofi returns is still the
whole `<key><TAB><preview>` line, which is what `decode`, `delete` and
`clip-const.sh` all need. If a future rofi ever changes that, the symptom is
"Enter does nothing" and the fix is to remove `-display-columns` and
`-display-column-separator` from the script and live with a visible id column.

---

## 4. Constants — `clip-const.sh`

A **constant** is a piece of text you keep on purpose: your email address, a
postal address, an ssh one-liner, a signature. The history cannot hold these —
`cliphist` keeps 750 items and dedupes, so anything you want forever eventually
falls off the end of it.

Constants are the second view of `$mod+v`, reached with **`Tab`**. They are
plain files, so nothing in this half involves `cliphist` at all:

```
~/.local/share/clip-constants/<epoch-nanos>.txt     one file per constant
```

### `$mod+c` means "make me a constant", and never dead-ends

| Clipboard holds | `$mod+c` does |
|---|---|
| New text | Pins it. A notification shows what was saved; no window opens |
| Text that is **already** a constant | Says so, then opens a **blank** one in the editor |
| Nothing, or only whitespace | Opens a blank one in the editor |
| An image — `clip-watch.sh` watches those too | Opens a blank one in the editor |

So the fast path is "`Ctrl+C` as usual, then `$mod+c`", and pressing `$mod+c`
again — which is what you actually do when you want a *second* constant — gives
you an empty one to type rather than an error.

> ⚠️ The first version **refused** in the last three rows, and that was wrong.
> "That one is already saved" is true and useless: the clipboard has not changed
> since you pinned it, so the key that makes constants appears to be broken
> exactly when you reach for it a second time. A key that can dead-end on its
> own most obvious repeat is the wrong shape.

**`+ New constant…`**, the last row of the constants view, does the same thing
from inside the picker. Quitting the editor without typing leaves no file
behind, either way.

> Reading the text under the mouse pointer instead — highlight something, press
> a key, done — is **not possible**. Wayland gives no client any way to see
> what another window is showing, and there is no "text under the cursor" to
> ask for. `$mod+c` after a normal `Ctrl+C` is the working equivalent.

### The rows show the content, not a name

Each row is the constant's own first line, with newlines folded to `⏎` and cut
at 100 characters — the same width `cliphist` previews at:

```
★ seeker@example.com
★ ssh -L 8080:localhost:80 user@host
★ Salar Mahani⏎Street 12⏎Tehran
```

There is deliberately no separate name field. A name is one more thing to
invent, to display and to keep in step with the text under it, and for the kind
of text this holds the first line already *is* the label.

Two substitutions in `preview()` are load-bearing rather than cosmetic. A row
is `<path><TAB><preview>` and rofi is told `-display-columns 2`, so a literal
**tab** inside a constant would open a third column and silently hide the rest
of the line; tabs are collapsed to spaces. Newlines become `⏎` for the same
reason in the other direction. Neither touches the stored file — copying reads
the file, never the preview.

### Editing is one editor in a floating window

`Ctrl+e` on a constant runs:

```bash
kitty --class clip-const -e "${VISUAL:-vim}" <file>
```

⚠️ **`$EDITOR` is deliberately not the first choice, and this is a Fedora trap.**
The package `nano-default-editor` ships
`/etc/profile.d/nano-default-editor.sh`, which exports `EDITOR=/usr/bin/nano`
for **every** user on the machine — and sway inherits it at login, so the first
version of this script opened nano no matter what. That is a distro default, not
a preference. `$VISUAL` is left alone by that package, so it is the one of the
two that actually means something here:

```bash
echo "$EDITOR $VISUAL"        # /usr/bin/nano  (and VISUAL empty)
rpm -qf /etc/profile.d/nano-default-editor.sh
```

So the order is `$VISUAL`, then `vim` (this repo tracks a `.vimrc`), and only if
that is missing does it fall back to `$EDITOR`. To change it, put
`export VISUAL=...` in `~/.zshenv` — `~/.zshrc` is not enough, since sway is not
started from an interactive shell.

`kitty --class` is what sets `app_id` on Wayland, and the sway config §5 floats
that `app_id` at 900×600. A one-shot editor for four lines of text has no
business rearranging the workspace you were in.

`kitty -e` stays in the **foreground**, which is the point: `clip-menu.sh`
blocks there until the window closes, so the list it redraws afterwards is
guaranteed fresh.

Two consequences worth knowing:

- **Saving a constant empty deletes it.** It is the obvious thing to try, and
  doing nothing instead would leave a blank row in the list with no way to read
  it. The same rule covers `+ New constant…`: quit without typing anything and
  no file is left behind.
- **`--trim-newline` on the way out.** Every editor ends a file with a newline;
  pasting a saved email address should not also press Enter. So `wl-copy
  --trim-newline` is what puts a constant back, and the stored file keeps its
  newline.

### The duplicate check

`cmp` on the **bytes**, not on the preview, so two constants that differ only
past the 100-character cut are still both kept. Its job is to stop the store
growing a second identical row when you press `$mod+c` twice — not to refuse
you, which is why it now opens a blank constant instead of stopping.

### The filename is a timestamp on purpose

`date +%s%N` gives digits only, so lexical order **is** creation order and two
constants made in the same second cannot collide. Nothing ever displays the
name.

The glob is `*.txt` and not `*`, because `$EDITOR` leftovers land in the same
directory — vim writes `file~`, nano writes `file.save`, both write `.swp` — and
a bare `*` would list every one of them as a constant.

⚠️ Like `clip-watch.sh`, **this script must not be renamed to anything
containing `cliphist`**: `pkill -f 'wl-paste --watch cliphist'` matches whole
command lines, so such a script would be killed by every sway reload. See
[section 2](#2-the-recorder--clip-watchsh).

---

## 5. Keys

Outside the picker:

| Key | Action |
|---|---|
| `$mod+v` | Open the picker, on the history |
| `$mod+c` | Save the current clipboard as a constant |

Inside the picker:

| Keys | History view | Constants view |
|---|---|---|
| `Enter` | Copy this entry back to the clipboard | Copy it — or, on the last row, make a new constant |
| `Tab` | → Constants | → History |
| `Ctrl+e` | — | Edit this constant in `$EDITOR` |
| `Ctrl+Delete` | Delete this one entry, then show the list again | Delete this constant — **asks first** |
| `Ctrl+Shift+Delete` | Wipe the whole history — asks first | — |
| `Escape` | Leave; the clipboard is untouched | Leave |
| `↑` `↓` / `Ctrl+p` `Ctrl+n` | Move, as everywhere else in rofi | Same |
| *type anything* | Filter | Filter |

**Why deleting a constant asks and deleting a history entry does not.** A
history entry arrived by accident and there are 749 more behind it. A constant
was written by hand and there is no undo. For the same reason there is
deliberately **no** "wipe all constants": losing the lot to one keypress is not
a mistake worth making available.

The view is **not remembered** between invocations. `$mod+v` always opens on the
history, so the muscle memory that predates the constants still works.

### Why those keys, and not the obvious ones

`Shift+Delete` is **not free** — rofi 2.0 binds it to `kb-delete-entry`, and
rofi errors out on a duplicate binding. Nor are `Ctrl+p` and `Ctrl+n`, which
are row up and row down.

rofi's own `-kb-custom-N` defaults (`Alt+1`, `Alt+2`, …) are useless on this
machine for a different reason: **`$mod` is Alt**, so sway grabs `Alt+1` as
"workspace 1" and rofi never sees the key. Any rofi binding on a plain Alt
combo that sway also binds is dead here.

`Ctrl+Delete` and `Ctrl+Shift+Delete` are free in both.

**`Tab` and `Ctrl+e` were not free, and are taken over explicitly.** rofi binds
`Tab` to `kb-element-next` and `Ctrl+e` to `kb-move-end`, so `clip-menu.sh`
gives both up on the command line before claiming them:

```bash
-kb-element-next ""      # Tab: steps between a row's columns. With
                         # -display-columns 2 there is one column, so it did
                         # nothing here — but it must be cleared explicitly or
                         # rofi refuses to start on the duplicate.
-kb-move-end ""          # Ctrl+e: "move the cursor to the end of the input".
```

⚠️ **Clear a binding, do not move it somewhere that looks free.** The first
attempt at the second line was `-kb-move-end "End"`, on the reasoning that End
does the same job — and `End` is *not* free either, it is `kb-row-last`. So
`$mod+v` stopped opening at all:

```
Failed to set binding End,KP_End for: Go to the last entry (kb-row-last):
Binding `End` is already bound.
```

Nothing is lost by clearing it outright. `Right` and `Ctrl+f` still walk the
input, and `End` keeps the more useful meaning in a list of "jump to the last
row".

### How to check a new binding

`rofi -list-keybindings` is the authority — it prints every action with the keys
currently on it, defaults included, which is what `-dump-config | grep kb-` does
*not* do (it only shows what has been changed):

```bash
rofi -list-keybindings
```

⚠️ **`-dump-config` is not a test.** Passing the flags with `-dump-config` parses
them and exits 0 even when the binding collides — rofi only detects a duplicate
when it actually **starts**. The real check is to start it, which `timeout` makes
non-interactive:

```bash
timeout 3 rofi -dmenu <your flags> <<< test >/dev/null
# exit 124 and empty stderr = it started clean.
# Any other exit, with a "Binding `X` is already bound" message = a collision.
```

### The cost of `$mod+v` and `$mod+c`

`$mod` is Alt, so these bindings take **Alt+V and Alt+C away from every
application** — the standing trade for every binding in this config, written up
in [keybinding-changes.md](keybinding-changes.md). Nothing on this system used
either: kitty, VS Code and Chrome all leave both unbound on Linux.

`$mod+Shift+v` would have been the better mnemonic for "save a constant" and is
**not free** — it is `splitv` in §7.3. `$mod+Shift+c` is `reload` and is
untouched.

---

## 6. The theme

`~/.config/rofi/clipboard.rasi` is nine lines of settings, because of its
first one:

```rasi
@import "config.rasi"
```

`@import` **merges**; `@theme` **discards everything loaded before it**. So
importing the launcher theme means the Catppuccin Mocha palette, the FiraCode
Nerd Font, the square corners and the 1px accent outline are defined in exactly
one place — `config.rasi`, which is also what waybar, mako and swaylock are
matched to. Re-theme that file and this popup follows.

It is loaded as `rofi -theme clipboard`: a bare **name**, not a path. rofi
appends `.rasi` and resolves it against `~/.config/rofi/`
(`man rofi-theme`, "Multiple file handling").

Everything the file actually says:

| Override | Value | Why |
|---|---|---|
| `window { width }` | `800px` | 400px suits an app name. A clipboard entry is a line of code or a URL, so it needs the room — and 800px is still under half of this 1366px screen |
| `listview { lines }` | `12` | 6 suits "type three letters, Enter". Scanning history is a reading task. 12 rows plus the input bar is ~430px on a 768px screen |
| `entry { placeholder }` | `"Search clipboard..."` | The inherited one says "Search...", which says nothing once two popups share a keyboard |

Icons are turned off with `-no-show-icons` on the command line rather than a
`configuration` block here, so this file stays purely a theme.

Like every rofi change: **nothing to reload.** It is read fresh on each launch.

---

## 7. Where it all lives

Two stores, and the difference between them is the difference between the two
views:

| | History | Constants |
|---|---|---|
| Path | `~/.cache/cliphist/db` | `~/.local/share/clip-constants/*.txt` |
| Shape | one binary db | one plain text file each |
| Written by | `cliphist store` | `clip-const.sh` |
| Lifetime | last 750 entries, deduped | until you delete it |
| Survives a reboot | yes | yes |
| Safe to delete by hand | yes, it is a cache | **no** — nothing else has a copy |

### The history

A single file, and it **persists across reboots** — the history you see after
logging in is the one you left. Check its size if images make you nervous:

```bash
du -h ~/.cache/cliphist/db
cliphist list | wc -l
```

cliphist keeps the last **750** entries by default. That limit is deliberately
not set in `clip-watch.sh` — it is one fewer knob, and 750 mixed entries has
not been a problem. To cap it, add the flag *before* the subcommand:

```bash
wl-paste --type text --watch cliphist -max-items 300 store
```

The file is a cache, so deleting it by hand is safe; `cliphist wipe` is the
same thing done properly.

### The constants

```
~/.local/share/clip-constants/
```

`~/.local/share` and **not** `~/.cache`, because a cache is by definition
something you can delete and these are hand-made. `$XDG_DATA_HOME` is honoured
if it is set.

They are **not in this repo**, and must not be added to it. The dotfiles repo
is published on GitHub, and a constant is exactly where an email address, a
server path or an API token ends up — the same rule as `~/.zshrc.local`. The
directory is created by the script on first use, never by `install.sh`.

To back them up, or to carry them to another machine, they are just files:

```bash
tar czf constants.tar.gz -C ~/.local/share clip-constants
```

---

## 8. Secrets

**Everything you copy is stored, including passwords and tokens.** Nothing
filters them out on the way in — cliphist cannot tell a password from a URL,
and Wayland offers it no hint that would help.

The history is a plain file in your cache directory readable by your user. It
is not encrypted.

So the two delete keys are not a nicety, they are the point:

| You did this | Do this |
|---|---|
| Copied one password | `$mod+v`, find it, `Ctrl+Delete` |
| Not sure what is in there | `$mod+v`, `Ctrl+Shift+Delete`, confirm |
| From a terminal | `cliphist wipe` |

Wiping is irreversible, which is why the key asks first. Deleting a single
entry does not ask — the same call the rest of this desktop makes, where
`$mod+q` closes every window on the workspace without a prompt.

**The constants are unencrypted too**, and unlike the history they never expire
out on their own. They are ordinary files owned by your user, so anything that
can read your home directory can read them:

```bash
grep -rl SOMETHING ~/.local/share/clip-constants/
```

A constant is deliberate, so this is a smaller hazard than the history — you do
not pin a password by accident. But `$mod+c` is one keypress with no
confirmation, so it *can* happen; `$mod+v`, `Tab`, `Ctrl+Delete` is the way
back out.

---

## 9. Common changes

**More or fewer rows.** `listview { lines: 12; }` in `clipboard.rasi`. Each row
is about 30px; the screen is 768px tall.

**A wider or narrower popup.** `window { width: 800px; }` in the same file.

**Stop recording images.** Delete the `--type image` line from
`clip-watch.sh`, then `$mod+Shift+c`.

**A different key.** Change the `bindsym $mod+v` or `bindsym $mod+c` in the
sway config §7.6. Free `$mod` keys are now genuinely scarce — see
[keybinding-changes.md](keybinding-changes.md) for what is already spent.

**A different editor for constants.** `clip-const.sh` uses
`${VISUAL:-${EDITOR:-vi}}`, so `export VISUAL=vim` in `~/.zshrc` is enough. To
change the *window* instead of the editor, it is the `kitty --class clip-const`
line in `edit_file()`, and the matching `for_window [app_id="clip-const"]` rule
in the sway config §5.

**A different marker than `★`.** One `printf` in `clip-const.sh`'s `list`
branch. The picker never parses it back out, so anything renders.

**Longer previews.** The `100` in `clip-const.sh`'s `preview()`. It matches
cliphist's own `-preview-width` so that the two views cut at the same place;
changing one without the other is the only cost.

**Cap the history.** See [section 7](#7-where-it-all-lives).

**Stop recording entirely, without uninstalling.** Comment out the
`exec_always $scripts/clip-watch.sh` line in §6, then
`pkill -f 'wl-paste --watch cliphist'`. A reload alone will not stop the
watchers already running.

---

## 10. Troubleshooting

**The list is empty, or `$mod+v` shows a "History is empty" popup.** The
recorder is not running. Check:

```bash
pgrep -af 'wl-paste --watch cliphist'      # expect TWO lines
```

Nothing? Run the script by hand and read the errors:

```bash
~/.config/sway/scripts/clip-watch.sh
```

**Nothing happens at all on `$mod+v`.** Run the picker from a terminal, where
sway is not swallowing its stderr:

```bash
~/.config/sway/scripts/clip-menu.sh
```

`cliphist: command not found` means the package is missing — `sudo dnf install
cliphist`.

**Entries are stored two or three times.** More than one pair of watchers is
running, which means the `pkill` in `clip-watch.sh` did not match. Confirm with
`pgrep -cf 'wl-paste --watch cliphist'` — it should print `2`. If the script
has been renamed to something containing `cliphist`, that is the cause; see
[section 2](#2-the-recorder--clip-watchsh).

**Enter selects an entry but the clipboard does not change.** `cliphist decode`
was given a line without its id. See the `-display-columns` note in
[section 3](#3-the-picker--clip-menush).

**The popup is unstyled, or rofi reports a theme error.** `rofi -theme clipboard
-dump-theme` parses it and prints the result without opening a window. If
`width` is not 800px, the `@import "config.rasi"` did not resolve.

**A copied image will not paste back.** Check what the clipboard is actually
holding after selecting it:

```bash
wl-paste --list-types
```

Some applications only accept `text/plain` from the clipboard and will ignore
an `image/png` entry regardless.

**The picker opens but its keys do nothing.** `Ctrl+Delete` reaching sway
instead of rofi would mean sway had bound it — it has not. Check with
`grep -rn 'Ctrl+Delete' ~/.config/sway/ /usr/share/sway/config.d/`.

**The picker does not open at all, and it used to.** Most likely a duplicate
rofi binding: rofi refuses to start on one, and sway swallows the error. Run
the picker from a terminal to see it, or parse the flags without a window:

```bash
~/.config/sway/scripts/clip-menu.sh
```

rofi prints the offending action and key. Note that `-dump-config` will **not**
reproduce it — see [section 5](#5-keys) for the check that does.

**`Tab` moves the cursor instead of swapping views.** The `-kb-element-next ""`
argument was lost. See [section 5](#5-keys).

**`$mod+c` opens a blank editor instead of pinning.** That is the designed
behaviour when there is nothing new to pin — see the table in
[section 4](#4-constants--clip-constsh). The three causes, in order of
likelihood:

- The clipboard has not changed since you last pinned it. You get a
  notification saying so as well as the blank editor.
- The clipboard is holding an **image**, normal right after a screenshot —
  `clip-watch.sh` watches those too. Confirm with `wl-paste --list-types`;
  anything without a `text/` line cannot become a constant.
- The clipboard is genuinely empty. `wl-paste` prints "Nothing is copied".

**`$mod+c` opens the wrong editor.** Fedora exports `EDITOR=/usr/bin/nano`
machine-wide from `/etc/profile.d/nano-default-editor.sh`, which is why the
script uses `$VISUAL` and then `vim` instead. Set `export VISUAL=...` in
**`~/.zshenv`** — `~/.zshrc` is not read by a sway session, so a change there
will appear to do nothing until you open a new terminal and test it by hand.

**A constant vanished after editing it.** Saving it empty deletes it, on
purpose — see [section 4](#4-constants--clip-constsh). There is no undo; the
file is gone.

**The constants view is empty but the files exist.** The glob is `*.txt`, so a
file saved under any other name is invisible to it:

```bash
ls ~/.local/share/clip-constants/
~/.config/sway/scripts/clip-const.sh list
```

**The editor opens tiled, or full screen.** The `for_window` rule did not
match. `swaymsg -t get_tree | grep app_id` while it is open should show
`clip-const`; if it shows something else, kitty's `--class` and the sway rule
have drifted apart.
