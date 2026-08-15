# ~/.zshenv — read by EVERY zsh invocation
#
# This is the first file zsh reads, and it is read for login shells, interactive
# shells, scripts and subshells alike. Keep it small and side-effect free: it
# runs even for `zsh -c 'true'`.
#
# Because it runs for nested shells too, appending to PATH unconditionally here
# is what made $PATH accumulate duplicates — hence the guard below.

# Volta (Node version manager). It must be in .zshenv rather than .zshrc so that
# non-interactive shells and scripts can find node.
export VOLTA_HOME="$HOME/.volta"
case ":$PATH:" in
    *":$VOLTA_HOME/bin:"*) ;;
    *) export PATH="$VOLTA_HOME/bin:$PATH" ;;
esac
