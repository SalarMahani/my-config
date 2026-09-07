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
| `mako` | Notification daemon styling |
| `vscode` | VS Code `settings.json`, `keybindings.json`, extension list |
| `shell` | `.zshrc`, `.zshenv`, `.bashrc`, `.profile`, `.p10k.zsh` |
| `vim` | `.vimrc` (terminal vim) and `.ideavimrc` (JetBrains IdeaVim) |
| `git` | `.gitconfig` |
| `glow` | Markdown renderer config and the Dimmed Monokai style |
| `bin` | `~/.local/bin` helpers (`glow-pty`) |
| `wallpapers` | 12 images → `~/Pictures/wallpapers` |
| `startpage` | Chrome new-tab extension → `~/StartPage` (code only; its images are untracked) |
| `docs` | The guides — **not** installed, reference only |

This is deliberately **GNU stow's package format**. Nothing here needs stow —
`install.sh` has no dependencies — but if you ever `dnf install stow`, then
`stow sway` from this directory does the same job with no restructuring.

`sway`, `waybar`, `kitty`, `rofi`, `mako`, `wallpapers` and `startpage` are linked as
whole **directories**, so a new script dropped into `sway/.config/sway/scripts/` is
picked up with no re-run. `startpage` is the one package whose payload lands directly
in `$HOME` rather than one level down, so it is listed separately in
`DIR_LINK_DEPTH1_PACKAGES`. The `$HOME` dotfiles are linked per **file**, so
nothing else in your home directory gets swept in.

⚠️ `vscode` **must** stay per-file. `~/.config/Code` is 549 MB of caches,
extension packages and `globalStorage` (which holds extension auth tokens) —
directory-linking it would commit all of that and publish credentials. Only
three files, 48 KB, are tracked.

⚠️ `startpage` **must** stay a directory link too. Chrome loads `~/StartPage` as an
unpacked extension; a single symlink to a directory of real files is a far better
trodden path than a tree of symlinked files inside an extension directory.

⚠️ `wallpapers` **must** stay a directory link. `wallpaper-next.sh` searches with
`find -L … -type f`; a plain per-file symlink is `-type l`, so the search would
return zero images and the cycler would silently stop working.

## Not tracked, on purpose

- **`~/.config/gtk-3.0` and `gtk-4.0`** — app-managed, rewritten by GTK itself,
  and full of binary assets. Tracking them produces noisy diffs you would learn
  to ignore, which defeats the point.
- **Secrets, identity and machine-specific settings** — these live in
  `~/.zshrc.local`, `~/.bashrc.local` and `~/.gitconfig.local`, all covered by
  `.gitignore`. The tracked configs source them if present. See
  [docs/shell-guide.md §2](docs/shell-guide.md#2-the-local-split--what-makes-this-repo-shareable).
- **FiraCode Nerd Font** — 50M and owned by no package. A bootstrap step below.
- **StartPage's wallpapers** (`startpage/StartPage/wallpaper-picutes/`) — 88M, and
  unlike the sway wallpapers they are *not* load-bearing: no config names a specific
  file, and the page shows "No wallpapers indexed" and carries on without them. The
  generated `wallpapers.js` is ignored with them. ⚠️ They sit inside the repo working
  tree, so **`git clean -xdf` here would delete them.**

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

## License

MIT — see [LICENSE](LICENSE). Take anything useful.

## Full documentation

[`docs/`](docs/README.md) has a guide per program — sway, waybar, kitty, rofi,
the shell and vim. Each walks through the actual config file, explains why it is
the way it is, and ends with recipes and troubleshooting. Start at
[docs/README.md](docs/README.md).

---

# Setting up on a new machine

Written for **Fedora**. On another distribution the package names differ but the
steps do not.

## 1. Install the dependencies

Every package below is here because something in this repo actually calls it —
the list was built by resolving each binary the configs invoke back to its
owning RPM, not from memory.

```bash
sudo dnf install -y \
  sway swaylock swayidle swaybg \
  waybar kitty rofi \
  zsh zsh-autosuggestions zsh-syntax-highlighting \
  eza jq python3 git vim-enhanced glow \
  libnotify grimshot brightnessctl pulseaudio-utils wl-clipboard cliphist \
  papirus-icon-theme mako
```

**Do not drop `mako`.** `libnotify` provides `notify-send`, which only *sends*
notifications; sway ships nothing that *displays* them. Without a daemon, D-Bus
still advertises `org.freedesktop.Notifications` as activatable, so `notify-send`
does not fail fast — it waits out the activation timeout, measured at **85
seconds**. Fedora's brightness and volume bindings each fire a notification, so
every key press would leave a process stuck for that long.

It is started from the sway config's §6:

```
exec_always sh -c 'pkill -x mako; mako'
```

Styled to match waybar and rofi in the `mako` package; see
[docs/mako-guide.md](docs/mako-guide.md). Verify after login:
`notify-send test test` should return in milliseconds and put a popup on
screen.

What each is for, so you can drop what you do not want:

| Package | Needed by |
|---|---|
| `sway` | The compositor. Also provides `swaymsg` and `swaynag` |
| `swaylock` `swayidle` `swaybg` | Lock screen, idle timers, wallpaper |
| `waybar` | The status bar |
| `kitty` | Terminal (`$mod+Return`) |
| `rofi` | Launcher (`$mod+space`) |
| `zsh` | The login shell |
| `zsh-autosuggestions` `zsh-syntax-highlighting` | Installed for completeness — **the config loads its own copies via zinit**, so these are optional |
| `eza` | The `ls` / `ll` / `la` aliases |
| `jq` | Used when inspecting sway's IPC output |
| `python3` | `ws-cycle.py`, the workspace navigation script |
| `git` | Cloning this repo, and zinit self-installs with it |
| `vim-enhanced` | The editor. **Not** `vim` — on Fedora that is a metapackage; `vim-enhanced` is what provides `/usr/bin/vim` |
| `libnotify` | `notify-send`, used by `wallpaper-next.sh` — sends notifications |
| `mako` | **Displays** them. Without it notify-send blocks ~85s and nothing appears. Started by sway §6 |
| `grimshot` | Screenshots (`Print`, bound by Fedora's sway config.d) |
| `brightnessctl` `pulseaudio-utils` | Brightness and volume keys |
| `wl-clipboard` | `wl-copy` / `wl-paste` — the clipboard itself, and the watcher behind the history |
| `cliphist` | Clipboard history (`$mod+v`). Stores what `wl-paste --watch` feeds it; see [docs/clipboard-guide.md](docs/clipboard-guide.md). The clipboard **constants** (`$mod+c`) add no dependency -- they need only `wl-clipboard`, `rofi`, `kitty` and `vim`, all already here |
| `papirus-icon-theme` | Application icons in rofi |

## 2. Install the Nerd Font — `dnf` cannot do this

**Do not skip this.** waybar, kitty and rofi all name `FiraCode Nerd Font`.
Without it every icon renders as an empty box (▯) and the desktop looks broken
in a way that is easy to misdiagnose as a config problem.

It is not packaged — it must be downloaded:

```bash
mkdir -p ~/.local/share/fonts/FiraCodeNerdFont
cd /tmp
curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FiraCode.zip
unzip -o FiraCode.zip -d ~/.local/share/fonts/FiraCodeNerdFont
fc-cache -f
```

Verify — a non-zero count for **both**, since kitty needs the `Mono` variant:

```bash
fc-list | grep -c "FiraCode Nerd Font"
fc-list | grep -c "FiraCode Nerd Font Mono"
```

## 3. Clone and link

```bash
git clone <your-repo-url> ~/dotfiles
cd ~/dotfiles
./install.sh --dry-run      # read this before applying
./install.sh
```

Existing files are moved to `<path>.bak-YYYY-MM-DD`, never deleted.

## 4. Create your private files

The repo deliberately contains **no identity and no machine-specific paths**.
Two files are yours to write, and neither is tracked:

```bash
cat > ~/.gitconfig.local <<'EOF'
[user]
	email = you@example.com
	name = Your Name
EOF
```

⚠️ **git will refuse to commit until this exists** — the tracked `.gitconfig`
carries no `user.email`.

```bash
cat > ~/.zshrc.local <<'EOF'
# PATH entries for locally installed apps, personal aliases, API tokens.
EOF
```

Optional; the shell works fine without it.

## 5. Restore VS Code extensions

Cloning the repo brings your settings and keybindings, but **not** the
extensions — those are hundreds of megabytes and live outside the config
directory. The tracked list reinstalls them:

```bash
xargs -n1 code --install-extension < ~/.config/Code/User/extensions.txt
```

Three of them are named directly in `settings.json` (the Monokai theme,
Material icons and Prettier), so skipping this leaves settings pointing at
things that do not exist. See [docs/vscode-guide.md](docs/vscode-guide.md).

Optional, referenced by `editor.fontFamily` but not installed here:

```bash
sudo dnf install jetbrains-mono-fonts
```

## 6. Make zsh your login shell

```bash
chsh -s /bin/zsh
```

Takes effect at the next login, not immediately.

## 7. Log out and back into sway

Then check:

| Check | Expect |
|---|---|
| `sway --validate` | Silence |
| `$mod+Return` | A kitty terminal |
| `$mod+space` | The rofi launcher, with icons |
| `$mod+.` / `$mod+,` | Move between workspaces on the current monitor |
| `$mod+Shift+w` | The wallpaper changes |
| The bar | Icons, not boxes |
| A new terminal | The Powerlevel10k prompt, no setup wizard |

**The first zsh start pauses for a few seconds.** That is zinit cloning itself
and the four plugins — it is not a hang, and it happens only once.

## 8. Adjust for the new hardware

Two things are specific to this laptop and will need editing:

**Style files that duplicate another config** — `glow/.config/glow/dimmed-monokai.json`
copies kitty's palette from `kitty/.config/kitty/current-theme.conf`, and
`glow.yml` names an absolute `/home/albos` path. Both need updating if you
change the kitty theme or the username.

**Monitor names and positions** — sway config §3 names `eDP-1` for the laptop
panel, and both `DP-1` and `HDMI-A-1` for the external (its connector name varies
with the port and adapter used; sway ignores lines naming an output that is not
attached, so listing both is safe). Get the real names with:

```bash
swaymsg -t get_outputs
```

Then update the `output` lines *and* the ten `workspace N output` parity pins.
See [docs/sway-guide.md §6.3](docs/sway-guide.md#63-the-oddeven-scheme) — the
odd/even scheme is driven entirely by those lines, and `ws-cycle.py` reads them
at runtime rather than hardcoding anything.

**Absolute paths** — two remain, both under `/home/albos/`:

```bash
grep -rn "/home/albos" ~/dotfiles \
  --include=config --include="*.sh" --include="*.yml" \
  --include="*.js" --include="*.json" | grep -v docs/
```

The wallpaper in sway config §4, the lock image in
`sway/.config/sway/scripts/lock.sh`, the style path in `glow/glow.yml`, and two in
the StartPage extension — `manifest.json`'s content-script match and the redirect
target in `newtab.js`. Both of those must name the real path of `~/StartPage`.

## What you will still be missing

Deliberately not tracked, so nothing here is broken — just absent:

- **GTK theming** (`~/.config/gtk-3.0`, `gtk-4.0`) — app-managed, excluded on purpose.
- **Installed applications** — this repo configures programs, it does not install them.
- **`~/.zsh_history`** — personal, and it would be a privacy leak.

## Before you publish this repo

A full audit was run over all 37 commits before this repo went public. What it
checked, and what it found:

| Checked | Result |
|---|---|
| Keys, tokens, passwords, credentials — **every blob in history**, not just diffs | none; every pattern hit was prose in `docs/` |
| Email addresses in file contents | none (only a `you@example.com` placeholder) |
| Real name in any tracked file | appears nowhere |
| `.zshrc.local` / `.bashrc.local` / `.gitconfig.local` ever committed | never |
| StartPage's 88M wallpapers and generated `wallpapers.js` ever committed | never |
| IPs, SSIDs, VPN or proxy config | none |
| Remote code, `eval`, CDN references | none |
| Image EXIF/GPS | no GPS or author; see the note below |

Re-run the blob scan after any risky commit — note it walks **every object**, so
it catches a secret that was committed and later deleted, which `git log -p` alone
can miss:

```bash
git cat-file --batch-check --batch-all-objects | awk '$2=="blob"{print $1}' |
while read -r sha; do
  git cat-file blob "$sha" 2>/dev/null | grep -alE \
    'BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}' \
    && echo "  ^ in blob $sha"
done
```

Two things the audit found and **deliberately left alone**:

- **Commit metadata carries real email addresses.** Rewriting them means rewriting
  all 37 commits and force-pushing. The GitHub account is under the same name
  anyway, so this was accepted rather than rewritten.
- **`02.png` and `1339750.png` carry an XMP `Software: Topaz Photo AI` tag.** No GPS
  and no author — it names a photo tool and an OS. Both files are 9.55M, so
  stripping the tag would write ~19M of new blobs into a 17M repo, **more than
  doubling it permanently** to remove one string. Not worth it.

Still true regardless:

- **Identity and server paths** are excluded via the `.local` pattern. The
  `[safe] directory` entries in particular name real servers — keep them in
  `~/.gitconfig.local`.
- **The wallpapers are 23M**, so the repo is not tiny. That is deliberate: they
  are load-bearing, since the sway config names `02.png` and `lock.sh` names
  `lock-001.png`.
