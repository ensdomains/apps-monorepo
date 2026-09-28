import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClassifiedName } from '../service/classifyNames'
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

const makeManagedName = (name: string) =>
  makeName(name, { registryController: CONTROLLER } as Partial<ClassifiedName>)

describe('useNameSelection', () => {
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

  it('requires an explicit selection for a name needing manager restoration', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
    const gifted = {
      ...makeName('gifted.eth'),
      managerAddress: '0x0000000000000000000000000000000000000002' as const,
    } as ClassifiedName
    const { result } = renderHook(() =>
      useNameSelection({
        eligible: [makeName('owned.eth'), gifted],
        isPending: false,
        onNamesChange,
        onManagerRestorationChange,
      }),
    )

    await waitFor(() => expect(result.current.totalSelected).toBe(1))
    expect(result.current.selected.has('gifted.eth')).toBe(false)
    expect(onNamesChange).toHaveBeenCalledWith(['owned.eth'])
  })

  it('restores a previously selected manager name during recovery', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
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
        onManagerRestorationChange,
      }),
    )

    await waitFor(() =>
      expect(result.current.selected.has('gifted.eth')).toBe(true),
    )
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
