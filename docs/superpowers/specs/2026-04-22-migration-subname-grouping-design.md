# Migration: Subname Grouping in Select Names Step

**Date:** 2026-04-22
**App:** `apps/manager/`
**Target file:** `apps/manager/src/features/migration/components/SelectNamesStep.tsx`

## Problem

The migration "Select Names" step currently renders every eligible v1 name as a flat list. When the list contains both a parent domain and one of its subnames (e.g. `sub1234.eth` and `gm.sub1234.eth`), the relationship isn't visible — the rows appear in alphabetical order with no hierarchy, making it harder to scan and reason about what's being migrated.

## Goal

Render subnames indented under their parent domain so the hierarchy is visually obvious, and bind subname selection to the parent so users can't accidentally leave a subname behind.

## Grouping & visibility rules

1. A name is a **subname** if it has a non-null `parentName` on the `ClassifiedName` returned from `useEligibleV1Names`.
2. A subname renders **only if** its parent is also present in the eligible list. Subnames whose parent is not in the eligible list are hidden entirely.
3. 2LDs (e.g. `foo.eth`) always render at the root level.
4. Rows are ordered: root names alphabetical → subnames alphabetical under each parent.

**Trade-off accepted:** hiding orphaned subnames (where the parent isn't in the eligible list) means some individually eligible subnames won't appear in this step. This is intentional to keep the UI predictable and the mental model simple — if a user needs to migrate such a subname, it can be addressed separately.

## Selection model

- **Parent drives everything.** A subname's checkbox state always equals its parent's state.
- **Subname checkboxes are non-interactive.** They render visibly (so the user sees the state) but clicking them is a no-op (`pointer-events-none` on the button, or rendered as a non-button element). Rationale: if a user accidentally deselects a subname, they may not realize it wasn't migrated and can't migrate again in the same batch.
- Toggling a parent toggles the parent + every one of its subnames together in a single state update.
- Footer counter "X out of Y eligible names selected" continues to count every individually selected name (parents + subnames), unchanged.
- Initial seed behavior is unchanged: all eligible names are pre-selected, which is consistent with the new cascade invariant.

## Search behavior

- Matches against the full name (existing logic — no change to the match string).
- If a subname matches the search but its parent doesn't, the parent row **still renders** so indentation context is preserved. The parent remains fully selectable; its normal cascade still applies.
- If a parent matches, all its subnames render underneath it regardless of whether they individually match. (They share the parent's "shown because parent matched" state.)
- If neither parent nor any of its subnames match, the whole group is hidden.

## Visual treatment

- Subname rows get ~32px left indent relative to parent rows (roughly the width of the checkbox + gap, aligning the subname avatar under the parent avatar).
- Subname's checkbox visual is unchanged from the current design — only `cursor-default` + `pointer-events-none` to make it non-interactive. No reduced opacity.
- No tree connector lines.
- No collapse/expand affordance — all subnames visible by default.
- Matches the minimal style of the current list (same row height, avatar, name chip).

## Implementation sketch

### New helper

A small pure helper — proposed location `apps/manager/src/features/migration/service/groupByParent.ts`:

```ts
type Group = {
  parent: ClassifiedName
  subnames: readonly ClassifiedName[]
}

export const groupByParent = (eligible: readonly ClassifiedName[]): Group[]
```

Behavior:
- Builds a set of eligible names by full name.
- Emits one `Group` per root name (no parent, or parent not in eligible set — wait, case 4 below).
- A subname whose parent IS in the eligible set attaches to that parent.
- A subname whose parent is NOT in the eligible set is **dropped** (per visibility rule 2).
- Result is sorted: roots alphabetical, subnames alphabetical.

Unit tests cover: empty, only roots, only subnames with eligible parents, subnames with missing parents (must be dropped), mixed ordering.

### Component changes

`SelectNamesStep.tsx`:

- After search filtering, pass the filtered list through `groupByParent` (with the search-expansion rule: if any subname matches, include its parent; if the parent matches, include all subnames).
- Replace the flat `filtered.map(...)` render with a two-level loop: for each group, render the parent row, then indented subname rows.
- Extract the current row JSX into a small `NameRow` sub-component with an `indent` and `interactive` prop so the parent and subname rows share code.
- Replace `toggleName(name)` with `toggleGroup(parent, subnames)` for parent rows, which updates the Set with parent + all subnames in one pass. Subname rows don't call any toggle.
- Seed logic unchanged (all eligible names pre-selected).
- Footer counter unchanged.

### Test coverage

- `groupByParent` unit tests (see above).
- Component test: renders indented subnames under parent; toggling parent off removes parent + all subnames from selection; toggling parent back on re-adds them; clicking a subname row has no effect; search that matches only a subname still renders the parent.

## Out of scope

- Deeper-than-one-level nesting (e.g. `a.b.c.eth` under `b.c.eth` under `c.eth`). The data model supports only `parentName` one level up; we render one level of indentation.
- Collapse/expand of subname groups.
- Handling orphan subnames (parent not in eligible list) — they are hidden, not surfaced in a separate group.
- Changes to the footer copy, button behavior, or any other step in the migration flow.
