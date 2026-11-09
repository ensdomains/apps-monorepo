import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  createPaletteHandoffController,
  getPaletteHandoffDecision,
  type PaletteHandoffIntent,
} from './handoff'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const intent: PaletteHandoffIntent = {
  kind: 'renew',
  name: 'alice.eth',
  chainId: 1,
  account: ACCOUNT,
}

describe('palette workflow handoffs', () => {
  it('claims an intent once and cannot consume a replacement through an old request', () => {
    const controller = createPaletteHandoffController()
    const first = controller.prepare(intent)
    const replacement = controller.prepare({ ...intent, name: 'bob.eth' })

    expect(controller.claim(first)).toBeNull()
    expect(controller.claim(replacement)).toEqual({
      ...intent,
      name: 'bob.eth',
    })
    expect(controller.claim(replacement)).toBeNull()
    expect(controller.getSnapshot().outcome).toEqual({
      requestId: replacement,
      status: 'opened',
    })
  })

  it('cancels only the requested handoff and never leaves a rejected intent pending', () => {
    const controller = createPaletteHandoffController()
    const oldRequest = controller.prepare(intent)
    const requestId = controller.prepare({ ...intent, kind: 'grant-role' })

    controller.cancel(oldRequest)
    expect(controller.getSnapshot().pending?.requestId).toBe(requestId)
    controller.reject(requestId, 'This wallet cannot grant roles.')
    expect(controller.getSnapshot().pending).toBeNull()
    expect(controller.getSnapshot().outcome).toEqual({
      requestId,
      status: 'blocked',
      reason: 'This wallet cannot grant roles.',
    })
    expect(controller.claim(requestId)).toBeNull()
  })

  it('matches address handoffs without applying the filter to a different address', () => {
    const request = {
      requestId: 2,
      intent: { kind: 'expiring-names' as const, address: ACCOUNT, chainId: 1 },
    }
    expect(
      getPaletteHandoffDecision(request, {
        kind: 'expiring-names',
        address: OTHER_ACCOUNT,
        chainId: 1,
        readiness: 'ready',
      }).status,
    ).toBe('ignore')
    expect(
      getPaletteHandoffDecision(request, {
        kind: 'expiring-names',
        address: ACCOUNT,
        chainId: 1,
        readiness: 'ready',
      }),
    ).toEqual({ status: 'ready', requestId: 2 })
  })

  it.each([
    { override: { name: 'bob.eth' }, expected: 'ignore' },
    { override: { kind: 'grant-role' as const }, expected: 'ignore' },
    { override: { chainId: 11155111 }, expected: 'blocked' },
    { override: { account: OTHER_ACCOUNT }, expected: 'blocked' },
    { override: { account: undefined }, expected: 'blocked' },
    { override: { readiness: 'checking' as const }, expected: 'checking' },
    {
      override: { readiness: { reason: 'Name cannot be renewed.' } },
      expected: 'blocked',
    },
    { override: {}, expected: 'ready' },
  ])(
    'resolves target/account/readiness with $override',
    ({ override, expected }) => {
      expect(
        getPaletteHandoffDecision(
          { requestId: 1, intent },
          { ...intent, readiness: 'ready', ...override },
        ).status,
      ).toBe(expected)
    },
  )
})
