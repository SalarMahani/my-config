# .bashrc

# Source global definitions
if [ -f /etc/bashrc ]; then
    . /etc/bashrc
fi

# User specific environment
if ! [[ "$PATH" =~ "$HOME/.local/bin:$HOME/bin:" ]]; then
    PATH="$HOME/.local/bin:$HOME/bin:$PATH"
fi
export PATH

# Uncomment the following line if you don't like systemctl's auto-paging feature:
# export SYSTEMD_PAGER=

# User specific aliases and functions
if [ -d ~/.bashrc.d ]; then
    for rc in ~/.bashrc.d/*; do
        if [ -f "$rc" ]; then
            . "$rc"
        fi
    done
fi
unset rc

# NOTE: zsh is the login shell here (see docs/shell-guide.md); this file only
# runs for interactive bash, which is rare. Six WebStorm PATH lines were
# removed on 2026-08-15 — the app is uninstalled, none of the directories
# existed, and /APPS/webstorm/bin was repeated five times.

# Volta (Node version manager).
export VOLTA_HOME="$HOME/.volta"
case ":$PATH:" in
    *":$VOLTA_HOME/bin:"*) ;;
    *) export PATH="$VOLTA_HOME/bin:$PATH" ;;
esac

# JetBrains IDEs write this file to set JVM options; guarded, so it is a no-op
# when none is installed.
___MY_VMOPTIONS_SHELL_FILE="${HOME}/.jetbrains.vmoptions.sh"; if [ -f "${___MY_VMOPTIONS_SHELL_FILE}" ]; then . "${___MY_VMOPTIONS_SHELL_FILE}"; fi

# Machine-specific settings, not tracked by git.
[ -f ~/.bashrc.local ] && . ~/.bashrc.local
