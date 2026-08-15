#!/usr/bin/env bash
#
# Symlink dotfile packages into $HOME.
#
#   ./install.sh --dry-run          show what would happen, change nothing
#   ./install.sh                    install every package
#   ./install.sh sway waybar        install only these packages
#   ./install.sh --list             list available packages
#
# A "package" is a top-level directory here whose contents mirror $HOME. So
# sway/.config/sway/config  ->  ~/.config/sway/config
#
# This is GNU stow's package layout on purpose: if you ever `dnf install stow`,
# `stow sway` from this directory does the same job with no restructuring. The
# script exists so the repo has no dependencies at all.
#
# Safety: an existing real file or directory in the way is MOVED to
# <path>.bak-YYYY-MM-DD, never deleted. Correct symlinks are left alone, so
# re-running is free.

set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
STAMP="$(date +%F)"

# Packages whose target directory is linked whole rather than file-by-file.
# Two reasons to want this:
#
#   1. New files added to the repo appear without re-running this script.
#      Verified: sway reads its config directory and writes nothing back.
#   2. Some tools break on symlinked FILES. wallpaper-next.sh searches with
#      `find -maxdepth 1 -type f`, and a symlink is -type l, not -type f — so
#      per-file linking would make it find zero wallpapers and silently stop
#      working. Linking the directory keeps the files inside it real.
DIR_LINK_PACKAGES=" sway waybar kitty rofi wallpapers "

info()  { printf '  %s\n' "$*"; }
act()   { if $DRY_RUN; then printf '  [dry-run] %s\n' "$*"; else printf '  %s\n' "$*"; fi; }
die()   { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

list_packages() {
    find "$DOTFILES" -mindepth 1 -maxdepth 1 -type d \
        -not -name '.git' -not -name 'docs' -printf '%f\n' | sort
}

# Move whatever currently occupies $1 out of the way, if anything does.
displace() {
    local target="$1"
    [ -e "$target" ] || [ -L "$target" ] || return 0

    if [ -L "$target" ]; then
        local current
        current="$(readlink -f "$target" || true)"
        if [ "$current" = "$(readlink -f "$2")" ]; then
            info "ok       $target"
            return 1   # already correct, nothing to do
        fi
        act "relink   $target (was -> $current)"
        $DRY_RUN || rm "$target"
        return 0
    fi

    local backup="$target.bak-$STAMP"
    local n=1
    while [ -e "$backup" ]; do backup="$target.bak-$STAMP.$n"; n=$((n + 1)); done
    act "backup   $target -> $backup"
    $DRY_RUN || mv "$target" "$backup"
}

link() {
    local src="$1" dest="$2"
    displace "$dest" "$src" || return 0
    act "link     $dest -> $src"
    if ! $DRY_RUN; then
        mkdir -p "$(dirname "$dest")"
        ln -s "$src" "$dest"
    fi
}

install_package() {
    local pkg="$1"
    local root="$DOTFILES/$pkg"
    [ -d "$root" ] || die "no such package: $pkg"

    printf '\n%s\n' "$pkg"

    # Whole-directory link. Works for any two-level layout, so both
    # sway/.config/sway -> ~/.config/sway and
    # wallpapers/Pictures/wallpapers -> ~/Pictures/wallpapers are handled.
    if [[ "$DIR_LINK_PACKAGES" == *" $pkg "* ]]; then
        local dir rel
        while IFS= read -r dir; do
            rel="${dir#"$root"/}"
            link "$dir" "$HOME/$rel"
        done < <(find "$root" -mindepth 2 -maxdepth 2 -type d)
        return 0
    fi

    # Otherwise link every file individually, preserving the tree shape.
    local file rel
    while IFS= read -r file; do
        rel="${file#"$root"/}"
        link "$file" "$HOME/$rel"
    done < <(find "$root" -type f -o -type l)
}

main() {
    local packages=()
    for arg in "$@"; do
        case "$arg" in
            --dry-run|-n) DRY_RUN=true ;;
            --list|-l)    list_packages; exit 0 ;;
            -h|--help)    sed -n '3,20p' "$0" | sed 's/^# \?//'; exit 0 ;;
            -*)           die "unknown option: $arg" ;;
            *)            packages+=("$arg") ;;
        esac
    done

    if [ ${#packages[@]} -eq 0 ]; then
        mapfile -t packages < <(list_packages)
    fi

    $DRY_RUN && printf 'DRY RUN - nothing will be changed.\n'
    printf 'dotfiles: %s\n' "$DOTFILES"

    for pkg in "${packages[@]}"; do
        install_package "$pkg"
    done

    printf '\nDone.%s\n' "$($DRY_RUN && printf ' (dry run - re-run without --dry-run to apply)')"
}

main "$@"
