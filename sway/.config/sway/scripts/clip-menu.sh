#!/usr/bin/env bash
#
# Clipboard picker — bound to $mod+v in the sway config §7.6.
#
# Two views in one popup, swapped with Tab:
#
#   History    what clip-watch.sh recorded, newest first. Transient: cliphist
#              keeps 750 items and dedupes, so entries do fall off the end.
#   Constants  text you saved on purpose and keep forever, from clip-const.sh.
#
# It opens on the history, so $mod+v then Enter still means what it always did.
# It does NOT paste: it only makes the entry current, so the next Ctrl+V
# anywhere gets it.
# Full prose guide: ~/dotfiles/docs/clipboard-guide.md
#
#   Enter             copy this entry to the clipboard, and leave
#   Tab               swap between History and Constants
#   Ctrl+e            edit this constant           (Constants only)
#   Ctrl+Delete       delete this one entry, then show the list again
#   Ctrl+Shift+Delete wipe the whole history — asks first  (History only)
#   Escape            leave, clipboard untouched
#
# The other way to make a constant is $mod+c, which pins whatever is on the
# clipboard right now without opening anything. See clip-const.sh.
#
# ── Why those keys and not the obvious ones ────────────────────────────────
# rofi errors out on a DUPLICATE binding, so every key here had to be checked
# against its defaults, and two of them had to be given up explicitly below.
#
# Shift+Delete is rofi's kb-delete-entry. Ctrl+p / Ctrl+n are row up/down.
# rofi's own -kb-custom-N defaults (Alt+1, Alt+2, ...) are useless on this
# machine for a different reason: $mod is Alt, so sway grabs Alt+1 as
# "workspace 1" and rofi never sees the key.
#
# ── Exit codes ─────────────────────────────────────────────────────────────
# rofi returns 0 for Enter, 1 for Escape, and 10 + (N-1) for -kb-custom-N.
# So custom-1 is 10 ... custom-4 is 13. Those non-zero exits are this script's
# control flow, which is why `set -e` is deliberately absent.

set -uo pipefail

CONST="${BASH_SOURCE[0]%/*}/clip-const.sh"

# Keys of the two synthetic rows. Real keys are a cliphist id (digits) or an
# absolute path, so neither of these can ever collide with one.
NEW_ROW='+new'
INFO_ROW='+info'

ROFI=(
    rofi -dmenu -i
    -theme clipboard          # bare NAME: rofi appends .rasi, finds it in
    -no-show-icons            # ~/.config/rofi/. Nothing here has an icon.

    # Both lists emit "<key><TAB><preview>". Show only the preview; rofi still
    # RETURNS the whole line, which is what cliphist and clip-const.sh need.
    -display-columns 2
    -display-column-separator '\t'

    # ── The two rofi defaults this popup takes over ────────────────────────
    # Tab is kb-element-next, which steps between the columns of a row. With
    # one displayed column it does nothing here, so it is free for the view
    # toggle — but it has to be cleared explicitly or rofi refuses to start.
    -kb-element-next ""
    # Ctrl+e is kb-move-end, "move the cursor to the end of the input". Cleared
    # outright rather than moved onto End: End is NOT free either, it is
    # kb-row-last, and rofi reports that collision only when it STARTS — a
    # `-dump-config` parse of the same flags exits 0 and tells you nothing.
    # Nothing is really lost; Right and Ctrl+f still walk the input, and End
    # keeps the more useful meaning here of jumping to the last row.
    -kb-move-end ""

    -kb-custom-1 "Control+Delete"
    -kb-custom-2 "Control+Shift+Delete"
    -kb-custom-3 "Tab"
    -kb-custom-4 "Control+e"
)

# The small 400px launcher box, deliberately WITHOUT -theme, so a question
# reads as a different thing from the wide list behind it.
confirm() {
    [[ $(printf 'no\nyes\n' | rofi -dmenu -i -no-show-icons -p "$1") == "yes" ]]
}

# Without this, a missing cliphist falls through to the empty-history row below
# and the popup says "History is empty" — which is true but sends you looking
# in entirely the wrong place. Say what is actually wrong instead.
if ! command -v cliphist >/dev/null; then
    notify-send -u critical "Clipboard" "cliphist is not installed — sudo dnf install cliphist"
    exit 1
fi

view=history

while :; do
    if [[ $view == history ]]; then
        list=$(cliphist list)
        # An empty rofi box gives no hint why it is empty, so say it in a row.
        # A row and not a notify-and-exit as this once was: exiting would also
        # take away the Tab that reaches the constants.
        # Most often this means the recorder is not running: check with
        #   pgrep -af 'wl-paste --watch cliphist'
        [[ -n $list ]] ||
            list=$(printf '%s\tHistory is empty — nothing copied yet' "$INFO_ROW")
        prompt="Clipboard"
        placeholder="Search clipboard..."
    else
        list=$("$CONST" list)
        # Always last, never first: as the only row it explains an empty
        # store, and once there are constants it never steals the default
        # selection from them.
        #
        # Built by hand rather than with ${list:+$'\n'}: bash does NOT apply
        # ANSI-C quoting inside a parameter expansion's word, so that form
        # inserts the six literal characters $'\n' between the last constant
        # and this row.
        new_row=$NEW_ROW$'\t'"+ New constant…"
        if [[ -n $list ]]; then
            list=$list$'\n'$new_row
        else
            list=$new_row
        fi
        prompt="Constants"
        placeholder="Search constants..."
    fi

    sel=$(printf '%s\n' "$list" | "${ROFI[@]}" -p "$prompt" \
              -theme-str "entry { placeholder: \"$placeholder\"; }")
    rc=$?
    key=${sel%%$'\t'*}

    case $rc in
        0)  # Enter
            if [[ $view == history ]]; then
                [[ $key == "$INFO_ROW" ]] && continue
                # decode parses the id off the front of the line and writes the
                # original bytes — text or image — which wl-copy then owns.
                printf '%s\n' "$sel" | cliphist decode | wl-copy
            else
                if [[ $key == "$NEW_ROW" ]]; then
                    "$CONST" new
                    continue
                fi
                # --trim-newline because $EDITOR always ends a file with one,
                # and pasting a saved email address should not also press Enter.
                wl-copy --trim-newline < "$key"
            fi
            exit 0
            ;;

        10) # Ctrl+Delete — delete the one entry, then loop so several can go
            # without reopening the picker each time.
            if [[ $view == history ]]; then
                [[ $key == "$INFO_ROW" ]] || printf '%s\n' "$sel" | cliphist delete
            else
                # A history entry is disposable and arrived by accident. A
                # constant was written by hand and there is no undo, so ask.
                [[ $key == "$NEW_ROW" ]] && continue
                confirm "Delete this constant?" && "$CONST" delete "$key"
            fi
            ;;

        11) # Ctrl+Shift+Delete — history only. There is deliberately no
            # equivalent for the constants: losing all of them to one keypress
            # is not a mistake worth making available.
            [[ $view == history ]] || continue
            if confirm "Wipe ALL clipboard history?"; then
                cliphist wipe
                notify-send "Clipboard" "History wiped"
                exit 0
            fi
            ;;

        12) # Tab — swap views. Not remembered between invocations: $mod+v
            # always opens on the history.
            if [[ $view == history ]]; then view=constants; else view=history; fi
            ;;

        13) # Ctrl+e — constants only; nothing in the history is editable.
            [[ $view == constants && $key != "$NEW_ROW" ]] || continue
            "$CONST" edit "$key"
            ;;

        *)  # Escape, or rofi failing to start.
            exit 0
            ;;
    esac
done
