# Waybar — The Status Bar

**Your version:** Waybar v0.15.0 · Fedora 44
**Config:** `~/.config/waybar/` → `~/dotfiles/waybar/.config/waybar/`

Waybar is the strip across the top of your screen. In Plasma this was the panel,
configured by right-clicking it. Here it is two files and no GUI.

---

## Table of Contents

1. [The two-file split](#1-the-two-file-split)
2. [How Waybar gets started](#2-how-waybar-gets-started)
3. [`config.jsonc` — what appears](#3-configjsonc--what-appears)
4. [`style.css` — how it looks](#4-stylecss--how-it-looks)
5. [Common changes](#5-common-changes)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. The two-file split

| File | Decides |
|---|---|
| `config.jsonc` | **Which** modules exist, where they sit, what text they show |
| `style.css` | **How** they look — colours, padding, fonts |

The split is strict: you cannot set a colour in `config.jsonc`, and you cannot
add a module in `style.css`. When something looks wrong, the first question is
always "is this a *what* problem or a *how* problem?"

`.jsonc` is JSON with comments allowed. Trailing commas are still an error.

---

## 2. How Waybar gets started

Not by Waybar itself, and not by Fedora's default. Your sway config §6 has:

```
exec_always $scripts/waybar-restart.sh
```

which runs:

```bash
pkill waybar; sleep 0.5; waybar
```

Three consequences worth knowing:

- **`exec_always` means every `$mod+Shift+c` restarts the bar.** That is how you
  apply a config change — reload sway, not just save the file.
- **It kills first**, so reloading repeatedly never stacks up duplicate bars.
- **Fedora's own bar block is disabled** by the empty
  `~/.config/sway/config.d/90-bar.conf`, which shadows the system file of the
  same name. That empty file is load-bearing — deleting it gives you *two* bars.
  Full explanation in [the sway guide](sway-guide.md), §4.3.

To restart the bar without touching sway: `~/.config/sway/scripts/waybar-restart.sh`.

To see why it is misbehaving, run it in the foreground and read the errors:

```bash
pkill waybar; waybar        # Ctrl+C when done
```

---

## 3. `config.jsonc` — what appears

### The frame

```jsonc
"layer": "top",       // draw above windows
"position": "top",    // top edge of the screen
"height": 28,         // pixels
"spacing": 4          // gap between modules, in pixels
```

`"layer": "top"` puts the bar above normal windows. The other useful value is
`"bottom"`, which puts it *behind* windows — occasionally wanted for a bar that
should not cover anything.

### The three zones

```jsonc
"modules-left":   ["sway/workspaces"],
"modules-center": ["sway/mode"],
"modules-right":  ["cpu","memory","network","bluetooth","pulseaudio","battery",
                   "power-profiles-daemon","sway/language","tray","clock"]
```

Order inside the array is left-to-right order on screen. Moving `clock` to
`modules-center` is a one-line change.

A module only renders if it is **both** listed in a zone **and** (for most
modules) configured in its own block below. Listing a module you have not
configured uses its defaults; configuring one you never listed does nothing —
a common reason an edit "does not work".

### `sway/workspaces` — the one tied to your workspace scheme

```jsonc
"sway/workspaces": {
    "disable-scroll": true,
    "format": "{name}"
}
```

`disable-scroll` stops the scroll wheel from changing workspace when the pointer
passes over the bar — worth keeping, since accidental scrolls are disorienting.

**Not set here, but important: `all-outputs` defaults to `false`.** Waybar draws
one bar per monitor, and each shows only the workspaces on *its own* monitor.
That is exactly right for your odd/even scheme: the laptop bar shows `1 3`, the
external shows `2 4`. Setting `"all-outputs": true` would make both bars show
all four and lose that signal.

### Format strings and `format-icons`

Every module's `format` is a template. `{}` is the module's main value; named
placeholders like `{usage}`, `{capacity}`, `{essid}` vary per module.

```jsonc
"cpu":    { "format": " {usage}%",     "interval": 5 },
"memory": { "format": " {percentage}%", "interval": 5 }
```

Those leading glyphs are **Nerd Font icons**, not emoji. They only render
because `style.css` asks for `FiraCode Nerd Font`. If you see boxes or blank
gaps, the font is missing — see [Troubleshooting](#6-troubleshooting).

`format-icons` is a *set* of glyphs Waybar picks from based on the value:

```jsonc
"battery": {
    "format": "{icon} {capacity}%",
    "format-icons": ["", "", "", "", ""],   // empty → full
    "format-charging": " {capacity}%"
}
```

With an array, Waybar divides 0–100% into as many buckets as there are icons.
With an object (as `pulseaudio` uses `"default"`), it picks by key.

`format-charging`, `format-muted`, `format-disconnected` are *state overrides* —
they replace `format` entirely when that state is active.

### `power-profiles-daemon` — the Plasma power switcher, rebuilt — added 2026-08-18

```jsonc
"power-profiles-daemon": {
    "format": "{icon}",
    "format-icons": { "performance": "performance", "balanced": "balanced",
                      "power-saver": "power-saver" }
}
```

Click cycles `power-saver → balanced → performance`; scrolling also switches.
The CSS colours them green / blue / red so the mode is readable without hovering.

**Why this works on Fedora at all** is worth writing down, because it looks like
it should not. Fedora ships **`tuned`**, not `power-profiles-daemon`, and
`powerprofilesctl` is not even installed. But the `tuned-ppd` package — already
running here — publishes tuned on the **same D-Bus name** Waybar expects
(`net.hadess.PowerProfiles`), mapping the three profile names onto tuned's own
(`performance` → `throughput-performance`). So the stock module needs no script
and no shim. To see the three profiles for yourself:

```bash
busctl --system get-property net.hadess.PowerProfiles \
    /net/hadess/PowerProfiles net.hadess.PowerProfiles Profiles
```

Switching needs no polkit password — the click just works.

### `sway/language` — which keyboard layout is live — added 2026-08-18

```jsonc
"sway/language": {
    "format": "{short}",
    "on-click": "swaymsg input type:keyboard xkb_switch_layout next"
}
```

Shows `us` or `ir` for the `xkb_layout "us,ir"` set in sway §2; the tooltip gives
the full name (`English (US)` / `Persian`). Clicking toggles, which is the mouse
alternative to the both-shifts binding.

**This module needs `min-width` in the CSS or it renders as a bare `…`.** See §6.

### `sway/mode` — added 2026-08-18

```jsonc
"sway/mode": { "format": "{}", "tooltip": false }
```

Renders **nothing** in the default mode, and the mode's name on a yellow badge
otherwise. It exists because sway's `move-all` mode (`Alt+Shift+a`) deliberately
stays open after each action: without a visible badge, a mode you forgot to
leave is indistinguishable from a keyboard that has stopped working.

### Interactivity

```jsonc
"pulseaudio": { "on-click": "pavucontrol" }
```

Any module takes `on-click`, `on-click-right`, `on-click-middle`,
`on-scroll-up`, `on-scroll-down`. The value is a shell command.

`"tooltip-format"` sets the hover text; `network` and `bluetooth` both use it
here to show detail that does not fit on the bar.

### `interval`

Seconds between refreshes. `cpu` and `memory` poll every 5s. `clock` needs no
interval — it is event-driven. Lowering intervals costs battery for little gain.

---

## 4. `style.css` — how it looks

Waybar styling is **real CSS**, via GTK. Not all CSS works — no flexbox, no
grid, no `calc()` in most places — but selectors, colours, padding, borders and
fonts behave as you expect.

### Selector syntax

| Selector | Matches |
|---|---|
| `*` | Everything — the place for font and reset rules |
| `window#waybar` | The bar itself (`#` = GTK widget name) |
| `#clock`, `#battery` | One module |
| `#workspaces button` | Each individual workspace button |
| `#battery.critical` | A module **in a state** (`.` = CSS class) |

The state classes are the link back to `config.jsonc`: Waybar adds
`.warning`, `.critical`, `.charging`, `.muted`, `.focused` and so on
automatically, and your CSS decides what they look like.

### Your file, top to bottom

```css
* {
    font-family: "FiraCode Nerd Font";
    font-size: 13px;
    border: none;          /* GTK adds borders by default; this resets them */
    border-radius: 0;      /* square corners everywhere */
    min-height: 0;         /* lets the bar be as short as `height` says */
}
```

`min-height: 0` is the non-obvious one. Without it GTK enforces a minimum widget
height and your `"height": 28` is silently ignored.

```css
window#waybar {
    background-color: #1e1e2e;   /* Catppuccin Mocha base */
    color: #cdd6f4;              /* default text */
}
```

```css
#workspaces button          { color: #b4b8c5; background-color: transparent; }
#workspaces button.focused  { background-color: #89b4fa; color: #1e1e2e; }
```

The focused workspace inverts: blue background, dark text. Waybar offers more
workspace classes than you currently use (`man waybar-sway-workspaces`):

| Selector | Meaning |
|---|---|
| `.focused` | The workspace you are on |
| `.visible` | Displayed on some monitor, but not focused — i.e. the *other* screen's current workspace |
| `.urgent` | A window on it is demanding attention |
| `.empty` | Exists but holds no windows |
| `.current_output` | On the same monitor as this bar |
| `#sway-workspace-3` | One specific workspace, by name |

`.visible` is a natural fit for your two-monitor setup: it would let the laptop
bar show, in a third colour, which workspace the external monitor is displaying.

```css
#battery.warning  { color: #f9e2af; }   /* yellow */
#battery.critical { color: #f38ba8; }   /* red */
```

Waybar decides *when* those apply, from thresholds in `config.jsonc`. You have
not set any, so the defaults are used. To control them:

```jsonc
"battery": { "states": { "warning": 30, "critical": 15 } }
```

```css
/* Power profile: colour tells you the mode at a glance */
#power-profiles-daemon.performance { color: #f38ba8; }   /* red */
#power-profiles-daemon.balanced    { color: #89b4fa; }   /* blue */
#power-profiles-daemon.power-saver { color: #a6e3a1; }   /* green */

/* Sway mode indicator — inverted, so a modal keyboard is unmissable */
#mode { background-color: #f9e2af; color: #1e1e2e; min-width: 40px; }

/* Without a width floor GTK collapses this label to an ellipsis. See §6. */
#language { min-width: 40px; }
```

The `.performance` / `.balanced` / `.power-saver` classes are set by Waybar from
the live profile, the same way `#battery.warning` is — you style the states, the
module decides when they apply.

### The palette

Catppuccin Mocha, shared with your sway lock screen and rofi:

| Colour | Hex | Used for |
|---|---|---|
| base | `#1e1e2e` | bar background |
| text | `#cdd6f4` | normal text |
| overlay | `#b4b8c5` | dimmed text (inactive workspaces) |
| blue | `#89b4fa` | accent / focused |
| yellow | `#f9e2af` | warning |
| red | `#f38ba8` | critical / performance profile |
| green | `#a6e3a1` | power-saver profile |

---

## 5. Common changes

**Make the bar taller** — `"height": 28` in `config.jsonc`, then reload sway.

**Change the font size** — `font-size` in the `*` rule of `style.css`.

**Move the clock to the middle** — cut `"clock"` from `modules-right`, put it in
`modules-center`.

**Remove a module** — delete it from its zone array. Leaving its config block
behind is harmless.

**Add a module** — add the name to a zone, then add a config block. E.g. disk:

```jsonc
"modules-right": ["disk", "cpu", ...],

"disk": {
    "interval": 60,
    "format": " {percentage_free}% free",
    "path": "/"
}
```

**Show the date as well as the time**

```jsonc
"clock": { "format": "{:%H:%M  %a %d %b}" }
```

The part after `:` is a [strftime](https://man7.org/linux/man-pages/man3/strftime.3.html)
format — `%Y` year, `%m` month, `%d` day, `%H:%M` 24-hour time.

**Highlight the focused workspace differently** — edit
`#workspaces button.focused` in `style.css`.

**Apply any change** — `$mod+Shift+c`. Because `waybar-restart.sh` is on an
`exec_always` line, that is all it takes.

---

## 6. Troubleshooting

**Icons show as boxes (▯) or blank gaps.** The Nerd Font is missing. Check:

```bash
fc-list | grep -c "FiraCode Nerd Font"    # 0 means not installed
```

It is not an RPM — see the bootstrap section of the repo README.

**The bar does not appear at all.** Run it in the foreground to see the error:

```bash
pkill waybar; waybar
```

A JSON syntax error (usually a trailing comma) makes it exit immediately with
the line number.

**Two bars appear.** The empty `~/.config/sway/config.d/90-bar.conf` was deleted
or renamed, so Fedora's bar block is no longer shadowed and starts a second one.
Recreate it empty:

```bash
touch ~/.config/sway/config.d/90-bar.conf
```

**A module shows nothing.** Either it is not listed in a zone array, or the
program it queries is missing (`pulseaudio` needs `pactl` from
`pulseaudio-utils`; `bluetooth` needs a running `bluetoothd`).

**A module renders as a bare `…` (ellipsis).** GTK has collapsed the label to
zero width and ellipsised it. The *content* is fine — the label is. Give it a
floor:

```css
#language { min-width: 40px; }
```

This is not hypothetical: `sway/language` did exactly this, deterministically,
and the ellipsis is easy to mistake for a tray icon. Two things make it hard to
diagnose, so check them in this order:

1. **The text is irrelevant.** A literal `format: "KBONLY"` ellipsises just the
   same, so do not go hunting for a bad `{placeholder}` — that is not the fault.
2. **It is the stylesheet, not the module.** Run the same config against a
   throwaway stylesheet to prove it:

   ```bash
   echo 'window { background: #222; color: #fff; }' > /tmp/t.css
   pkill waybar; waybar -c ~/.config/waybar/config.jsonc -s /tmp/t.css
   ```

   If the module appears, the module works and the CSS is the problem.

**A module is invisible but its space is there.** Check `format-icons` for
**empty strings**. `"format": "{icon}"` with `"performance": ""` renders exactly
nothing, and the failure is silent — no error, no warning, no log line. Note
that none of the modules in this config use glyphs; `cpu` is a plain
`" {usage}%"` with a leading **space**, not an icon.

**Style edits do nothing.** GTK ignores properties it does not implement, in
silence. Verify the selector matches first by setting something unmissable:

```css
#clock { background-color: red; }
```

If the clock does not turn red, the selector is wrong, not the property.

**Changes only appear sometimes.** You saved but did not reload. `$mod+Shift+c`.
