# Vim

**Your version:** VIM 9.2 · Fedora 44
**Config:** `~/.vimrc` → `~/dotfiles/vim/.vimrc`

Eight lines, no plugins, no plugin manager. This guide explains each line and
what is worth adding next — it is the shortest config here, so most of it is
about where to go from a deliberately minimal starting point.

Your zsh command line also uses vi keybindings (`bindkey -v`), so the motions
you learn here work when editing commands too — see the
[shell guide](shell-guide.md), §6.

## ⚠️ You have three separate vim configurations

They are easy to confuse because all three use vim motions and a `<space>`
leader, but **no file is shared between them** — each editor reads its own:

| File | Read by | Tracked as |
|---|---|---|
| `~/.vimrc` | **vim** itself, in the terminal | `vim/.vimrc` |
| `~/.ideavimrc` | **JetBrains IDEs** (Rider, WebStorm) via the IdeaVim plugin | `vim/.ideavimrc` |
| `settings.json` → `vim.*` keys | **VS Code**, via the VSCodeVim extension | `vscode/.config/Code/User/settings.json` |

**VS Code does not read any vimrc file.** VSCodeVim *can* be told to, with
`vim.vimrc.enable`, but that setting is absent from your `settings.json` — so
your VS Code vim mappings come entirely from the `vim.normalModeKeyBindings…`
arrays in that file. Editing `~/.ideavimrc` has no effect on VS Code.

`.ideavimrc` belongs to the JetBrains IDEs, of which you have several profiles
under `~/.config/JetBrains/` (Rider 2025.2, WebStorm 2024.3 through 2026.1). It
is 186 lines and uses two things that only exist there:

- **`:action <Name>`** — invokes a JetBrains IDE action, e.g.
  `nnoremap <leader>f :action CollapseRegion<CR>`. Plain vim has no equivalent.
- **`Plug '…'`** — declares one of IdeaVim's *emulated* plugins. It does not
  download anything; IdeaVim ships reimplementations of `vim-surround`,
  `vim-commentary`, `easymotion`, `vim-sneak`, `nerdtree`,
  `ReplaceWithRegister`, `argtextobj`, `vim-multiple-cursors` and
  `highlightedyank`, and this line switches them on.

Neither works in terminal vim. Copying lines between these files will silently
fail rather than error.

If you ever *do* want VS Code to read a vimrc, add:

```jsonc
"vim.vimrc.enable": true,
"vim.vimrc.path": "~/.vimrc"
```

Be aware it is a partial implementation — `:action` and `Plug` lines will not
work there either.

---

## Table of Contents

1. [Your `.vimrc`, line by line](#1-your-vimrc-line-by-line)
2. [The leader key](#2-the-leader-key)
3. [netrw, the built-in file browser](#3-netrw-the-built-in-file-browser)
4. [Worth adding next](#4-worth-adding-next)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Your `.vimrc`, line by line

```vim
set norelativenumber
```

Turns off relative line numbers — the mode where the current line shows `0` and
neighbours count outward, making `5j` easy to aim.

Note this disables relative numbers but never enables **absolute** ones, and
vim shows no numbers by default. So right now you have **no line numbers at
all**. If that is not what you wanted:

```vim
set number                    " absolute numbers
set number relativenumber     " hybrid: absolute on the cursor line, relative elsewhere
```

```vim
set scrolloff=15
```

Keep at least 15 lines visible above and below the cursor. The view scrolls
before you reach the edge, so you always have context. A high value like this
effectively keeps your cursor near the middle of the screen. One of the best
quality-of-life settings in vim.

```vim
set expandtab
```

The Tab key inserts **spaces** instead of a tab character.

⚠️ Incomplete on its own. `expandtab` says *what* to insert but not *how many*.
Without the companions, vim uses its default of 8:

```vim
set tabstop=4        " a tab character displays as 4 columns
set shiftwidth=4     " >> and << shift by 4
set softtabstop=4    " Tab and Backspace move 4 at a time
```

Setting all three to the same value is the usual choice.

```vim
set smartindent
```

Indent new lines based on the previous one, with some C-like awareness of `{`.
It is the older mechanism, and it misbehaves in some languages — notably it
force-shifts lines beginning with `#`, which is wrong for Python comments. The
modern replacement:

```vim
filetype plugin indent on
set autoindent
```

which loads per-language indent rules that ship with vim.

```vim
colorscheme desert
```

A built-in scheme — no download needed. See the others with `:colorscheme` then
`Tab`, or preview one live with `:colorscheme habamax`. Built-ins worth trying:
`habamax`, `slate`, `industry`, `retrobox`.

Note this does not match your terminal's Dimmed Monokai theme, but it will still
look reasonable because it draws from the same 16 ANSI colours kitty defines.

```vim
let mapleader = " "
nnoremap <leader>pv :Vex<CR>
```

Covered in the next two sections.

---

## 2. The leader key

`mapleader` is a prefix for your own shortcuts, kept separate from vim's
built-ins so they can never collide. Yours is **space**, the most common choice —
it is easy to hit with either thumb and does nothing useful in normal mode
otherwise.

```vim
nnoremap <leader>pv :Vex<CR>
```

Reading it piece by piece:

| Piece | Meaning |
|---|---|
| `nnoremap` | Map in **n**ormal mode, **no**n-**re**cursively |
| `<leader>pv` | Space, then `p`, then `v` |
| `:Vex<CR>` | Run `:Vex` and press Enter |

**Always use `nnoremap`, not `nmap`.** The `nore` part stops the mapping from
re-triggering other mappings, which is how infinite loops happen. There is an
equivalent per mode: `inoremap` (insert), `vnoremap` (visual), `xnoremap`
(visual block).

⚠️ `mapleader` must be set **before** any mapping that uses `<leader>`. Vim
substitutes the current value at definition time, so a mapping defined above the
`let mapleader` line silently binds to backslash — the default. Yours is in the
right order.

---

## 3. netrw, the built-in file browser

`:Vex` is **V**ertical **Ex**plore — netrw, vim's built-in file browser, opened
in a vertical split. No plugin required.

| Command | Opens the browser |
|---|---|
| `:Ex` | in the current window |
| `:Vex` | in a vertical split |
| `:Sex` | in a horizontal split |
| `:Lex` | in a left-hand sidebar that persists |

Inside netrw:

| Key | Does |
|---|---|
| `Enter` | Open file / enter directory |
| `-` | Go up one directory |
| `%` | Create a new file |
| `d` | Create a new directory |
| `D` | Delete |
| `R` | Rename |
| `i` | Cycle view style (thin / long / wide / tree) |
| `q` | Close |

A tree view that persists is often nicer:

```vim
let g:netrw_liststyle = 3     " tree view
let g:netrw_banner = 0        " hide the help banner
let g:netrw_winsize = 25      " sidebar takes 25% width
```

With those, `:Lex` gives you a NERDTree-like sidebar with no plugin at all.

---

## 4. Worth adding next

Nothing here needs a plugin manager. Roughly in order of value:

```vim
" Search
set ignorecase        " case-insensitive search...
set smartcase         " ...unless you type a capital
set incsearch         " jump to matches as you type
set hlsearch          " highlight all matches
nnoremap <leader><space> :nohlsearch<CR>   " clear the highlight

" Editing
set undofile                       " undo survives closing the file
set undodir=~/.vim/undodir         " (mkdir -p ~/.vim/undodir first)
set clipboard=unnamedplus          " y and p use the system clipboard

" Interface
set number relativenumber
set cursorline
set signcolumn=yes                 " stop the text jumping when a sign appears
set splitbelow splitright          " new splits go where you expect
syntax on
filetype plugin indent on

" Behaviour
set nobackup noswapfile            " you have undofile and git
set updatetime=300

" Move between splits without the C-w prefix
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l
```

Those last four deliberately mirror your sway bindings (`$mod+h/j/k/l` moves
focus between windows), so the same four fingers move between vim splits.

⚠️ **`set clipboard=unnamedplus` will not work on this machine as it stands.**
It needs vim built with `+clipboard`, and yours reports `-clipboard`:

```bash
vim --version | grep -o '[+-]clipboard' | head -1    # -> -clipboard
```

Fedora's minimal `vim-enhanced` build omits it. Two options:

```bash
sudo dnf install vim-X11     # provides +clipboard even when used in the terminal
```

or pipe explicitly, which needs nothing installed (`wl-clipboard` is already
present):

```vim
:w !wl-copy                  " send the whole buffer to the clipboard
:'<,'>w !wl-copy             " or just the visual selection
```

---

## 5. Troubleshooting

**A setting seems ignored.** Ask vim where it came from:

```vim
:verbose set scrolloff?
```

It prints the current value *and* the file and line that last set it.

**A mapping does nothing.** Check what it is bound to:

```vim
:verbose nmap <leader>pv
```

If it shows nothing, either `mapleader` was set after the mapping, or something
else claimed the sequence.

**Tabs still insert 8 spaces.** `expandtab` alone does not set the width — add
`tabstop`, `shiftwidth` and `softtabstop` as in section 1.

**Colours look wrong or washed out.** Vim inherits kitty's 16 ANSI colours. For
24-bit colour instead:

```vim
set termguicolors
```

**Test a config change without restarting** — `:source ~/.vimrc`. To start
without any config at all (useful for isolating a problem): `vim -u NONE`.

**No system clipboard.** Expected — this vim is built `-clipboard`. Either
install `gvim` or use `:w !wl-copy`. See section 4.
