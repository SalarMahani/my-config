# The Shell — zsh, zinit and Powerlevel10k

**Your version:** zsh 5.9 · Fedora 44 · login shell `/bin/zsh`
**Config:** `~/.zshrc`, `~/.zshenv`, `~/.p10k.zsh` → `~/dotfiles/shell/`

This is the longest guide, because the shell has the most moving parts: five
possible startup files, a plugin manager that installs itself, a prompt with its
own config, and a `bash` config that still exists but almost never runs.

---

## Table of Contents

1. [Which file runs when](#1-which-file-runs-when)
2. [The `.local` split — what makes this repo shareable](#2-the-local-split--what-makes-this-repo-shareable)
3. [`.zshenv` — PATH for every shell](#3-zshenv--path-for-every-shell)
4. [`.zshrc` walkthrough](#4-zshrc-walkthrough)
5. [zinit and Powerlevel10k](#5-zinit-and-powerlevel10k)
6. [vi mode](#6-vi-mode)
7. [`.bashrc` and `.profile`](#7-bashrc-and-profile)
8. [Common changes](#8-common-changes)
9. [Bugs that were fixed here](#9-bugs-that-were-fixed-here)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Which file runs when

This is the part that trips everyone up. zsh reads a *different set* of files
depending on how it was started.

| File | Login shell | Interactive | Script / `zsh -c` |
|---|:---:|:---:|:---:|
| `/etc/zshenv` | ✅ | ✅ | ✅ |
| **`~/.zshenv`** | ✅ | ✅ | ✅ |
| `/etc/zprofile` | ✅ | — | — |
| `~/.zprofile` | ✅ | — | — |
| `/etc/zshrc` | ✅ | ✅ | — |
| **`~/.zshrc`** | ✅ | ✅ | — |
| `/etc/zlogin` | ✅ | — | — |
| `~/.zlogin` | ✅ | — | — |

Read top to bottom in that order. On your machine only the **bold** two exist as
your own files; `~/.zprofile`, `~/.zlogin` and `~/.zlogout` do not.

Two practical rules follow:

- **`~/.zshenv` runs for everything**, including every subshell and every script.
  Keep it small, fast and side-effect free. Environment variables that
  *non-interactive* things need (like `VOLTA_HOME`, so scripts can find node) go
  here — and nothing else.
- **`~/.zshrc` runs only for interactive shells.** Aliases, prompts, keybindings
  and completion belong here. Putting them in `.zshenv` slows down every script
  you run for no benefit.

**Fedora detail:** `/etc/zprofile` sources `/etc/profile`, which is a *sh*
script. That is how system-wide PATH entries (`/usr/local/bin`, snap) reach zsh.
It also means a login zsh has already built most of `$PATH` before `~/.zshrc` is
read — which is why `.zshrc` must add to PATH carefully rather than blindly.

---

## 2. The `.local` split — what makes this repo shareable

This repo is published on GitHub, so the tracked files must contain nothing
personal and nothing machine-specific. The pattern used throughout:

| Tracked (public) | Untracked (private) |
|---|---|
| `~/.zshrc` | `~/.zshrc.local` |
| `~/.bashrc` | `~/.bashrc.local` |
| `~/.gitconfig` | `~/.gitconfig.local` |

Each tracked file ends by sourcing its `.local` counterpart *if it exists*:

```zsh
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
```

`.gitignore` covers all three. Because it is sourced last, `.zshrc.local` wins
over anything in `.zshrc`.

**What belongs in `.local`:** API keys and tokens, PATH entries for apps
installed only on this machine, personal aliases, work-specific settings.

Your `~/.zshrc.local` currently holds the GapCode and Rider PATH entries and the
`kingdom` Wine alias. Your `~/.gitconfig.local` holds your name, email and the
`safe.directory` entries — those name real server paths and must never be
published.

⚠️ On a new machine these files do not exist. Everything still works, except
**git will refuse to commit until you create `~/.gitconfig.local`** with your
identity. The repo README's bootstrap section covers this.

---

## 3. `.zshenv` — PATH for every shell

```zsh
export VOLTA_HOME="$HOME/.volta"
case ":$PATH:" in
    *":$VOLTA_HOME/bin:"*) ;;
    *) export PATH="$VOLTA_HOME/bin:$PATH" ;;
esac
```

Volta is a Node version manager; its shims must be on `$PATH` for
non-interactive shells too, which is why this is in `.zshenv` and not `.zshrc`.

**The `case` is a de-duplication guard, and it is load-bearing.** `.zshenv` runs
for *every* zsh — including every subshell you spawn. Appending unconditionally
means each nested shell prepends the same directory again. That is exactly how
`$PATH` reached 20 entries with `.volta/bin` in it three times. The
`case ":$PATH:" in *":$dir:"*)` idiom adds the directory only if it is not
already there; the surrounding colons make sure the first and last entries match
too.

---

## 4. `.zshrc` walkthrough

### Instant prompt (must stay at the top)

```zsh
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "..."
fi
```

Powerlevel10k caches a snapshot of your prompt and paints it *immediately*, then
finishes loading in the background. It is why your terminal feels instant despite
loading four plugins.

**Anything that prints output or asks a question must go above this block.** If
something below it writes to the terminal during startup, p10k warns you on every
launch — the fix is to move that code above the block, not to silence the warning.

### PATH

```zsh
for dir in "$HOME/.local/bin" "$HOME/bin"; do
    case ":$PATH:" in
        *":$dir:"*) ;;
        *) PATH="$dir:$PATH" ;;
    esac
done
```

Same guard as `.zshenv`, for the same reason. `~/.local/bin` is where `pip
--user` and `pipx` install things; `~/bin` is the traditional spot for your own
scripts (it does not exist yet — creating it is enough to start using it).

### History

```zsh
HISTSIZE=5000            # commands kept in memory
SAVEHIST=$HISTSIZE       # commands written to the file
HISTFILE=~/.zsh_history
```

| Option | Effect |
|---|---|
| `appendhistory` | Add to the file rather than overwriting it |
| `sharehistory` | **Every open shell sees every other shell's history, live** |
| `hist_ignore_space` | A command typed with a leading space is not recorded |
| `hist_ignore_all_dups` | An older duplicate is removed when you repeat a command |
| `hist_save_no_dups` | Do not write duplicates to the file |
| `hist_find_no_dups` | Searching does not show the same command twice |

`hist_ignore_space` is the useful one to remember: prefix a command with a space
and it stays out of your history. Handy for anything with a token in it.

`sharehistory` means a command run in one terminal is instantly available in
another — convenient, but it interleaves history from all your terminals.

### Completion

```zsh
autoload -U compinit && compinit
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
```

`compinit` starts the completion system — required, and must come *after* plugins
that add completions (which is why `zsh-completions` is loaded above it).

The `matcher-list` line makes completion **case-insensitive**: typing `doc<Tab>`
matches `Documents`.

`list-colors` colours the completion menu the same way `ls` colours output.
`${(s.:.)LS_COLORS}` is zsh's split-on-colon syntax turning `LS_COLORS` into an
array.

### Aliases

```zsh
alias ls='eza --icons'
alias ll='eza --icons -la'
alias la='eza --icons -la'
```

[eza](https://github.com/eza-community/eza) is a modern `ls` with colour, icons
and git awareness. `--icons` needs the Nerd Font.

`ll` and `la` are currently identical. A conventional split is `ll` for a long
listing and `la` to include dotfiles:

```zsh
alias ll='eza --icons -l'
alias la='eza --icons -la'
```

The real `ls` is always reachable as `command ls` or `\ls`.

---

## 5. zinit and Powerlevel10k

```zsh
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "${ZINIT_HOME}/zinit.zsh"
```

**zinit installs itself.** On a machine where it is missing, these three lines
clone it on the first zsh start. That is why the bootstrap needs nothing but
`git` for the shell — but also why the *first* shell after a fresh install pauses
for a few seconds. That pause is the clone, not a hang.

```zsh
zinit ice depth"1"
zinit light romkatv/powerlevel10k
```

`zinit ice` sets options for the **next** command only — `depth"1"` means a
shallow clone. `zinit light` loads a plugin without tracking it for reporting
(faster).

```zsh
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
```

| Plugin | What you see |
|---|---|
| `zsh-syntax-highlighting` | Commands turn green when valid, red when not — as you type |
| `zsh-completions` | Extra completion definitions for many tools |
| `zsh-autosuggestions` | Greyed-out suggestion from history; accept with `^y` |

⚠️ **Load each of these exactly once.** Fedora also ships them as RPMs under
`/usr/share/`, and this file used to load both copies — see
[section 9](#9-bugs-that-were-fixed-here).

### Powerlevel10k

The prompt itself. `~/.p10k.zsh` (193 lines, tracked) holds every setting;
`.zshrc` just sources it:

```zsh
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
```

To reconfigure, run **`p10k configure`** — an interactive wizard that rewrites
`~/.p10k.zsh`. Since that file is tracked, review and commit afterwards:

```bash
git -C ~/dotfiles diff shell/.p10k.zsh
```

Useful zinit commands:

| Command | Does |
|---|---|
| `zinit update --all` | Update every plugin |
| `zinit times` | Show what each plugin costs at startup |
| `zinit delete --clean` | Remove plugins no longer in `.zshrc` |

---

## 6. vi mode

```zsh
bindkey -v
export KEYTIMEOUT=1
```

`bindkey -v` gives the command line vi keybindings: `Esc` for normal mode, then
`w`, `b`, `dd`, `ci"` and so on. `KEYTIMEOUT=1` sets the wait after `Esc` to
10ms — the default 0.4s makes vi mode feel sluggish.

```zsh
autoload -Uz add-zle-hook-widget

function _vi_cursor_shape {
  case $KEYMAP in
    vicmd) printf '\e[1 q' ;;   # block = normal mode
    *)     printf '\e[5 q' ;;   # beam  = insert mode
  esac
}
add-zle-hook-widget keymap-select _vi_cursor_shape

function _vi_cursor_beam { printf '\e[5 q' }
add-zle-hook-widget line-init _vi_cursor_beam

autoload -Uz add-zsh-hook
function _vi_cursor_block { printf '\e[1 q' }
add-zsh-hook preexec _vi_cursor_block
```

The cursor shape follows the mode, so you can see which one you are in. The
escape codes are terminal cursor-shape controls: `1` block, `3` underline,
`5` beam.

**Three hooks, and all three are needed.**

`keymap-select` fires when the keymap changes — that is the obvious one, and on
its own it used to be the whole implementation. It is not enough: it fires only
on a *change*, and pressing `Esc` then `Enter` starts the next line back in
`viins` with no change event. The prompt kept showing a block cursor while zsh
was really in insert mode. `line-init` fixes that by resetting the shape at
every new prompt. `preexec` hands a block to full-screen programs, so `vim`,
`less` and `man` do not inherit a beam.

**Why `add-zle-hook-widget` and not `zle -N`.** `zle -N` *replaces* the widget
on a hook. Powerlevel10k puts its own widgets on `keymap-select` and
`line-init` to drive the `❯` / `❮` prompt char, so registering with `zle -N`
here would silently break the prompt indicator. `add-zle-hook-widget` chains
onto whatever is already registered instead, and both survive.

*Fixed 2026-08-16. A/B tested on a pty: before, pressing `Enter` emitted no
cursor sequence at all; now it emits `ESC[5 q`, and p10k's prompt char still
renders in both modes.*

### Key bindings

| Keys | Does |
|---|---|
| `^p` / `^n` | **Prefix** history search — type `git`, press `^p`, walk only `git` commands |
| `^y` | Accept the greyed-out autosuggestion |
| `^l` *(insert mode, kitty)* | Accept the autosuggestion — see below |
| `^l` *(insert mode, VS Code panel)* | Focuses the editor — VS Code intercepts it; use `^y` there |
| `^l` *(normal mode)* | `clear-screen`, zsh's default |
| `Backspace` / `Delete` | Rebound because vi insert mode does not handle them by default |

`history-search-backward` is prefix-aware, unlike plain up-arrow. It is the most
useful binding in the file.

`^l` is bound with `bindkey -M viins` — **insert mode only**, deliberately. It
is `clear-screen` by default in both keymaps, and overriding it everywhere
would cost the standard "clear the terminal" key. Scoped this way, insert mode
accepts the suggestion and normal mode still clears, so clearing is `Esc` then
`^l` and nothing is lost.

These keys only reach zsh at all because VS Code was made to stop intercepting
them — `^l`, `^p`, `^n`, `^h`, `^i` and `Esc` were all bound in its
`keybindings.json`. See
[keybinding-changes.md](keybinding-changes.md).

---

## 6b. Reading markdown — `md`

```zsh
md <file>   # read it rendered, with a cursor
md          # browse every .md below the current directory
```

`md` renders markdown with [glow](https://github.com/charmbracelet/glow):
styled headings, bordered tables, highlighted code blocks. It is defined in
`.zshrc`, and it does **not** call `glow --pager`.

**Why not the pager.** Glow's pager scrolls but has no cursor, so you cannot see
which line you are on and none of `j`, `k`, `/`, `gg` or `G` work. `md` hands
off to vim's `:Glow` instead, which runs glow inside a vim *terminal buffer* —
glow's colours and layout, vim's cursor and motions. `q` quits. Full details in
[vim-guide.md](vim-guide.md#6-reading-markdown).

For the plain, faster pager without a cursor, call glow directly: `glow -p <file>`.

Configuration lives in the `glow` package (`~/.config/glow/`), including a
custom style built from kitty's Dimmed Monokai palette so rendered markdown
matches the terminal around it.

---

## 7. `.bashrc` and `.profile`

Your login shell is `/bin/zsh`, so **these barely ever run**. `.bashrc` executes
only if you explicitly start `bash`.

`.bashrc` is mostly Fedora's default: source `/etc/bashrc`, add
`~/.local/bin` and `~/bin` to PATH, and run every file in `~/.bashrc.d/`. Yours
adds Volta and the JetBrains vmoptions hook.

`.profile` is read by *sh-compatible login shells*. On this machine it is
reached indirectly — `/etc/zprofile` sources `/etc/profile`, not your
`~/.profile` — so it mostly matters for display managers and non-zsh logins.

Both duplicate the Volta and JetBrains lines from `.zshenv`. Harmless: the
JetBrains line is guarded by `[ -f ]`, and PATH additions are now guarded
against duplication.

---

## 8. Common changes

**Add an alias** — in `.zshrc` under Aliases, or in `~/.zshrc.local` if it is
personal. Apply with `source ~/.zshrc` or a new terminal.

**Add a PATH entry** — machine-specific ones go in `~/.zshrc.local`, using the
existence-checked loop already there so a stale path cannot linger.

**Add a plugin**

```zsh
zinit light zsh-users/zsh-history-substring-search
```

Place it with the other `zinit light` lines, above `compinit`.

**Change the prompt** — `p10k configure`, then commit the diff.

**Keep more history** — raise `HISTSIZE`; `SAVEHIST` follows it automatically.

**Turn off shared history** — remove `setopt sharehistory` if you would rather
each terminal keep its own.

**Go back to emacs keybindings** — remove `bindkey -v` (and the `-M viins`
lines, which would no longer apply).

**Time your startup**

```bash
time zsh -i -c exit     # total
zinit times             # per plugin
```

---

## 9. Bugs that were fixed here

Recorded because each was invisible in normal use, and each could come back.

**A relative PATH entry.** `.zshrc` had `export PATH="APPS/webstorm/bin:$PATH"`
— no leading slash. A relative entry in `$PATH` resolves against whatever
directory you happen to be in, so it is both broken and a security smell: `cd`
into a directory containing an `APPS/webstorm/bin/ls` and you would run *that*.
Removed, along with five more copies in `.bashrc` (`/APPS/webstorm/bin` appeared
**five times**) — WebStorm is uninstalled and none of the six paths existed.

**Plugins loaded twice.** zinit loaded `zsh-syntax-highlighting` and
`zsh-autosuggestions`, then two `source /usr/share/...` lines loaded the Fedora
RPM copies of both again. Slower startup and two highlighters competing. The
`/usr/share` lines were removed; zinit's copies are authoritative.

**You could not type a capital L.** `bindkey -M viins 'L' autosuggest-accept`
binds the literal character `L` in insert mode, so shift+l ran the accept widget
instead of inserting the letter. Rebound to `^y`.

**PATH accumulated duplicates.** Unconditional appends in `.zshenv` (which runs
for every subshell) plus `.zshrc` produced 20 entries, several triplicated. Both
now use the `case ":$PATH:"` guard. Verified in a clean environment: 11 entries,
no duplicates.

**A dead alias.** `alias ls='ls --color'` was overridden 40 lines later by the
`eza` alias. Removed.

**The vi-mode cursor got stuck.** Only `zle-keymap-select` was hooked, and it
fires solely on a keymap *change* — so `Esc` then `Enter` left the next prompt
showing a block cursor while zsh was back in insert mode. Fixed with `line-init`
and `preexec` hooks, installed via `add-zle-hook-widget` so Powerlevel10k's
widgets on the same hooks survive. See [§6](#6-vi-mode).

---

## 10. Troubleshooting

**A change did nothing.** `.zshrc` is read at shell start. `source ~/.zshrc` or
open a new terminal. Note `source` cannot undo things — for a clean test use
`exec zsh`.

**Check PATH honestly.** A running shell inherits `$PATH` from its parent, so
`echo $PATH` in an existing terminal can show entries your config no longer sets.
For the truth about what a fresh login builds:

```bash
env -i HOME="$HOME" TERM=xterm USER="$USER" /bin/zsh -l -i -c 'print -l $path'
```

**Find duplicates**

```bash
print -l $path | sort | uniq -d
```

**Startup is slow.** `zinit times` shows the cost per plugin. A first-run clone
of zinit or a plugin is a one-off pause, not a permanent regression.

**"[Powerlevel10k] detected console output during initialization."** Something
below the instant-prompt block printed to the terminal. Move it above the block.

**A key types the wrong thing.** Find what it is bound to:

```bash
bindkey -M viins | grep '"L"'     # or whichever key
```

An empty result means the key is free and self-inserts, which is normal.

**Syntax-check without running**

```bash
zsh -n ~/.zshrc
bash -n ~/.bashrc
```

**Which file set this variable?** Add `set -x` temporarily, or bisect by
commenting blocks. Remember `.zshenv` runs first and for every shell.

**git refuses to commit on a new machine.** `~/.gitconfig.local` does not exist,
so `user.email` is unset. Create it — see the repo README's bootstrap section.
