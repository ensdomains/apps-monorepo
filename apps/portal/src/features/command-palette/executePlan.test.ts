import type { Address } from 'viem'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'
import { type ExecutionDependencies, executePlan } from './executePlan'
import type { ExecutionPlan } from './executionPlan'
import { cancelPaletteHandoff, paletteHandoff } from './handoff'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const ADDRESS: Address = '0x2222222222222222222222222222222222222222'
const makeDependencies = (
  overrides: Partial<ExecutionDependencies> = {},
): ExecutionDependencies => ({
  chainId: 11155111,
  account: ACCOUNT,
  navigate: async () => {},
  isAtDestination: () => true,
  writeClipboard: async () => {},
  openRpc: () => {},
  connect: () => {},
  disconnect: async () => {},
  openDeveloper: () => {},
  ...overrides,
})

afterEach(() => cancelPaletteHandoff())

describe('executePlan', () => {
  it.each([
    {
      plan: { type: 'handoff', kind: 'renew', name: 'bob.eth' } as const,
      destination: { to: '/$name', params: { name: 'bob.eth' } },
      intent: { kind: 'renew', name: 'bob.eth' },
    },
    {
      plan: { type: 'handoff', kind: 'grant-role', name: 'bob.eth' } as const,
      destination: { to: '/$name/roles', params: { name: 'bob.eth' } },
      intent: { kind: 'grant-role', name: 'bob.eth' },
    },
    {
      plan: { type: 'expiring-names', address: ADDRESS } as const,
      destination: { to: '/addr/$addr/names', params: { addr: ADDRESS } },
      intent: { kind: 'expiring-names', address: ADDRESS },
    },
  ])(
    'passes an exact $plan.type target to its existing destination and consumes once',
    async ({ plan, destination, intent }) => {
      const navigate = vi.fn(async () => {})
      const isAtDestination = vi.fn(() => true)
      const result = await executePlan(
        plan,
        makeDependencies({ navigate, isAtDestination }),
      )

      expect(result.isOk()).toBe(true)
      expect(navigate).toHaveBeenCalledExactlyOnceWith(destination)
      expect(isAtDestination).toHaveBeenCalledExactlyOnceWith(destination)
      const pending = paletteHandoff.getSnapshot().pending
      expect(pending?.intent).toEqual({
        ...intent,
        chainId: 11155111,
        account: ACCOUNT,
      })
      assert(pending !== null)
      expect(paletteHandoff.claim(pending.requestId)).toEqual(pending.intent)
      expect(paletteHandoff.claim(pending.requestId)).toBeNull()
    },
  )

  it.each(['canceled', 'rejected'] as const)(
    'cancels pending workflow intent when navigation is %s',
    async (failure) => {
      const cause = new Error('Route unavailable')
      const result = await executePlan(
        { type: 'handoff', kind: 'renew', name: 'alice.eth' },
        makeDependencies({
          navigate:
            failure === 'rejected'
              ? () => Promise.reject(cause)
              : async () => {},
          isAtDestination: () => false,
        }),
      )

      expect(result.isErr()).toBe(true)
      expect(paletteHandoff.getSnapshot().pending).toBeNull()
      expect(paletteHandoff.getSnapshot().outcome?.status).toBe('cancelled')
    },
  )

  it('treats canceled ordinary navigation as failure even when the caller remains on the same entity', async () => {
    const isAtDestination = vi.fn(() => false)
    const result = await executePlan(
      {
        type: 'navigate',
        navigation: { to: '/$name/records', params: { name: 'alice.eth' } },
      },
      makeDependencies({ isAtDestination }),
    )
    expect(result.isErr()).toBe(true)
    expect(isAtDestination).toHaveBeenCalledExactlyOnceWith({
      to: '/$name/records',
      params: { name: 'alice.eth' },
    })
  })

  it('returns a clipboard failure instead of claiming completion', async () => {
    const cause = new Error('Clipboard permission denied')
    const plan: ExecutionPlan = {
      type: 'copy',
      value: ADDRESS,
      label: 'Address',
    }
    const result = await executePlan(
      plan,
      makeDependencies({ writeClipboard: () => Promise.reject(cause) }),
    )
    assert(result.isErr())
    expect(result.error.cause).toBe(cause)
  })
})
