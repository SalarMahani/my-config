# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

export PATH="APPS/webstorm/bin:$PATH"
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "${ZINIT_HOME}/zinit.zsh"
zinit ice depth"1"
zinit light romkatv/powerlevel10k

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions

autoload -U compinit && compinit

HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

bindkey '^p' history-search-backward
bindkey '^n' history-search-forward

zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"

alias ls='ls --color'





export PATH=$PATH:/home/albos/Apps/Rider/bin
export PATH=$HOME/bin:$PATH
alias kingdom="/usr/bin/env WINEPREFIX=$HOME/.var/app/com.heroicgameslauncher.hgl/config/heroic/wineprefixes/MyGame wine \"$HOME/Kingdom Two Crowns/KingdomTwoCrowns.exe\""


# GapCode
export PATH="/home/albos/.gapcode/bin:$PATH"
___MY_VMOPTIONS_SHELL_FILE="${HOME}/.jetbrains.vmoptions.sh"; if [ -f "${___MY_VMOPTIONS_SHELL_FILE}" ]; then . "${___MY_VMOPTIONS_SHELL_FILE}"; fi
export PATH="$HOME/.local/bin:$PATH"

#enable vim in zshrc
bindkey -v

export KEYTIMEOUT=1

function zle-keymap-select {
  if [[ $KEYMAP == vicmd ]]; then
    echo -ne '\e[1 q'  # block cursor = normal mode
  else
    echo -ne '\e[5 q'  # beam cursor = insert mode
  fi
}
zle -N zle-keymap-select

bindkey -M viins '^n' history-search-forward
bindkey -M viins '^p' history-search-backward

bindkey -M viins '^?' backward-delete-char    # Backspace
bindkey -M viins '^[[3~' delete-char          # Delete key

bindkey -M viins 'L' autosuggest-accept       # Shift+L accepts suggestion

#auto suggestion and heghlighting
source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
#icon
alias ls='eza --icons'
alias ll='eza --icons -la'
alias la='eza --icons -la'
