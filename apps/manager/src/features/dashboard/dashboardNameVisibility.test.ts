import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it, vi } from 'vitest'
import { getDashboardNameVisibility } from './dashboardNameVisibility'

const summary = (overrides: Partial<NameSummary> = {}): NameSummary => ({
  name: 'managed.eth',
  displayName: 'managed.eth',
  namehash: '0x01',
  protocol: 'v2',
  relations: ['role_holder'],
  isPrimary: false,
  isMigrated: true,
  registrationStatus: 'active',
  expiresAt: null,
  servedExpiry: null,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
  ...overrides,
})

describe('getDashboardNameVisibility', () => {
  it.each([
    { relations: ['owner'] },
    { relations: ['owner', 'manager'] },
  ] satisfies {
    relations: NameSummary['relations']
  }[])(
    'keeps $relations without probing record access',
    async ({ relations }) => {
      const canWriteRecords = vi.fn<() => Promise<boolean>>()
      const isVisible = getDashboardNameVisibility(canWriteRecords)

      expect((await isVisible(summary({ relations })))._unsafeUnwrap()).toBe(
        true,
      )
      expect(canWriteRecords).not.toHaveBeenCalled()
    },
  )

  it('keeps V1 managers without probing record access', async () => {
    const canWriteRecords = vi.fn<() => Promise<boolean>>()
    const isVisible = getDashboardNameVisibility(canWriteRecords)

    expect(
      (
        await isVisible(summary({ protocol: 'v1', relations: ['manager'] }))
      )._unsafeUnwrap(),
    ).toBe(true)
    expect(canWriteRecords).not.toHaveBeenCalled()
  })

  it.each(['manager', 'role_holder'] as const)(
    'keeps a V2 %s with record-write access',
    async (relation) => {
      const canWriteRecords = vi.fn(async () => true)
      const isVisible = getDashboardNameVisibility(canWriteRecords)

      expect(
        (await isVisible(summary({ relations: [relation] })))._unsafeUnwrap(),
      ).toBe(true)
      expect(canWriteRecords).toHaveBeenCalledWith('managed.eth')
    },
  )

  it.each(['manager', 'role_holder'] as const)(
    'hides a V2 %s after a confirmed failed write probe',
    async (relation) => {
      const isVisible = getDashboardNameVisibility(async () => false)

      expect(
        (await isVisible(summary({ relations: [relation] })))._unsafeUnwrap(),
      ).toBe(false)
    },
  )

  it('keeps the name when the permission read fails', async () => {
    const isVisible = getDashboardNameVisibility(async () => {
      throw new Error('RPC unavailable')
    })

    expect((await isVisible(summary()))._unsafeUnwrap()).toBe(true)
  })

  it('waits for a pending permission read before deciding visibility', async () => {
    let complete: ((canWrite: boolean) => void) | undefined
    const permission = new Promise<boolean>((resolve) => {
      complete = resolve
    })
    const result = getDashboardNameVisibility(() => permission)(summary())
    let isSettled = false
    void result.then(() => {
      isSettled = true
    })

    await Promise.resolve()
    expect(isSettled).toBe(false)

    complete?.(false)
    expect((await result)._unsafeUnwrap()).toBe(false)
  })
})
