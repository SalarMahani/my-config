# Keybinding Changes

Everything that moved, why it moved, and what to retrain. Changed 2026-08-16.

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
| Next / previous editor tab | `Alt+.` / `Alt+,` *(dead)* | **`Ctrl+.`** / **`Ctrl+,`** |
| Reorder tab within group | `Ctrl+.` / `Ctrl+,` | **`Ctrl+Shift+.`** / **`Ctrl+Shift+,`** |
| Open Settings | `Alt+A` *(dead)* | **`Ctrl+Shift+A`** |
| Quick access | `Alt+Enter` *(dead)* | **`Ctrl+Enter`** |
| Move line up / down | `Alt+K` *(dead)* / *nothing* | **`Ctrl+Shift+↑`** / **`Ctrl+Shift+↓`** |
| Toggle panel + sidebar together | `Ctrl+.` | **`Ctrl+Shift+K`** |
| Leave the terminal | `Escape` | **`Ctrl+Shift+L`** *(toggles the panel)* |
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
| `Ctrl+P` | `history-search-backward` | `terminal.focusPrevious` | moved to `Ctrl+Shift+,` |
| `Ctrl+N` | `history-search-forward` | `terminal.focusNext` | moved to `Ctrl+Shift+.` |
| `Ctrl+L` | accept autosuggestion *(new)* | `terminal.resizePaneRight` | binding deleted |
| `Ctrl+H` | backspace | `terminal.resizePaneLeft` | binding deleted |
| `Ctrl+I` | Tab | `terminal.kill`, **no `when` at all** | scoped `!terminalFocus` |
| `Ctrl+J` | newline | `terminal.resizePaneDown`, **no `when`** | moved to `Ctrl+Shift+↓` |
| `Ctrl+K` | — | `terminal.resizePaneUp`, **no `when`** | moved to `Ctrl+Shift+↑` |

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
| `nextEditor` | `Alt+.` | `ws-cycle.py next` | `Ctrl+.` |
| `previousEditor` | `Alt+,` | `ws-cycle.py prev` | `Ctrl+,` |
| `nextPanelView` | `Alt+.` *(panelFocus)* | ↑ | `Ctrl+.` *(panelFocus)* |
| `previousPanelView` | `Alt+,` *(panelFocus)* | ↑ | `Ctrl+,` *(panelFocus)* |
| `unifiedQuickAccess` | `Alt+Enter` | launch kitty | `Ctrl+Enter` |
| `openSettings` | `Alt+A` | `$mod+a` | `Ctrl+Shift+A` |
| `moveLinesUpAction` | `Alt+K` | focus up | `Ctrl+Shift+↑` |
| `moveLinesDownAction` | *never bound* | focus down | `Ctrl+Shift+↓` |

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
| `moveEditorLeftInGroup` | `Ctrl+,` | `Ctrl+Shift+,` *(`editorFocus`)* |
| `moveEditorRightInGroup` | `Ctrl+.` | `Ctrl+Shift+.` *(`editorFocus`)* |
| panel + sidebar toggle | `Ctrl+.` | `Ctrl+Shift+K` |

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
| `Ctrl+Shift+,` | reorder tab left | previous terminal |
| `Ctrl+Shift+.` | reorder tab right | next terminal |
| `Ctrl+Shift+↑` | move line up | resize pane up |
| `Ctrl+Shift+↓` | move line down | resize pane down |

`Ctrl+.` and `Ctrl+,` overlap on purpose: they are next/previous **editor**
generally, and next/previous **panel view** while the panel has focus. The
panel rules are placed later in the file so they win in that context.

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
