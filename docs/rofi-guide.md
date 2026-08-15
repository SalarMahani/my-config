# Rofi — The Launcher

**Your version:** rofi 2.0.0 · Fedora 44
**Config:** `~/.config/rofi/config.rasi` → `~/dotfiles/rofi/.config/rofi/config.rasi`

Rofi is the search box that appears on `$mod+space`. It replaces KRunner.

Its config language, **rasi**, looks like CSS but is not CSS. That single fact
explains most confusion, so this guide starts there.

---

## Table of Contents

1. [Two halves of one file](#1-two-halves-of-one-file)
2. [The `@theme "/dev/null"` line](#2-the-theme-devnull-line)
3. [Settings — the `configuration` block](#3-settings--the-configuration-block)
4. [The widget tree](#4-the-widget-tree)
5. [Your theme, widget by widget](#5-your-theme-widget-by-widget)
6. [Common changes](#6-common-changes)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Two halves of one file

`config.rasi` contains two unrelated things:

| Half | Syntax | Controls |
|---|---|---|
| `configuration { ... }` | key-value | **Behaviour** — which modes, icons on/off, keybindings |
| everything after | CSS-like rules | **Appearance** — sizes, colours, layout |

They do not interact. A behaviour problem is never fixed in the theme half, and
vice versa.

### rasi is not CSS

Close enough to mislead, different enough to break:

- Every property ends with `;` — including the last one in a block.
- Values are **typed**. `padding: 12px;` is a length; `background-color: #1e1e2e;`
  is a colour; `children: [inputbar, listview];` is a list. Wrong type, error.
- `@variable` reads a variable; the `* { }` block defines them.
- There is no cascade or specificity. Rules match a widget by name and path, and
  a later rule for the same widget overrides an earlier one — that is all.

Rofi reports syntax errors clearly, with the line number, when you launch it
from a terminal. Always test a theme edit that way first (see
[Troubleshooting](#7-troubleshooting)).

---

## 2. The `@theme "/dev/null"` line

```rasi
@theme "/dev/null"
```

This is the most important line in the file and the least obvious.

Rofi ships a default theme, and any theme you load is applied *on top of* it.
Loading `/dev/null` — an empty file — **wipes the default theme entirely**, so
what follows is the complete definition rather than a patch over rofi's opinions.

Without it you would be fighting inherited padding, borders and colours you never
wrote. With it, if you did not specify something, it has no styling at all.

Consequence: this file must define everything it wants. That is why there are
rules for `element-text` and `element-icon` that look redundant — nothing is
inherited.

---

## 3. Settings — the `configuration` block

```rasi
configuration {
    modi: "drun,run,window";
    show-icons: true;
    icon-theme: "Papirus";
    font: "FiraCode Nerd Font 10";
    drun-display-format: "{name}";

    kb-row-down: "Down,Control+n";
    kb-row-up: "Up,Control+p";
}
```

**`modi`** — the modes rofi can run. Each answers a different question:

| Mode | Searches | Launch with |
|---|---|---|
| `drun` | Installed applications (`.desktop` files) | `rofi -show drun` |
| `run` | Every executable on `$PATH` | `rofi -show run` |
| `window` | Currently open windows — a window switcher | `rofi -show window` |

Listing a mode here only makes it *available*. What actually runs is the
`-show` argument, and your sway binding is:

```
bindsym $mod+space exec rofi -show drun
```

so `$mod+space` gives you `drun` only. `run` and `window` are configured but
unbound — see [Common changes](#6-common-changes) to bind them.

**`show-icons` / `icon-theme`** — application icons in the list, from the
Papirus theme (`papirus-icon-theme`, which *is* an RPM, unlike your font).

**`font`** — note this is the **non-Mono** `FiraCode Nerd Font`, unlike kitty's
`FiraCode Nerd Font Mono`. Correct: rofi is not a character grid, so it wants
the proportional variant with full-width icons.

**`drun-display-format: "{name}"`** — show just the application name. Other
placeholders include `{generic}` (the subtitle, e.g. "Web Browser"),
`{comment}`, `{exec}`. The default includes `{generic}`, so this line is what
keeps your list clean and short.

**`kb-row-down` / `kb-row-up`** — adds `Ctrl+n` / `Ctrl+p` alongside the arrow
keys, matching the readline/vim-ish navigation you use in zsh. Note the value is
a comma-separated list *inside* one string: adding a binding means editing the
string, not adding a line.

---

## 4. The widget tree

Rofi's window is a nested tree, and theme rules target nodes in it:

```
window                    the popup itself — size, border, padding
└── mainbox               the vertical container
    ├── inputbar          the search row
    │   └── entry         the text you type
    └── listview          the scrolling results
        └── element       one result row
            ├── element-icon    its icon
            └── element-text    its label
```

Two rules make this tree work:

- **`children:` decides what a container holds and in what order.** Your
  `mainbox` says `children: [inputbar, listview];`. Removing `inputbar` from
  that list removes the search box entirely.
- **State is written as a second word**: `element selected` styles an element
  in the selected state. That is not CSS descendant syntax — it is
  widget-plus-state.

---

## 5. Your theme, widget by widget

### The palette

```rasi
* {
    bg:     #1e1e2eee;
    bg-alt: #313244;
    fg:     #b4b8c5;
    accent: #89b4fa;
}
```

Catppuccin Mocha, matching waybar and swaylock.

`#1e1e2eee` is **eight** digits: `RRGGBBAA`. The trailing `ee` is alpha ≈ 93%,
so the popup is slightly translucent. Change it to `#1e1e2e` for fully opaque.

### `window`

```rasi
window {
    background-color: @bg;
    border: 0px;
    border-radius: 0px;
    width: 400px;
    padding: 12px;
}
```

Fixed 400px width, square corners, no border — consistent with your sway
`default_border pixel 1` and waybar's `border-radius: 0`.

### `mainbox`, `inputbar`, `entry`

```rasi
mainbox  { children: [inputbar, listview]; spacing: 10px; }
inputbar { background-color: @bg-alt; padding: 6px 10px; children: [entry]; }
entry    { placeholder: "Search..."; placeholder-color: #6c7086; }
```

The search row gets the lighter `bg-alt` so it reads as a distinct field. Adding
`prompt` to `inputbar`'s children would show the mode name ("drun") beside the
input.

### `listview` and `element`

```rasi
listview { lines: 6; scrollbar: false; spacing: 3px; }
element  { padding: 5px; }
```

`lines: 6` is the *number of results shown*, and with a fixed `width` it is what
determines the popup's height.

```rasi
element selected              { border: 1px; border-color: @accent; }
element selected element-text { text-color: @accent; font: "FiraCode Nerd Font Bold 10"; }
```

Selection is marked with a **blue outline and blue bold text**, not a filled
background — deliberately lighter-touch than waybar's inverted focused
workspace. Note the second rule reaches *into* the selected element to restyle
its text, and re-specifies the font in bold.

`element-icon { margin: 0px 8px 0px 0px; }` is the gap between icon and label
(top, right, bottom, left).

---

## 6. Common changes

**Make it wider** — `width: 400px;` in `window`. A percentage works too:
`width: 30%;`.

**Show more results** — `lines: 6;` in `listview`.

**Remove transparency** — change `bg: #1e1e2eee;` to `bg: #1e1e2e;`.

**Rounded corners** — set `border-radius` in `window` (and `inputbar` to match).

**Fill the selection instead of outlining it**

```rasi
element selected {
    background-color: @accent;
    border: 0px;
}
element selected element-text {
    text-color: @bg;
}
```

**Bind the window switcher.** `window` mode is already configured but unbound.
In the sway config §7.1:

```
bindsym $mod+Tab exec rofi -show window
```

This is genuinely useful with your workspace scheme — it searches every window
across both monitors, so you do not need to remember which workspace something
is on.

**Bind `run` mode** for arbitrary executables:

```
bindsym $mod+Shift+space exec rofi -show run
```

⚠️ `$mod+Shift+space` is already `floating toggle` in your sway config. Pick a
free key or move that binding.

**Combine drun and run in one list** — the `combi` mode:

```
bindsym $mod+space exec rofi -show combi -combi-modes drun#run -modes combi
```

This is exactly what the deleted `$menu` variable did (sway guide, Issue 3).

**Show the mode name in the search bar**

```rasi
inputbar { children: [prompt, entry]; }
prompt   { text-color: @accent; margin: 0px 8px 0px 0px; }
```

---

## 7. Troubleshooting

**Always test a theme edit from a terminal.** Rofi prints parse errors with line
numbers there and shows nothing when launched from a keybinding:

```bash
rofi -show drun
```

**Nothing appears on `$mod+space`.** Run `rofi -show drun` in a terminal. A rasi
syntax error — usually a missing `;` — makes rofi refuse to start.

**Icons are missing.** `show-icons` must be `true` *and* the icon theme must
exist:

```bash
rpm -q papirus-icon-theme
ls -d /usr/share/icons/Papirus
```

**Glyphs render as boxes.** That is the *font*, not the icon theme —
`FiraCode Nerd Font` is missing. See the repo README's bootstrap section.

**A style change does nothing.** Most likely the widget path is wrong. rasi has
no cascade, so a rule that does not match exactly is silently ignored. Prove the
selector matches by making it obvious:

```rasi
element { background-color: red; }
```

If nothing turns red, the selector is wrong rather than the property.

**Results are stale** — `drun` caches `.desktop` files. Clear it:

```bash
rm ~/.cache/rofi3.druncache
```

**Rofi looks completely different from this file.** The `@theme "/dev/null"`
line was removed or moved, so rofi's built-in default theme is applying
underneath yours.
