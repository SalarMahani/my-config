#!/usr/bin/env python3
"""Cycle between the workspaces that exist on the CURRENTLY FOCUSED output.

Usage: ws-cycle.py next|prev [--take]

`--take` drags the focused window along to wherever you land, including onto a
freshly appended workspace.

Unlike `$mod+1..0`, which jumps to one fixed workspace anywhere in the layout,
this walks the workspaces of the monitor you are looking at right now.

The workspaces of one output behave like a STRIP that you walk left and right,
and that grows off the right-hand end when you run out:

  next  -> move one step right. At the RIGHTMOST workspace there is nowhere to
           go, so a new empty workspace is appended and focused. Walking off
           the end is how you make a new desktop; there is no separate key.
  prev  -> move one step left. At the LEFTMOST workspace it does nothing.
           Never creates anything.

Neither direction wraps around: wrapping and appending cannot coexist, because
at the last workspace `next` has to mean exactly one of them.

This is `workspace next_on_output` / `prev_on_output` plus the grow-on-demand
behaviour, which sway has no built-in command for.
"""

import json
import re
import subprocess
import sys

# When the rightmost workspace is already EMPTY, `next` does nothing instead of
# appending another one. This is not a policy choice so much as bowing to how
# sway works: it destroys a workspace the moment the last window leaves it and
# you focus away, so appending #6 while sitting on an empty #5 would destroy #5
# on the way out and leave you on an identical empty desktop with a new number.
# Two empty workspaces cannot coexist on one output, so there is nothing to gain
# by trying. Set to False to append regardless.
SKIP_CREATE_WHEN_EMPTY = True

# `prev` at the leftmost workspace: False = do nothing (the strip has a left
# edge, matching the fact that `next` no longer wraps at the right edge).
# Set to True to make it jump to the rightmost workspace instead.
WRAP_PREV = False

MAX_WORKSPACE_NUM = 99


def sway(*args: str) -> str:
    return subprocess.run(
        ["swaymsg", *args], capture_output=True, text=True, check=True
    ).stdout


def sway_cmd(*args: str) -> str:
    """Run a sway *command*. The `--` stops swaymsg from claiming command flags
    like `--no-auto-back-and-forth` as its own options."""
    return sway("--", *args)


def emptiness_by_workspace() -> dict:
    """Map workspace name -> True if it holds no windows at all."""
    tree = json.loads(sway("-t", "get_tree"))
    empty = {}

    def walk(node):
        if node.get("type") == "workspace":
            empty[node["name"]] = not (
                node.get("nodes") or node.get("floating_nodes")
            )
            return
        for child in node.get("nodes", []) + node.get("floating_nodes", []):
            walk(child)

    walk(tree)
    return empty


def pinned_numbers() -> dict:
    """Map workspace number -> set of outputs it is pinned to.

    Parses `workspace <n> output <name...>` lines out of the live config so we
    never hand a fresh workspace a number that belongs to the other monitor.
    """
    config = json.loads(sway("-t", "get_config"))["config"]
    pins = {}
    pattern = re.compile(
        r"^\s*workspace\s+(?:number\s+)?(\d+)\s+output\s+(.+?)\s*$", re.MULTILINE
    )
    for num, outputs in pattern.findall(config):
        pins.setdefault(int(num), set()).update(outputs.split())
    return pins


def pin_stride(output: str, pins: dict):
    """Infer the numbering pattern the pins give `output`, as (stride, residue).

    Pins only cover the numbers you bothered to write down, but a scheme like
    "odd = laptop, even = external" is meant to hold forever. Above the last
    pinned number there is nothing to skip, so without this the search would
    just take the next free integer and silently break the pattern: with pins
    up to 10, the external monitor would append 11 -- an odd number.

    So read the intent off the pins. Numbers pinned to this output that form an
    arithmetic progression (1,3,5,7,9 -> stride 2, residue 1) let us keep that
    progression going past the pinned range. Returns None when the pins imply no
    pattern worth extending -- fewer than two of them, or a contiguous block
    like 1,2,3,4,5, where stride 1 constrains nothing anyway.
    """
    mine = sorted(n for n, outs in pins.items() if output in outs or "*" in outs)
    if len(mine) < 2:
        return None
    stride = mine[1] - mine[0]
    if stride < 2 or any(b - a != stride for a, b in zip(mine, mine[1:])):
        return None
    return stride, mine[0] % stride


def number_for_new_workspace(used: set, output: str, pins: dict, after: int) -> int:
    """Pick the number for a workspace appended to the end of `output`'s strip.

    It must sort AFTER the current last workspace, so we look for the first free
    number above it rather than the first free number overall. On a laptop
    holding 1 and 4, appending must give 5: taking the lowest free number would
    give 3, which sorts *between* them and would appear to the left instead.
    """
    pattern = pin_stride(output, pins)
    last_pinned = max(pins, default=0)

    def usable(n: int) -> bool:
        if n in used:
            return False
        # A number pinned to another output would yank us to that monitor.
        if n in pins and output not in pins[n] and "*" not in pins[n]:
            return False
        # Past the pinned range, keep the pins' own pattern going.
        if pattern and n > last_pinned and n % pattern[0] != pattern[1]:
            return False
        return True

    for n in range(after + 1, MAX_WORKSPACE_NUM + 1):
        if usable(n):
            return n
    # Strip has reached the ceiling; fall back to any free number so that the
    # keybinding still does something rather than silently failing.
    for n in range(1, after + 1):
        if usable(n):
            return n
    raise SystemExit("ws-cycle: no free workspace number available")


def go(workspace: dict, take: bool) -> None:
    """Focus `workspace`, first dragging the focused window there if `take`."""
    selector = (
        ["number", str(workspace["num"])]
        if workspace["num"] >= 0
        else [workspace["name"]]
    )
    if take:
        sway_cmd("move", "container", "to", "workspace", *selector)
    sway_cmd("workspace", "--no-auto-back-and-forth", *selector)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--take"]
    take = "--take" in sys.argv[1:]
    direction = args[0] if args else "next"
    if direction not in ("next", "prev"):
        raise SystemExit("usage: ws-cycle.py next|prev [--take]")

    workspaces = json.loads(sway("-t", "get_workspaces"))
    current = next((w for w in workspaces if w["focused"]), None)
    if current is None:
        return

    output = current["output"]
    # num is -1 for named (non-numbered) workspaces; sort those last, by name.
    peers = sorted(
        (w for w in workspaces if w["output"] == output),
        key=lambda w: (w["num"] < 0, w["num"], w["name"]),
    )

    index = peers.index(current)

    if direction == "prev":
        if index == 0:
            if not WRAP_PREV:
                return  # left edge of the strip
            index = len(peers)
        go(peers[index - 1], take)
        return

    if index < len(peers) - 1:
        go(peers[index + 1], take)
        return

    # Right edge of the strip: grow it. A single-workspace output is just the
    # case where the right edge and the left edge are the same workspace.
    if SKIP_CREATE_WHEN_EMPTY and emptiness_by_workspace().get(current["name"], False):
        return

    used = {w["num"] for w in workspaces if w["num"] >= 0}
    fresh = number_for_new_workspace(
        used, output, pinned_numbers(), after=max(current["num"], 0)
    )
    go({"num": fresh, "name": str(fresh)}, take)


if __name__ == "__main__":
    main()
