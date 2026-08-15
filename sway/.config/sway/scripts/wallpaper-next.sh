#!/usr/bin/env bash

WALLPAPER_DIR="$HOME/Pictures/wallpapers"
STATE_FILE="$HOME/.cache/sway-wallpaper-index"

mkdir -p "$(dirname "$STATE_FILE")"

# Get sorted list of images
mapfile -t WALLPAPERS < <(find "$WALLPAPER_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | sort)

COUNT=${#WALLPAPERS[@]}

if [ "$COUNT" -eq 0 ]; then
    notify-send "Wallpaper" "No images found in $WALLPAPER_DIR"
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

notify-send "Wallpaper changed" "$(basename "$NEXT_WALLPAPER")"
