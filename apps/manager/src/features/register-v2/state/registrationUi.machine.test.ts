/**
 * registrationUi.machine fail-fast tests
 *
 * Focused on the HCA approval-signer guard in `startRegistrationAction`: a
 * rhinestone (HCA) registration where the name owner (EOA) differs from the
 * account address (HCA) MUST have an EOA `approvalSigner`. Without one, the
 * registration machine would fall back to the legacy bundled approve+register
 * intent, which approves from the HCA and leaves `allowance[EOA][registrar]`
 * at 0 — reverting the registration. We fail fast instead.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: test fixtures use loose typing
import { describe, expect, it, vi } from 'vitest'
import { createActor, createMachine } from 'xstate'

// Stub the registration child machine so we don't pull in the whole
// transaction-manager import graph (and so no transactions are ever started).
vi.mock('@ens-apps/transaction-manager', () => ({
  registrationMachine: createMachine({
    id: 'registrationStub',
    initial: 'idle',
    states: { idle: {} },
  }),
}))

vi.mock('@/features/register/components/Pricing/utils', () => ({
  MIN_REGISTER_DURATION_SECONDS: 2_419_200,
}))

vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))

vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => undefined,
}))

import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { registrationV2UiMachine } from './registrationUi.machine'

const HCA_ADDRESS = '0x1111111111111111111111111111111111111111' as const
const EOA_ADDRESS = '0x2222222222222222222222222222222222222222' as const

const startEvent = (account: SmartAccountContextValue) =>
  ({
    type: 'registration.start' as const,
    label: 'example',
    duration: 31_536_000n,
    token: 'USDC',
    totalPrice: 1_000_000n,
    account,
    basePriceNumber: 1,
    premiumPriceNumber: 0,
  }) as any

/** Drive the machine into the `pricing.tokens` state where it accepts start. */
const startActorInTokens = () => {
  const actor = createActor(registrationV2UiMachine, {
    input: { chainId: 11155111 },
  })
  actor.start()
  actor.send({ type: 'pricing.step.next' })
  return actor
}

describe('registrationV2UiMachine — HCA approval-signer guard', () => {
  it('fails fast when an HCA registration has no owner wallet client', () => {
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('failure')
    expect(snapshot.context.lastErrorMessage).toMatch(/reconnect your wallet/i)
  })

  it('proceeds when an HCA registration has an owner wallet client', () => {
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: { account: { address: EOA_ADDRESS } } as any,
      } as unknown as SmartAccountContextValue),
    )

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches('registering')).toBe(true)
    expect(snapshot.context.lastErrorMessage).toBeUndefined()
  })

  it('does not fail fast for a pure-EOA registration without a wallet client', () => {
    const actor = startActorInTokens()

    // owner === account and signer is eoa: the bundled-rhinestone hazard does
    // not apply, so a missing approval signer must NOT block the flow.
    actor.send(
      startEvent({
        signer: { type: 'eoa' } as any,
        accountAddress: EOA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches('registering')).toBe(true)
    expect(snapshot.context.lastErrorMessage).toBeUndefined()
  })
})
