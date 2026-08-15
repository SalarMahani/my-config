# dotfiles

Configuration for albos · Fedora 44 · sway on an Acer laptop (Intel i915).

Files live here and are **symlinked** into `$HOME`. Editing
`~/.config/sway/config` and editing `~/dotfiles/sway/.config/sway/config` are
the same act — the first is a link to the second. So the workflow is just:
edit as usual, then `git diff` before you reload.

## Install

```bash
git clone <this repo> ~/dotfiles
cd ~/dotfiles
./install.sh --dry-run     # always look first
./install.sh               # apply
./install.sh sway waybar   # or just some packages
./install.sh --list        # what packages exist
```

Anything real already sitting at a target path is moved to
`<path>.bak-YYYY-MM-DD` — never deleted. Re-running is free; correct symlinks
are reported `ok` and left alone.

## Layout

Each top-level directory is a **package** whose contents mirror `$HOME`:

```
sway/.config/sway/config   ->   ~/.config/sway/config
shell/.zshrc               ->   ~/.zshrc
```

| Package | Contents |
|---|---|
| `sway` | Compositor config, `config.d/`, helper scripts |
| `waybar` | Bar modules (`config.jsonc`) and styling (`style.css`) |
| `kitty` | Terminal config and current theme |
| `rofi` | Launcher theme |
| `shell` | `.zshrc`, `.bashrc`, `.profile` |
| `vim` | `.vimrc` |
| `git` | `.gitconfig` |
| `docs` | The full sway guide — **not** installed, reference only |

This is deliberately **GNU stow's package format**. Nothing here needs stow —
`install.sh` has no dependencies — but if you ever `dnf install stow`, then
`stow sway` from this directory does the same job with no restructuring.

`sway`, `waybar`, `kitty` and `rofi` are linked as whole **directories**, so a
new script dropped into `sway/.config/sway/scripts/` is picked up with no
re-run. The `$HOME` dotfiles are linked per **file**, so nothing else in your
home directory gets swept in.

## Not tracked, on purpose

- **`~/.config/gtk-3.0` and `gtk-4.0`** — app-managed, rewritten by GTK itself,
  and full of binary assets. Tracking them produces noisy diffs you would learn
  to ignore, which defeats the point.
- **Secrets and machine-specific settings** — put them in `~/.zshrc.local`,
  which `.gitignore` covers. Never commit tokens or keys.
- **`~/Pictures/wallpapers/`** — referenced by the sway config and `lock.sh`,
  but images do not belong in a config repo. On a fresh machine you must
  restore these separately or the lock screen falls back to a blank image.

## Editing sway safely

```bash
sway --validate            # parse check; silence means OK
swaymsg reload             # or $mod+Shift+c
git -C ~/dotfiles diff     # review before you reload, revert with git checkout
```

`swaymsg <any config line>` applies a setting live without editing anything,
which is the fastest way to experiment.

Two traps worth remembering:

- **`exec` runs only at sway startup; `exec_always` runs on every reload.** The
  `swayidle` line is `exec`, so changing its timers and reloading does *nothing*
  — the old process keeps the old timers. `pkill -x swayidle` and re-run it, or
  log out and back in.
- **`swaymsg -t get_config` does not expand the `include`.** It returns only the
  top-level file, so grepping it for a system binding finds nothing even though
  the binding is live. To search everything:
  ```bash
  grep -rn PATTERN ~/.config/sway/ /etc/sway/config.d/ /usr/share/sway/config.d/
  ```

## If the sway config outgrows one file

It is currently ~290 lines in nine numbered sections, which one `grep` searches
fine. If it ever genuinely needs splitting, **do not use
`~/.config/sway/config.d/`.** Two reasons:

1. Fedora's `layered-include` matches files **by filename** across
   `/usr/share/sway/config.d/`, `/etc/sway/config.d/` and yours. A file named
   `60-bindings-media.conf` would silently *replace* Fedora's and kill your
   media keys. This shadowing is already used deliberately — the empty
   `config.d/90-bar.conf` is what stops waybar being started twice — so it cuts
   both ways.
2. `config.d/` loads *after* the main config, so anything moved there gains
   override precedence it did not have before: a semantic change disguised as
   tidying.

The safe pattern is a **separate** directory, e.g. `~/.config/sway/conf.d/`,
with explicit `include` lines placed exactly where you want them in the load
order.

## Full documentation

`docs/sway-guide.md` is a complete guide to this setup — how sway works, every
config section explained, the workspace scheme, keybindings, known issues, and
a troubleshooting cookbook. It is also symlink-readable at `~/Desktop/doc/`.
