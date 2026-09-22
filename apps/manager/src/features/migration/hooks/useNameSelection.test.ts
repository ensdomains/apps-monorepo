import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClassifiedName } from '../service/classifyNames'
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
