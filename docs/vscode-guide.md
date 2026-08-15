# VS Code

**Your version:** 1.133.0 · Fedora 44
**Config:** `~/.config/Code/User/` → `~/dotfiles/vscode/.config/Code/User/`

Three files are tracked. The rest of `~/.config/Code` — 549 MB of it — is
deliberately left alone, and understanding why is the most important thing in
this guide.

---

## Table of Contents

1. [Why only three files](#1-why-only-three-files)
2. [`settings.json`](#2-settingsjson)
3. [`keybindings.json`](#3-keybindingsjson)
4. [Extensions](#4-extensions)
5. [The symlink caveat](#5-the-symlink-caveat)
6. [Common changes](#6-common-changes)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Why only three files

`~/.config/Code` is **549 MB**, and almost none of it is configuration:

| Path | Size | What it is |
|---|---|---|
| `CachedExtensionVSIXs` | 166 MB | Downloaded extension packages |
| `User/History` | 98 MB | Local file history — every edit you have made |
| `WebStorage`, `Cache`, `CachedData` | 241 MB | Browser-engine caches |
| `User/globalStorage` | 33 MB | Per-extension state, **including auth tokens** |
| `User/workspaceStorage` | 1.6 MB | Per-project UI state |
| **`User/settings.json`** | **4.6 KB** | **Your settings** |
| **`User/keybindings.json`** | **36 KB** | **Your keybindings** |

So the `vscode` package links **individual files**, not the directory. Linking
`~/.config/Code` wholesale would put half a gigabyte of cache into git and —
much worse — publish `globalStorage`, which holds extension credentials.

The package is **48 KB**:

```
vscode/.config/Code/User/settings.json
vscode/.config/Code/User/keybindings.json
vscode/.config/Code/User/extensions.txt
```

⚠️ This is why `vscode` must **never** be added to `DIR_LINK_PACKAGES` in
`install.sh`, unlike sway, waybar, kitty, rofi and mako.

Two files in `User/` are also deliberately skipped: `keybindings.json.6623eaec.bak`
(a VS Code backup) and `nano.7812.save` (a stray nano swap file). `snippets/` is
empty, and git cannot track empty directories — add files there and re-run
`./install.sh vscode` to pick them up.

---

## 2. `settings.json`

JSON with comments (`jsonc`), so `//` is legal. Trailing commas are tolerated by
VS Code but not by strict parsers.

Nothing in it is machine-specific — no absolute paths, no tokens — which is why
it is safe to publish.

### Vim mode is the heart of it

You run the `vscodevim.vim` extension with `<space>` as leader, matching your
real `.vimrc` ([vim-guide.md](vim-guide.md), §2). The muscle memory carries
across the editor, the terminal (`bindkey -v` in zsh) and vim itself.

```jsonc
"vim.leader": "<space>",
"vim.useSystemClipboard": true,
"vim.easymotion": true,
"vim.sneak": true,
"vim.surround": true,
"vim.scrolloff": 13,
"editor.cursorSurroundingLines": 13,   // must match vim.scrolloff
```

That last pair matters: `vim.scrolloff` controls the Vim extension, but VS Code
does its own scrolling, so `editor.cursorSurroundingLines` has to be set to the
same number or the two fight. (Your `.vimrc` uses `scrolloff=15`; these are 13.
Harmless, but worth knowing they are not in sync.)

Notable normal-mode mappings:

| Keys | Does |
|---|---|
| `<leader>d` | Show hover docs |
| `<leader>s` | Save |
| `<leader>f` | Close editor |
| `<leader>e` | Quick fix |
| `<leader>a` | Focus explorer |
| `<leader>l` | Focus terminal |
| `<leader>sl` / `<leader>sr` | Move editor to left/right group |
| `H` / `L` | Start / end of line (`^` and `$`) |
| `,` / `.` | Previous / next editor |
| `<` / `>` | Move editor left / right in group |

`H`/`L` and `,`/`.` are worth noting — `,` and `.` do the same job in sway
(previous/next workspace on the monitor), so the same two keys mean "step
between things" at both levels.

### The rest

```jsonc
"editor.smoothScrolling": false,
"workbench.list.smoothScrolling": false,
"editor.cursorSmoothCaretAnimation": "off",
"explorer.autoReveal": false,
"editor.occurrencesHighlight": "off",
```

A deliberate anti-jump group, commented in the file as fixing a "Top to Bottom"
scrolling problem. Worth keeping together — they solve one symptom.

```jsonc
"editor.defaultFormatter": "esbenp.prettier-vscode",
"editor.formatOnSave": true,
"prettier.requireConfig": true,
"files.autoSave": "onFocusChange",
```

`prettier.requireConfig: true` is the important one: Prettier only formats
projects that have their own config file, so it cannot reformat a repo that has
not opted in.

```jsonc
"editor.fontFamily": "'Source Code Pro', 'JetBrains Mono', 'Courier New', monospace",
```

A fallback chain, used left to right. **`Source Code Pro` is installed;
`JetBrains Mono` is not**, so the second entry never applies. Either install it
or drop it from the list.

Note this is *not* the Nerd Font the rest of your desktop uses — VS Code draws
its own icons, so it does not need one.

---

## 3. `keybindings.json`

1109 lines, 225 bindings, and most of them are **unbindings**. Entries whose
command starts with `-` remove a default:

```jsonc
{ "key": "alt+h", "command": "-testing.toggleTestingPeekHistory", "when": "..." }
```

That is why the file is so large — clearing VS Code defaults out of the way of
Vim-mode keys takes a lot of lines.

⚠️ **Alt is also your sway `$mod`.** Sway grabs `Alt+h/j/k/l` for window focus
*before* VS Code ever sees them, so an `alt+…` binding here can appear dead for
reasons that have nothing to do with VS Code. If a binding does not fire, check
whether sway claimed it first:

```bash
grep -n "alt" ~/.config/sway/config
```

Edit bindings through the UI with `Ctrl+K Ctrl+S`, or `<leader>w` in normal
mode — you have that mapped to `workbench.action.openGlobalKeybindings`.

---

## 4. Extensions

Extensions are **not** tracked — they live in `~/.vscode/extensions` and are
hundreds of megabytes. What is tracked is the *list*:

```
vscode/.config/Code/User/extensions.txt
```

22 extensions, regenerated with:

```bash
code --list-extensions > ~/.config/Code/User/extensions.txt
```

Reinstall them all on a new machine:

```bash
xargs -n1 code --install-extension < ~/.config/Code/User/extensions.txt
```

Refresh the list after adding or removing one, then commit — otherwise a new
machine gets a stale set.

The list as it stands:

| Extension | Role |
|---|---|
| `vscodevim.vim` | Vim mode — everything in `settings.json` depends on it |
| `monokai.theme-monokai-pro-vscode` | Theme and icons named in settings |
| `pkief.material-icon-theme` | Second icon theme (`activeIconPack: react`) |
| `esbenp.prettier-vscode` | The configured default formatter |
| `dbaeumer.vscode-eslint` | Linting |
| `bradlc.vscode-tailwindcss`, `stivo.tailwind-fold` | Tailwind |
| `dsznajder.es7-react-js-snippets`, `xabikos.javascriptsnippets` | React/JS snippets |
| `firsttris.vscode-jest-runner`, `vitest.explorer`, `wallabyjs.quokka-vscode` | Test runners |
| `anthropic.claude-code` | Claude Code |
| others | Comments, paths, colours, spell check, YAML, Live Server |

Three are named directly in `settings.json` — the Monokai theme, Material icons
and Prettier — so removing them breaks settings rather than just losing a
feature.

---

## 5. The symlink caveat

**Watch this the first time you change a setting through the VS Code UI.**

Some editors save by writing a temporary file and renaming it over the target.
That replaces a symlink with a regular file, which silently disconnects your
config from the repo — edits stop showing up in `git diff` and you do not notice
for weeks.

VS Code is generally well behaved here, but verify it once:

```bash
# change any setting through the Settings UI, then:
ls -la ~/.config/Code/User/settings.json
```

You want to see `settings.json -> /home/albos/dotfiles/...`. If it has become a
regular file, the symlink was replaced — move your edited copy into the repo and
re-link:

```bash
cp ~/.config/Code/User/settings.json ~/dotfiles/vscode/.config/Code/User/settings.json
./install.sh vscode
```

Editing the file directly (`Ctrl+Shift+P` → "Open User Settings (JSON)") avoids
the risk entirely.

---

## 6. Common changes

**Add a setting** — edit `~/.config/Code/User/settings.json` (or the repo path;
same file). Applies immediately, no restart.

**Change the theme** — `Ctrl+K Ctrl+T` picks one, and VS Code writes
`workbench.colorTheme` into settings for you. Commit the diff.

**Add a Vim mapping** — append to `vim.normalModeKeyBindingsNonRecursive`:

```jsonc
{ "before": ["<leader>", "q"], "commands": ["workbench.action.closeWindow"] }
```

`before` is the key sequence; `commands` is a VS Code command ID, and `after`
maps to other Vim keys instead.

**Install JetBrains Mono**, which settings already ask for:

```bash
sudo dnf install jetbrains-mono-fonts
```

**After changing extensions** — refresh the list and commit:

```bash
code --list-extensions > ~/.config/Code/User/extensions.txt
git -C ~/dotfiles diff vscode/
```

**Track snippets** — add files to `~/.config/Code/User/snippets/`, then
`./install.sh vscode` to link them.

---

## 7. Troubleshooting

**A keybinding does nothing.** Most likely sway claimed it first — especially
anything with Alt, which is `$mod`. Check `~/.config/sway/config`. VS Code's own
conflicts are visible in `Ctrl+K Ctrl+S`, which flags duplicates.

**Settings changes are not in `git diff`.** The symlink was probably replaced —
see [section 5](#5-the-symlink-caveat).

**The font looks wrong.** `JetBrains Mono` is not installed, so the chain falls
through to `Source Code Pro`. Check with:

```bash
fc-list | grep -ci "JetBrains Mono"
```

**Vim mode is not working.** `vscodevim.vim` is missing. Everything under
`vim.*` in settings is inert without it:

```bash
code --list-extensions | grep vscodevim
```

**Formatting does not happen on save.** `prettier.requireConfig` is `true`, so
the project needs its own `.prettierrc`. That is deliberate.

**A new machine has no extensions.** Run the `xargs` line in
[section 4](#4-extensions) — cloning the repo does not install them.
