set norelativenumber

set scrolloff=15

set expandtab
set smartindent


" 24-bit colour. Needed for :Glow further down: glow emits truecolour, and
" without this vim squashes it to the nearest of 256 inside the terminal
" buffer, so the custom Dimmed Monokai style renders approximately rather than
" exactly. Guarded on $COLORTERM so a dumb terminal is left alone.
"
" t_8f/t_8b must be set explicitly -- vim only infers them for a handful of
" TERM values, and kitty's xterm-kitty is not one of them, so termguicolors
" alone would produce no colour at all.
"
" Side effect worth knowing: this also makes `desert` below use its gui colours
" instead of its 256-colour ones. Remove these four lines to go back.
if has('termguicolors') && ($COLORTERM ==# 'truecolor' || $COLORTERM ==# '24bit')
  let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum"
  let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
  set termguicolors
endif

colorscheme desert

let mapleader= " "
nnoremap <leader>pv :Vex<CR>


" ── Markdown: a readable view ───────────────────────────────────────────────
"
" No plugin needed for any of this. Vim already ships syntax/markdown.vim and
" ftplugin/markdown.vim, and Fedora's /etc/vimrc runs `syntax on` and
" `filetype plugin on`, so .md files are ALREADY highlighted. What was missing
" was the view: `wrap` is on but `linebreak` is off, so long paragraphs broke
" mid-word, and the conceal rules the syntax file already defines never applied
" because conceallevel was 0.

" Fold on headers, using MarkdownFold() from the built-in ftplugin. The
" function is always there; it just checks this variable, which defaults to 0.
" Set here rather than in the autocmd because the ftplugin reads it while the
" buffer loads.
let g:markdown_folding = 1

augroup markdown_readable
  autocmd!
  autocmd FileType markdown call s:MarkdownReadable()
augroup END

function! s:MarkdownReadable() abort
  " The single biggest win: break wrapped lines at spaces, not mid-word.
  setlocal linebreak
  " Keep a wrapped line indented under the one it came from, so a long bullet
  " or nested list item stays visually attached instead of resetting to
  " column 0, with an arrow marking the continuation.
  setlocal breakindent
  setlocal breakindentopt=shift:2
  " Assignment form, not `setlocal showbreak=↳\ ` -- that spelling needs a
  " backslash-escaped trailing space, which any editor or tool that trims
  " trailing whitespace will silently eat, leaving a stray backslash on screen.
  let &l:showbreak = '↳ '

  " With wrapping on, one file line is several screen lines. Move by what you
  " can see -- otherwise j jumps a whole paragraph.
  nnoremap <buffer> j gj
  nnoremap <buffer> k gk
  nnoremap <buffer> 0 g0
  nnoremap <buffer> $ g$

  " Hide the ** __ ~~ markers. The syntax file already tags them concealable;
  " conceallevel is what applies it. concealcursor=nc re-reveals them on the
  " line the cursor is on, so editing still shows what is really there.
  setlocal conceallevel=2
  setlocal concealcursor=nc

  " Open fully; zM folds every section, za toggles the one under the cursor.
  setlocal foldlevel=99
  " Doubles as a left margin -- vim has no built-in zen mode.
  setlocal foldcolumn=4
  setlocal nonumber

  " Wrap prose at a comfortable column when you press gq, without hard-wrapping
  " anything as you type.
  setlocal textwidth=0
  setlocal formatoptions-=t

  " <leader>m = read the RENDERED version. See :Glow below.
  nnoremap <buffer> <leader>m :Glow<CR>
endfunction

" ── :Glow — the rendered view, with a cursor ────────────────────────────────
"
" The settings above make the SOURCE readable, which is what you want while
" editing. This is the other half: the rendered view, for reading.
"
" Deliberately NOT `glow --pager`. Glow's own pager scrolls but has no concept
" of a cursor, so there is no way to see which line you are on and no vim
" motions. Instead glow runs to completion inside a vim TERMINAL BUFFER: once
" the job exits the buffer becomes navigable, keeping glow's colours and
" layout while vim supplies the cursor, `cursorline`, j/k, /search, gg/G and
" everything else. Best of both.
"
" :Glow          render the current buffer, including unsaved edits
" :Glow {file}   render a file on disk
"
" Requires glow (`sudo dnf install glow`).
command! -bar -nargs=? -complete=file Glow call s:Glow(<q-args>)

function! s:Glow(...) abort
  if !executable('glow')
    echohl ErrorMsg
    echomsg 'Glow: glow is not installed — sudo dnf install glow'
    echohl NONE
    return
  endif
  if !has('terminal')
    echohl ErrorMsg | echomsg 'Glow: this vim lacks +terminal' | echohl NONE
    return
  endif

  let l:arg = a:0 ? a:1 : ''
  if empty(l:arg)
    " Render the BUFFER via a temp file rather than the file on disk, so
    " unsaved edits show up — matching how VS Code's preview updates before you
    " save. The .md suffix matters: glow picks its renderer from the file
    " extension, and piping to `glow -` does NOT render, it prints raw source.
    let l:title = empty(expand('%:t')) ? '[buffer]' : expand('%:t')
    let l:src = tempname() . '.md'
    call writefile(getline(1, '$'), l:src)
  else
    let l:src = fnamemodify(l:arg, ':p')
    let l:title = fnamemodify(l:src, ':t')
    if !filereadable(l:src)
      echohl ErrorMsg | echomsg 'Glow: cannot read ' . l:src | echohl NONE
      return
    endif
  endif

  " Same width reasoning as the `md` function in .zshrc: glow's 80-column
  " default re-wraps already-wrapped prose and strands orphan fragments.
  let l:w = &columns > 120 ? 120 : &columns

  " A tab rather than a split: on a 1366x768 panel a vertical split leaves too
  " few columns for glow's own margins.
  " glow-pty rather than glow: vim's terminal does not answer glow's
  " background-colour probe, so glow gives up and renders with NO colour at
  " all. The wrapper runs it on a pty that answers, and relays the escape
  " sequences through. See ~/.local/bin/glow-pty for the full story.
  let l:cmd = executable('glow-pty') ? 'glow-pty' : 'glow'

  " `desert` paints Normal on #333333, a mid grey, and with termguicolors on
  " that becomes this buffer's background -- lighter than kitty's own #1e1e1e
  " and tiring over a long document. term_highlight scopes the override to THIS
  " terminal buffer, so other :terminal windows and the editor keep desert.
  " Defined here rather than at top level so it survives a :colorscheme reload.
  " #1e1e1e is kitty's background, so the reader blends into the terminal
  " around it; drop to #181818 if you want it darker still.
  highlight GlowNormal guifg=#b8bcb9 guibg=#1e1e1e ctermfg=250 ctermbg=234

  tabnew
  call term_start([l:cmd, '--width', string(l:w), l:src],
        \ { 'curwin': 1,
        \   'term_name': 'glow: ' . l:title,
        \   'term_highlight': 'GlowNormal' })

  " Reading view: no line numbers and no current-line bar. Line numbers here
  " would count RENDERED lines, which correspond to nothing in the source, and
  " the highlight bar is noise when you are just reading prose. The terminal
  " cursor alone is enough to show where you are, and every vim motion still
  " works.
  setlocal nonumber norelativenumber
  setlocal nocursorline
  setlocal scrolloff=8

  " ...but when you DO want to track a line closely, `c` brings the bar back.
  " Safe to map: the buffer is not modifiable, so vim's `c` change operator
  " has nothing to do here anyway.
  nnoremap <buffer><silent> c :setlocal cursorline!<CR>
  nnoremap <buffer><silent> q :call <SID>GlowQuit()<CR>
endfunction

" `q` has to mean two different things depending on how you got here. From
" inside vim (:Glow or <leader>m) the render is an extra tab, so q closes it
" and returns you to the source. From the shell (`md <file>`) the wrapper runs
" `tabonly`, leaving the render as the ONLY tab -- and tabclose! on a lone tab
" is E784: Cannot close last tab page. There, q should just exit vim.
function! s:GlowQuit() abort
  if tabpagenr('$') > 1
    tabclose!
  else
    qall!
  endif
endfunction










