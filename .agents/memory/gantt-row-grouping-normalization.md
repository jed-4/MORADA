---
name: Gantt left-panel row grouping normalization
description: How schedule row order stays contiguous (parent→children) and why drop-commit and render must share one normalizer.
---

# Gantt row grouping (one-level nesting)

The Gantt left panel supports one-level groups (a parent + its children). The row
order must ALWAYS render as contiguous blocks: a parent immediately followed by its
visible children, never a stray top-level item wedged between them.

## The rule
There is ONE normalizer (`buildNormalizedOrder(flatOrder, parentIdOf, collapsedItems)`
in `client/src/pages/Gantt.tsx`) that rebuilds a flat id sequence into contiguous
parent→children order. It:
- flattens accidental grandchildren (2nd-level nesting) back to one level,
- skips children of collapsed parents,
- keeps children directly under their parent.

Both the render path (`sortableItemIds` useMemo) AND the drag-drop commit
(`onMouseUp`) run the SAME normalizer. The drop path splices the dragged block into
a `base` order at an `insertIndex` (from `resolveDrop`), then normalizes.

**Why:** if render and commit use different ordering logic, the mid-drag preview
diverges from what persists after a refetch — the classic "it jumps back after
refresh" bug. Sharing one normalizer guarantees mid-drag view == post-refresh view.

## Drop → parent resolution (`resolveDrop`)
Parenting is derived from the drop *gap*, not from a hover timer:
- gap directly beneath an expanded group parent → first child of that group,
- gap between two children of the same group → stays in that group,
- gap below a group's last child (next row is not a sibling) → becomes top-level,
- a group parent being dragged never becomes a child (one-level only).

`resolveDrop` returns `{ base, insertIndex, blockIds, newParentId, draggedIsParent }`.
The dragged block = the item plus its children (moved together, contiguous).

**How to apply:** any new drop/reorder/create-child path must go through
`resolveDrop` + `buildNormalizedOrder`, then PATCH `parentItemId` (only if changed)
and persist `sortOrder` for ALL rows. Never hand-roll a second ordering pass.

## Hover-nest (create a NEW group)
The 750ms hover-nest is now ONLY for turning a childless parent into a group
(`canNestItem`); position-based nesting into an existing group happens instantly on a
plain drop. `dragBlockRef` holds the dragged item + its children so drop detection
never targets a row inside the block being dragged.
