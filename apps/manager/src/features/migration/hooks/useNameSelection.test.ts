import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeDomain } from '../service/_fixtures'
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
  it('requires explicit selection before including grace-period names', async () => {
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

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.filteredGracePeriodNames).toEqual(gracePeriodNames)
    expect(result.current.visibleCount).toBe(2)
    expect(result.current.displayedCount).toBe(2)
    expect(result.current.selected).toEqual(new Set(['active.eth']))
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggleName('grace.eth'))
    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )
    expect(result.current.allSelected).toBe(true)
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth', 'grace.eth'])

    act(() => result.current.toggleName('grace.eth'))
    expect(result.current.selected).toEqual(new Set(['active.eth']))

    act(() => result.current.toggleAll())
    expect(result.current.selected).toEqual(
      new Set(['active.eth', 'grace.eth']),
    )

    act(() => result.current.toggleAll())
    expect(result.current.totalSelected).toBe(0)
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

  it('starts grace-only wallets unselected and allows selecting names to renew', () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gracePeriodNames = [makeGracePeriodName('grace.eth')]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [],
        gracePeriodNames,
        isPending: false,
        onNamesChange,
      }),
    )

    expect(result.current.filteredGracePeriodNames).toEqual(gracePeriodNames)
    expect(result.current.displayedCount).toBe(1)
    expect(result.current.visibleCount).toBe(1)
    expect(result.current.totalSelected).toBe(0)
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.toggleAll())
    expect(result.current.selected).toEqual(new Set(['grace.eth']))
    expect(onNamesChange).toHaveBeenLastCalledWith(['grace.eth'])

    act(() => result.current.toggleName('grace.eth'))

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

    act(() => result.current.toggleName('selected.eth'))
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

    act(() => result.current.toggleName('grace.eth'))
    rerender({ gracePeriodNames: [] })

    expect(result.current.selected).toEqual(new Set(['active.eth']))
    expect(onNamesChange).toHaveBeenLastCalledWith(['active.eth'])
  })

  it('prunes selected names when eligibility changes', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const first = [makeName('one.eth'), makeName('two.eth')]
    const next = [makeName('one.eth')]

    const { result, rerender } = renderHook(
      ({ eligible }) =>
        useNameSelection({
          eligible,
          isPending: false,
          onNamesChange,
        }),
      { initialProps: { eligible: first } },
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(2))

    rerender({ eligible: next })

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.selected.has('two.eth')).toBe(false)
    expect(onNamesChange.mock.calls.at(-1)?.[0]).toEqual(['one.eth'])
  })

  it('requires an explicit selection for a name needing manager restoration', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gifted = {
      ...makeName('gifted.eth'),
      managerAddress: '0x0000000000000000000000000000000000000002' as const,
    } as ClassifiedName
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [makeName('owned.eth'), gifted],
        isPending: false,
        onNamesChange,
      }),
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.selected.has('gifted.eth')).toBe(false)
    expect(onNamesChange).toHaveBeenCalledWith(['owned.eth'])
  })

  it('restores a previously selected manager name during recovery', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const gifted = {
      ...makeName('gifted.eth'),
      managerAddress: '0x0000000000000000000000000000000000000002' as const,
    } as ClassifiedName
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [gifted],
        isPending: false,
        isRecovery: true,
        onNamesChange,
      }),
    )

    await waitFor(() =>
      expect(result.current.selected.has('gifted.eth')).toBe(true),
    )
  })
})
