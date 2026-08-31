#!/usr/bin/env python3
"""
Proves the estimate grid renderers were MOVED, not rewritten.

  python3 scripts/estimate-grid-verbatim.py [<base-ref>]

PR1 lifted ~1,100 lines out of EstimateDetail.tsx into
components/estimates/estimateGridRow.tsx so the estimate page and the
estimate-template page can draw the same grid. The risk in a move that size is a
silent visual regression on the estimate page — a class dropped, a testid
renamed, a branch inverted — that no reviewer would spot by eye.

So instead of reviewing it, diff it: pull the original bodies out of <base-ref>
and the moved bodies out of the working tree, discard the lines the move is
ALLOWED to change (the function signatures, the ctx destructure, the renderCell
alias), and require the rest to be byte-identical.

Exit 0 = provably verbatim. Exit 1 = something changed; the diff says what.
"""
import subprocess, sys, difflib

BASE = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
OLD_PATH = "client/src/pages/EstimateDetail.tsx"
NEW_PATH = "client/src/components/estimates/estimateGridRow.tsx"


def git_show(ref, path):
    r = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"cannot read {ref}:{path}\n{r.stderr}")
    return r.stdout.split("\n")


def block(lines, start_pred, end_pred, what):
    """Lines from the first line matching start_pred to the first later line
    matching end_pred, inclusive."""
    try:
        i = next(n for n, l in enumerate(lines) if start_pred(l))
    except StopIteration:
        sys.exit(f"could not find the start of {what}")
    try:
        j = next(n for n in range(i + 1, len(lines)) if end_pred(lines[n]))
    except StopIteration:
        sys.exit(f"could not find the end of {what}")
    return lines[i:j + 1]


old = git_show(BASE, OLD_PATH)
new = open(NEW_PATH).read().split("\n")

CASES = [
    (
        "renderCell",
        block(old, lambda l: l.strip().startswith("const renderCell ="),
                   lambda l: l == "  };", "renderCell (base)"),
        block(new, lambda l: l.startswith("export function renderEstimateCell"),
                   lambda l: l == "}", "renderEstimateCell (working tree)"),
    ),
    (
        "renderItemWithSubItems",
        block(old, lambda l: l.strip().startswith("const renderItemWithSubItems"),
                   lambda l: l == "  };", "renderItemWithSubItems (base)"),
        block(new, lambda l: l.startswith("export function renderEstimateItemWithSubItems"),
                   lambda l: l == "}", "renderEstimateItemWithSubItems (working tree)"),
    ),
    (
        "CellChip",
        block(old, lambda l: l.startswith("function CellChip"),
                   lambda l: l == "}", "CellChip (base)"),
        block(new, lambda l: l.startswith("function CellChip"),
                   lambda l: l == "}", "CellChip (working tree)"),
    ),
    (
        "SortableRow",
        block(old, lambda l: l.startswith("const SortableRow = React.memo"),
                   lambda l: l == "});", "SortableRow (base)"),
        block(new, lambda l: l.startswith("export const SortableRow = React.memo"),
                   lambda l: l == "});", "SortableRow (working tree)"),
    ),
]


def strip_allowed(lines):
    """Drop the lines the move is permitted to change, so what remains is the
    part that must not have moved a byte."""
    out = []
    for l in lines:
        s = l.strip()
        if s.startswith("const { ") and s.endswith("} = ctx;"):
            continue                      # ctx destructure, added by the move
        if s.startswith("const renderCell = (cellItem"):
            continue                      # alias so the body reads unchanged
        if s.startswith("ctx: EstimateGridCtx,"):
            continue                      # new first parameter
        if s in (") => {", ") {"):
            continue                      # multi-line signature terminator:
                                          # `) => {` became `) {`. Dropped from
                                          # BOTH sides, so a body line of this
                                          # shape can't hide a change.
        out.append(l)
    # the signature's first line and the closing brace differ by design
    return out[1:-1]


failed = False
for name, old_block, new_block in CASES:
    a, b = strip_allowed(old_block), strip_allowed(new_block)
    if a == b:
        print(f"  ok   {name:24} {len(a):>4} lines verbatim")
        continue
    failed = True
    print(f"  FAIL {name:24} {len(a)} base lines vs {len(b)} moved lines")
    for d in difflib.unified_diff(a, b, f"{BASE}:{OLD_PATH}", NEW_PATH, lineterm="", n=2):
        print("       " + d)

if failed:
    print("\nThe move is NOT verbatim — see the diff above.")
    sys.exit(1)
print(f"\nAll blocks byte-identical to {BASE}. The move changed nothing.")
