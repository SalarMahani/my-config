#!/usr/bin/env bash
#
# Clipboard constants — the store behind the second view of $mod+v.
#
# A "constant" is a piece of text you keep permanently: an email address, a
# postal address, an ssh one-liner, a signature. The clipboard HISTORY cannot
# hold these — cliphist keeps 750 items and dedupes, so anything you want
# forever eventually falls off the end of it.
#
# This script is the store. It is called from two places:
#   sway §7.6   bindsym $mod+c exec $scripts/clip-const.sh pin
#   clip-menu.sh   list / new / edit / delete, from inside the picker
# Full prose guide: ~/dotfiles/docs/clipboard-guide.md
#
#   pin            save the current clipboard as a constant
#   list           emit "<path><TAB>* <preview>" rows, oldest first
#   new            create one by typing it in $EDITOR
#   edit <path>    re-open one in $EDITOR
#   delete <path>  remove one
#
# ── Where the constants live, and why there ────────────────────────────────
# ~/.local/share/clip-constants/<epoch-nanos>.txt — one file per constant.
#
# NOT ~/.cache, where the history db lives: a cache is something you can
# delete, and these are hand-made. NOT the dotfiles repo either — it is
# published on GitHub, and a constant is exactly where an email address, a
# server path or a token ends up. Same rule as ~/.zshrc.local.
#
# The filename is `date +%s%N`, so lexical order IS creation order and two
# constants made in the same second cannot collide. Nothing ever displays the
# name; the content is its own label.
#
# ⚠️ Everything here is stored UNENCRYPTED, exactly like the history.
#
# ⚠️ This file must not be renamed to anything containing "cliphist".
# clip-watch.sh runs `pkill -f 'wl-paste --watch cliphist'`, which matches
# whole command lines — a script whose path contained that word would be
# killed by every sway reload. Same trap documented in clip-watch.sh.

set -uo pipefail

DIR="${XDG_DATA_HOME:-$HOME/.local/share}/clip-constants"

# The glob is deliberately *.txt and not *. $EDITOR leftovers land in the same
# directory — vim writes `file~`, nano writes `file.save`, both write .swp —
# and a bare * would list every one of them as a constant.
GLOB='*.txt'

mkdir -p "$DIR"

note() { notify-send "Clipboard" "$1"; }

# One-line preview of a file, for the rofi list.
#
# Two substitutions, both load-bearing:
#   tabs -> spaces   the list rows are "<path><TAB><preview>" and rofi is told
#                    -display-columns 2. A literal tab in the content would
#                    open a third column and silently hide the rest.
#   newlines -> ⏎    so a multi-line constant stays one row.
# The copy path reads the FILE, never this string, so the stored text is
# untouched by either.
preview() {
    local text
    text=$(awk 'NR>1 { printf "⏎" } { gsub(/\t/, " "); printf "%s", $0 }' "$1")
    # 100 chars matches cliphist's own -preview-width, so the two views
    # truncate at the same place.
    if (( ${#text} > 100 )); then
        printf '%s…' "${text:0:100}"
    else
        printf '%s' "$text"
    fi
}

# A file is "empty" if it holds no non-whitespace character. Saving a constant
# empty in the editor is how you delete it from there.
blank() {
    [[ -z $(tr -d '[:space:]' < "$1") ]]
}

# The editor, in its own floating kitty window. The sway rule that floats it is
# `for_window [app_id="clip-const"]` in §5 — kitty's --class sets app_id on
# Wayland.
#
# `kitty -e` stays in the FOREGROUND, which is the point: clip-menu.sh blocks
# here until the window closes, so the list it redraws afterwards is fresh.
#
# ⚠️ $EDITOR is deliberately NOT the first choice. Fedora ships
# /etc/profile.d/nano-default-editor.sh, which exports EDITOR=/usr/bin/nano for
# every user on the machine — so it is a distro default, not a preference, and
# sway inherits it at login. $VISUAL is left unset by that package, so it is the
# one of the two that actually means something here. Set `export VISUAL=...` in
# ~/.zshenv to override; vim is the fallback because this repo tracks a .vimrc.
edit_file() {
    local editor=${VISUAL:-vim}
    command -v "$editor" >/dev/null || editor=${EDITOR:-vi}
    kitty --class clip-const -e "$editor" "$1"
}

# Make one from scratch: a real file with its final name straight away rather
# than a temp file, because the caller is blocked while the editor is open, so
# nothing can observe the half-made file and an abandoned one is removed a line
# later.
new_constant() {
    local f="$DIR/$(date +%s%N).txt"
    : > "$f"
    edit_file "$f"
    blank "$f" && rm -f "$f"
    return 0
}

# Reject a path that did not come out of `list`. The picker hands back whatever
# rofi returned, so this is the one place that has to be suspicious of it.
valid() {
    [[ $1 == "$DIR"/*.txt && -f $1 ]]
}

case "${1:-}" in

pin)
    # $mod+c means "make me a constant", and it never dead-ends: when there is
    # nothing NEW on the clipboard to pin, it opens a blank one in the editor
    # instead of refusing. Refusing was the original behaviour and it was wrong
    # — pressing the constants key twice is exactly what you do when you want a
    # second constant, and the answer "that one is already saved" is true but
    # useless. The `+ New constant…` row inside $mod+v does the same job; this
    # is the same thing without the two keystrokes to reach it.

    # The clipboard may hold a screenshot — clip-watch.sh runs an image watcher
    # alongside the text one. Writing those bytes into a .txt would produce a
    # constant that is binary garbage, so check the offer first.
    #
    # Wayland clients advertise text/plain (usually with a charset suffix);
    # the STRING/UTF8_STRING names come via XWayland.
    text=""
    if wl-paste --list-types 2>/dev/null |
            grep -qiE '^(text/|UTF8_STRING$|STRING$|TEXT$)'; then
        # --no-newline drops the single trailing newline a terminal or editor
        # adds, so pasting a saved email address does not also press Enter.
        text=$(wl-paste --no-newline 2>/dev/null)
    fi

    # No text at all, or only whitespace: nothing to pin, so make a fresh one.
    # No notification — the window appearing is its own answer.
    if [[ -z $(printf '%s' "$text" | tr -d '[:space:]') ]]; then
        new_constant
        exit 0
    fi

    # Never grow a second identical constant. `cmp` on the bytes, not on the
    # preview, so two that differ only past the 100-char cut are both kept.
    tmp=$(mktemp) || exit 1
    printf '%s' "$text" > "$tmp"
    for f in "$DIR"/$GLOB; do
        [[ -e $f ]] || break
        if cmp -s "$tmp" "$f"; then
            rm -f "$tmp"
            # This one case DOES notify before opening the editor: without it
            # the blank window looks like the clipboard was ignored, and the
            # useful fact is that the text is already safely stored.
            note "Already a constant — opening a blank one"
            new_constant
            exit 0
        fi
    done
    mv "$tmp" "$DIR/$(date +%s%N).txt"

    # Show what was saved. Without this the key press has no visible effect at
    # all and you cannot tell it worked without opening $mod+v.
    line=${text%%$'\n'*}
    note "Saved as a constant — ${line:0:60}"
    ;;

list)
    # Oldest first, which the timestamp filenames give for free. `sort` is
    # explicit rather than trusting the glob's locale-dependent order.
    for f in "$DIR"/$GLOB; do
        [[ -e $f ]] || break
        printf '%s\n' "$f"
    done | sort | while read -r f; do
        printf '%s\t★ %s\n' "$f" "$(preview "$f")"
    done
    ;;

new)
    new_constant
    ;;

edit)
    valid "${2:-}" || exit 0
    edit_file "$2"
    # Emptying a constant in the editor deletes it. That is deliberate: it is
    # the obvious thing to try, and doing nothing instead would leave a blank
    # row in the list with no way to read it.
    blank "$2" && rm -f "$2"
    ;;

delete)
    # No confirmation here — clip-menu.sh asks before calling this, because it
    # is the half that has a rofi window to ask in.
    valid "${2:-}" && rm -f "$2"
    ;;

*)
    printf 'usage: %s pin|list|new|edit <path>|delete <path>\n' "${0##*/}" >&2
    exit 2
    ;;
esac
