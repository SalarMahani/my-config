# Documentation

A guide per program. Each one walks through *your actual config file*, explains
why it is the way it is, and ends with copy-pasteable recipes and a
troubleshooting section.

Written for albos · Fedora 44 · Acer laptop (Intel i915), coming from KDE Plasma.

| Guide | Covers | Read it when |
|---|---|---|
| [sway-guide.md](sway-guide.md) | The compositor — tiling, the tree, outputs, keybindings, the odd/even workspace scheme, idle & lock | Windows, monitors, workspaces, keyboard shortcuts, anything about the desktop itself |
| [waybar-guide.md](waybar-guide.md) | The status bar — modules, format strings, CSS styling | The bar shows the wrong thing, or you want to add/restyle a module |
| [kitty-guide.md](kitty-guide.md) | The terminal — fonts, themes, the theme-marker mechanism | Terminal colours, font size, ligatures, scrollback |
| [rofi-guide.md](rofi-guide.md) | The launcher — modes, the rasi language, the widget tree | `$mod+space` behaves oddly, or you want to resize/restyle the popup |
| [mako-guide.md](mako-guide.md) | Notifications — sender vs displayer, criteria, do-not-disturb | Notifications look wrong, do not appear, or stay too long |
| [clipboard-guide.md](clipboard-guide.md) | Clipboard — the `wl-paste` → `cliphist` → rofi chain behind `$mod+v`, the permanent **constants** behind `$mod+c`, and getting a secret back out | `$mod+v` shows nothing, an entry will not paste back, or you copied a password |
| [vscode-guide.md](vscode-guide.md) | VS Code — settings, Vim mode, keybindings, extensions | Editor settings, a keybinding not firing, setting up a new machine |
| [shell-guide.md](shell-guide.md) | zsh — startup order, zinit, Powerlevel10k, history, vi mode | Aliases, PATH, prompt, completion, "why did my change not apply" |
| [terminal-vs-shell.md](terminal-vs-shell.md) | The concept — what kitty is vs what zsh is, the PTY between them, which one to configure | You are not sure whether a setting belongs to the terminal or the shell, or why a keybinding never arrives |
| [vim-guide.md](vim-guide.md) | vim — the 8-line `.vimrc`, `.ideavimrc` for JetBrains, leader key, netrw | Editing settings, indentation, adding mappings, or working out which of your three vim configs to change |
| [startpage-guide.md](startpage-guide.md) | The Chrome new tab — the file:// + extension split, setup on a new machine, every key, the Vimium pass-through rule | The new tab is blank or wrong, a key stopped working, or you are setting Chrome up again |
| [symlinks-guide.md](symlinks-guide.md) | How the repo works — `ln -s`, the traps, adding a config yourself | You want to track a new config, or something broke after moving files |
| [keybinding-changes.md](keybinding-changes.md) | Every shortcut that moved and why — the Alt/sway collision, the terminal control keys, what to retrain | A shortcut you remember stopped working, or you are about to add a new one |

## Start here

**Nothing works / the desktop looks broken** → [sway-guide.md](sway-guide.md),
troubleshooting cookbook at the end.

**"How does this repo actually work?"** → [symlinks-guide.md](symlinks-guide.md),
which explains the one mechanism everything rests on.

**"Is this kitty's job or zsh's job?"** → [terminal-vs-shell.md](terminal-vs-shell.md),
which separates the two programs people most often treat as one.

**Setting this up on a new machine** → the repo [README](../README.md), which has
the dependency list and bootstrap order.

**"Where does this setting live?"** → [sway-guide.md §4](sway-guide.md#4-where-config-lives-and-how-it-loads)
maps every path that affects the session.

## The one rule that explains most surprises

Each of these programs is **separate**. There is no central settings database,
nothing coordinates them, and none of them reloads automatically just because
you saved a file. How a change is applied differs per program:

| Program | Apply a change with |
|---|---|
| sway | `$mod+Shift+c` |
| waybar | `$mod+Shift+c` (sway restarts it via `exec_always`) |
| kitty | `Ctrl+Shift+F5`, or a new window |
| rofi | Nothing — read fresh on every launch |
| mako | `makoctl reload` |
| Clipboard history and constants | `$mod+Shift+c` restarts the recorder (`exec_always`); the rofi picker, its theme and the constants are all read fresh on every launch |
| zsh | New terminal, or `exec zsh` |
| vim | `:source ~/.vimrc`, or restart |
| VS Code | Nothing — settings apply live |
| StartPage | Reload the card at `chrome://extensions`, then the tab |

The exception worth memorising: **`swayidle`'s timers are on an `exec` line, so
`$mod+Shift+c` does NOT apply changes to them.** You must `pkill -x swayidle`
and restart it, or log out.

## Conventions

- `$mod` is **Alt** (`Mod1`), not Super. Most sway tutorials online assume Super.
- Config files live in `~/dotfiles/` and are symlinked into `$HOME`; editing
  either path is the same act.
- Anything personal or machine-specific lives in a `.local` file that git
  ignores — see [shell-guide.md §2](shell-guide.md#2-the-local-split--what-makes-this-repo-shareable).
