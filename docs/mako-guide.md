# Mako — Notifications

**Your version:** mako 1.11.0 · Fedora 44
**Config:** `~/.config/mako/config` → `~/dotfiles/mako/.config/mako/config`

Mako is the daemon that *draws* notification popups. In Plasma this was built
into KDE; sway ships nothing equivalent, so it is a separate program you start
and style yourself.

---

## Table of Contents

1. [Sender vs displayer](#1-sender-vs-displayer)
2. [How it gets started](#2-how-it-gets-started)
3. [Global options](#3-global-options)
4. [Criteria — per-notification styling](#4-criteria--per-notification-styling)
5. [The timeout trap](#5-the-timeout-trap)
6. [Common changes](#6-common-changes)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Sender vs displayer

Two separate halves, and confusing them explains most notification problems:

| Program | Package | Role |
|---|---|---|
| `notify-send` | `libnotify` | **Sends** a notification over D-Bus |
| `mako` | `mako` | **Displays** it |

You had the sender for a long time without the displayer. That did not merely
mean "no popups" — it caused an 85-second hang, because D-Bus still advertised
`org.freedesktop.Notifications` as *activatable* (a leftover KDE registration),
so `notify-send` waited out the full activation timeout trying to start a daemon
that did not exist. Full story in [sway-guide.md](sway-guide.md), Issue 6.

Check which is which at any time:

```bash
busctl --user list | grep org.freedesktop.Notifications
```

A real PID and `mako` in that line means the daemon is running. `(activatable)`
with no owner means it is not.

## What sends notifications here

- **`wallpaper-next.sh`** (`$mod+Shift+w`) — announces the new image
- **Fedora's brightness bindings** — `/usr/share/sway/config.d/60-bindings-brightness.conf`
- **Fedora's volume bindings** — `60-bindings-volume.conf`
- Any application: browsers, chat apps, `notify-send` from a script

---

## 2. How it gets started

From the sway config, §6:

```
exec_always sh -c 'pkill -x mako; mako'
```

- **`pkill` first** so `$mod+Shift+c` replaces the daemon rather than stacking a
  second one. Same pattern as `waybar-restart.sh`.
- **`sh -c`** so the `;` is unambiguously a shell separator rather than
  something sway's own config parser might act on.
- **`exec_always`**, not `exec`, so a reload restarts it and picks up changes.

For config changes you do **not** need to reload sway:

```bash
makoctl reload
```

Useful commands:

| Command | Does |
|---|---|
| `makoctl reload` | Re-read the config |
| `makoctl list` | What is currently displayed |
| `makoctl dismiss` | Dismiss the newest |
| `makoctl dismiss -a` | Dismiss everything |
| `makoctl restore` | Bring back the last dismissed |
| `makoctl mode` | Show active modes (e.g. do-not-disturb) |

---

## 3. Global options

Format is `key=value`, one per line. Everything before the first `[section]` is
global.

### Palette

Catppuccin Mocha, the same set waybar, rofi and swaylock use:

| Colour | Hex | Used for |
|---|---|---|
| base | `#1e1e2e` | background |
| surface | `#313244` | grouped popups, progress bar |
| text | `#cdd6f4` | body text |
| overlay | `#6c7086` | dimmed text |
| blue | `#89b4fa` | accent / border |
| yellow | `#f9e2af` | wallpaper notifications |
| red | `#f38ba8` | critical |

Colours are `#RRGGBB` or `#RRGGBBAA`. The `ee` suffix on `#1e1e2eee` is alpha
≈93% — slightly translucent, matching rofi's popup so the two read as one
system.

### Shape

```
border-size=1
border-radius=0
font=FiraCode Nerd Font 10
```

Square corners and a 1px border deliberately match sway's
`default_border pixel 1`, waybar's `border-radius: 0` and rofi's 1px accent
outline. The whole desktop is square-edged.

The font is the **non-Mono** variant, like waybar and rofi. Mono is only for
kitty, which needs every glyph to occupy exactly one terminal cell.

### Placement

```
anchor=top-right
outer-margin=34,10,10,10
layer=top
```

`outer-margin` is `top,right,bottom,left`. The 34 clears your 28px waybar plus a
6px gap, so popups never overlap the bar.

**`output` is deliberately unset.** With two monitors, notifications follow the
*focused* output. Set `output=eDP-1` to pin them to the laptop.

### Behaviour

```
max-visible=5
default-timeout=5000
ignore-timeout=0
group-by=app-name
```

`group-by=app-name` collapses ten notifications from one app into a single
counted popup rather than a wall of them.

`ignore-timeout=0` means mako honours whatever expiry the *sender* asked for —
see [the timeout trap](#5-the-timeout-trap), which is not as harmless as it looks.

---

## 4. Criteria — per-notification styling

Sections in square brackets match notifications and apply style options to them:

```
[urgency=critical]
border-color=#f38ba8
```

**All fields in the bracket must match.** Fields not mentioned are ignored.
A notification can match several criteria, and **later matches win** — so keep
general rules first and specific ones last.

Available fields (`man 5 mako`):

| Field | Matches |
|---|---|
| `app-name` | The sending application |
| `summary` / `summary~` | Exact / regex match on the title |
| `body` / `body~` | Exact / regex match on the body |
| `urgency` | `low`, `normal`, `critical` |
| `category`, `desktop-entry` | App metadata |
| `actionable`, `expiring` | Booleans |
| `grouped`, `group-index` | Matched on a second pass, after grouping is decided |
| `mode` | Only when a named mode is active |

The `~` variants are POSIX extended regular expressions, which is how the
brightness/volume rule catches three different summaries at once:

```
[summary~="(Brightness|Volume|Muted).*"]
default-timeout=1200
```

### The progress bar

Fedora's brightness binding sends:

```
notify-send -h "int:value:$VALUE" -t 800 "Brightness: ${VALUE}%"
```

The `int:value:` hint (0–100) makes mako draw a **progress bar**, styled by:

```
progress-color=over #313244
```

`over` draws it on top of the background; `source` replaces the background
instead, which is useful when the popup is semi-transparent.

### Replacement, not stacking

Those same bindings also send
`-h string:x-canonical-private-synchronous:brightness`, which makes each new
notification *replace* the previous one with that tag.

This is **not documented in `man 5 mako`**, but it works — verified by firing
three brightness notifications in a row and finding exactly one popup showing
the latest value. Without it, holding a brightness key would paper the screen.

---

## 5. The timeout trap

The single non-obvious thing in this config, and worth understanding before you
change any timeout.

`default-timeout` is a **style** option, so it is legal inside a criteria
section. But it only applies when the *sender* did not specify its own expiry —
because the global `ignore-timeout=0` tells mako to honour the sender.

And `notify-send` sends a positive default rather than "let the server decide".
So this looks correct and silently does nothing:

```
[urgency=critical]
default-timeout=0        # never expire — but the sender's timeout wins
```

Verified: `notify-send -u critical "test"` vanished after a few seconds, while
`notify-send -u critical -t 0 "test"` persisted. The sender was overriding the
config.

The fix is to tell mako to ignore the sender *for that rule*:

```
[urgency=critical]
ignore-timeout=1
default-timeout=0
```

Confirmed working: of four notifications sent together, only the critical one
survives past 7 seconds.

**Rule of thumb:** if a `default-timeout` in a criteria section seems ignored,
add `ignore-timeout=1` beside it.

---

## 6. Common changes

**Change how long notifications stay** — `default-timeout` in milliseconds.
`0` means never, but pair it with `ignore-timeout=1` (see above).

**Move them to the other corner** — `anchor=top-left`, `bottom-right`, etc. If
you move to the bottom, drop the 34px top margin: `outer-margin=10`.

**Pin to one monitor** — `output=eDP-1`. Check names with
`swaymsg -t get_outputs`.

**Make them wider** — `width=340`.

**Style one application specially**

```
[app-name="Firefox"]
border-color=#f9e2af
default-timeout=10000
```

Find the exact name with `makoctl list` while one is on screen.

**Do-not-disturb.** Mako supports modes; add a sway binding to toggle one:

```
# in ~/.config/mako/config
[mode=dnd]
invisible=1
```

```
# in the sway config §7
bindsym $mod+n exec makoctl mode -t dnd
```

`invisible=1` is a criteria-only option — notifications are still queued and
readable with `makoctl list`, just not drawn.

**Dismiss everything** — `makoctl dismiss -a`. Worth a binding if you get
bursts.

**Apply any change** — `makoctl reload`. No sway reload needed.

---

## 7. Troubleshooting

**`notify-send` hangs for ~85 seconds.** Mako is not running. D-Bus keeps trying
to activate a daemon that does not exist. Check and restart:

```bash
pgrep -a mako || (pkill -x mako; mako &)
```

If it is missing after a reboot, the `exec_always` line in sway §6 is wrong or
was removed.

**Nothing appears, but `notify-send` returns instantly.** Mako is running but
not drawing. Check whether it is actually receiving them:

```bash
makoctl list
```

If they are listed, the problem is styling or placement — a `[mode=dnd]` with
`invisible=1` still active, or an `outer-margin` pushing them off screen.

**A style change did nothing.** Two likely causes: you did not run
`makoctl reload`, or a *later* criteria section overrides it. Later matches win.

**Popups overlap the waybar.** Increase the first number of `outer-margin`; the
bar is 28px tall.

**Critical notifications disappear.** The timeout trap — add `ignore-timeout=1`
to that section. See [section 5](#5-the-timeout-trap).

**Config errors.** Mako reports them on stderr at startup, which sway swallows.
Run it in the foreground to see them:

```bash
pkill -x mako; mako
```

**Icons are boxes.** `FiraCode Nerd Font` is missing — see the repo README's
bootstrap section.
