# Migration: Subname Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render eligible subnames indented under their parent domain in the migration "Select Names" step, and cascade parent selection to subnames so a subname is always selected when its parent is.

**Architecture:** Add a pure `groupByParent` helper that turns the flat `ClassifiedName[]` list into an ordered list of `{ parent, subnames }` groups, hiding subnames whose parent isn't in the eligible list. Refactor `SelectNamesStep.tsx` to render groups via a shared `NameRow` sub-component (with `indent` + `interactive` props). Replace per-name toggle with a parent-cascade toggle. Extend the search filter so that a match on a subname keeps its parent visible for context.

**Tech Stack:** React 18 + TypeScript, Tailwind, Lingui, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-04-22-migration-subname-grouping-design.md`

---

## File Structure

Files created or modified:

- **Create:** `apps/manager/src/features/migration/service/groupByParent.ts` — pure grouping helper
- **Create:** `apps/manager/src/features/migration/service/groupByParent.test.ts` — unit tests for the helper
- **Create:** `apps/manager/src/features/migration/components/NameRow.tsx` — reusable row sub-component (parent or subname)
- **Create:** `apps/manager/src/features/migration/components/SelectNamesStep.test.tsx` — integration test for cascade + search
- **Modify:** `apps/manager/src/features/migration/components/SelectNamesStep.tsx` — use grouping + NameRow + cascade toggle

---

## Task 1: Add `groupByParent` helper (pure, unit-tested)

**Files:**
- Create: `apps/manager/src/features/migration/service/groupByParent.ts`
- Test: `apps/manager/src/features/migration/service/groupByParent.test.ts`

**Context:** `ClassifiedName` has `name` (full name like `gm.sub1234.eth`), `parentName` (e.g. `sub1234.eth` or `eth`), `tokenType` (`unwrapped` | `unlocked` | `locked-2ld` | `locked-child` | `detached-child`). 2LDs have `tokenType` of `unwrapped` / `unlocked` / `locked-2ld`; subnames have `locked-child` / `detached-child`. The `is2LD` helper in `classifyNames.ts` already encodes this.

- [ ] **Step 1: Write the failing test**

Create `apps/manager/src/features/migration/service/groupByParent.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ClassifiedName } from './classifyNames'
import { groupByParent } from './groupByParent'

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'],
): ClassifiedName => {
  const label = fullName.split('.')[0]
  const parentName = fullName.includes('.')
    ? fullName.split('.').slice(1).join('.')
    : null
  return {
    domain: {
      id: fullName,
      name: fullName,
      labelName: label,
    },
    tokenType,
    label,
    parentName,
    fuses: 0,
    tokenHolder: '0x0000000000000000000000000000000000000001',
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  } as unknown as ClassifiedName
}

describe('groupByParent', () => {
  it('returns empty array for empty input', () => {
    expect(groupByParent([])).toEqual([])
  })

  it('returns 2LDs as roots with empty subname arrays, alphabetical', () => {
    const a = makeName('b.eth', 'unwrapped')
    const b = makeName('a.eth', 'locked-2ld')
    const result = groupByParent([a, b])
    expect(result.map((g) => g.parent.domain.name)).toEqual(['a.eth', 'b.eth'])
    expect(result.every((g) => g.subnames.length === 0)).toBe(true)
  })

  it('groups subnames under eligible parents, sorted alphabetically', () => {
    const parent = makeName('sub1234.eth', 'unwrapped')
    const childA = makeName('gm.sub1234.eth', 'locked-child')
    const childB = makeName('hi.sub1234.eth', 'detached-child')
    const result = groupByParent([childB, childA, parent])
    expect(result).toHaveLength(1)
    expect(result[0].parent.domain.name).toBe('sub1234.eth')
    expect(result[0].subnames.map((c) => c.domain.name)).toEqual([
      'gm.sub1234.eth',
      'hi.sub1234.eth',
    ])
  })

  it('drops subnames whose parent is not in the eligible list', () => {
    const orphan = makeName('gm.sub1234.eth', 'locked-child')
    const other = makeName('other.eth', 'unwrapped')
    const result = groupByParent([orphan, other])
    expect(result.map((g) => g.parent.domain.name)).toEqual(['other.eth'])
    expect(result[0].subnames).toEqual([])
  })

  it('mixed: multiple roots each with their own subnames, dropped orphans', () => {
    const root1 = makeName('a.eth', 'unwrapped')
    const root2 = makeName('b.eth', 'locked-2ld')
    const child1 = makeName('x.a.eth', 'locked-child')
    const child2 = makeName('y.a.eth', 'detached-child')
    const child3 = makeName('z.b.eth', 'locked-child')
    const orphan = makeName('o.missing.eth', 'locked-child')
    const result = groupByParent([child2, orphan, child3, root2, child1, root1])
    expect(result.map((g) => g.parent.domain.name)).toEqual(['a.eth', 'b.eth'])
    expect(result[0].subnames.map((c) => c.domain.name)).toEqual([
      'x.a.eth',
      'y.a.eth',
    ])
    expect(result[1].subnames.map((c) => c.domain.name)).toEqual(['z.b.eth'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/manager && pnpm test src/features/migration/service/groupByParent.test.ts`
Expected: FAIL with `Cannot find module './groupByParent'`.

- [ ] **Step 3: Implement `groupByParent`**

Create `apps/manager/src/features/migration/service/groupByParent.ts`:

```ts
import { type ClassifiedName, is2LD } from './classifyNames'

export type NameGroup = {
  readonly parent: ClassifiedName
  readonly subnames: readonly ClassifiedName[]
}

export const groupByParent = (
  eligible: readonly ClassifiedName[],
): readonly NameGroup[] => {
  const byName = new Map<string, ClassifiedName>()
  for (const n of eligible) byName.set(n.domain.name, n)

  const subnamesByParent = new Map<string, ClassifiedName[]>()
  const roots: ClassifiedName[] = []

  for (const n of eligible) {
    if (is2LD(n)) {
      roots.push(n)
      continue
    }
    const parent = n.parentName
    if (!parent || !byName.has(parent)) continue
    const list = subnamesByParent.get(parent) ?? []
    list.push(n)
    subnamesByParent.set(parent, list)
  }

  roots.sort((a, b) => a.domain.name.localeCompare(b.domain.name))

  return roots.map((parent) => {
    const subnames = (subnamesByParent.get(parent.domain.name) ?? [])
      .slice()
      .sort((a, b) => a.domain.name.localeCompare(b.domain.name))
    return { parent, subnames }
  })
}
```

Note: `ClassifiedName` exposes the full name via `domain.name` (from `V1Domain`), not a top-level `name`. The test helper above already reflects this — `groupByParent` reads `n.domain.name` for its lookup key and for sort ordering.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/manager && pnpm test src/features/migration/service/groupByParent.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/manager/src/features/migration/service/groupByParent.ts apps/manager/src/features/migration/service/groupByParent.test.ts
git commit -m "feat: add groupByParent helper for migration name hierarchy"
```

---

## Task 2: Extract `NameRow` sub-component

**Files:**
- Create: `apps/manager/src/features/migration/components/NameRow.tsx`
- Modify: `apps/manager/src/features/migration/components/SelectNamesStep.tsx`

**Context:** The current row JSX lives inside the `.otherwise(() => filtered.map((item) => ...))` branch of `SelectNamesStep.tsx` (roughly lines 119–156). Extract it into a dedicated component so parent and subname rows can share markup.

- [ ] **Step 1: Create `NameRow.tsx`**

```tsx
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassifiedName } from '../service/classifyNames'

type NameRowProps = {
  readonly item: ClassifiedName
  readonly isSelected: boolean
  readonly indent: boolean
  readonly interactive: boolean
  readonly onClick?: () => void
}

export const NameRow = ({
  item,
  isSelected,
  indent,
  interactive,
  onClick,
}: NameRowProps) => {
  const content = (
    <>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[4px] p-1 transition-colors',
          isSelected
            ? 'bg-ens-garnet-900'
            : 'border border-ens-garnet-900/30 bg-transparent',
        )}
      >
        <Check
          className={cn(
            'size-5 transition-opacity',
            isSelected ? 'text-white opacity-100' : 'text-transparent opacity-0',
          )}
          strokeWidth={2.5}
        />
      </div>
      <div className="flex size-[37px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-garnet-900/10">
        <span className="font-semi-mono text-ens-garnet-900 text-xs">
          {item.domain.labelName?.[0]?.toUpperCase() ?? '?'}
        </span>
      </div>
      <div className="rounded-[2px] border border-[#595755]/40 bg-white px-2 py-1 font-medium font-semi-mono text-[#595755] text-base leading-[0.96] tracking-[-0.32px]">
        {item.domain.name}
      </div>
    </>
  )

  const rowClass = cn(
    'flex items-center gap-3',
    indent && 'pl-8',
    interactive ? 'cursor-pointer' : 'cursor-default',
  )

  if (interactive) {
    return (
      <button
        aria-pressed={isSelected}
        className={rowClass}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    )
  }

  return (
    <div aria-pressed={isSelected} className={rowClass} role="checkbox" aria-checked={isSelected}>
      {content}
    </div>
  )
}
```

- [ ] **Step 2: Replace the inline row in `SelectNamesStep.tsx`**

In `SelectNamesStep.tsx`, remove the `Check` import (still used inside `NameRow`). Replace the row mapping block inside `.otherwise(...)` (currently rendering `<button ...>` per item) with a call to `NameRow`:

```tsx
.otherwise(() =>
  filtered.map((item) => (
    <NameRow
      key={item.domain.id}
      item={item}
      isSelected={selected.has(item.domain.name)}
      indent={false}
      interactive={true}
      onClick={() => toggleName(item.domain.name)}
    />
  )),
)
```

Add the import at the top of `SelectNamesStep.tsx`:

```tsx
import { NameRow } from './NameRow'
```

Remove the now-unused `Check` import from `SelectNamesStep.tsx` (only `Info`, `Search` are still needed).

Also: several places in the existing `SelectNamesStep` reference `item.name`, `item.labelName`, `item.id` — these were convenience accessors on `ClassifiedName`. Looking at `classifyNames.ts`, `ClassifiedName` does NOT have top-level `name`, `labelName`, or `id` — they live on `item.domain`. The existing component must be using `domain` fields or the types are implicit. Before this task, read `SelectNamesStep.tsx` and confirm the shape:
- `item.id` → should be `item.domain.id`
- `item.labelName` → should be `item.domain.labelName`
- `item.name` → should be `item.domain.name`

If the current code uses `item.name` (etc.) directly, it's because an earlier memo maps `(c) => c.domain` (see `const eligibleNames = useMemo(() => eligible.map((c) => c.domain), [eligible])`). Either preserve that mapping OR update this task to operate on `ClassifiedName` directly. Recommendation: **remove the `.map((c) => c.domain)` memo** and let downstream code operate on `ClassifiedName` — grouping needs the full `ClassifiedName` anyway. Update references accordingly:

- `eligibleNames` → rename to `eligibleList`, type `readonly ClassifiedName[]`, body `eligible` (no map).
- Seed effect: `new Set(eligibleList.map((n) => n.domain.name))`.
- Footer counter: `{eligibleList.length}` unchanged.
- Filter: `eligibleList.filter((n) => n.domain.name.toLowerCase().includes(searchLower))`.
- `toggleName(name)` still takes a full name string — unchanged signature.

- [ ] **Step 3: Typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Smoke test the app**

Run `cd apps/manager && pnpm dev`, open the migration flow, verify the Select Names step renders identically to before (no indentation yet — that comes in Task 3). Shut the dev server down when done.

- [ ] **Step 5: Commit**

```bash
git add apps/manager/src/features/migration/components/NameRow.tsx apps/manager/src/features/migration/components/SelectNamesStep.tsx
git commit -m "refactor: extract NameRow sub-component from SelectNamesStep"
```

---

## Task 3: Render grouped parent + subname rows with cascade selection

**Files:**
- Modify: `apps/manager/src/features/migration/components/SelectNamesStep.tsx`

- [ ] **Step 1: Wire `groupByParent` into the render pipeline**

Replace the filtering + rendering block. The new logic:

1. Compute `groups = groupByParent(eligibleList)` once per render of `eligibleList`.
2. When search is empty, render every group.
3. When search is non-empty, include a group if either (a) the parent's name matches, or (b) any subname matches. When included, render all subnames under that parent regardless of individual match (matches the spec's "if parent matches, all subnames render").

Add imports at the top:

```tsx
import { groupByParent } from '../service/groupByParent'
```

Replace the `filtered` memo and the `.otherwise(...)` rendering:

```tsx
const groups = useMemo(() => groupByParent(eligibleList), [eligibleList])

const filteredGroups = useMemo(() => {
  if (!searchLower) return groups
  return groups.filter((g) => {
    if (g.parent.domain.name.toLowerCase().includes(searchLower)) return true
    return g.subnames.some((s) =>
      s.domain.name.toLowerCase().includes(searchLower),
    )
  })
}, [groups, searchLower])

// hasResults check
const hasResults = filteredGroups.length > 0
```

Replace the match statement that used `filtered`:

```tsx
{match({ isPending, hasResults })
  .with({ isPending: true }, () => <NameListSkeleton />)
  .with({ hasResults: false }, () => (
    <div className="flex flex-col items-center gap-3 py-8">
      <p className="text-ens-garnet-900/40 text-sm">
        {match(search)
          .when(
            (s) => s.length > 0,
            () => <Trans>No names match your search</Trans>,
          )
          .otherwise(() => (
            <Trans>No eligible names found for this wallet</Trans>
          ))}
      </p>
    </div>
  ))
  .otherwise(() =>
    filteredGroups.map((group) => {
      const parentSelected = selected.has(group.parent.domain.name)
      return (
        <div className="flex flex-col gap-4" key={group.parent.domain.id}>
          <NameRow
            item={group.parent}
            isSelected={parentSelected}
            indent={false}
            interactive={true}
            onClick={() => toggleGroup(group)}
          />
          {group.subnames.map((sub) => (
            <NameRow
              key={sub.domain.id}
              item={sub}
              isSelected={parentSelected}
              indent={true}
              interactive={false}
            />
          ))}
        </div>
      )
    }),
  )}
```

Note: the outer `<div className="flex flex-col gap-4">` already wraps all rows. Keep that outer div, but remove the per-group wrapper if it produces double gaps — or adjust to `gap-3` within a group and `gap-4` between groups as needed. Simpler: keep a single flat flow where parent and its subnames are consecutive rows within the outer `gap-4` flex column. If visual spacing needs tightening between a parent and its subnames, do it in Task 4 polish.

Implementation detail — drop the per-group wrapper and use a fragment so spacing stays uniform:

```tsx
.otherwise(() =>
  filteredGroups.flatMap((group) => {
    const parentSelected = selected.has(group.parent.domain.name)
    return [
      <NameRow
        key={group.parent.domain.id}
        item={group.parent}
        isSelected={parentSelected}
        indent={false}
        interactive={true}
        onClick={() => toggleGroup(group)}
      />,
      ...group.subnames.map((sub) => (
        <NameRow
          key={sub.domain.id}
          item={sub}
          isSelected={parentSelected}
          indent={true}
          interactive={false}
        />
      )),
    ]
  }),
)
```

- [ ] **Step 2: Replace `toggleName` with `toggleGroup`**

Replace the `toggleName` callback:

```tsx
const toggleGroup = useCallback(
  (group: NameGroup) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const parentName = group.parent.domain.name
      const hadParent = next.has(parentName)
      if (hadParent) {
        next.delete(parentName)
        for (const sub of group.subnames) next.delete(sub.domain.name)
      } else {
        next.add(parentName)
        for (const sub of group.subnames) next.add(sub.domain.name)
      }
      onNamesChange([...next])
      return next
    })
  },
  [onNamesChange],
)
```

Add the import:

```tsx
import type { NameGroup } from '../service/groupByParent'
```

Delete the old `toggleName` callback and the `filtered` memo.

- [ ] **Step 3: Update the seed effect to use the new flat-eligible list**

The seed effect currently builds `new Set(eligibleNames.map((n) => n.name))`. After Task 2's refactor it reads from `eligibleList`. Keep the invariant that **only visible names** are seeded — orphan subnames (parent not in list) are hidden per the spec and must NOT be in the initial selection, otherwise the footer counter will be inflated and the cascade invariant breaks.

Replace the seed effect:

```tsx
const didSeed = useRef(false)
useEffect(() => {
  if (didSeed.current || isPending || eligibleList.length === 0) return
  didSeed.current = true
  const visibleNames = new Set<string>()
  for (const group of groups) {
    visibleNames.add(group.parent.domain.name)
    for (const sub of group.subnames) visibleNames.add(sub.domain.name)
  }
  setSelected(visibleNames)
  onNamesChange([...visibleNames])
}, [isPending, eligibleList, groups, onNamesChange])
```

- [ ] **Step 4: Update the footer counter source**

The "X out of Y eligible names selected" line uses `eligibleNames.length`. Replace with the count of visible names (parents + their subnames), which matches the cascade invariant:

```tsx
const visibleCount = useMemo(
  () =>
    groups.reduce(
      (acc, g) => acc + 1 + g.subnames.length,
      0,
    ),
  [groups],
)
```

Then in JSX replace `{eligibleNames.length}` with `{visibleCount}`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `cd apps/manager && pnpm lint`
Expected: no errors. Fix any issues with `pnpm lint:fix` if auto-fixable.

- [ ] **Step 7: Manual smoke test in browser**

Run: `cd apps/manager && pnpm dev`

Verify:
1. A wallet that owns a 2LD plus a subname under it: subname renders indented beneath the parent.
2. Toggling the parent off (click the parent row) unchecks the parent and all its subnames; footer counter drops by (1 + N subnames).
3. Toggling the parent back on re-adds all of them.
4. Clicking directly on a subname row does nothing — no selection change, no visual flicker.
5. Searching for a subname (e.g. `gm`) keeps its parent visible as context.
6. Searching for a parent keeps its subnames visible.
7. A subname whose parent is not in the eligible list does not appear at all.

Shut the dev server down when done.

- [ ] **Step 8: Commit**

```bash
git add apps/manager/src/features/migration/components/SelectNamesStep.tsx
git commit -m "feat: group migration subnames under parent with cascade selection"
```

---

## Task 4: Integration test for cascade + search

**Files:**
- Create: `apps/manager/src/features/migration/components/SelectNamesStep.test.tsx`

**Context:** This test mocks `useEligibleV1Names` and renders `SelectNamesStep` in isolation. Follow the pattern from `useOpenModalOnFirstVisit.test.tsx` for vitest module mocks.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'
import { describe, expect, it, vi } from 'vitest'
import type { ClassifiedName } from '../service/classifyNames'

i18n.load('en', {})
i18n.activate('en')

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'],
): ClassifiedName => {
  const label = fullName.split('.')[0]
  const parentName = fullName.includes('.')
    ? fullName.split('.').slice(1).join('.')
    : null
  return {
    domain: {
      id: fullName,
      name: fullName,
      labelName: label,
      labelhash: '0x0',
      isMigrated: false,
      parent: null,
      owner: { id: '0x0' },
      resolver: null,
    },
    tokenType,
    label,
    parentName,
    fuses: 0,
    tokenHolder: '0x0000000000000000000000000000000000000001',
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  } as unknown as ClassifiedName
}

const eligible: ClassifiedName[] = [
  makeName('sub1234.eth', 'unwrapped'),
  makeName('gm.sub1234.eth', 'locked-child'),
  makeName('sub123.eth', 'unwrapped'),
]

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({ eligible, isPending: false }),
}))

import { SelectNamesStep } from './SelectNamesStep'

const renderStep = () => {
  const onNamesChange = vi.fn<(names: string[]) => void>()
  const onNext = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <SelectNamesStep onNamesChange={onNamesChange} onNext={onNext} />
    </I18nProvider>,
  )
  return { onNamesChange, onNext }
}

describe('SelectNamesStep', () => {
  it('seeds all visible names as selected', () => {
    renderStep()
    expect(screen.getByText('sub1234.eth')).toBeInTheDocument()
    expect(screen.getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(screen.getByText('sub123.eth')).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('unselecting a parent unselects all its subnames', async () => {
    const user = userEvent.setup()
    const { onNamesChange } = renderStep()
    const parentRow = screen.getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    await user.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).not.toContain('sub1234.eth')
    expect(lastCall).not.toContain('gm.sub1234.eth')
    expect(lastCall).toContain('sub123.eth')
  })

  it('re-selecting a parent re-adds all its subnames', async () => {
    const user = userEvent.setup()
    const { onNamesChange } = renderStep()
    const parentRow = screen.getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    await user.click(parentRow)
    await user.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).toContain('sub1234.eth')
    expect(lastCall).toContain('gm.sub1234.eth')
  })

  it('subname rows are not interactive', async () => {
    const user = userEvent.setup()
    const { onNamesChange } = renderStep()
    const subnameText = screen.getByText('gm.sub1234.eth')
    const subnameRow = subnameText.closest('[role="checkbox"]')
    expect(subnameRow).not.toBeNull()
    expect(subnameText.closest('button')).toBeNull()
    const callsBefore = onNamesChange.mock.calls.length
    if (subnameRow) await user.click(subnameRow as HTMLElement)
    expect(onNamesChange.mock.calls.length).toBe(callsBefore)
  })

  it('searching a subname keeps the parent visible for context', async () => {
    const user = userEvent.setup()
    renderStep()
    const searchInput = screen.getByLabelText('Search names')
    await user.type(searchInput, 'gm')
    expect(screen.getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(screen.getByText('sub1234.eth')).toBeInTheDocument()
    expect(screen.queryByText('sub123.eth')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/manager && pnpm test src/features/migration/components/SelectNamesStep.test.tsx`
Expected: likely FAIL initially due to missing `@testing-library/user-event` import path, unmet provider wiring, or mocking shape. Fix incrementally — the goal is to get a passing run that exercises the cascade + search behavior described above.

Common gotchas:
- If `I18nProvider` + `i18n` setup throws, check existing component tests in the repo for the correct provider boilerplate and mirror that.
- If `useSmartAccountContext` is pulled in transitively and explodes, add a `vi.mock('@/lib/smart-account', ...)` with a minimal stub. (The hook is not directly consumed by `SelectNamesStep`, but its mock target for `useEligibleV1Names` may need it.)

- [ ] **Step 3: Iterate to green**

Make the smallest changes needed to get all 5 assertions passing. If a test is structurally wrong for this codebase (e.g. Lingui provider incompatible), align it with an existing working test in `apps/manager` and preserve the behavior being verified.

Run: `cd apps/manager && pnpm test src/features/migration/components/SelectNamesStep.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 4: Typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full migration test suite to catch regressions**

Run: `cd apps/manager && pnpm test src/features/migration/`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/manager/src/features/migration/components/SelectNamesStep.test.tsx
git commit -m "test: cover parent cascade and subname context in select names step"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full test run**

Run: `cd apps/manager && pnpm test`
Expected: all tests PASS (no regressions in other features).

- [ ] **Step 2: Typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd apps/manager && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Final browser smoke test**

Run: `cd apps/manager && pnpm dev`

Replay all scenarios from Task 3 Step 7 one more time to confirm nothing regressed between tasks. Especially verify:
- Visual indentation of subnames is clearly visible but not excessive.
- Selected-count footer updates correctly as parents toggle.
- "Upgrade Names" button reflects correct disabled state when nothing is selected.

Shut the dev server down when done.

- [ ] **Step 5: Done — no commit unless final fix-ups needed**

---

## Notes for the implementer

- **DRY:** the row JSX lives only in `NameRow.tsx` after Task 2. Do not duplicate it.
- **YAGNI:** do not add collapse/expand, nested grouping beyond one level, or orphan-subname fallback UI. The spec explicitly scopes those out.
- **TDD:** Task 1 and Task 4 are test-first. Tasks 2 and 3 are refactors where the existing manual smoke test validates behavior; adding a test for the extracted `NameRow` in isolation is optional and not required by this plan.
- **Frequent commits:** one commit per task. If a task's step list gets long, commit after each logical chunk — but do not commit broken builds.
- **Types:** `ClassifiedName` exposes full name as `domain.name`, label as `domain.labelName`, id as `domain.id`. The previous component used an `eligible.map((c) => c.domain)` shortcut; Task 2 removes that and operates on `ClassifiedName` directly.
