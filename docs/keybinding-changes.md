# Keybinding Changes

Everything that moved, why it moved, and what to retrain. Changed 2026-08-16.

Section [9](#9-markdown-reading-keys) covers keys that were *added* rather than moved.
Section [10](#10-the-ctrll-trade-off) explains why `Ctrl+L` differs between kitty and VS Code.
Section [11](#11-resizing-the-terminal) covers terminal resizing, and a command that never worked.
Section [12](#12-the----family) lays out the four layers of `,` / `.`.

If you only read one thing, read [§1](#1-what-to-retrain).

---

## Why any of this happened

Two collisions, both invisible — neither sway nor VS Code reports an error when
a keybinding is silently swallowed.

**Sway owns Alt.** `set $mod Mod1` means every `$mod+<key>` sway binds is
consumed by the compositor and never reaches the focused application. VS Code
had 12 bindings on Alt combos sway claims. All 12 were dead. Only `alt+d`
survived, because sway happens not to bind `$mod+d`.

**The terminal is not a text box.** Ctrl-letter combos are how a terminal
transmits control characters: `^H` *is* backspace, `^I` *is* Tab, `^J` *is* a
newline, `^L` *is* clear-screen, and Escape is the only way into zsh's vi normal
mode (`.zshrc`: `bindkey -v`). VS Code bindings on those keys intercepted them
before zsh ever saw them, which is why vi mode appeared not to work in the
integrated terminal at all.

The fix in both cases was to move VS Code onto `Ctrl+Shift+…`, a namespace
**sway does not touch** (it binds zero `ctrl+` combos) and **terminals do not
use** (a terminal cannot transmit `Ctrl+Shift+<letter>` as a distinct control
character).

---

## 1. What to retrain

The changes that affect what your fingers do every day. Everything else in this
document is either a restored default or an internal move.

| Do this | Old key | New key |
|---|---|---|
| Next / previous editor tab | `Alt+.` / `Alt+,` *(dead)* | **`Ctrl+Shift+.`** / **`Ctrl+Shift+,`** |
| Next / previous **terminal** | `Ctrl+Shift+.` / `Ctrl+Shift+,` | **`Ctrl+.`** / **`Ctrl+,`** |
| Reorder tab within group | `Ctrl+.` / `Ctrl+,` | **`Ctrl+Alt+.`** / **`Ctrl+Alt+,`** |
| Open Settings | `Alt+A` *(dead)* | **`Ctrl+Shift+A`** |
| Quick access | `Alt+Enter` *(dead)* | **`Ctrl+Enter`** |
| Move line up / down | `Alt+K` *(dead)* / *nothing* | **`Ctrl+K`** / **`Ctrl+J`** |
| Toggle panel + sidebar together | `Ctrl+.` | **`Ctrl+Shift+;`** |
| Resize the terminal taller / shorter | *nothing that worked* | **`Ctrl+Shift+K`** / **`Ctrl+Shift+J`** |
| Leave the terminal, keep it visible | `Escape` | **`Ctrl+L`** |
| Leave the terminal and hide the panel | `Escape` | **`Ctrl+Shift+L`** |
| Accept a shell autosuggestion | `Ctrl+Y` | **`Ctrl+L`** *(or `Ctrl+Y`, still works)* |

Unchanged and worth remembering, because they now cover cases the dead Alt keys
used to: `<leader>l` focuses the terminal, `<leader>e` is quick fix, `<leader>t`
opens a real kitty window, and `,` / `.` in vim normal mode still switch tabs.

---

## 2. Keys handed back to zsh

These were the blockers. Each was bound in VS Code, so the keystroke never
reached the shell.

| Key | What it means to zsh | Was bound in VS Code to | Now |
|---|---|---|---|
| `Escape` | enter vi **normal mode** | `focusActiveEditorGroup` when `terminalFocus` | `when` narrowed to `sideBarFocus` |
| `Ctrl+P` | `history-search-backward` | `terminal.focusPrevious` | moved to `Ctrl+,` |
| `Ctrl+N` | `history-search-forward` | `terminal.focusNext` | moved to `Ctrl+.` |
| `Ctrl+L` | accept autosuggestion *(new)* | `terminal.resizePaneRight` | rebound to `focusActiveEditorGroup` — see [§10](#10-the-ctrll-trade-off) |
| `Ctrl+H` | backspace | `terminal.resizePaneLeft` | binding deleted |
| `Ctrl+I` | Tab | `terminal.kill`, **no `when` at all** | scoped `!terminalFocus` |
| `Ctrl+J` | newline | `terminal.resizePaneDown`, **no `when`** | resize replaced (see [§11](#11-resizing-the-terminal)); `Ctrl+J` now moves a line down, scoped `editorTextFocus` |
| `Ctrl+K` | — | `terminal.resizePaneUp`, **no `when`** | resize replaced (see [§11](#11-resizing-the-terminal)); `Ctrl+K` now moves a line up, scoped `editorTextFocus` |

`Escape` was the one that mattered. Without it there is no normal mode, so no
motions at all — every other fix here was invisible until it was made.

`Ctrl+I`, `Ctrl+J` and `Ctrl+K` had **no `when` clause**, meaning they fired
everywhere, including mid-keystroke in the terminal.

### Why `Ctrl+H` / `Ctrl+L` were deleted rather than moved

VS Code ships `resizePaneLeft`/`Right` with a **Linux** default of
`Ctrl+Shift+←` / `Ctrl+Shift+→`, which the config had explicitly deleted to free
those keys. Removing both the custom binding *and* the deletion lets the stock
key come back on its own — a smaller config than rebinding.

`resizePaneUp`/`Down` are different: VS Code ships them **mac-only**, with no
Linux default to fall back on. Those two had to be re-homed rather than deleted,
which is what completes the `Ctrl+Shift+<arrow>` family.

---

## 3. Dead Alt bindings, rebound

All 12 were consumed by sway. Verified with a cross-check of every `bindsym` in
`~/.config/sway/config` against every key in `keybindings.json`.

| Command | Was | Sway takes it for | Now |
|---|---|---|---|
| `nextEditor` | `Alt+.` | `ws-cycle.py next` | `Ctrl+Shift+.` |
| `previousEditor` | `Alt+,` | `ws-cycle.py prev` | `Ctrl+Shift+,` |
| `nextPanelView` | `Alt+.` *(panelFocus)* | ↑ | `Ctrl+.` *(panelFocus)* |
| `previousPanelView` | `Alt+,` *(panelFocus)* | ↑ | `Ctrl+,` *(panelFocus)* |
| `unifiedQuickAccess` | `Alt+Enter` | launch kitty | `Ctrl+Enter` |
| `openSettings` | `Alt+A` | `$mod+a` | `Ctrl+Shift+A` |
| `moveLinesUpAction` | `Alt+K` | focus up | `Ctrl+K` |
| `moveLinesDownAction` | *never bound* | focus down | `Ctrl+J` |

`moveLinesDown` was a genuine gap, not a move: VS Code's `Alt+↓` default had been
deleted and never replaced, so moving a line down had **no key at all**. `Alt+J`
would not have worked either — sway takes both `$mod+j` and `$mod+Down`.

### Deleted rather than rebound

| Was | Command | Why it went |
|---|---|---|
| `Alt+E` | `editor.action.quickFix` | `<leader>e` already does this |
| `Alt+L` | `terminal.focus` | `<leader>l` already does this |
| `Shift+Alt+H` | `toggleActivityBarVisibility` | `settings.json` hides the activity bar permanently |
| `Alt+A` | `keybindings.editor.recordSearchKeys` | second, conflicting use of `Alt+A` |
| `Alt+K` | `selectPrevSuggestion` | `Ctrl+P` already does this, on the same condition |

### Displaced to make room

| Command | Was | Now |
|---|---|---|
| `moveEditorLeftInGroup` | `Ctrl+,`, then `Ctrl+Shift+,` | `Ctrl+Alt+,` *(`editorFocus`)* |
| `moveEditorRightInGroup` | `Ctrl+.`, then `Ctrl+Shift+.` | `Ctrl+Alt+.` *(`editorFocus`)* |
| panel + sidebar toggle | `Ctrl+.`, then `Ctrl+Shift+K` | `Ctrl+Shift+;` |
| `positionPanelBottom` | `Ctrl+Shift+J` | **deleted** — a one-time layout choice, already made |

That last one was a trap. The toggle sat **later in the file** than the new
`nextEditor` binding, and VS Code resolves a collision by taking the last rule
whose `when` matches — so `Ctrl+.` would have hidden both panes instead of
switching tabs whenever the panel and sidebar were open.

---

## 4. Four keys now do two things

Sharing is deliberate. Each pair has **mutually exclusive** `when` clauses, so
only one can ever match and file order is irrelevant.

| Key | In the editor | In the terminal |
|---|---|---|
| `Ctrl+,` | *(previous panel view)* | previous terminal |
| `Ctrl+.` | *(next panel view)* | next terminal |

`Ctrl+K` and `Ctrl+J` are shared a different way — not editor vs terminal, but
editor vs *popup*. They move a line normally, and select up/down while the
quick-fix menu is open. Those `codeActionMenuVisible` rules sit later in the
file, so they win in that context.

`Ctrl+Shift+↑` / `Ctrl+Shift+↓` are now unbound entirely — see
[§11](#11-resizing-the-terminal).

One subtlety worth recording: **the terminal lives in the panel**, so
`panelFocus` is true while the terminal has focus. That is why panel-view
navigation could not stay on plain `Ctrl+,` / `Ctrl+.` — it would have hijacked
terminal-to-terminal navigation on the same keys. Moving it to the `Ctrl+Shift+`
pair, where the competing rule is editor-tab navigation scoped `!panelFocus`,
removes the overlap entirely rather than patching around it.

---

## 5. Shell changes (`.zshrc`)

Both live in zsh, not in a terminal's config. That is what makes them behave
**identically in kitty and in VS Code's panel** — two different terminal
emulators running the same shell. Nothing here is emulator-specific.

### `Ctrl+L` accepts the autosuggestion

```zsh
bindkey -M viins '^l' autosuggest-accept
```

Scoped to `viins` **only**. `^l` is `clear-screen` by default in both keymaps;
binding it everywhere would have cost the standard "clear the terminal" key.
This way insert mode accepts the suggestion and **normal mode still clears the
screen** — clearing is `Escape` then `Ctrl+L`. Nothing was lost.

`Ctrl+Y` still accepts too; it was not removed.

| Mode | `Ctrl+L` does |
|---|---|
| insert (`viins`) | `autosuggest-accept` |
| normal (`vicmd`) | `clear-screen` |

### Cursor shape fix

The cursor is a block in normal mode and a beam in insert mode — but it used to
get stuck. `zle-keymap-select` only fires when the keymap **changes**, and
pressing `Escape` then `Enter` starts the next line back in `viins` with no
keymap-change event. The prompt showed a block cursor while you were actually in
insert mode.

Two hooks were added: `line-init` resets the shape at every new prompt, and
`preexec` hands a block to full-screen programs so `vim` and `less` do not
inherit a beam.

They are installed with `add-zle-hook-widget`, **not** `zle -N`. Powerlevel10k
puts its own widgets on those same hooks to drive the `❯` / `❮` prompt char;
`zle -N` replaces a widget, while the hook helper chains onto whatever is
already registered. Both survive.

---

## 6. Settings changes (`settings.json`)

| Setting | Value | Effect |
|---|---|---|
| `terminal.integrated.defaultProfile.linux` | `zsh` | pins the shell, so vi mode exists even before `chsh` has been run |
| `terminal.external.linuxExec` | `kitty` | `Ctrl+Shift+C` and the Explorer's *Open in External Terminal* launch real kitty |
| `terminal.explorerKind` | `both` | keeps the integrated entry in the context menu and adds an external one |
| `terminal.sourceControlRepositoriesKind` | `both` | same, for the SCM view |
| `<leader>t` *(vim normal mode)* | `openNativeConsole` | real kitty at the workspace root |

VS Code spawns the external terminal with `cwd` set and no arguments, so kitty
lands in the right directory by inheritance — no `-d` flag needed.

### What was tried and reverted

The integrated terminal was briefly themed to look like kitty — font, ligatures,
copy-on-select, and all 16 ANSI colors from `current-theme.conf`. It was reverted
in full; the panel uses VS Code's own appearance.

Worth recording **why it can never be more than theming**: VS Code's integrated
terminal is **xterm.js**, a terminal emulator written in JavaScript and compiled
into the Electron app. kitty is a native GPU-accelerated program that draws its
own window. There is no API to swap the emulator, and on Wayland there is no
XEmbed to reparent a native window into Electron. "Use kitty inside VS Code" is
not a setting that exists. `<leader>t` — a real kitty window — is the honest
version of that wish.

---

## 7. Verifying it works

**Terminal vi mode.** Open the panel with `<leader>l`, press `Escape`. The
Powerlevel10k prompt char flips **`❯` → `❮`** (`.p10k.zsh` sets
`PROMPT_CHAR_*_VIINS_CONTENT_EXPANSION`). That is the ground truth for whether
normal mode engaged. Then `k` / `j` walk history and `w`, `b`, `0`, `$`, `ciw`
all work.

**Autosuggestion.** Type a prefix of a command you have run before, and with the
grey suggestion showing press `Ctrl+L` in insert mode.

**Nothing is dead.** To re-check that no VS Code binding is being eaten by sway
after future edits:

```bash
grep -oP '^\s*bindsym\s+\K\S+' ~/.config/sway/config | sort -u
```

Anything starting `$mod+` is unavailable to every application. `$mod` is `Mod1`
= Alt, and `$left/$down/$up/$right` expand to `h/j/k/l`.

**Applying changes.** VS Code reloads `keybindings.json` and `settings.json` on
save. zsh does not — run `exec zsh`, or open a new terminal.

---

## 9. Markdown reading keys

Added rather than moved, so nothing here replaced a shortcut you had. Full
detail in [vim-guide.md §6](vim-guide.md#6-reading-markdown) and
[shell-guide.md §6b](shell-guide.md#6b-reading-markdown--md).

### Shell

| Key | Does |
|---|---|
| `md <file>` | read a `.md` rendered, with a cursor |
| `md` | browse every `.md` below the current directory |
| **`Ctrl+L`** *(insert mode)* | accept the zsh autosuggestion |
| `Ctrl+L` *(normal mode)* | `clear-screen`, unchanged |

`Ctrl+L` is bound with `bindkey -M viins`, insert mode only. It is
`clear-screen` by default in both keymaps, so binding it everywhere would have
cost the standard "clear the terminal" key. Scoped this way, clearing is
`Esc` then `Ctrl+L` and nothing is lost. `Ctrl+Y` still accepts as well.

This is also why `Ctrl+L` had to be freed from VS Code first — see
[§2](#2-keys-handed-back-to-zsh).

### In vim, editing a `.md`

| Key | Does |
|---|---|
| `<leader>m` | render the buffer (`:Glow`) |
| `j` `k` `0` `$` | move by *screen* line, not file line — wrapped paragraphs step smoothly |
| `zM` / `zR` | fold every section into a table of contents / unfold |
| `za` | toggle the section under the cursor |

### In the rendered view

| Key | Does |
|---|---|
| `j` `k` `gg` `G` `/` `n` | ordinary vim motions over the rendered text |
| **`c`** | toggle the current-line highlight — **off by default** |
| `q` | quit |

`q` closes the tab when there is another and quits vim when the render is the
only tab, which is the case coming from `md`. Without that branch it fails with
`E784: Cannot close last tab page`.

---

## 10. The `Ctrl+L` trade-off

`Ctrl+L` now does two different things depending on which terminal you are in,
and that is a deliberate compromise rather than an oversight.

| Where | `Ctrl+L` does |
|---|---|
| VS Code's panel | focus the editor, panel stays open |
| kitty | accept the zsh autosuggestion (insert mode) |
| either, normal mode | `clear-screen` — unchanged |

`.zshrc` binds `^l` to `autosuggest-accept`, but a VS Code keybinding scoped to
`terminalFocus` intercepts the key before the shell ever sees it. Both cannot
have it in the same window.

**Inside VS Code, use `Ctrl+Y` to accept a suggestion** — it was never
unbound and works in both terminals.

To give `^l` back to zsh in VS Code as well, delete the
`focusActiveEditorGroup` entry from `keybindings.json` and pick another key to
leave the terminal; `Ctrl+Shift+;`, `Ctrl+Shift+O` and `Ctrl+Shift+M` are all
free.

---

## 11. Resizing the terminal

**`Ctrl+Shift+K` makes it taller, `Ctrl+Shift+J` shorter** — from the editor as
well as the terminal, and meaning the same thing in both. Neither is scoped;
they do not need to be.

### The command that never worked

These used to run `terminal.resizePaneUp` / `resizePaneDown` — originally on
`Ctrl+K` / `Ctrl+J`, later `Ctrl+Shift+<arrow>`. That command begins:

```js
resizePane(e){ if(!this._splitPaneContainer) return; ... }
```

It resizes panes **within a split terminal** and returns immediately when there
is only one. With a single terminal the binding had been doing nothing at all,
on every key it ever lived on.

`increaseViewHeight` / `decreaseViewHeight` actually resize.

### The commands are named misleadingly

`increaseViewHeight` / `decreaseViewHeight` sound like they resize whatever has
focus. They do not — both are **hardcoded to the editor part**:

```js
increaseViewHeight  "Increase Editor Height"
                    resizePart(0, +INC, ..., "workbench.parts.editor")
decreaseViewHeight  "Decrease Editor Height"
                    resizePart(0, -INC, ..., "workbench.parts.editor")
```

The focused-view commands are `increaseViewSize` / `decreaseViewSize`, without
the part argument. Easy to reach for the wrong pair.

Because the target is fixed, the effect on the terminal is the same wherever
focus is, and **no `when` clause is needed**:

| Key | Command | Editor | Terminal |
|---|---|---|---|
| `Ctrl+Shift+K` | `decreaseViewHeight` | shorter | **taller** |
| `Ctrl+Shift+J` | `increaseViewHeight` | taller | **shorter** |

*This first shipped with a `terminalFocus` / `editorFocus` pair per key, written
on the assumption that these resized the focused view. The keys worked in the
editor and ran backwards in the terminal. Fixed by dropping the branching
entirely — two bindings instead of four.*

### What it costs

Two VS Code defaults are overridden:

| Key | Default it replaces | Why that is fine |
|---|---|---|
| `Ctrl+Shift+K` | Delete Line | vim's `dd` already deletes a line |
| `Ctrl+Shift+J` | Toggle Search Details | already unbound in this config |

And two bindings moved out of the way: the panel+sidebar toggle to
`Ctrl+Shift+;`, and `positionPanelBottom` deleted outright — it moves the panel
to the bottom, which is a one-time layout choice rather than something worth a
permanent key.

---

## 12. The `,` / `.` family

Four layers on the same two keys, each safe in its own context.

| Keys | Does | Scope |
|---|---|---|
| `,` `.` | previous / next **editor tab** | vim normal mode only |
| **`Ctrl+,`** **`Ctrl+.`** | previous / next **terminal** | `terminalFocus` |
| **`Ctrl+,`** **`Ctrl+.`** | **split** — send the current tab to the left / right group | `editorFocus` |
| **`Ctrl+Shift+,`** **`Ctrl+Shift+.`** | previous / next **panel view** — Terminal, Output, Problems, Debug Console | `panelFocus` |
| **`Ctrl+Shift+,`** **`Ctrl+Shift+.`** | previous / next **editor tab** | `!panelFocus` |
| **`Ctrl+Alt+,`** **`Ctrl+Alt+.`** | reorder the current tab | `editorFocus` |

`Ctrl+Shift+,` / `Ctrl+Shift+.` mean "previous / next tab" in both rows — which
*kind* of tab just depends on where you are standing. `panelFocus` and
`!panelFocus` are exact complements, so only one rule can ever match and file
order is irrelevant.

The plain `Ctrl+` pair went to terminal switching because that is the shorter
reach and the more frequent action while working in the panel.

### Resolved, context by context

| | `Ctrl+,` / `Ctrl+.` | `Ctrl+Shift+,` / `Ctrl+Shift+.` | `Ctrl+Alt+,` / `Ctrl+Alt+.` |
|---|---|---|---|
| In the terminal | previous / next terminal | previous / next panel view | — |
| In Output or Problems | — | previous / next panel view | — |
| In the editor | **split left / right** | previous / next editor tab | reorder tab left / right |

Every cell was checked by resolving each rule's `when` against the three focus
contexts, not by reading the file.

### The split

`Ctrl+.` sends the current tab into a group on the right and leaves every other
tab behind; `Ctrl+,` does the same to the left. VS Code creates the group if it
does not exist, so the first press *is* the split and later presses just move
tabs between the halves.

`editorFocus` and `terminalFocus` are mutually exclusive, which is what lets the
same pair mean "switch terminal" down in the panel and "split" up in the editor.

Two older bindings do the same job and were left alone: `<leader>sl` /
`<leader>sr` in vim normal mode, and `Alt+D` — the one surviving `Alt` binding,
since sway happens not to claim `$mod+d`.

### Why not bare `,` and `.` in the terminal

That was the first idea, matching vim normal mode exactly. It cannot work.

In an editor, VSCodeVim owns the keystroke and knows you are in normal mode,
where `,` is a command rather than text. **A terminal has no such mode from VS
Code's side.** zsh's vi mode lives inside the shell process; VS Code pipes bytes
to it and never learns which mode it is in — of its ~25 terminal context keys
(`terminalFocus`, `terminalCount`, `terminalAltBufferActive`, …) **none exposes
the shell's vi mode**, so there is nothing to write a `when` clause against.

A bare `"key": ","` with `when: terminalFocus` would fire on every comma you
type, making `cd ..`, `ls ./src` and `git commit -m "a, b"` impossible.

**In a terminal, only modifier combinations are safe to bind.** Bare keys are
text. That single rule explains most of this document.

---

## 8. The rule going forward

**Do not bind Alt in VS Code.** Sway takes `h j k l a b e f n r s w x`, all
digits, comma, period, space, minus, Return and the arrows — plus every
`$mod+Shift+` variant of those. Only `alt+d` is currently free, and it is one
sway edit away from not being.

**Do not bind bare Ctrl+letter for anything that should work in the terminal.**
Those are control characters.

**`Ctrl+Shift+…` is the safe namespace.** Sway binds zero `ctrl+` combos, and a
terminal cannot transmit `Ctrl+Shift+<letter>` as a distinct character. Every key
introduced here lives there for that reason.

**When a key must be shared, split it with a `when` clause** — `editorFocus` vs
`terminalFocus` — rather than hoping file order saves you. Overlapping `when`
clauses on one key resolve to the **last** matching rule in the file, which is
easy to get wrong and produces no error when you do.
