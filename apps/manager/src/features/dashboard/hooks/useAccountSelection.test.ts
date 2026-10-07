import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DashboardName } from '../dashboardNames'
import { useAccountSelection } from './useAccountSelection'

const name = (label: string): DashboardName => ({
  key: `0x${label}`,
  name: `${label}.eth`,
  protocol: 'v2',
  expiryDate: 100n,
  servedExpiry: 100n,
  createdAt: null,
  nameRoles: ['owner'],
  isLapsed: false,
})

describe('useAccountSelection', () => {
  it('toggles one name and toggles all names off once every one is in', () => {
    const { result } = renderHook(() => useAccountSelection('0xa'))

    act(() => result.current.toggle(name('alice')))
    act(() => result.current.toggleAll([name('alice'), name('bob')]))
    expect([...result.current.labels]).toEqual(['alice.eth', 'bob.eth'])

    act(() => result.current.toggleAll([name('alice'), name('bob')]))
    expect(result.current.selected.size).toBe(0)
  })

  it('starts empty when the accounts change, and stays with the new ones', () => {
    const { result, rerender } = renderHook(
      ({ accounts }) => useAccountSelection(accounts),
      { initialProps: { accounts: '0xa' } },
    )
    act(() => result.current.toggle(name('alice')))

    rerender({ accounts: '0xb' })
    expect(result.current.selected.size).toBe(0)

    act(() => result.current.toggle(name('bob')))
    expect([...result.current.labels]).toEqual(['bob.eth'])
  })
})
