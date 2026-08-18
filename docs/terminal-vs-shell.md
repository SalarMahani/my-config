# Terminal vs Shell — What kitty Is and What zsh Is

**Short version:** kitty is a **window that draws text**. zsh is a **program that
reads what you type and runs it**. They are two separate programs, and kitty
starts zsh as its child. Neither one contains the other.

Every number and path in this guide was read off *this* machine, so you can
re-run the commands and see the same thing.

---

## Table of Contents

1. [The one-sentence answer](#1-the-one-sentence-answer)
2. [Seeing it on your own machine](#2-seeing-it-on-your-own-machine)
3. [The pipe between them: a PTY](#3-the-pipe-between-them-a-pty)
4. [How kitty picks zsh](#4-how-kitty-picks-zsh)
5. [What kitty tells zsh about itself](#5-what-kitty-tells-zsh-about-itself)
6. [Which one am I configuring?](#6-which-one-am-i-configuring)
7. [Why this explains so many odd bugs](#7-why-this-explains-so-many-odd-bugs)
8. [The whole chain, top to bottom](#8-the-whole-chain-top-to-bottom)

---

## 1. The one-sentence answer

| | kitty (the **terminal**) | zsh (the **shell**) |
|---|---|---|
| Is | A GUI window | A command interpreter |
| Job | Draw characters, read the keyboard, handle colours, fonts, scrollback, tabs, splits | Read a line, expand it, find the program, run it, report the exit code |
| Knows about | Pixels, fonts, key events | Files, `$PATH`, pipes, jobs, variables |
| Does **not** know | What a pipe or an alias is | What a font, a colour or a window is |
| Config | `~/.config/kitty/kitty.conf` | `~/.zshrc` |
| Replaceable by | alacritty, foot, GNOME Terminal | bash, fish, nushell |

The two are genuinely independent. You could run zsh inside alacritty, or run
bash inside kitty, and nothing else would have to change. That swappability is
the clearest proof they are separate things.

A useful mental image: **kitty is the screen and keyboard; zsh is the clerk
sitting behind them.** The clerk never touches the screen directly — they hand
text to kitty, and kitty is the one that paints it.

---

## 2. Seeing it on your own machine

This is the part that makes it click. Run:

```bash
ps -eo pid,ppid,tty,stat,comm --forest | grep -A2 kitty
```

On this machine that prints, among others:

```
   7137    1651 ?        Ssl   \_ kitty
   7143    7137 ?        Sl    |   \_ kitten
   7145    7137 pts/0    Ss    |   \_ zsh
  32308    7145 pts/0    Sl+   |       \_ claude
```

Read it top to bottom:

- **`kitty` (7137)** was started by **1651** — that is sway. Sway launched the
  terminal because you pressed `Alt+Return`.
- **`zsh` (7145)** has **kitty as its parent**. kitty started it. This is the
  whole relationship in one line.
- **`claude` (32308)** has zsh as *its* parent, because zsh ran it for you.
- Each thing you launch nests one level deeper. The tree is the history of who
  started whom.

Now look at the **TT** column, which is the single most revealing detail here:

| Process | TT |
|---|---|
| kitty | `?` |
| zsh | `pts/0` |

**kitty has no terminal.** It *is* the terminal. A GUI program talking to
Wayland has no need for one. zsh, by contrast, is attached to `pts/0` — and that
device is the connection between them.

---

## 3. The pipe between them: a PTY

kitty and zsh are separate processes, so they need a channel. That channel is a
**pseudo-terminal**, or PTY: a kernel-provided pipe with two ends that pretends
to be an old physical terminal.

```
   you type 'l' 's' Enter
            │
            ▼
   ┌──────────────────┐   writes keystrokes   ┌──────────┐
   │  kitty  (7137)   │ ────────────────────▶ │   PTY    │
   │  the GUI window  │ ◀──────────────────── │  pts/0   │
   └──────────────────┘   reads back output   └──────────┘
            ▲                                       ▲
            │ draws the text                        │ stdin/stdout/stderr
            │                                       ▼
        your screen                            ┌──────────┐
                                               │ zsh(7145)│
                                               └──────────┘
```

kitty holds the **master** end, zsh holds the **slave** end. Prove both halves:

```bash
ls -l /proc/7145/fd/0        # zsh's stdin  -> /dev/pts/0
ls -l /proc/7137/fd | grep ptmx   # kitty holds /dev/ptmx, the master
```

So the actual loop, every time you press a key:

1. Wayland hands kitty a key event.
2. kitty writes that byte into the PTY master.
3. zsh reads it from `/dev/pts/0` as if typed on a serial terminal in 1978.
4. zsh does its work and writes output back to `/dev/pts/0`.
5. kitty reads it from the master end and **draws** it.

**zsh never draws anything.** It only ever writes bytes. Everything you see is
kitty's rendering of those bytes — which is exactly why the same zsh looks
different in a different terminal.

> `/dev/pts/0` is a real file you can write to. From a *different* terminal,
> `echo hello > /dev/pts/0` makes `hello` appear in the first one, even though
> no shell ran it. That is the PTY laid bare — and a good reason to be careful
> what you redirect where.

---

## 4. How kitty picks zsh

kitty has one job here and it is short: start the user's **login shell**.

```bash
getent passwd albos | awk -F: '{print $7}'    # -> /bin/zsh
```

That last field of `/etc/passwd` is the setting. kitty's own `shell` option
defaults to `.`, meaning "whatever that field says". So the chain is:

```
/etc/passwd says /bin/zsh   →   kitty runs /bin/zsh   →   zsh reads ~/.zshrc
```

kitty has **no zsh setting of its own**, and `~/.zshrc` has no kitty setting.
Neither file mentions the other. If you wanted fish instead, you would change it
with `chsh`, not in `kitty.conf`.

### Login shell vs interactive shell — the part that bites

Check how kitty actually invoked it:

```bash
tr '\0' ' ' < /proc/7145/cmdline    # -> /bin/zsh
```

The argument is `/bin/zsh`, **not** `-zsh`. That leading dash is the ancient
convention marking a *login* shell, and it is absent. So the shell in a kitty
window is **interactive but not a login shell**, which decides which startup
files run:

| File | Runs in a kitty window? |
|---|---|
| `~/.zshenv` | Yes — every zsh, always |
| `~/.zshrc` | Yes — this is the one you edit |
| `~/.zprofile`, `~/.zlogin` | **No** — login shells only |

This is the answer to "why did my change not apply": if you put it in
`.zprofile`, no terminal window will ever see it. Full startup order in
[shell-guide.md §1](shell-guide.md#1-which-file-runs-when).

---

## 5. What kitty tells zsh about itself

kitty cannot render zsh's thoughts, so instead it sets environment variables in
the child telling it what kind of screen it is talking to:

```bash
tr '\0' '\n' < /proc/7145/environ | grep -E '^(TERM|KITTY_|COLORTERM)'
```

```
COLORTERM=truecolor
KITTY_PID=7137
KITTY_WINDOW_ID=1
KITTY_SHELL_INTEGRATION=enabled
TERM=xterm-kitty
TERMINFO=/usr/lib64/kitty/terminfo
```

Note `KITTY_PID=7137` — the exact PID of the kitty process from §2. The child
literally carries a pointer back to its parent window.

The important one is **`TERM`**. It is how every program decides what the
terminal can do:

- `TERM=xterm-kitty` tells vim, less and zsh which escape codes are safe.
- `COLORTERM=truecolor` promises 24-bit colour, which is why your themes have
  exact hex colours instead of 256 approximations.
- `TERMINFO` points at kitty's own capability database, because `xterm-kitty` is
  not in the system default set.

**This is why an SSH session sometimes looks broken.** `TERM=xterm-kitty`
travels with you, but the remote box has never heard of it and has no matching
terminfo entry, so it gives up on colours or draws garbage. It is not a bug in
either program — it is one machine describing a terminal the other does not
know.

---

## 6. Which one am I configuring?

The rule that resolves nearly every case: **if it is still true after you
`exec bash`, it belongs to kitty.**

| I want to change | Program | File |
|---|---|---|
| Font, font size, ligatures | kitty | `kitty.conf` |
| The 16 colours / theme | kitty | `kitty.conf` |
| Splits, tabs, `Ctrl+Shift+…` keys | kitty | `kitty.conf` |
| Scrollback length, copy-on-select | kitty | `kitty.conf` |
| The **prompt** (the text before your cursor) | zsh | `.zshrc` (Powerlevel10k) |
| Aliases, `PATH`, functions | zsh | `.zshrc` / `.zshenv` |
| Tab-completion, history | zsh | `.zshrc` |
| `Ctrl+R`, `Ctrl+A`, vi mode | zsh | `.zshrc` |

The prompt is the classic confusion: it looks like part of the window frame, but
it is just text zsh prints. Run `bash` and the pretty prompt vanishes while the
font and colours stay — the cleanest demonstration of the split there is.

Applying a change also differs, because they are separate programs:

| Program | Apply with |
|---|---|
| kitty | `Ctrl+Shift+F5`, or open a new window |
| zsh | `exec zsh`, or open a new window |

---

## 7. Why this explains so many odd bugs

**A keybinding "does not work".** Three layers can eat a key before it reaches
your program, in this order: **sway → kitty → zsh**. `Alt+Return` never reaches
kitty because sway takes it. `Ctrl+Shift+C` never reaches zsh because kitty
takes it. Whichever layer grabs it first wins, and the layers below never learn
the key existed. This is what
[keybinding-changes.md](keybinding-changes.md) is entirely about.

**Colours are wrong in one program only.** That program is choosing colours from
`TERM`, not from your theme. kitty supplies the palette; the program decides
which slots to use.

**A long-running command survives, or dies, when the window closes.** Closing
kitty destroys the PTY. Children get a hangup signal because their terminal
vanished. That is why `nohup` and `tmux` exist — they detach from the PTY so the
window can go away without taking the work with it.

**The window is alive but nothing echoes.** The PTY is fine and kitty is fine;
the *shell* is busy or wedged. Distinguish them: if `Ctrl+Shift+F5` still
reloads kitty's config, kitty is healthy and the problem is below it.

**Scrollback is empty for a full-screen program.** vim and less switch the
terminal to its alternate screen buffer, which kitty keeps separate on purpose
so your history is still there when they exit.

---

## 8. The whole chain, top to bottom

```
sway            compositor — draws windows, owns Alt+…            (config)
  └─ kitty      terminal   — draws text, owns Ctrl+Shift+…        (kitty.conf)
       └─ PTY   /dev/pts/0 — the kernel pipe between the two
            └─ zsh   shell — reads your line, owns Ctrl+R, aliases (.zshrc)
                 └─ your program   (claude, vim, ls, …)
```

Each layer knows only its neighbours. sway has no idea zsh exists; zsh has no
idea it is being drawn by kitty; `ls` has no idea about any of them and just
writes bytes to file descriptor 1.

**One question answers most confusion: which layer is this?**

| Guide | Layer |
|---|---|
| [sway-guide.md](sway-guide.md) | The compositor |
| [kitty-guide.md](kitty-guide.md) | The terminal |
| [shell-guide.md](shell-guide.md) | The shell |
