import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeClassified, makeDomain, OTHER } from '../service/_fixtures'
import type { ClassifiedName, IneligibleName } from '../service/classifyNames'
import { useNameSelection } from './useNameSelection'

const makeName = (name: string): ClassifiedName =>
  ({
    domain: {
      id: name,
      name,
      labelName: name.split('.')[0] ?? name,
    },
    parentName: null,
    managerAddress: null,
  }) as ClassifiedName

const makeGracePeriodName = (name: string): IneligibleName => ({
  domain: makeDomain({ id: name, name, labelName: name.split('.')[0] }),
  reason: 'expired-registration',
})

describe('useNameSelection', () => {
  it('selects eligible and grace-period names by default and allows deselection', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const eligible = [makeName('active.eth')]
    const gracePeriodNames = [makeGracePeriodName('grace.eth')]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        gracePeriodNames,
        isPending: false,
        onNamesChange,
      }),
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(2))
    expect(result.current.filteredGracePeriodNames).toEqual(gracePeriodNames)
    expect(result.current.visibleCount).toBe(2)
    expect(result.current.displayedCount).toBe(2)
    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth', 'grace.eth'])

    act(() => result.current.toggleName('grace.eth'))
    expect(result.current.selected).toEqual(new Set(['active.eth']))
    expect(result.current.allSelected).toBe(false)
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth'])

    act(() => result.current.toggleAll())
    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )

    act(() => result.current.toggleAll())
    expect(result.current.totalSelected).toBe(0)
  })

  it('waits for names to finish loading before selecting eligible and grace-period names', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const { result, rerender } = renderHook(
      (names: {
        eligible: ClassifiedName[]
        gracePeriodNames: IneligibleName[]
        isPending: boolean
      }) => useNameSelection({ ...names, onNamesChange }),
      {
        initialProps: {
          eligible: [makeName('active.eth')],
          gracePeriodNames: [] as IneligibleName[],
          isPending: true,
        },
      },
    )

    expect(result.current.totalSelected).toBe(0)
    expect(onNamesChange).not.toHaveBeenCalled()

    rerender({
      eligible: [makeName('active.eth')],
      gracePeriodNames: [makeGracePeriodName('grace.eth')],
      isPending: false,
    })

    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth', 'grace.eth'])
  })

  it('includes grace-period names in case-insensitive search results', () => {
    const eligible = [makeName('active.eth')]
    const gracePeriodNames = [
      makeGracePeriodName('grace.eth'),
      makeGracePeriodName('other.eth'),
    ]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        gracePeriodNames,
        isPending: false,
        onNamesChange: vi.fn(),
      }),
    )

    act(() => result.current.setSearch('GRACE'))

    expect(result.current.filteredGracePeriodNames).toEqual([
      gracePeriodNames[0],
    ])
    expect(result.current.filteredGroups).toEqual([])
    expect(result.current.filteredOrphans).toEqual([])
    expect(result.current.displayedCount).toBe(3)
    expect(result.current.visibleCount).toBe(3)
  })

  it('selects every name by default for grace-only wallets', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gracePeriodNames = [
      makeGracePeriodName('grace.eth'),
      makeGracePeriodName('other.eth'),
    ]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [],
        gracePeriodNames,
        isPending: false,
        onNamesChange,
      }),
    )

    expect(result.current.filteredGracePeriodNames).toEqual(gracePeriodNames)
    expect(result.current.displayedCount).toBe(2)
    expect(result.current.visibleCount).toBe(2)
    expect(result.current.totalSelected).toBe(2)
    expect(result.current.allSelected).toBe(true)
    expect(result.current.selected).toEqual(new Set(['grace.eth', 'other.eth']))
    expect(onNamesChange).toHaveBeenLastCalledWith(['grace.eth', 'other.eth'])

    act(() => result.current.toggleAll())
    expect(result.current.totalSelected).toBe(0)
    expect(result.current.selected).toEqual(new Set())
    expect(onNamesChange).toHaveBeenLastCalledWith([])
  })

  it('preserves explicit choices when grace names become eligible after renewal', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const eligible: ClassifiedName[] = []
    const { result, rerender } = renderHook(
      (names: {
        eligible: ClassifiedName[]
        gracePeriodNames: IneligibleName[]
      }) =>
        useNameSelection({
          ...names,
          isPending: false,
          onNamesChange,
        }),
      {
        initialProps: {
          eligible,
          gracePeriodNames: [
            makeGracePeriodName('selected.eth'),
            makeGracePeriodName('unselected.eth'),
          ],
        },
      },
    )

    act(() => result.current.toggleName('unselected.eth'))
    rerender({
      eligible: [makeName('selected.eth'), makeName('unselected.eth')],
      gracePeriodNames: [],
    })

    expect(result.current.selected).toEqual(new Set(['selected.eth']))
    expect(result.current.filteredGracePeriodNames).toEqual([])
    expect(onNamesChange).toHaveBeenLastCalledWith(['selected.eth'])
  })

  it('prunes selected grace names when their grace period ends', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const eligible = [makeName('active.eth')]
    const { result, rerender } = renderHook(
      ({ gracePeriodNames }: { gracePeriodNames: IneligibleName[] }) =>
        useNameSelection({
          eligible,
          gracePeriodNames,
          isPending: false,
          onNamesChange,
        }),
      {
        initialProps: {
          gracePeriodNames: [makeGracePeriodName('grace.eth')],
        },
      },
    )

    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )
    rerender({ gracePeriodNames: [] })

    expect(result.current.selected).toEqual(new Set(['active.eth']))
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth'])
  })

  it('prunes selected names when eligibility changes', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
    const first = [makeName('one.eth'), makeName('two.eth')]
    const next = [makeName('one.eth')]

    const { result, rerender } = renderHook(
      ({ eligible }) =>
        useNameSelection({
          eligible,
          isPending: false,
          onNamesChange,
          onManagerRestorationChange,
        }),
      { initialProps: { eligible: first } },
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(2))

    rerender({ eligible: next })

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.selected.has('two.eth')).toBe(false)
    expect(onNamesChange.mock.calls.at(-1)?.[0]).toEqual(['one.eth'])
  })

  it('requires explicit selection of names needing manager restoration and their subtrees', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gifted = makeClassified({
      name: 'gifted.eth',
      managerAddress: OTHER,
    })
    const child = makeClassified({
      name: 'child.gifted.eth',
      parentName: 'gifted.eth',
      tokenType: 'registry-child',
    })
    const grandchild = makeClassified({
      name: 'deep.child.gifted.eth',
      parentName: 'child.gifted.eth',
      tokenType: 'registry-child',
    })
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [makeName('owned.eth'), gifted, child, grandchild],
        gracePeriodNames: [makeGracePeriodName('grace.eth')],
        isPending: false,
        onNamesChange,
      }),
    )

    expect(result.current.selected).toEqual(new Set(['owned.eth', 'grace.eth']))
    expect(result.current.allSelected).toBe(false)
    expect(onNamesChange).toHaveBeenLastCalledWith(['owned.eth', 'grace.eth'])

    act(() => result.current.toggleName('gifted.eth'))
    expect(result.current.selected).toEqual(
      new Set([
        'owned.eth',
        'grace.eth',
        'gifted.eth',
        'child.gifted.eth',
        'deep.child.gifted.eth',
      ]),
    )
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith([
      'owned.eth',
      'grace.eth',
      'gifted.eth',
      'child.gifted.eth',
      'deep.child.gifted.eth',
    ])

    act(() => result.current.toggleName('gifted.eth'))
    expect(result.current.selected).toEqual(new Set(['owned.eth', 'grace.eth']))
  })

  it('preserves saved recovery selections that need manager restoration', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const eligible = [
      makeClassified({ name: 'gifted.eth', managerAddress: OTHER }),
      makeClassified({
        name: 'child.gifted.eth',
        parentName: 'gifted.eth',
        tokenType: 'registry-child',
      }),
    ]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        isPending: false,
        isRecovery: true,
        onNamesChange,
      }),
    )

    expect(result.current.selected).toEqual(
      new Set(['gifted.eth', 'child.gifted.eth']),
    )
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith([
      'gifted.eth',
      'child.gifted.eth',
    ])
  })

  it('requires explicit selection of grace names that need manager restoration after renewal', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gifted = {
      ...makeGracePeriodName('gifted.eth'),
      domain: makeDomain({ name: 'gifted.eth', ownerId: OTHER }),
    }
    const wrapped = {
      ...makeGracePeriodName('wrapped.eth'),
      domain: makeDomain({
        name: 'wrapped.eth',
        ownerId: OTHER,
        isWrapped: true,
      }),
    }
    const staleWrapped = {
      ...makeGracePeriodName('stale-wrapped.eth'),
      domain: makeDomain({
        name: 'stale-wrapped.eth',
        ownerId: OTHER,
        isWrapped: true,
        wrappedExpiry: '1',
        wrappedOwnerId: OTHER,
      }),
    }
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [],
        gracePeriodNames: [
          gifted,
          wrapped,
          staleWrapped,
          makeGracePeriodName('grace.eth'),
        ],
        isPending: false,
        onNamesChange,
      }),
    )

    expect(result.current.selected).toEqual(
      new Set(['wrapped.eth', 'grace.eth']),
    )
    expect(result.current.allSelected).toBe(false)
    expect(onNamesChange).toHaveBeenLastCalledWith(['wrapped.eth', 'grace.eth'])

    act(() => result.current.toggleName('gifted.eth'))
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggleName('stale-wrapped.eth'))
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith([
      'wrapped.eth',
      'grace.eth',
      'gifted.eth',
      'stale-wrapped.eth',
    ])
  })
})
