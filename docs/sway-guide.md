# Sway on This Machine — A Complete Guide

**Written for:** albos · Fedora 44 · sway 1.11 · Acer laptop (Intel i915)
**Last updated:** 2026-08-15

You came from KDE Plasma. This document explains how sway works in general, then
walks through *your* actual configuration line by line, so you can change things
with confidence instead of guessing.

---

## Table of Contents

1. [The Big Mental Shift: Plasma vs Sway](#1-the-big-mental-shift-plasma-vs-sway)
2. [How Sway Works Globally](#2-how-sway-works-globally)
3. [The Pieces on Your System](#3-the-pieces-on-your-system)
4. [Where Config Lives and How It Loads](#4-where-config-lives-and-how-it-loads)
5. [Your Config, Section by Section](#5-your-config-section-by-section)
6. [Workspace Navigation and the Odd/Even Scheme](#6-workspace-navigation-and-the-oddeven-scheme)
7. [Your Helper Scripts](#7-your-helper-scripts)
8. [Your Idle and Lock Chain](#8-your-idle-and-lock-chain)
9. [Complete Keybinding Reference](#9-complete-keybinding-reference)
10. [Known Issues in Your Config](#10-known-issues-in-your-config)
11. [How to Make Changes Safely](#11-how-to-make-changes-safely)
12. [Troubleshooting Cookbook](#12-troubleshooting-cookbook)
13. [Glossary](#13-glossary)

---

## 1. The Big Mental Shift: Plasma vs Sway

The single most important thing to understand: **Plasma is one integrated
program; sway is not.**

In Plasma, one project (KDE) ships the compositor, the panel, the lock screen,
the wallpaper setter, the settings app, the notification daemon, and the screen
locker — and they all talk to each other through a settings system. You change
a slider in System Settings and the right daemon reacts.

Sway ships **only the compositor**: the thing that draws windows and handles
input. Everything else is a separate program you launch yourself and configure
in its own file. There is no settings GUI. There is no central settings
database. There is one text file that starts things and defines keybindings.

| Plasma concept | Sway equivalent |
|---|---|
| System Settings app | Edit `~/.config/sway/config` in a text editor |
| Plasma panel | `waybar` (separate program, own config) |
| Wallpaper settings page | `output * bg <file> fill` line, or `swaybg` |
| Screen locking / energy saving page | `swayidle` (timers) + `swaylock` (the lock screen) |
| KRunner | `rofi` (separate program) |
| Konsole | `kitty` (separate program) |
| Spectacle | `grimshot` (separate program) |
| Window rules GUI | `for_window [criteria] <command>` lines |
| Restart Plasma | `swaymsg reload` (`$mod+Shift+c`) |

The upside: everything is one plain-text file you can read, version, and copy to
another machine. The downside: nothing is set up for you, and nothing warns you
when a setting is silently doing nothing.

---

## 2. How Sway Works Globally

### 2.1 What sway actually is

Sway is a **Wayland compositor** built on the `wlroots` library, designed to be
a drop-in replacement for the i3 window manager. "Compositor" means it owns the
screen: it receives input from the kernel, decides which window gets it, decides
where every window is drawn, and hands the final image to the GPU.

Because it targets i3 compatibility, almost every i3 tutorial, config snippet,
and Stack Overflow answer online applies to sway too. That is a large practical
advantage when searching for help — but watch out: i3 answers involving `xset`,
`xrandr`, `xautolock`, or `compton` are X11-only and will **not** work here.

### 2.2 Tiling: the core idea

In Plasma, windows float. You place them, they overlap, you drag them around.

In sway, windows **tile**: they automatically divide the available space so they
never overlap and never leave gaps. Open one terminal, it fills the screen. Open
a second, the screen splits in half. Open a third, it splits again. You do not
position windows — you position *splits*.

Floating still exists for dialogs and small utilities (`$mod+Shift+space`
toggles it), but it is the exception, not the default.

### 2.3 The tree

Everything sway manages is one tree. Understanding this explains almost all of
sway's otherwise-confusing behavior:

```
root
├── output eDP-1  (your laptop panel — odd workspaces)
│   ├── workspace 1
│   │   └── container (splith)
│   │       ├── view: kitty
│   │       └── container (splitv)
│   │           ├── view: firefox
│   │           └── view: kitty
│   └── workspace 3
└── output DP-1  (your external monitor — even workspaces)
    ├── workspace 2
    └── workspace 4
```

- **output** — a physical monitor.
- **workspace** — a virtual desktop. Each workspace lives on exactly one output.
- **container** — an invisible box that holds children in a layout. This is the
  part with no Plasma equivalent, and the part worth internalizing.
- **view** — an actual application window.

You can inspect this live at any time:

```bash
swaymsg -t get_tree | less        # raw JSON
swaymsg -t get_tree -p            # pretty-printed
```

When something behaves strangely — a window on the wrong monitor, a mysterious
black rectangle — `get_tree` is almost always how you find the cause. That is
exactly how the `xwaylandvideobridge` problem in your config was diagnosed.

### 2.4 Layouts

Every container arranges its children in one of four layouts:

| Layout | Key | Behavior |
|---|---|---|
| `splith` | `$mod+b` | Children side by side, left to right |
| `splitv` | `$mod+Shift+v` | Children stacked, top to bottom |
| `stacking` | `$mod+s` | One child visible, others as title bars above |
| `tabbed` | `$mod+w` | One child visible, others as tabs across the top |

`stacking` and `tabbed` are the ones Plasma has no analogue for, and they are
extremely useful on a 1366×768 laptop screen: put six terminals in a tabbed
container and each still gets the full screen.

### 2.5 Focus and direction

Movement is directional, not by window list. `$mod+h/j/k/l` (or the arrow keys)
moves focus left/down/up/right through the tree — and continues onto the next
monitor when you run out of windows on the current one. Adding `Shift` moves the
focused window instead of the focus.

`$mod+a` focuses the *parent container*. This is how you select a whole split to
operate on it rather than a single window. It feels strange at first; it is the
key to reorganizing a complex layout.

### 2.6 IPC: talking to a running sway

Sway listens on a Unix socket (`$SWAYSOCK`, currently
`/run/user/1000/sway-ipc.1000.1627.sock`). The `swaymsg` command talks to it.

**Any config line is also a runtime command.** This is the single most useful
fact for experimenting:

```bash
swaymsg output '*' bg '#3366ff' solid_color   # try a setting instantly
swaymsg -t get_outputs -p                     # what monitors exist?
swaymsg -t get_inputs -p                      # what input devices exist?
swaymsg -t get_workspaces -p                  # what workspaces exist and where?
swaymsg reload                                # re-read the config file
```

Test with `swaymsg` first, then write the line that worked into your config.
Nothing you do with `swaymsg` is permanent, so it is completely safe to explore.

### 2.7 The one gotcha that catches everyone: `exec` vs `exec_always`

| Directive | When it runs |
|---|---|
| `exec` | **Only** when sway first starts. Ignored on reload. |
| `exec_always` | On startup **and** on every `swaymsg reload`. |

This matters constantly. If you change your `swayidle` timeout — which is on an
`exec` line — pressing `$mod+Shift+c` will **not** apply it. The old `swayidle`
process keeps running with the old timers. You must kill and restart it, or log
out and back in.

Use `exec` for things that must not be duplicated (daemons, agents). Use
`exec_always` for things that are safe to restart, and make the script itself
kill the old copy first — which is exactly what your `waybar-restart.sh` does.

---

## 3. The Pieces on Your System

| Program | Role | Config location |
|---|---|---|
| `sway` 1.11 | The compositor | `~/.config/sway/config` |
| `swaybg` | Draws the wallpaper | Invoked by the `output ... bg` line |
| `swayidle` | Idle timer daemon — "user has done nothing for N seconds" | Arguments on the `exec` line in your config |
| `swaylock` | The lock screen itself | Flags in `~/.config/sway/scripts/lock.sh` |
| `waybar` | The status bar | `~/.config/waybar/config.jsonc`, `style.css` |
| `rofi` | App launcher | `~/.config/rofi/` |
| `kitty` | Terminal | `~/.config/kitty/` |
| `grimshot` | Screenshots | none (called with arguments) |
| `brightnessctl` | Screen brightness | none |
| `playerctl` | Media keys | none |
| `notify-send` | *Sends* a notification (from `libnotify`) | none |
| `mako` | *Displays* them — the daemon `notify-send` talks to | `~/.config/mako/config` |

Note the split of responsibility between the two idle-related programs, because
this is where most confusion lives:

- **`swayidle` decides *when*.** It is a timer. It knows nothing about images.
- **`swaylock` decides *what it looks like*.** It draws the lock screen.

They are separate programs. Changing the timeout means editing the `swayidle`
line in your sway config. Changing the picture means editing the `swaylock`
flags in `lock.sh`.

---

## 4. Where Config Lives and How It Loads

### 4.1 The files

**The short answer: everything you own lives under `~/.config/sway/`** — which,
since 2026-08-15, is a symlink into `~/dotfiles`. That repo is what you back up
and what you copy to a new machine.

```
~/.config/sway/
├── config                  ← your main config (the important one)
├── config.d/
│   └── 90-bar.conf         ← empty, 0 bytes — see below, this is doing something
├── environment             ← notes about environment variables
└── scripts/
    ├── lock.sh             ← your swaylock appearance
    ├── wallpaper-next.sh   ← cycles wallpapers
    ├── waybar-restart.sh   ← restarts the bar
    └── ws-cycle.py         ← workspace navigation, see §6
```

⚠️ **This directory is now a symlink** into your dotfiles repo — see §4.2. The
paths below are all still correct; they just resolve through the link.

### 4.2 Every path that affects your sway session

`~/.config/sway/` is yours, but it is not the whole story — sway also loads
system files, and the bar and lock screen keep their config elsewhere. The full
picture, in load-priority order:

| Path | Owner | What it holds |
|---|---|---|
| `~/dotfiles/` | **you** | **The git repo. Real files live here; everything below is a symlink into it.** |
| `~/.config/sway/config` | **you** | Main config: bindings, outputs, workspace pins, rules |
| `~/.config/sway/config.d/*.conf` | **you** | Your overrides; shadow system files by filename |
| `~/.config/sway/scripts/` | **you** | Helper scripts your bindings call |
| `~/.config/sway/environment` | **you** | Env-var notes, sourced by `start-sway` at login |
| `/etc/sway/config.d/*.conf` | system admin | Machine-wide overrides (systemd session glue) |
| `/usr/share/sway/config.d/*.conf` | the package | Fedora defaults: media keys, screenshots, window rules |
| `/etc/sway/config` | the package | Upstream default config — **not used**, yours replaces it |

Related, and easy to forget when you back up — these are *not* sway config, but
your session looks broken without them:

| Path | What it is |
|---|---|
| `~/.config/waybar/config.jsonc` | Bar modules and layout |
| `~/.config/waybar/style.css` | Bar colours and fonts |
| `~/Pictures/wallpapers/` | Wallpapers, including `lock-001.png` used by `lock.sh` |
| `~/.cache/sway-wallpaper-index` | Which wallpaper is next; regenerates if deleted |

**Commands that answer "where is this coming from?"**

```bash
# Which config file did the running sway actually load?
swaymsg -t get_version | jq -r .loaded_config_file_name

# Your top-level config as sway parsed it — variables NOT substituted,
# and the include on the last line NOT expanded.
swaymsg -t get_config | jq -r .config

# So to search EVERYTHING, grep your file and the system dirs together:
grep -rn "XF86MonBrightness" ~/.config/sway/ /etc/sway/config.d/ /usr/share/sway/config.d/
```

⚠️ A trap worth knowing: **`get_config` does not expand the include.** It returns
your `~/.config/sway/config` and nothing else, ending with the literal
`include '$(...)'` line. Searching it for a system binding like
`XF86MonBrightnessUp` returns zero hits even though that binding is live. When
you need the real merged picture, use the `layered-include` command in §4.3 to
list the files, or the `grep -rn` above.

### 4.3 The layered include — Fedora-specific, worth understanding

The **last line** of your config is:

```
include '$(/usr/libexec/sway/layered-include "/usr/share/sway/config.d/*.conf" "/etc/sway/config.d/*.conf" "${XDG_CONFIG_HOME:-$HOME/.config}/sway/config.d/*.conf")'
```

This is a Fedora addition, not upstream sway. It merges three directories in
priority order:

1. `/usr/share/sway/config.d/` — package defaults
2. `/etc/sway/config.d/` — system administrator overrides
3. `~/.config/sway/config.d/` — **your** overrides (highest priority)

The rule: **files are matched by filename, and a later directory completely
replaces an earlier file with the same name.** It does not merge their contents
— it swaps the whole file.

Right now that resolves to exactly this, in this order:

```
/etc/sway/config.d/10-systemd-cgroups.conf
/etc/sway/config.d/10-systemd-session.conf
/usr/share/sway/config.d/50-rules-browser.conf
/usr/share/sway/config.d/50-rules-pavucontrol.conf
/usr/share/sway/config.d/50-rules-policykit-agent.conf
/usr/share/sway/config.d/60-bindings-brightness.conf
/usr/share/sway/config.d/60-bindings-media.conf
/usr/share/sway/config.d/60-bindings-screenshot.conf
/usr/share/sway/config.d/60-bindings-volume.conf
/usr/share/sway/config.d/65-mode-passthrough.conf
/home/albos/.config/sway/config.d/90-bar.conf      ← YOURS, empty
/usr/share/sway/config.d/90-swayidle.conf
/usr/share/sway/config.d/95-autostart-policykit-agent.conf
/usr/share/sway/config.d/95-xdg-desktop-autostart.conf
/usr/share/sway/config.d/95-xdg-user-dirs.conf
```

You can regenerate that list yourself any time:

```bash
cat "$(/usr/libexec/sway/layered-include \
  '/usr/share/sway/config.d/*.conf' \
  '/etc/sway/config.d/*.conf' \
  "$HOME/.config/sway/config.d/*.conf")"
```

**Two consequences you are already relying on:**

**(a) Your empty `90-bar.conf` disables the system bar.** Fedora's
`/usr/share/sway/config.d/90-bar.conf` contains:

```
bar {
    swaybar_command waybar
}
```

Your empty file with the same name replaces it, so that block never loads. That
is why you start waybar yourself with `exec_always waybar-restart.sh` instead.
It works, and it gives you control over restarts — just know the empty file is
load-bearing. Deleting it would give you **two** waybars.

**(b) Fedora's `90-swayidle.conf` loads but harmlessly fails.** It contains:

```
exec LT="$lock_timeout" ST="$screen_timeout" LT=${LT:-300} ST=${ST:-60} && \
    swayidle -w timeout $LT 'swaylock -f' ...
```

It expects you to define `set $lock_timeout 300` somewhere. You never do, so
sway passes the literal text `$lock_timeout` through, `swayidle` receives a
non-numeric timeout, and that instance exits immediately. Only your own
`swayidle` survives. Confirmed live — there is exactly one `swayidle` running.

This is worth remembering, because it is the most likely explanation for any
"my screen used to lock after 5 minutes" memory. If you ever want to silence it
properly, create an empty `~/.config/sway/config.d/90-swayidle.conf` using the
same shadowing trick as the bar.

### 4.4 Load order matters

Your main config is read top to bottom, and the include is on the **last line**.
So everything in `config.d/` loads *after* your personal settings and can
override them. If a keybinding of yours mysteriously does not work, check
whether one of those system files rebinds it.

---

## 5. Your Config, Section by Section

File: `~/.config/sway/config` (a symlink to `~/dotfiles/sway/.config/sway/config`)

Since 2026-08-15 the file is organised into nine numbered sections, and the
subsections below map onto them. Two orderings actually matter to sway and must
be preserved if you rearrange anything:

- **Variables must be `set` before they are used**, so §1 comes first.
- **The `include` must stay on the last line.** `config.d/` loads *after* this
  file and overrides it, so moving the include earlier would silently change
  which settings win.

| Config section | Contents |
|---|---|
| §1 Variables | `$mod`, `$left/$down/$up/$right`, `$term`, `$scripts` |
| §2 Input devices | Keyboard (us/ir, caps→esc), touchpad |
| §3 Outputs and workspaces | Monitor positions, odd/even workspace pins |
| §4 Appearance | Wallpaper, `default_border`, `floating_modifier` |
| §5 Window rules | The `xwaylandvideobridge` fix |
| §6 Startup programs | `exec_always` waybar and mako, `exec` swayidle |
| §7 Key bindings | Basics, focus, workspaces, layout, scratchpad, session |
| §8 Modes | `resize` |
| §9 Include | Fedora's layered include — **must stay last** |

### 5.1 Variables (config §1)

```
set $mod Mod1
```

**`$mod` is `Mod1`, which is the Alt key** — not the Super/Windows key. Most
sway documentation online assumes `Mod4` (Super), so when a tutorial says
`$mod+Return`, on your machine that is **Alt+Return**.

This is a real trade-off worth knowing: Alt collides with application shortcuts.
Alt+F is "File menu" in many programs, but here `$mod+f` is fullscreen and sway
takes it first. If that ever bites you, `$mod+Pause` toggles **passthrough
mode** (from `65-mode-passthrough.conf`), which suspends all sway bindings until
you press it again.

```
set $left h / $down j / $up k / $right l
```

Vim-style direction keys.

```
set $term kitty
set $rofi_cmd rofi -terminal '$term'
set $menu $rofi_cmd -show combi -combi-modes drun#run -modes combi
```

Note: `$menu` is defined but **never used** — your launcher binding on line 88
calls `rofi -show drun` directly. Harmless, but if you ever want the combined
drun+run launcher, bind `$menu` instead.

### 5.2 Input devices (config §2)

```
input "type:keyboard" {
    xkb_layout "us,ir"
    xkb_options "caps:escape_shifted_capslock,grp:shifts_toggle"
}
```

- Two layouts: US English and Persian (`ir`).
- **Both Shift keys pressed together** switches between them (`grp:shifts_toggle`).
- **Caps Lock acts as Escape**; Shift+Caps Lock gives you real Caps Lock.

```
input "type:touchpad" {
    natural_scroll enable
}
```

Reversed ("Mac-style") scrolling on the touchpad only.

The `type:` prefix matches whole classes of device, which is why this survives
plugging in an external keyboard. To target one specific device, use its
identifier from `swaymsg -t get_inputs`.

### 5.3 Outputs and workspaces (config §3)

```
output eDP-1 position 0 0
output DP-1      position 1366 0
output HDMI-A-1  position 1366 0

workspace 1 output eDP-1     workspace 2  output DP-1 HDMI-A-1
workspace 3 output eDP-1     workspace 4  output DP-1 HDMI-A-1
workspace 5 output eDP-1     workspace 6  output DP-1 HDMI-A-1
workspace 7 output eDP-1     workspace 8  output DP-1 HDMI-A-1
workspace 9 output eDP-1     workspace 10 output DP-1 HDMI-A-1

output * bg /home/albos/Pictures/wallpapers/02.png fill
```

**`eDP-1`** is your laptop panel: BOE, 1366×768 @ 60 Hz.

**The external monitor has no stable connector name.** It has come up as both
`DP-1` and `HDMI-A-1` on this machine, depending on which port and adapter it is
plugged into, so the config names **both**. Sway ignores a line naming a
connector that is not attached — which is precisely what makes listing both
safe, and what made naming only one of them fail silently, twice. Check which
one is live with `swaymsg -t get_outputs`. It sits to the right of the laptop at
x=1366. Its make/model report as `Unknown`, so sway's stable
`<make> <model> <serial>` output identifier is not usable here.

The ten `workspace N output` lines implement the **odd = laptop, even =
external** scheme. They are explained in full in
[§6](#6-workspace-navigation-and-the-oddeven-scheme) — read that before changing
them, because `ws-cycle.py` reads these lines and derives its behaviour from
them.

These lines have been wrong twice, in both directions — `DP-1` when the monitor
was on HDMI, then `HDMI-A-1` when it came back on DP. Naming both ended it. See
[Known Issues](#10-known-issues-in-your-config) for the full story.

`output * bg <file> fill` applies the wallpaper to every output. Scaling modes
are `stretch`, `fill`, `fit`, `center`, `tile`. `fill` covers the whole screen
and crops the overflow.

### 5.4 Window rules (config §5)

```
for_window [class="xwaylandvideobridge"] floating enable, opacity 0, fullscreen disable, move to scratchpad
```

Your config carries an excellent comment block explaining this, so
briefly: `xwaylandvideobridge` (an X11 screen-sharing helper pulled in by
PipeWire) was launching fullscreen on the external monitor and covering the
wallpaper with a transparent surface, which read as a black screen. This rule
makes it floating, invisible, non-fullscreen, and parks it in the scratchpad.

The diagnostic method there is the reusable lesson: they proved the image was
innocent by setting a solid color, then used `swaymsg -t get_tree` to find the
real culprit. Keep that comment.

`for_window` criteria you will use most: `app_id` for native Wayland apps,
`class` for X11/XWayland apps, `title` for matching window titles.

### 5.5 Appearance (config §4)

```
default_border pixel 1
```

A 1-pixel border with no title bar. Other options: `normal` (title bar),
`none`, `pixel <n>`.

### 5.6 Modes (config §8)

```
mode "resize" { ... }
bindsym $mod+r mode "resize"
```

A **mode** is a modal keymap — like vim's insert mode. Press `$mod+r` and the
keys `h/j/k/l` resize instead of moving focus. `Return` or `Escape` exits.

Note a small asymmetry: inside resize mode only `Right` is bound among the arrow
keys; `Left`, `Up`, `Down` are not. The `h/j/k/l` keys all work.

#### `move-all` mode — added 2026-08-18

```
mode "move-all" { ... }
bindsym $mod+Shift+a mode "move-all"
```

Sway has **no window selection**. There is nothing to "select all" first, so
where Plasma would have you rubber-band a group of windows and drag them, this
mode stands in for the selection with the criteria `[workspace="__focused__"]` —
"every window on the workspace I am looking at". Sway resolves criteria **once,
before anything moves**, so emptying the workspace out from under the match is
safe.

| Inside the mode | Action |
|---|---|
| `l` | Every window on this workspace → the monitor on the **right** |
| `h` | Every window on this workspace → the monitor on the **left** |
| `.` | Every window one workspace **right** along this monitor's strip |
| `,` | Every window one workspace **left** along this monitor's strip |
| `Return` / `Escape` | Leave the mode |

Three decisions worth knowing, because each fixes something that broke without
it:

1. **The mode stays open after a move.** That is the point: press `Alt+Shift+a`
   once, then tap `. .` to walk the whole group two workspaces along. Waybar
   shows a yellow `move-all` badge while it is open (see the waybar guide), so a
   mode you forgot to leave looks like a mode rather than a broken keyboard.
2. **`l`/`h` move the *windows*, not the workspace.** They merge into whatever
   workspace is showing on the other monitor, which keeps the odd/even parity of
   §6.3 intact. The obvious alternative, `move workspace to output right`, would
   carry an odd-numbered workspace onto the external monitor and break it.
3. **`l`/`h` end with `focus output`.** Without it, focus stays behind on the
   workspace you just emptied, and a second press finds nothing to move — which
   kills the whole point of the mode staying open.

---

## 6. Workspace Navigation and the Odd/Even Scheme

*Added 2026-08-15. This is the one part of your setup that is genuinely custom —
it does not come from sway or Fedora.*

### 6.1 The problem it solves

In the default config, `$mod+1`…`$mod+0` is the only workspace switching that is
actually **bound to a key**. (Sway does ship relative commands — `workspace
next_on_output` and friends — they simply have no bindings by default.) That has
an awkward consequence: to get back to a workspace you already have open, you
must remember its number. If the laptop is showing workspaces 1 and 3, then
"switch to the other one" means recalling that the other one is 3, not 2 or 4.

The fix is to separate two jobs that the number keys were doing at once:

| Job | Key | Nature |
|---|---|---|
| "Flip to the other desktop on this screen" | `$mod+.` / `$mod+,` | **relative** — no number needed |
| "Go to that specific desktop over there" | `$mod+1`…`$mod+0` | **absolute** — number and monitor both fixed |

Both still exist. They are complementary, not alternatives: relative keys are
fastest for the workspace you were just on, absolute keys are fastest for a
workspace you know by name.

### 6.2 The strip model

Think of each monitor as owning a **strip** of workspaces that you walk left and
right, and that grows off the right-hand end when you run out.

```
                       ←── $mod+,              $mod+. ──→

laptop    (eDP-1)     [ 1 ] ─── [ 3 ] ─── [ 5 ] ─── (appends here)
external  (DP-1)      [ 2 ] ─── [ 4 ] ─── [ 6 ] ─── (appends here)
```

- **`$mod+.`** — one step right. At the **last** workspace there is nowhere to
  go, so it **appends a new empty workspace** and focuses it. Walking off the end
  is how you create a desktop; there is no separate "new workspace" key.
- **`$mod+,`** — one step left. Stops at the first workspace. Never creates.
- **`$mod+Shift+.` / `$mod+Shift+,`** — same, but drag the focused window along.

**Neither direction wraps around.** This is forced, not a preference: at the last
workspace `$mod+.` has to mean *either* "wrap to the first" *or* "append a new
one", and it cannot be both. Appending was the more useful of the two, so
wrapping had to go — and `$mod+,` stops at the left edge to stay symmetrical.

Two behaviours that look like bugs but are not:

- **`$mod+.` on an empty last workspace does nothing.** Sway destroys a workspace
  the instant its last window leaves and you focus away. Appending #7 while you
  are sitting on an empty #5 would destroy #5 on the way out and leave you on an
  identical empty desktop with a different number. Two empty workspaces cannot
  coexist on one output, so there is nothing to gain.
- **Everything is scoped to the monitor you are looking at.** `$mod+.` on the
  laptop will never move you to the external screen.

### 6.3 The odd/even scheme

The ten `workspace N output` lines in your config (§5.3) pin **odd numbers to the
laptop and even numbers to the external monitor**:

```
workspace 1 output eDP-1     workspace 2  output DP-1 HDMI-A-1
workspace 3 output eDP-1     workspace 4  output DP-1 HDMI-A-1
...                          ...
workspace 9 output eDP-1     workspace 10 output DP-1 HDMI-A-1
```

The payoff is that **a number now tells you which screen it is on before you
press it.** Odd = laptop, even = external, always.

This also feeds the navigation above: when `$mod+.` appends a workspace it skips
numbers pinned to the *other* monitor, so the laptop grows `1 → 3 → 5 → 7` and
the external grows `2 → 4 → 6` without either being told to.

**The trade you accepted:** `$mod+<number>` now means "jump to that workspace on
that monitor", so pressing `$mod+4` while on the laptop **moves your focus to the
external screen**. Before the pins, it would have made workspace 4 wherever you
were standing. This is the intended behaviour — absolute keys became spatial —
and it only works because `$mod+.` covers the "give me a workspace right here"
case.

**Consequences worth remembering:**

- **Five directly-reachable workspaces per monitor**, not ten, since the number
  keys are split between them. Anything past that is reachable with `$mod+.`.
- **Pins do not move workspaces that already exist.** `man 5 sway` is explicit:
  the assignment only steers workspaces created *from now on*. When these pins
  were added, the existing workspaces had to be renumbered by hand.
- **Renaming does not relocate.** `swaymsg 'rename workspace 4 to 3'` changes the
  number but leaves the workspace on its current monitor — verified live. That is
  what makes a manual fix-up safe: your windows do not jump screens.
- **Undocked, parity breaks temporarily.** With the external unplugged, its even
  workspaces land on the laptop and `$mod+2` will simply make workspace 2 there.
  Sway migrates them back when the monitor returns.
- **Your bar already agrees.** Waybar's `sway/workspaces` module defaults to
  showing only the workspaces on its own output, so the laptop bar shows `1 3`
  and the external bar shows `2 4`.

### 6.4 `ws-cycle.py`

File: `~/.config/sway/scripts/ws-cycle.py` · `ws-cycle.py next|prev [--take|--all]`

Sway has built-in `workspace next_on_output` / `prev_on_output`, which do the
walking correctly — but they always wrap and can never append. The append is the
whole point, so the four bindings call this script instead.

**It hardcodes nothing about odd and even.** At runtime it reads your
`workspace N output` lines out of the live config and derives everything from
them. Change the pins and the script follows; delete them and it falls back to
plain "next free number".

Two rules do the real work:

1. **Append after the end, not into the first gap.** Strips get holes in them.
   Before the parity pins existed, the laptop held `{1, 4}` — and taking the
   lowest free number there would have created **3**, which sorts *between* 1
   and 4, so the "new" desktop would have appeared to your **left** and pressing
   `$mod+.` again would have taken you back to 4. The search therefore starts
   just above the current last workspace rather than at 1.
2. **Keep the pins' pattern going past where they stop.** Pins only cover 1–10,
   because only those have keys. Above 10 nothing is pinned, so a naive "next
   free number" would hand the external monitor **11** — an odd number — and
   silently break parity. Instead the script infers the progression from the pins
   (`1,3,5,7,9` → stride 2, odd) and continues it: the laptop appends 11, 13, and
   the external appends 12, 14.

That inference is general. Pin three monitors as `1,4,7 / 2,5,8 / 3,6,9` and it
extends stride 3 instead. Use contiguous ranges like `1-5 / 6-10` and it
correctly detects no pattern worth extending and falls back to first-free.

3. **A pin naming an absent monitor does not reserve anything — for an output
   the pins have never heard of.** This is the fix for the bug in
   [§10, Issue 1](#10-known-issues-in-your-config), and the wording is fussy
   because both halves matter.

   When the focused output is named in *no* pin — because the monitor came up
   under a connector name the config does not list — the parity scheme has
   nothing to say about it, and rules 1 and 2 turn hostile. Every pinned number
   looks like it belongs to someone else, so the search skips the entire pinned
   range; `pin_stride` finds no pattern to extend, because none of the pins are
   ours. Result: from workspace 2, `$mod+.` appended workspace **11**.

   So for an output like that, numbers pinned *only* to monitors that are not
   currently attached are treated as free. Numbers pinned to a monitor that **is**
   attached still block, which is what stops an unknown external from being
   handed the laptop's odd numbers — the laptop's own pins still fence them off.

   The condition is deliberately narrow. On any output the pins *do* name — which
   is the normal case once the config is right — nothing changes, and evens stay
   reserved for the external even while it is unplugged.

**`--take` vs `--all`.** `--take` drags the focused window; `--all` drags every
window on the workspace, and is what the `move-all` mode of §5.6 calls. Both
land on the same `go()`, so the group move inherits the strip's behaviour for
free — it appends a new workspace at the right edge and stops dead at the left
edge, exactly like the plain walk. Sway's own
`move container to workspace next_on_output` would have wrapped instead of
appending, which is the same reason the plain walk needs this script at all.

Two tunables at the top of the file:

| Constant | Default | Effect if changed |
|---|---|---|
| `SKIP_CREATE_WHEN_EMPTY` | `True` | `False` = append even when the last workspace is already empty |
| `WRAP_PREV` | `False` | `True` = `$mod+,` at the first workspace jumps to the last |

**A `swaymsg` trap the script had to work around**, worth knowing if you write
your own: `swaymsg` parses leading `--` options as *its own*, so
`swaymsg workspace --no-auto-back-and-forth number 4` fails with
`unrecognized option`. You need a `--` separator first:

```bash
swaymsg -- workspace --no-auto-back-and-forth number 4
```

---

## 7. Your Helper Scripts

### `lock.sh` — the lock screen's appearance

```bash
swaylock -f -i /home/albos/Pictures/wallpapers/lock-001.png \
    --indicator-radius 100 --indicator-thickness 10 \
    --ring-color 1e1e2e --ring-ver-color 89b4fa --ring-wrong-color f38ba8 ...
```

A Catppuccin Mocha colour scheme. `-f` forks to the background (essential — the
`swayidle` timer must not block waiting for it). `-i` sets the background image.

The image lives in your local wallpapers folder deliberately: it was originally
copied from a removable drive at `/run/media/albos/465.76/...`, and if that
drive is not mounted when the timer fires, `swaylock` cannot load the image. A
lock command that fails is a machine that does not lock.

Useful extra flags: `-s fit|fill|center|stretch` (scaling mode), `--clock`,
`--timestr`, `-e` (ignore empty password), `-F` (show failure count).

### `wallpaper-next.sh` — bound to `$mod+Shift+w`

Cycles through every `.jpg`/`.jpeg`/`.png` in `~/Pictures/wallpapers/`, sorted.
Remembers its position in `~/.cache/sway-wallpaper-index`, wraps at the end,
kills any running `swaybg` to avoid a race, applies the new image via
`swaymsg output "*" bg`, and sends a notification.

⚠️ It now picks up `lock-001.png` too, since that file is in the same folder. If
you would rather keep lock images out of the rotation, move it to a subfolder
(the script uses `-maxdepth 1`) and update the path in `lock.sh`.

### `mako` — the notification daemon, started by `exec_always`

Not a script of yours, but it lives on the same `exec_always` line style and is
easy to forget:

```
exec_always sh -c 'pkill -x mako; mako'
```

`pkill` first, so a reload replaces the daemon rather than stacking a second
one. `sh -c` so the `;` is a shell separator, not something sway's parser acts
on.

Styled to match waybar and rofi in `~/.config/mako/config`, tracked as the
`mako` package. Apply changes with `makoctl reload` — no sway reload needed.

Full walkthrough in **[mako-guide.md](mako-guide.md)**, including the one trap
worth knowing: `default-timeout=0` inside a criteria section is silently
overridden by the sender unless you also set `ignore-timeout=1`.

### `waybar-restart.sh` — bound to `exec_always`

```bash
pkill waybar; sleep 0.5; waybar
```

Kills the old bar and starts a fresh one. Because it is `exec_always`, every
`$mod+Shift+c` reload restarts your bar cleanly — and because it kills first,
reloading never stacks up duplicate bars.

### `ws-cycle.py` — bound to `$mod+.` `$mod+,` `$mod+Shift+.` `$mod+Shift+,`, and `.` `,` inside `move-all` mode

Walks the workspaces on the current monitor and appends a new one when you reach
the end. The only script here that is not a thin shell wrapper, and the only one
with its own tunables. Fully documented in
[§6.4](#64-ws-cyclepy) — read that before editing it.

### `set-outputs.sh` and `fix-second-monitor.sh` — deleted 2026-08-15

Leftovers from debugging the second-monitor problem, referenced by nothing.
`set-outputs.sh` used `HDMI-A-1` all along, which is what flagged the `DP-1`
mistake in the main config — but it also hardcoded the output positions, making
it a second source of truth that could silently contradict the config.

Both were removed *after* the first git commit, so they remain recoverable:

```bash
# Find the import commit by message rather than by hash — the history was
# rewritten on 2026-08-15 to scrub a leaked client path, so hashes changed.
commit=$(git -C ~/dotfiles log --format=%h --grep="Import existing dotfiles" | tail -1)
git -C ~/dotfiles show "$commit:sway/.config/sway/scripts/set-outputs.sh"
```

---

## 8. Your Idle and Lock Chain

This is the part you most recently changed. Current state:

```
exec swayidle -w \
    timeout 900 '/home/albos/.config/sway/scripts/lock.sh' \
    timeout 905 'swaymsg "output * power off"' resume 'swaymsg "output * power on"' \
    before-sleep '/home/albos/.config/sway/scripts/lock.sh'
```

### What happens, in order

| Idle time | Event | Controlled by |
|---|---|---|
| 15:00 | Lock screen appears with `lock-001.png` | `timeout 900` |
| 15:05 | Monitors physically power off — true black | `timeout 905` |
| any input | Monitors on, password prompt appears | `resume` |
| before suspend | Locks first, so it wakes up locked | `before-sleep` |

### Rules for reading swayidle syntax

- Timeouts are **absolute**, counted from your last input — not cumulative.
  `900` and `905` mean "at 15:00" and "at 15:05", not "at 15:00 then 5s later".
- Each `timeout N 'cmd'` may be followed by `resume 'cmd'`, which runs when
  activity returns. `resume` belongs to the `timeout` directly before it.
- `-w` means "wait for the command to finish before continuing" — it prevents a
  race where the display powers off before `swaylock` has drawn.
- `before-sleep` fires on suspend/hibernate.

### The critical distinction

**Powering the output off produces a true black screen. No image can be shown at
that stage** — the monitor is electrically off. The image you can control is the
*lock screen*, which appears 5 seconds earlier. To look at the picture longer,
widen the gap between `900` and `905`.

### Applying a change to these timers

Because this is `exec`, not `exec_always`, reload does **not** restart it:

```bash
pkill -x swayidle
setsid -f swayidle -w \
  timeout 900 '/home/albos/.config/sway/scripts/lock.sh' \
  timeout 905 'swaymsg "output * power off"' resume 'swaymsg "output * power on"' \
  before-sleep '/home/albos/.config/sway/scripts/lock.sh' >/dev/null 2>&1
```

Verify with `pgrep -a swayidle`. `setsid -f` detaches it so it survives the
terminal closing.

### Preventing idle during videos

`50-rules-browser.conf` already marks Firefox, Chromium, and Brave with
`inhibit_idle fullscreen` — a fullscreen browser video will not trigger the
lock. For anything else, add your own rule:

```
for_window [app_id="mpv"] inhibit_idle visible
```

Modes: `focus`, `fullscreen`, `open`, `visible`, `none`.

---

## 9. Complete Keybinding Reference

`$mod` = **Alt**. Bindings marked *(system)* come from `/usr/share/sway/config.d/`.

### Launching and windows

| Keys | Action |
|---|---|
| `Alt+Return` | New kitty terminal |
| `Alt+space` | Launch rofi |
| `Alt+Shift+q` | Close focused window |
| `Alt+q` / `Alt+x` | Close **every** window on the current workspace — no confirmation, no undo |
| `Alt+f` | Fullscreen toggle |
| `Alt+Shift+space` | Toggle floating |
| `Alt+r` | Enter resize mode (`h/j/k/l`, `Escape` to exit) |
| `Alt+Shift+a` | Enter `move-all` mode — acts on every window of the workspace |
| `Alt+a` | Focus parent container |

### Focus and movement

| Keys | Action |
|---|---|
| `Alt+h/j/k/l` or arrows | Move focus left/down/up/right |
| `Alt+Shift+h/j/k/l` or arrows | Move the window one slot through the layout |

There is no "swap these two windows" command. `Alt+Shift+l` slides the focused
window **one position** along the row, so with two windows it reads as a swap and
with three you position by repetition. Focus follows the window you moved.

**At the edge, `move` does not stop — it throws the window onto the next
monitor.** One press too many and the window leaves the screen rather than
sitting still; `Alt+Shift+h` brings it back. This is the opposite of the
workspace strip in §6.2, which deliberately stops at the left edge.

### Workspaces

See [§6](#6-workspace-navigation-and-the-oddeven-scheme) for the full model.
**Odd numbers are on the laptop, even numbers on the external monitor.**

| Keys | Action |
|---|---|
| `Alt+.` | Next workspace **on this monitor**; appends a new one if you are on the last |
| `Alt+,` | Previous workspace on this monitor; stops at the first |
| `Alt+Shift+.` | Same as `Alt+.`, dragging the focused window along |
| `Alt+Shift+,` | Same as `Alt+,`, dragging the focused window along |
| `Alt+1`…`Alt+0` | Jump to workspace 1–10 — **switches monitor** if that number lives on the other one |
| `Alt+Shift+1`…`Alt+Shift+0` | Send window to workspace 1–10 |

Neither `Alt+.` nor `Alt+,` wraps around, and `Alt+.` does nothing if the last
workspace is already empty — both are explained in §6.2.

### Moving a whole workspace at once — `move-all` mode

`Alt+Shift+a` first, then the key. The mode **stays open**, so the keys repeat on
the same group until `Escape`. Full reasoning in [§5.6](#56-modes-config-8).

| Keys | Action |
|---|---|
| `Alt+Shift+a` then `l` | All windows → monitor on the right |
| `Alt+Shift+a` then `h` | All windows → monitor on the left |
| `Alt+Shift+a` then `.` | All windows → next workspace on this monitor |
| `Alt+Shift+a` then `,` | All windows → previous workspace on this monitor |
| `Escape` / `Return` | Leave the mode |

The single-window equivalents are `Alt+Shift+.` and `Alt+Shift+,` above; they
need no mode.

### Layout

| Keys | Action |
|---|---|
| `Alt+b` | Split horizontally |
| `Alt+Shift+v` | Split vertically |
| `Alt+s` | Stacking layout |
| `Alt+w` | Tabbed layout |
| `Alt+e` | Toggle split direction |

### Scratchpad

| Keys | Action |
|---|---|
| `Alt+Shift+minus` | Send window to scratchpad (hidden) |
| `Alt+minus` | Show/cycle scratchpad windows |

### Session

| Keys | Action |
|---|---|
| `Alt+Shift+c` | Reload config |
| `Alt+Shift+e` | Exit sway (asks for confirmation) |
| `Alt+Shift+x` | Lock screen now |
| `Alt+Shift+w` | Next wallpaper |
| `Alt+n` | Toggle do-not-disturb (mako) |
| `Alt+Shift+n` | Dismiss all notifications |
| `Alt+Pause` | Passthrough mode — suspends all sway bindings *(system)* |

### Media and hardware *(all system)*

| Keys | Action |
|---|---|
| `XF86MonBrightnessUp/Down` | Brightness ±5% with notification |
| `XF86AudioRaiseVolume/LowerVolume` | Volume, works while locked |
| `XF86AudioMute` / `XF86AudioMicMute` | Mute speakers / microphone |
| `XF86AudioPlay` / `Stop` | Play-pause / stop, works while locked |
| `XF86AudioNext` / `Prev` | Next / previous track |
| `XF86AudioForward` / `Rewind` | Seek ±10 seconds |
| `Print` | Screenshot whole output |
| `Alt+Print` | Screenshot active window |
| `Ctrl+Print` | Screenshot selected area |

`--locked` on a binding means it still works while the lock screen is up — which
is why volume and play/pause work without unlocking.

### Automatic window rules *(system)*

- Firefox/Chromium/Brave: marked `Browser`, inhibit idle when fullscreen
- Firefox "Sharing Indicator": floating
- `pavucontrol` / `pavucontrol-qt`: floating, centered
- `lxqt-policykit-agent`: floating, centered

---

## 10. Known Issues in Your Config

### ✅ Issue 1: the external monitor's connector name — FIXED 2026-08-16

The config used to say:

```
output DP-1 resolution 1024x768 position 1366 0
workspace 2 output DP-1
```

But the actual hardware, from `swaymsg -t get_outputs`, is:

```
Output HDMI-A-1 'LG Electronics W2286'
  Current mode: 1680x1050 @ 59.883 Hz
  Position: 1366,0
```

Sway silently ignores rules for outputs that do not exist, so **both lines did
nothing**. The consequences were:

- The monitor ran at **1680×1050**, not the 1024×768 configured. That is its
  native resolution and looks better, so the failure was a bug in your favour.
- Its position of `1366,0` did not come from the config — it was sway's default
  left-to-right auto-arrangement, which happened to produce the same result.
- **Workspace 2 was not pinned to the external monitor.** This was the one real
  breakage.

The `DP-1` name was a leftover from an earlier VGA-adapter setup. The comment
block above it, and the since-deleted `set-outputs.sh`, both used `HDMI-A-1`
correctly.

The `DP-1` name was assumed to be a leftover from an earlier VGA-adapter setup,
and on 2026-08-15 every mention of it was rewritten to `HDMI-A-1`.

**That fix was wrong, and broke again on 2026-08-16.** The monitor came back up
as `DP-1`:

```
$ swaymsg -t get_outputs
DP-1   | Unknown | Unknown | Unknown | 1024x768 @ 60 Hz | position 1366,0
eDP-1  | BOE     | 0x0672  | Unknown | 1366x768  @ 60 Hz | position 0,0
```

So `HDMI-A-1` was now the dead name, and all five even `workspace N output`
lines pointed at a monitor that was not there. The visible symptom was in
`ws-cycle.py`: sitting on workspace 2 with the laptop holding 1/3/5, `$mod+.`
created workspace **11** instead of 4. Every even number was pinned to an output
the focused monitor was not, so the search skipped 2–10 entirely, found no
pattern to extend (the focused output `DP-1` was named in no pin at all), and
took the first free integer.

**The real bug was never which name is correct — it was hardcoding one name.**
The connector depends on which port and adapter the monitor is plugged into, and
sway reports no error when a line names an absent output. So the config now names
both, which is safe precisely because the dead one is ignored:

```
output eDP-1 position 0 0
output DP-1      position 1366 0
output HDMI-A-1  position 1366 0

workspace 2 output DP-1 HDMI-A-1        # "DP-1, or HDMI-A-1 if that is absent"
```

`workspace N output a b` is one pin with a fallback, not two competing pins, and
`ws-cycle.py` already parsed the multi-output form. The `<make> <model> <serial>`
identifier sway also accepts would be the properly stable answer, but this
monitor reports all three as `Unknown`.

`ws-cycle.py` was hardened at the same time so an *unlisted* connector can never
reproduce this. See [§6.4](#64-ws-cyclepy).

The resolution override was deliberately dropped rather than carried across, and
stays dropped: whatever the monitor reports as native beats guessing. Verified
after reload — from workspace 2 on `DP-1`, `$mod+.` now creates workspace 4 on
`DP-1`.

Workspace assignments apply at *creation* time, so pre-existing workspaces keep
their placement — that is normal, and matches sway's default behavior anyway. It
is also why adding the odd/even pins required renumbering the workspaces that
already existed.

One caveat for the future: output names for external monitors can change between
reboots or ports. For something stable, match on the monitor's make/model
instead:

```
output 'LG Electronics W2286 0x00101010' position 1366 0
```

### ⚠️ Issue 2: laptop position assumes a width that no longer matches

Config §3 places `eDP-1` at `0,0` and the external at x=1366, which correctly
abuts them since the laptop is 1366 wide. But the external is 1050 tall versus
the laptop's 768, so their vertical alignment is top-edge-flush. If mouse
movement between screens ever feels wrong, adjust the external's y-position —
e.g. `position 1366 -140` to centre them vertically.

### ✅ Issue 3: `$menu` defined but unused — FIXED 2026-08-15

`$rofi_cmd` and `$menu` were defined but never referenced; `$mod+space` called
`rofi -show drun` directly. Both variables were deleted rather than wired up,
so **`$mod+space` behaves exactly as before**.

The deleted `$menu` used rofi's `combi` mode, showing `drun` and `run` results
together. If you want that, restore it as a one-liner:

```
bindsym $mod+space exec rofi -show combi -combi-modes drun#run -modes combi
```

### ✅ Issue 4: unused scripts — FIXED 2026-08-15

`set-outputs.sh` and `fix-second-monitor.sh` deleted; see §7. Recoverable from
git history.

### ✅ Issue 5: resize mode arrow keys are incomplete — FIXED 2026-08-15

`Left`, `Up` and `Down` are now bound inside resize mode alongside the existing
`Right`, matching the `h/j/k/l` bindings.

### ✅ Issue 6: no notification daemon — FIXED 2026-08-15

`libnotify` gives you `notify-send`, which *sends* notifications, but sway ships
nothing that *displays* them, and no daemon was installed.

It was worse than notifications simply not appearing. D-Bus still advertises
`org.freedesktop.Notifications` as **activatable** — a leftover KDE registration
— so `notify-send` did not fail fast. It waited out the full activation timeout
trying to start a daemon that did not exist: **85 seconds**, measured.

Two things were affected. `wallpaper-next.sh` called it bare as its last
command, so `$mod+Shift+w` appeared to hang and returned exit 1 even though the
wallpaper had already changed. And Fedora's brightness and volume bindings in
`/usr/share/sway/config.d/` each fire a notification, so every one of those key
presses left a process stuck for 85 seconds.

Fixed on both sides:

- **`mako` installed** and started from config §6 with
  `exec_always sh -c 'pkill -x mako; mako'`. The `pkill` prevents reloads from
  stacking up daemons; `sh -c` keeps the `;` unambiguous.
- **`wallpaper-next.sh` detaches and caps its notification at 3s** regardless.
  Redundant now, kept because the failure mode is easy to fall back into.

Measured after: `notify-send` returns in **40ms** instead of 85,000ms, the
wallpaper script runs in 61ms and exits 0, and brightness notifications render
their level bar in 11ms.

### ℹ️ Issue 7: absolute paths remain in two places

`$scripts` now covers the helper scripts, but the wallpaper in config §4 and the
lock image in `lock.sh` are still absolute `/home/albos/...` paths. Harmless on
this machine; they would need editing on a differently-named account.

---

## 11. How to Make Changes Safely

### The workflow

1. **Test it live first** — every config line works as a `swaymsg` command:
   ```bash
   swaymsg output DP-1 position 1366 0
   ```
   Sway reports success for an output that is not attached, so confirm the name
   against `swaymsg -t get_outputs` first — a typo'd or stale connector name
   fails silently, which is how [§10, Issue 1](#10-known-issues-in-your-config)
   went unnoticed twice.
2. **Write it into the config** once it works.
3. **Validate before reloading** — this catches syntax errors without breaking
   your session:
   ```bash
   sway --validate
   ```
4. **Reload** with `Alt+Shift+c`.
5. **Remember `exec`** — anything on an `exec` line needs its process killed and
   restarted manually; reload will not do it.

### Back up before big edits

```bash
cp ~/.config/sway/config ~/.config/sway/config.bak
```

Better: make `~/.config/` a git repository. A broken sway config can leave you
with no way to launch a terminal, and `git checkout` is a fast way out.

### If sway will not start after an edit

Switch to a TTY with **Ctrl+Alt+F3**, log in, and fix the file with a
terminal editor. Then `sudo systemctl restart display-manager`, or just reboot.
This is the reason to keep a backup.

### Finding documentation

```bash
man 5 sway            # config file reference — the essential one
man 1 sway            # command-line options
man 5 sway-input      # input device settings
man 5 sway-output     # output/monitor settings
man 5 sway-bar        # bar settings
man 1 swaymsg
man 1 swayidle
man 1 swaylock
```

`man 5 sway` is genuinely complete and worth reading start to finish once. It is
much better than most of the blog posts you will find.

---

## 12. Troubleshooting Cookbook

**A window is on the wrong monitor, or something invisible is covering the screen**
```bash
swaymsg -t get_tree -p | less
```
Look for anything fullscreen or oddly placed. This is how the
`xwaylandvideobridge` problem was solved.

**What is my monitor actually called and what modes does it support?**
```bash
swaymsg -t get_outputs -p
```

**A keybinding does nothing**

Check whether a `config.d/` file overrides it — those load *after* your config:
```bash
grep -rn 'bindsym.*<key>' /usr/share/sway/config.d/ /etc/sway/config.d/ ~/.config/sway/
```

**Which app_id or class should I use in a `for_window` rule?**
```bash
swaymsg -t get_tree | grep -E '"app_id"|"class"|"name"'
```

**The screen locks too early or too late**
```bash
pgrep -a swayidle
```
This shows the timers actually in effect, which may differ from the config file
if you edited it without restarting the process.

**Duplicate bars / duplicate daemons**

Almost always an `exec_always` running something that does not kill its
predecessor. Check with `pgrep -a waybar`.

**Wallpaper is black on one monitor**

Set a solid colour to test whether the image is at fault:
```bash
swaymsg output '*' bg '#3366ff' solid_color
```
If it is still black, the image is innocent — something is covering it. Go to
`get_tree`.

**Screen sharing does not work**

Requires `xdg-desktop-portal-wlr`. Verify with:
```bash
rpm -q xdg-desktop-portal-wlr
```

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Wayland** | The display protocol replacing X11 |
| **compositor** | The program that owns the screen — here, sway itself |
| **wlroots** | The library sway is built on |
| **XWayland** | Compatibility layer running X11 apps under Wayland |
| **output** | A monitor (`eDP-1` = laptop panel, `DP-1`/`HDMI-A-1` = external) |
| **view** | An application window |
| **container** | An invisible box holding windows in a layout |
| **scratchpad** | A hidden workspace for parking windows |
| **mode** | A modal keymap, e.g. `resize`, `passthrough` |
| **IPC** | The socket interface `swaymsg` uses to talk to sway |
| **DPMS** | The standard for powering monitors off |
| **`app_id`** | Window identifier for native Wayland apps |
| **`class`** | Window identifier for X11/XWayland apps |
| **eDP** | Embedded DisplayPort — the internal laptop panel |

---

## Quick Reference Card

```
REPO        ~/dotfiles                   ← real files; everything below symlinks here
            git -C ~/dotfiles diff       ← review BEFORE you reload
            git -C ~/dotfiles checkout . ← undo uncommitted damage
            ~/dotfiles/install.sh -n     ← re-link after adding a package (-n = dry run)
CONFIG      ~/.config/sway/config        ← symlink into the repo
SYSTEM      /usr/share/sway/config.d/    ← package defaults (media keys, screenshots)
            /etc/sway/config.d/          ← machine-wide overrides
RELOAD      Alt+Shift+c              (does NOT restart `exec` programs)
VALIDATE    sway --validate
LOCK NOW    Alt+Shift+x
INSPECT     swaymsg -t get_tree -p / get_outputs -p / get_inputs -p
TEST LIVE   swaymsg <any config line>    (prefix with `--` if it takes --flags)
DOCS        man 5 sway

MONITORS    eDP-1      laptop panel, position 0,0     → ODD  workspaces
            DP-1 or HDMI-A-1  external, position 1366,0 → EVEN workspaces
            (the external's connector name varies — config names both;
             check which is live with `swaymsg -t get_outputs`)

WORKSPACES  Alt+.  next on this monitor, or append a new one at the end
            Alt+,  previous on this monitor, stops at the first
            Alt+N  jump to workspace N — moves you to whichever monitor owns it

IDLE        15:00 → lock screen (lock-001.png)
            15:05 → monitors power off (true black, no image possible)
            Changing these requires: pkill -x swayidle, then restart it
```
