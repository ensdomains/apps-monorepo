import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ALL_ELIGIBLE_PRESET,
  NO_MANAGER_RESTORATION_PRESET,
} from '../components/migrationAiPreset'
import { makeClassified, OTHER } from '../service/_fixtures'
import { useNameSelection } from './useNameSelection'

const makeName = (name: string) =>
  makeClassified({
    action: 'migrate',
    tokenType: 'unwrapped',
    id: name,
    name,
    label: name.split('.')[0] ?? name,
    parentName: 'eth',
  })

const makeRestorationParent = () =>
  makeClassified({
    action: 'migrate',
    tokenType: 'unwrapped',
    name: 'gifted.eth',
    parentName: 'eth',
    managerAddress: OTHER,
  })

const makeChild = () =>
  makeClassified({
    action: 'copy',
    tokenType: 'registry-child',
    name: 'child.gifted.eth',
    parentName: 'gifted.eth',
  })

describe('useNameSelection', () => {
  it('waits for fresh eligibility, then includes restoration parents and children only for explicit all', async () => {
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const parent = makeRestorationParent()
    const child = makeChild()
    const eligible = [parent, child, makeName('other.eth')]
    const { result, rerender } = renderHook(
      ({ isPending }) =>
        useNameSelection({
          eligible,
          isPending,
          preset: ALL_ELIGIBLE_PRESET,
          onNamesChange,
        }),
      { initialProps: { isPending: true } },
    )
    expect(result.current.selected.size).toBe(0)
    expect(onNamesChange).not.toHaveBeenCalled()
    rerender({ isPending: false })
    await waitFor(() =>
      expect(result.current.selected).toEqual(
        new Set(['gifted.eth', 'child.gifted.eth', 'other.eth']),
      ),
    )
    expect(onNamesChange).toHaveBeenCalledWith(
      expect.arrayContaining(['gifted.eth', 'child.gifted.eth', 'other.eth']),
    )
  })

  it.each([
    undefined,
    NO_MANAGER_RESTORATION_PRESET,
  ])('retains manager-restoration exclusions for preset %s', async (preset) => {
    const eligible = [
      makeRestorationParent(),
      makeChild(),
      makeName('other.eth'),
    ]
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        isPending: false,
        preset,
        onNamesChange: vi.fn(),
      }),
    )
    await waitFor(() =>
      expect(result.current.selected).toEqual(new Set(['other.eth'])),
    )
  })

  it('preserves an exact request when the all-eligible preset is also present', async () => {
    const eligible = [makeName('one.eth'), makeName('two.eth')]
    const names = ['two.eth']
    const { result } = renderHook(() =>
      useNameSelection({
        eligible,
        names,
        preset: ALL_ELIGIBLE_PRESET,
        isPending: false,
        onNamesChange: vi.fn(),
      }),
    )
    await waitFor(() =>
      expect(result.current.selected).toEqual(new Set(['two.eth'])),
    )
  })

  it('seeds only an exact AI subset and retains saved recovery precedence', async () => {
    const eligible = [makeName('one.eth'), makeName('two.eth')]
    const names = ['two.eth']
    const onNamesChange = vi.fn<(names: string[]) => void>()
    const { result } = renderHook(() =>
      useNameSelection({ eligible, names, isPending: false, onNamesChange }),
    )
    await waitFor(() =>
      expect(result.current.selected).toEqual(new Set(['two.eth'])),
    )
    expect(onNamesChange).toHaveBeenCalledWith(['two.eth'])
    const recovered = renderHook(() =>
      useNameSelection({
        eligible,
        names,
        isPending: false,
        isRecovery: true,
        onNamesChange: vi.fn(),
      }),
    )
    await waitFor(() =>
      expect(recovered.result.current.selected).toEqual(
        new Set(['one.eth', 'two.eth']),
      ),
    )
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
    const gifted = makeRestorationParent()
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
    const gifted = makeRestorationParent()
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
