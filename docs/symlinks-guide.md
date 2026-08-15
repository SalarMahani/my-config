# Symlinks — How the Dotfiles Repo Actually Works

Every example below was run and its output copied in, not written from memory.

This is the one mechanism the whole repo rests on. Once it clicks, `install.sh`
stops being magic and you can wire up a new config yourself in one command.

---

## Table of Contents

1. [The idea in one picture](#1-the-idea-in-one-picture)
2. [Making one: `ln -s`](#2-making-one-ln--s)
3. [Inspecting them](#3-inspecting-them)
4. [Adding a new config to the repo, by hand](#4-adding-a-new-config-to-the-repo-by-hand)
5. [The four traps](#5-the-four-traps)
6. [Undoing a symlink](#6-undoing-a-symlink)
7. [Symlink vs hard link vs copy](#7-symlink-vs-hard-link-vs-copy)
8. [What `install.sh` does for you](#8-what-installsh-does-for-you)
9. [Cheat sheet](#9-cheat-sheet)

---

## 1. The idea in one picture

A symlink is a tiny file whose entire content is *a path to somewhere else*. It
is a signpost, not a container.

```
~/.config/sway/config  ──points at──>  ~/dotfiles/sway/.config/sway/config
   (the symlink)                            (the real file, with your bytes)
```

When sway opens `~/.config/sway/config`, the kernel silently follows the signpost
and hands over the real file. Sway never knows the difference.

**This is why editing either path is the same act.** There is one file. Proven
by inode — the filesystem's unique ID for a file:

```
link   -> 2490
target -> 2490
```

Same number, one file, two names. And edits flow both ways:

```
$ echo "added via link" >> home/config.txt      # write through the LINK
$ cat repo/config.txt                            # read the TARGET
real content v1
added via link                                   # <- it is there

$ echo "added via target" >> repo/config.txt     # write the TARGET
$ cat home/config.txt                            # read through the LINK
real content v1
added via link
added via target                                 # <- it is there
```

---

## 2. Making one: `ln -s`

```bash
ln -s <target> <linkname>
#      ^ the real file      ^ the signpost you are creating
```

**The order confuses everyone.** Read it as *"link to `<target>`, calling it
`<linkname>`"* — same order as `cp source dest`: the thing that already exists
comes first.

```bash
ln -s ~/dotfiles/sway/.config/sway/config ~/.config/sway/config
```

Useful flags:

| Flag | Does |
|---|---|
| `-s` | Make a **s**ymbolic link (without it you get a hard link — see §7) |
| `-f` | **F**orce: replace an existing link |
| `-n` | **N**o-dereference: treat an existing *directory symlink* as a file to replace, not a directory to descend into |
| `-r` | Make the stored path **r**elative automatically |
| `-v` | **V**erbose: print what it did |

`ln -sfn` is the combination you want when re-pointing a directory link. §5 shows
why `-n` matters.

### Absolute or relative?

The path you pass is stored **verbatim**. A relative one is resolved from the
**link's own directory**, not from where you were standing when you typed it —
which produces the single most common broken link:

```
$ cd /tmp/symdemo
$ ln -s repo/config.txt home/relative-wrong.txt     # looks right...
$ cat home/relative-wrong.txt
cat: home/relative-wrong.txt: No such file or directory
```

The link literally stores `repo/config.txt`, so the kernel looks for
`home/repo/config.txt`. Correct version, written from the link's perspective:

```
$ ln -s ../repo/config.txt home/relative-right.txt
$ head -1 home/relative-right.txt
real content v1
```

**This repo uses absolute paths** (`/home/albos/dotfiles/...`) because the links
live in `~` and `~/.config` while the targets live in `~/dotfiles` — there is no
tidy relative route, and absolute paths survive moving the link.

---

## 3. Inspecting them

```bash
ls -la ~/.config/sway/config
# lrwxrwxrwx  config -> /home/albos/dotfiles/sway/.config/sway/config
# ^ the leading "l" means symlink; "-" is a regular file, "d" a directory
```

| Command | Tells you |
|---|---|
| `ls -la <path>` | Whether it is a link, and where it points |
| `readlink <path>` | The stored path, exactly as written |
| `readlink -f <path>` | The **final** destination, resolving chains and relative paths |
| `stat -L -c %i <path>` | Inode of the *target* (`-L` follows the link) |
| `stat -c %i <path>` | Inode of the *link itself* |
| `[ -L <path> ]` | Test in a script |

Find every symlink, and every **broken** one, in a directory:

```bash
find ~/.config -maxdepth 1 -type l          # all symlinks
find ~ -xtype l                             # only DANGLING ones
```

`-xtype l` is worth remembering — it is how you catch links whose target was
deleted or renamed:

```
$ find home -xtype l
home/relative-wrong.txt
```

---

## 4. Adding a new config to the repo, by hand

This is the whole migration, four commands. Say you want to track `~/.config/foo`.

```bash
# 1. Move the real file into the repo, preserving the $HOME-mirroring layout
mkdir -p ~/dotfiles/foo/.config
mv ~/.config/foo ~/dotfiles/foo/.config/foo

# 2. Point the old location at it
ln -s ~/dotfiles/foo/.config/foo ~/.config/foo

# 3. Check
ls -la ~/.config/foo

# 4. Commit
git -C ~/dotfiles add -A && git -C ~/dotfiles commit -m "Track foo config"
```

That is exactly what was done for sway, waybar, kitty, rofi, mako, vscode and
the shell files — `install.sh` just automates it with backups.

**Safer variant:** copy first, verify, then replace. Nothing is destroyed if you
mistype:

```bash
cp -r ~/.config/foo ~/dotfiles/foo/.config/foo   # copy
mv ~/.config/foo ~/.config/foo.bak               # set the original aside
ln -s ~/dotfiles/foo/.config/foo ~/.config/foo   # link
# ...test the app...
rm -rf ~/.config/foo.bak                         # only once you are happy
```

### File or directory?

Both work. The repo uses both deliberately:

| Style | Used for | Why |
|---|---|---|
| **Directory link** | sway, waybar, kitty, rofi, mako, wallpapers | New files added to the repo appear automatically |
| **Per-file link** | `.zshrc`, `.vimrc`, `.gitconfig`, VS Code | The parent directory holds things you must *not* track |

VS Code is the clearest case: `~/.config/Code` is 549 MB of caches and
`globalStorage` holds extension auth tokens. Only three files are linked.

---

## 5. The four traps

### Trap 1 — `rm -rf link/` destroys the target's contents

**The dangerous one.** A trailing slash means "go *through* the link", so the
delete lands on the real directory:

```
$ ls repo/dir
a.txt

$ rm -rf home/dir/          # note the trailing slash
$ [ -L home/dir ] && echo "link still exists"
link still exists
$ ls repo/dir
                            # <- EMPTY. It deleted the real files.
```

The link survived; **your actual config did not.** In this repo, `rm -rf ~/.config/sway/`
would empty `~/dotfiles/sway/.config/sway/` — your whole sway setup, recoverable
only from git.

Without the slash it is safe, removing only the signpost:

```
$ rm home/dir
$ [ -L home/dir ] || echo "link gone"
link gone
$ ls repo/dir
a.txt  b.txt               # <- target untouched
```

**Rule: never put a trailing slash after a symlink in an `rm` command.**

### Trap 2 — `ln -s` into an existing directory nests instead of replacing

```
$ mkdir home/dir
$ ln -s /tmp/repo/dir home/dir
$ find home/dir
home/dir
home/dir/dir               # <- created INSIDE, not what you meant
```

Because the destination is an existing directory, `ln` puts the link *in* it.
Use `-n` so it treats the destination as a plain name:

```bash
ln -sfn ~/dotfiles/foo/.config/foo ~/.config/foo
```

### Trap 3 — some programs replace a symlink when they save

An editor that saves by writing a temp file and renaming it over the target will
replace your symlink with a regular file. Your edits then stop reaching the repo
and you notice weeks later.

Check after the first UI-driven save of any new app:

```bash
ls -la ~/.config/Code/User/settings.json     # want to see the "->"
```

Recovery: copy the changed file into the repo and re-link.

### Trap 4 — `find` does not follow symlinks

Default `find` treats a symlink as a symlink, not as what it points to:

```bash
find ~/Pictures/wallpapers -maxdepth 1 -type f | wc -l    # 0
find -L ~/Pictures/wallpapers -maxdepth 1 -type f | wc -l # 12
```

This bit `wallpaper-next.sh` for real — once the directory became a symlink, its
image search returned nothing and the script reported "No images found". The fix
was `find -L`. Same applies to `grep -r` (use `-R`) and `du` (use `-L`).

---

## 6. Undoing a symlink

To go back to a normal file — before deleting the repo, say — replace the link
with real content. **`-L` (dereference) is the key part:**

```bash
cp -rL ~/.config/foo ~/.config/foo.real   # -L copies CONTENT, not the link
rm ~/.config/foo                          # no trailing slash!
mv ~/.config/foo.real ~/.config/foo
```

Proven:

```
$ cp -r  home out1/      # out1/home/dir is: symlink preserved
$ cp -rL home out2/      # out2/home/dir is: real directory (content copied)
```

Without `-L` you copy the *signposts*, and they still point at the repo — so
deleting the repo breaks your "backup" too.

⚠️ **Never delete `~/dotfiles` while the links are in place.** You would be left
with ~17 dangling links and every app losing its config at once. Check first:

```bash
find ~ -maxdepth 3 -xtype l 2>/dev/null
```

---

## 7. Symlink vs hard link vs copy

| | Copy | Hard link | Symlink |
|---|---|---|---|
| Edits sync? | ❌ two files, drift apart | ✅ same file | ✅ same file |
| Survives target being moved? | n/a | ✅ | ❌ becomes dangling |
| Can point at a directory? | ✅ | ❌ | ✅ |
| Can cross filesystems? | ✅ | ❌ | ✅ |
| Visible as a link? | n/a | ❌ indistinguishable | ✅ `ls -la` shows `->` |

A hard link is a second *name* for the same inode — equally real, no arrow:

```
$ ln repo/config.txt home/hardlink.txt
$ stat -c %i repo/config.txt home/hardlink.txt
2490
2490

$ ln repo/dir home/harddir
ln: repo/dir: hard link not allowed for directory
```

**Symlinks win for dotfiles** on three counts: they work for directories, they
survive across filesystems (`/home` and `/` may differ), and `ls -la` makes the
arrangement *visible* — you can see at a glance which files are managed.

Their one weakness — breaking if the target moves — is exactly why this repo
stores absolute paths and why you should not move `~/dotfiles`.

---

## 8. What `install.sh` does for you

Nothing you could not type by hand. It adds three things:

1. **Backups instead of overwrites.** Anything real in the way becomes
   `<path>.bak-YYYY-MM-DD`. Nothing is ever deleted.
2. **Idempotency.** A correct link is reported `ok` and left alone, so re-running
   is free.
3. **`--dry-run`.** Prints the plan and changes nothing. Always look first.

The core is the same `ln -s` you now know:

```bash
./install.sh --dry-run     # what would happen
./install.sh               # do it
./install.sh sway waybar   # only some packages
./install.sh --list        # what packages exist
```

After adding files to a per-file package (`shell`, `vim`, `git`, `vscode`),
re-run `./install.sh <package>` to link the new ones. Directory-linked packages
pick them up automatically.

---

## 9. Cheat sheet

```bash
# CREATE
ln -s  <target> <linkname>        # basic
ln -sfn <target> <linkname>       # replace an existing link, incl. directories
ln -srf <target> <linkname>       # relative path, forced

# INSPECT
ls -la <path>                     # is it a link, where does it point
readlink -f <path>                # final destination
find <dir> -maxdepth 1 -type l    # all links here
find ~ -xtype l                   # BROKEN links

# DELETE  (never a trailing slash!)
rm <linkname>                     # removes the signpost only
rm -rf <linkname>/                # DANGER: empties the real target

# UNDO — turn a link back into real content
cp -rL <link> <link>.real && rm <link> && mv <link>.real <link>

# TOOLS THAT NEED HELP FOLLOWING LINKS
find -L <dir> ...                 # otherwise -type f finds nothing
grep -R  (not -r)
du -L
cp -rL   (not -r)
```

**The three rules worth memorising:**

1. `ln -s <target> <linkname>` — the existing thing comes first.
2. Never put a trailing slash after a symlink in an `rm`.
3. If a tool seems blind to your files, it is probably not following links — try `-L`.
