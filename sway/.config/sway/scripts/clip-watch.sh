#!/usr/bin/env bash
#
# Clipboard history recorder — starts the processes that feed cliphist.
#
# Started from the sway config §6:  exec_always $scripts/clip-watch.sh
# The picker that reads what these record is clip-menu.sh, on $mod+v.
# Full prose guide: ~/dotfiles/docs/clipboard-guide.md
#
# ── Why two watchers ────────────────────────────────────────────────────────
# `wl-paste --watch` watches ONE mime family per process. --type text covers
# everything you copy out of an editor, a terminal or a browser; --type image
# covers a grimshot screenshot. Both pipe into the same cliphist database at
# ~/.cache/cliphist/db, so the picker shows one merged, ordered history.
#
# Dropping the image line would not break anything — it would just mean a
# copied screenshot is gone the moment you copy something else.
#
# ── Why this is a script and not an inline `sh -c` in the config ────────────
# The obvious one-liner is a trap:
#
#     exec_always sh -c 'pkill -f "wl-paste --watch cliphist"; wl-paste ...'
#
# `pkill -f` matches against the whole command line, and the wrapper shell's
# own command line CONTAINS that pattern — so it kills its own parent before
# starting anything. A script's command line is just its path, which the
# pattern does not match.
#
# ⚠️ That is also why this file is called clip-watch.sh and not
# cliphist-watch.sh. Renaming it to anything containing "cliphist" would
# reintroduce the same self-match.
#
# ── Why kill first ─────────────────────────────────────────────────────────
# `exec_always` re-runs on every $mod+Shift+c. Without the pkill, each reload
# would add two more watchers and every copy would be stored several times.
# Same pattern as waybar-restart.sh and the mako line beside it in §6.
#
# Nothing is lost by restarting: the history lives on disk, not in these
# processes.

# No `set -e` here on purpose: pkill exits 1 when nothing matched, which is
# exactly what happens on the first run after login.
pkill -f 'wl-paste --watch cliphist' 2>/dev/null

wl-paste --type text  --watch cliphist store &
wl-paste --type image --watch cliphist store &
