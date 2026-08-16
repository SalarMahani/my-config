# ~/.zshrc — interactive zsh configuration
#
# Documented in ~/dotfiles/docs/shell-guide.md.
#
# Machine-specific settings (paths to installed apps, personal aliases) do NOT
# belong in this file — it is published on GitHub. Put them in ~/.zshrc.local,
# which is gitignored and sourced at the bottom of this file.

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi


### PATH ###################################################################

# Add each directory only if it is not already present. A login zsh sources
# /etc/profile and ~/.profile before this file, so appending unconditionally is
# how PATH ended up with 20 entries and several triplicates.
for dir in "$HOME/.local/bin" "$HOME/bin"; do
    case ":$PATH:" in
        *":$dir:"*) ;;
        *) PATH="$dir:$PATH" ;;
    esac
done
export PATH
unset dir

# JetBrains IDEs write this file to set JVM options. Guarded, so it is a no-op
# when no JetBrains product is installed.
___MY_VMOPTIONS_SHELL_FILE="${HOME}/.jetbrains.vmoptions.sh"
[ -f "${___MY_VMOPTIONS_SHELL_FILE}" ] && . "${___MY_VMOPTIONS_SHELL_FILE}"


### Plugin manager #########################################################

# zinit installs itself on first run, so a fresh machine needs nothing but git.
# The first shell after a clean install takes a few seconds while it clones.
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "${ZINIT_HOME}/zinit.zsh"

# Prompt.
zinit ice depth"1"
zinit light romkatv/powerlevel10k

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# These three are loaded by zinit and must NOT also be sourced from
# /usr/share/... — doing both loads each plugin twice, which slows startup and
# makes the highlighter fight itself.
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions

autoload -U compinit && compinit


### History ################################################################

HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory          # every shell sees every other shell's history
setopt hist_ignore_space     # a leading space keeps a command out of history
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups


### Completion #############################################################

# Case-insensitive matching, and colour completions like ls does.
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"


### Key bindings and vi mode ###############################################

bindkey -v                   # vi keybindings on the command line
export KEYTIMEOUT=1          # 10ms before Escape is treated as mode-switch

# Block cursor in normal mode, beam in insert mode.
#
# Installed with add-zle-hook-widget rather than `zle -N zle-keymap-select`,
# because powerlevel10k (loaded above) puts its own widgets on these same two
# hooks to drive the ❯/❮ prompt char. `zle -N` REPLACES a widget; the hook
# helper chains onto whatever is already registered, so both survive.
autoload -Uz add-zle-hook-widget

function _vi_cursor_shape {
  case $KEYMAP in
    vicmd) printf '\e[1 q' ;;   # block = normal mode
    *)     printf '\e[5 q' ;;   # beam  = insert mode
  esac
}
add-zle-hook-widget keymap-select _vi_cursor_shape

# keymap-select alone is not enough: it only fires when the keymap CHANGES.
# Press Escape (block) then Enter, and zsh starts the next line back in viins
# without a keymap-change event -- so the prompt kept showing a block cursor
# while you were actually in insert mode. Every new line begins in viins, so
# reset the shape explicitly at line-init.
function _vi_cursor_beam { printf '\e[5 q' }
add-zle-hook-widget line-init _vi_cursor_beam

# Commands inherit whatever shape the line editor left behind, so a beam would
# leak into vim, less and man. Hand them a block before they start.
autoload -Uz add-zsh-hook
function _vi_cursor_block { printf '\e[1 q' }
add-zsh-hook preexec _vi_cursor_block

# Prefix search: type a few characters, then ^p/^n walks matching history.
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey -M viins '^p' history-search-backward
bindkey -M viins '^n' history-search-forward

bindkey -M viins '^?' backward-delete-char    # Backspace
bindkey -M viins '^[[3~' delete-char          # Delete key

# Accept the greyed-out autosuggestion.
# NOTE: this used to be bound to 'L', which is a literal capital L in insert
# mode — it made typing a capital L impossible, because the key ran this widget
# instead of inserting the character. ^y is the conventional choice and
# collides with nothing.
bindkey -M viins '^y' autosuggest-accept

# ...and on ^l as well. Deliberately scoped to viins ONLY: ^l is clear-screen by
# default in both keymaps, and overriding it everywhere would cost you the
# standard "clear the terminal" key. Bound here, insert mode accepts the
# suggestion while NORMAL mode still clears the screen — so clearing is Escape
# then ^l, and nothing is actually lost.
#
# Both bindings live here rather than in a terminal's own config, which is what
# makes the behaviour identical in kitty and in VS Code's panel: they are two
# different terminal emulators, but they run this same zsh. Nothing about this
# is emulator-specific. Two things had to be true for ^l to reach zsh at all:
# kitty does not bind it (verified), and VS Code's binding was removed — it used
# to fire terminal.resizePaneRight and swallow the key.
bindkey -M viins '^l' autosuggest-accept


### Markdown ###############################################################

# Read a rendered .md instead of its source: styled headings, bordered tables,
# highlighted code blocks.
#
#   md <file>   read it, with a cursor
#   md          browse every .md under the current directory (glow's own TUI)
#
# `md <file>` hands off to vim's :Glow rather than calling `glow --pager`.
# Glow's pager scrolls but has no cursor, so you cannot see which line you are
# on and none of j/k, /search or gg/G work. :Glow runs glow inside a vim
# terminal buffer instead, which keeps glow's colours and layout but gives you
# a real cursor and a highlighted current line. `q` quits.
#
# For the plain, faster pager without a cursor, call glow directly:
#   glow -p <file>
md() {
  if (( ! $# )); then
    glow --tui .
    return
  fi
  # -c "Glow <path>" runs before tabonly, which then discards vim's empty
  # startup tab and leaves only the rendered one -- so `q` exits straight back
  # to the shell. :Glow uses <q-args>, so paths containing spaces survive.
  vim -c "Glow $1" -c 'tabonly'
}


### Aliases ################################################################

alias ls='eza --icons'
alias ll='eza --icons -la'
alias la='eza --icons -la'


### Machine-specific overrides — not tracked by git ########################

# Anything that only makes sense on this particular machine goes here:
# PATH entries for locally installed apps, personal aliases, API tokens.
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
