import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react'
import { createElement, StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeClassified, makeDomain, OTHER } from '../service/_fixtures'
import type { ClassifiedName, IneligibleName } from '../service/classifyNames'
import { useNameSelection } from './useNameSelection'

const CONTROLLER = '0x00000000000000000000000000000000000000c1'

const makeName = (
  name: string,
  extra: Partial<ClassifiedName> = {},
): ClassifiedName =>
  ({
    action: 'migrate',
    domain: {
      id: name,
      name,
      labelName: name.split('.')[0] ?? name,
    },
    parentName: null,
    registryController: null,
    managerAddress: null,
    ...extra,
  }) as ClassifiedName

const makeGracePeriodName = (name: string): IneligibleName => ({
  domain: makeDomain({ id: name, name, labelName: name.split('.')[0] }),
  reason: 'expired-registration',
})

const makeManagedName = (name: string) =>
  makeName(name, { registryController: CONTROLLER } as Partial<ClassifiedName>)

describe('useNameSelection', () => {
  it('publishes committed selection to its parent without updating it during render', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onManagerRestorationChange = vi.fn()
    const reportedSelections = vi.fn<(names: string[]) => void>()
    type SelectionProps = {
      readonly eligible: ClassifiedName[]
      readonly isPending?: boolean
    }
    const SelectionStep = ({
      eligible,
      isPending = false,
      onNamesChange,
    }: SelectionProps & {
      readonly onNamesChange: (names: string[]) => void
    }) => {
      const selection = useNameSelection({
        eligible,
        isPending,
        onNamesChange,
        onManagerRestorationChange,
      })
      return createElement(
        'div',
        null,
        createElement(
          'output',
          { 'data-testid': 'local' },
          [...selection.selected].join(','),
        ),
        ...['one.eth', 'two.eth'].map((name) =>
          createElement(
            'button',
            {
              key: name,
              onClick: () => selection.toggleName(name),
              type: 'button',
            },
            name,
          ),
        ),
        createElement(
          'button',
          { onClick: selection.toggleAll, type: 'button' },
          'Toggle all',
        ),
      )
    }
    const SelectionPage = ({ eligible, isPending }: SelectionProps) => {
      const [reported, setReported] = useState<string[]>([])
      return createElement(
        'div',
        null,
        createElement(
          'output',
          { 'data-testid': 'reported' },
          reported.join(','),
        ),
        createElement(SelectionStep, {
          eligible,
          isPending,
          // Recreated callbacks must not republish the same selection forever.
          onNamesChange: (names) => {
            reportedSelections(names)
            setReported(names)
          },
        }),
      )
    }
    const eligible = [makeName('one.eth'), makeName('two.eth')]
    try {
      const view = render(
        createElement(
          StrictMode,
          null,
          createElement(SelectionPage, { eligible }),
        ),
      )
      expect(view.getByTestId('reported').textContent).toBe('one.eth,two.eth')
      expect(reportedSelections.mock.calls).toEqual([[['one.eth', 'two.eth']]])
      act(() => {
        fireEvent.click(view.getByRole('button', { name: 'one.eth' }))
        fireEvent.click(view.getByRole('button', { name: 'two.eth' }))
      })
      expect(view.getByTestId('local').textContent).toBe('')
      expect(view.getByTestId('reported').textContent).toBe('')
      fireEvent.click(view.getByRole('button', { name: 'Toggle all' }))
      expect(view.getByTestId('reported').textContent).toBe('one.eth,two.eth')
      const notificationsBeforeRefresh = reportedSelections.mock.calls.length
      view.rerender(
        createElement(
          StrictMode,
          null,
          createElement(SelectionPage, { eligible: [], isPending: true }),
        ),
      )
      expect(view.getByTestId('reported').textContent).toBe('one.eth,two.eth')
      view.rerender(
        createElement(
          StrictMode,
          null,
          createElement(SelectionPage, { eligible }),
        ),
      )
      expect(view.getByTestId('local').textContent).toBe('one.eth,two.eth')
      expect(reportedSelections).toHaveBeenCalledTimes(
        notificationsBeforeRefresh,
      )
      view.rerender(
        createElement(
          StrictMode,
          null,
          createElement(SelectionPage, { eligible: eligible.slice(0, 1) }),
        ),
      )
      expect(view.getByTestId('local').textContent).toBe('one.eth')
      expect(view.getByTestId('reported').textContent).toBe('one.eth')
      expect(
        consoleError.mock.calls.filter(([message]) =>
          String(message).includes('Cannot update a component'),
        ),
      ).toEqual([])
    } finally {
      consoleError.mockRestore()
    }
  })

  it('leaves an affected migration group unchecked until explicitly selected', () => {
    const eligible = [
      makeName('safe.eth'),
      makeName('affected.eth'),
      makeName('child.affected.eth', { parentName: 'affected.eth' }),
    ]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        defaultExcludedNames: ['child.affected.eth'],
        isPending: false,
        onNamesChange: vi.fn(),
        onManagerRestorationChange: vi.fn(),
      }),
    )

    expect(result.current.selected).toEqual(new Set(['safe.eth']))
    act(() => result.current.toggleName('affected.eth'))
    expect(result.current.selected).toEqual(
      new Set(['safe.eth', 'affected.eth', 'child.affected.eth']),
    )
  })

  it('preserves manual selection after the default exclusion changes', () => {
    const eligible = [makeName('safe.eth'), makeName('affected.eth')]
    const { result, rerender } = renderHook(
      ({ excluded }: { excluded: string[] }) =>
        useNameSelection({
          eligible,
          defaultExcludedNames: excluded,
          isPending: false,
          onNamesChange: vi.fn(),
          onManagerRestorationChange: vi.fn(),
        }),
      { initialProps: { excluded: ['affected.eth'] } },
    )

    act(() => result.current.toggleName('affected.eth'))
    rerender({ excluded: ['safe.eth', 'affected.eth'] })
    expect(result.current.selected).toEqual(
      new Set(['safe.eth', 'affected.eth']),
    )
  })

  it('replays a recovery selection without applying default exclusions', () => {
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [makeName('affected.eth')],
        defaultExcludedNames: ['affected.eth'],
        isPending: false,
        isRecovery: true,
        onNamesChange: vi.fn(),
        onManagerRestorationChange: vi.fn(),
      }),
    )
    expect(result.current.selected).toEqual(new Set(['affected.eth']))
  })

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
        onManagerRestorationChange: vi.fn(),
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
      }) =>
        useNameSelection({
          ...names,
          onNamesChange,
          onManagerRestorationChange: vi.fn(),
        }),
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
        onManagerRestorationChange: vi.fn(),
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
        onManagerRestorationChange: vi.fn(),
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
          onManagerRestorationChange: vi.fn(),
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
          onManagerRestorationChange: vi.fn(),
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
        onManagerRestorationChange: vi.fn(),
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
        onManagerRestorationChange: vi.fn(),
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
        onManagerRestorationChange: vi.fn(),
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

describe('useNameSelection manager restoration (WEB-1528)', () => {
  const renderSelection = (eligible: ClassifiedName[]) => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
    const utils = renderHook(
      (props: { eligible: ClassifiedName[]; isPending?: boolean }) =>
        useNameSelection({
          eligible: props.eligible,
          isPending: props.isPending ?? false,
          onNamesChange,
          onManagerRestorationChange,
        }),
      { initialProps: { eligible, isPending: false } },
    )
    return { ...utils, onManagerRestorationChange }
  }

  it('reports nothing until a name is opted in', async () => {
    const { result, onManagerRestorationChange } = renderSelection([
      makeManagedName('one.eth'),
    ])

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.restoredManagers.size).toBe(0)
    expect(onManagerRestorationChange.mock.calls.at(-1)?.[0] ?? []).toEqual([])
  })

  it('keeps ticked opt-ins across a render where eligibility is briefly empty', async () => {
    const names = [makeManagedName('one.eth'), makeManagedName('two.eth')]
    const { result, rerender, onManagerRestorationChange } =
      renderSelection(names)

    await waitFor(() => expect(result.current.totalSelected).toBe(2))
    act(() => {
      result.current.toggleManagerRestoration('one.eth')
      result.current.toggleManagerRestoration('two.eth')
    })
    await waitFor(() =>
      expect(onManagerRestorationChange.mock.calls.at(-1)?.[0]).toEqual([
        'one.eth',
        'two.eth',
      ]),
    )

    // A refetch empties `eligible` for a render or two. The selection survives
    // because its pruning effect bails while pending; the opt-ins must survive
    // the same way rather than being written back as an empty set.
    rerender({ eligible: [], isPending: true })
    rerender({ eligible: names, isPending: false })

    await waitFor(() =>
      expect([...result.current.restoredManagers].sort()).toEqual([
        'one.eth',
        'two.eth',
      ]),
    )
  })

  it('withdraws an opt-in from the batch while the name is deselected, and restores it on reselect', async () => {
    const names = [makeManagedName('one.eth')]
    const { result } = renderSelection(names)

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    act(() => result.current.toggleManagerRestoration('one.eth'))
    await waitFor(() => expect(result.current.restoredManagers.size).toBe(1))

    act(() => result.current.toggleName('one.eth'))
    await waitFor(() => expect(result.current.restoredManagers.size).toBe(0))

    act(() => result.current.toggleName('one.eth'))
    await waitFor(() => expect(result.current.restoredManagers.size).toBe(1))
  })

  it('offers no candidate for a name whose controller matches its registrant', async () => {
    const { result } = renderSelection([makeName('plain.eth')])

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.managerCandidates.size).toBe(0)
  })

  it.each([
    {
      case: 'a different registry controller',
      domain: { ownerId: CONTROLLER },
      candidate: CONTROLLER,
    },
    {
      case: 'a matching registry controller',
      domain: {},
      candidate: undefined,
    },
    {
      case: 'a cleared registry record',
      domain: { ownerId: '0x0000000000000000000000000000000000000000' },
      candidate: undefined,
    },
    {
      case: 'an active wrapper',
      domain: { ownerId: CONTROLLER, isWrapped: true },
      candidate: undefined,
    },
  ])(
    'offers the manager choice on a grace name with $case',
    ({ domain, candidate }) => {
      const { result } = renderHook(() =>
        useNameSelection({
          eligible: [],
          gracePeriodNames: [
            {
              domain: makeDomain({
                id: 'grace.eth',
                name: 'grace.eth',
                labelName: 'grace',
                ...domain,
              }),
              reason: 'expired-registration',
            },
          ],
          isPending: false,
          onNamesChange: vi.fn(),
          onManagerRestorationChange: vi.fn(),
        }),
      )

      expect(result.current.managerCandidates.get('grace.eth')).toBe(candidate)
    },
  )

  it('ignores toggles on a resumed run, whose choice is fixed by its snapshot', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
    const locked = makeName('one.eth', {
      registryController: CONTROLLER,
      managerAddress: CONTROLLER,
    } as Partial<ClassifiedName>)
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [locked],
        isPending: false,
        // A resumed run sets both: recovery seeds every name from the saved
        // plan, and the opt-in it replays can no longer be changed.
        isRecovery: true,
        isManagerRestorationLocked: true,
        onNamesChange,
        onManagerRestorationChange,
      }),
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    // Seeded from the replayed plan, not from the live v1 controller.
    expect([...result.current.restoredManagers]).toEqual(['one.eth'])

    act(() => result.current.toggleManagerRestoration('one.eth'))
    expect([...result.current.restoredManagers]).toEqual(['one.eth'])
  })
})
