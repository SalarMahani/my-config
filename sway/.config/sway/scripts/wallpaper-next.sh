#!/usr/bin/env bash

WALLPAPER_DIR="$HOME/Pictures/wallpapers"
STATE_FILE="$HOME/.cache/sway-wallpaper-index"

mkdir -p "$(dirname "$STATE_FILE")"

# Get sorted list of images.
#
# The -L matters: ~/Pictures/wallpapers is a symlink into the dotfiles repo,
# and find does NOT follow symlinks by default. Without -L this search returns
# zero images and the script reports "No images found" — whether the symlink is
# the directory itself or the individual files inside it. -L covers both.
mapfile -t WALLPAPERS < <(find -L "$WALLPAPER_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | sort)

COUNT=${#WALLPAPERS[@]}

if [ "$COUNT" -eq 0 ]; then
    notify-send "Wallpaper" "No images found in $WALLPAPER_DIR" 2>/dev/null || true
    echo "wallpaper-next: no images in $WALLPAPER_DIR" >&2
    exit 1
fi

# Read current index, default to -1 if missing
if [ -f "$STATE_FILE" ]; then
    INDEX=$(cat "$STATE_FILE")
else
    INDEX=-1
fi

# Move to next index, wrap around
NEXT_INDEX=$(( (INDEX + 1) % COUNT ))
echo "$NEXT_INDEX" > "$STATE_FILE"

NEXT_WALLPAPER="${WALLPAPERS[$NEXT_INDEX]}"

# Set wallpaper on all outputs via sway's native background (no swaybg race)
pkill swaybg 2>/dev/null
swaymsg output "*" bg "$NEXT_WALLPAPER" fill

# Notifications are best-effort, detached, and time-limited.
#
# No notification daemon (mako/dunst/swaync) is installed here, yet D-Bus still
# advertises org.freedesktop.Notifications as activatable because of a leftover
# KDE service. So notify-send blocks trying to start something that will never
# start: measured at 85 SECONDS before it gives up. Run bare, that made
# $mod+Shift+w appear to hang and turned a successful change into exit 1.
#
# The wallpaper is already applied above, so the notification is pure garnish:
# detach it, cap it at 3s, and never let it affect our exit status.
( timeout 3 notify-send "Wallpaper changed" "$(basename "$NEXT_WALLPAPER")" >/dev/null 2>&1 & )
