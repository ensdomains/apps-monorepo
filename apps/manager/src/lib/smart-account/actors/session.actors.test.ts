/**
 * Regression tests for the session gate.
 *
 * A session is the gate on the entire app: if `resolveSessionActor` errors, the
 * user sees "Smart sessions are required to use this app" and can do nothing.
 * Both tests here cover ways the cross-chain funding work broke that gate for
 * users who never asked to pay from an L2.
 */

import { errAsync, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createDestinationSession = vi.fn()
const createSourceNexus = vi.fn()
const createMultiChainSessions = vi.fn()
const getValidSessionForAccount = vi.fn()
const saveSession = vi.fn()

class FakeSessionEnableError extends Error {}

vi.mock('@ens-apps/smart-account', () => ({
  DEFAULT_SESSION_VALIDITY_SECONDS: 3600,
  SessionRestoreError: class extends Error {},
  computeResolverAddress: () => '0x000000000000000000000000000000000000dEaD',
  createDestinationSession: (...a: unknown[]) => createDestinationSession(...a),
  createMultiChainSessions: (...a: unknown[]) => createMultiChainSessions(...a),
  createSourceNexus: (...a: unknown[]) => createSourceNexus(...a),
  getDestinationContracts: () => ({ usdc: '0x' + 'dd'.repeat(20) }),
  getSourceContracts: () => ({ usdc: '0x' + 'ss'.repeat(20) }),
  getSkippedStatus: () => false,
  getValidSessionForAccount: (...a: unknown[]) =>
    getValidSessionForAccount(...a),
  hasRegistrationHeadroom: () => true,
  isRhinestoneSession: (s: unknown) =>
    (s as { provider?: string })?.provider === 'rhinestone',
  saveSession: (...a: unknown[]) => saveSession(...a),
  serializeChainDigests: () => '[]',
}))

vi.mock('@/lib/wagmi', () => ({
  customBaseSepolia: { id: 84532, name: 'Base Sepolia' },
}))

import { createSessionActor, resolveSessionActor } from './session.actors'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const CHAIN = { id: 11155111, name: 'Sepolia' } as never

/** A stored session with no source binding — the same-chain shape. */
const sameChainSession = {
  provider: 'rhinestone',
  id: 'stored-1',
  ownerAddress: OWNER,
  smartAccountAddress: HCA,
  chainId: 11155111,
  validUntil: 2_000_000_000,
  sessionPrivateKey: `0x${'11'.repeat(32)}`,
  permissionId: `0x${'ab'.repeat(32)}`,
  resolver: '0x000000000000000000000000000000000000dEaD',
  hcaSessionNonce: '0',
  authorization: `0x${'cc'.repeat(65)}`,
  hashesAndChainIds: '[]',
  sessionToEnableIndex: 0,
}

const destinationResult = {
  session: {},
  permissionId: `0x${'ab'.repeat(32)}`,
  validUntil: 2_000_000_000n,
  hcaSessionNonce: 0n,
  enableData: {
    userSignature: `0x${'cc'.repeat(65)}`,
    hashesAndChainIds: [],
    sessionToEnableIndex: 0,
  },
}

const resolveInput = {
  ownerAddress: OWNER,
  accountAddress: HCA,
  chain: CHAIN,
  rhinestoneAccount: {} as never,
  publicClient: {} as never,
  alreadyDeployed: false,
  // The app requests cross-chain unconditionally — the authorization is signed
  // before the user picks a payment route.
  sourceChainId: 84532,
  sdk: {} as never,
  walletAccount: {} as never,
}

beforeEach(() => {
  vi.clearAllMocks()
  createDestinationSession.mockReturnValue(okAsync(destinationResult))
})

describe('resolveSessionActor', () => {
  it('upgrades a same-chain session when the L2 route is requested', async () => {
    getValidSessionForAccount.mockReturnValue(sameChainSession)
    createSourceNexus.mockReturnValue(errAsync(new FakeSessionEnableError('x')))

    const result = await resolveSessionActor(resolveInput)

    expect(result.isOk()).toBe(true)
    // Reusing it unconditionally left the user stuck: the gate is satisfied by
    // any live session, so a stale same-chain one is never replaced, and the
    // L2 route then dead-ends at "needs the source Nexus address as spender".
    expect(createSourceNexus).toHaveBeenCalled()
  })

  it('stops re-prompting once the source half is known to fail', async () => {
    getValidSessionForAccount.mockReturnValue({
      ...sameChainSession,
      sourceAuthorizationFailed: true,
    })

    const result = await resolveSessionActor(resolveInput)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().session.id).toBe('stored-1')
    // Without this the upgrade retries forever: each attempt degrades back to
    // a same-chain session, which the next check again sees as upgradeable.
    expect(createSourceNexus).not.toHaveBeenCalled()
    expect(createDestinationSession).not.toHaveBeenCalled()
  })

  it('re-authorizes a session bound to a DIFFERENT source chain', async () => {
    getValidSessionForAccount.mockReturnValue({
      ...sameChainSession,
      sourceChainId: 999,
    })
    createSourceNexus.mockReturnValue(errAsync(new FakeSessionEnableError('x')))

    const result = await resolveSessionActor(resolveInput)

    expect(result.isOk()).toBe(true)
    // That session really cannot fund from the requested chain, so it is
    // replaced rather than reused.
    expect(createDestinationSession).toHaveBeenCalled()
  })

  it('reuses a matching cross-chain session without re-authorizing', async () => {
    getValidSessionForAccount.mockReturnValue({
      ...sameChainSession,
      sourceChainId: 84532,
      sourceNexusAddress: `0x${'bb'.repeat(20)}`,
    })

    const result = await resolveSessionActor(resolveInput)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().session.id).toBe('stored-1')
    expect(createSourceNexus).not.toHaveBeenCalled()
  })
})

describe('createSessionActor', () => {
  const createInput = {
    ownerAddress: OWNER,
    accountAddress: HCA,
    chainId: 11155111,
    rhinestoneAccount: {} as never,
    chain: CHAIN,
    publicClient: {} as never,
    alreadyDeployed: false,
    sourceChainId: 84532,
    sdk: {} as never,
    walletAccount: {} as never,
  }

  it('falls back to a same-chain session when the Nexus cannot be derived', async () => {
    createSourceNexus.mockReturnValue(
      errAsync(new FakeSessionEnableError('base sepolia unreachable')),
    )

    const result = await createSessionActor(createInput)

    // The L2 funding half is optional; the app is not. Authorizing the source
    // session needs the source chain reachable and its SmartSessions contracts
    // answering a nonce read — neither of which the same-chain route depends
    // on, and neither of which should be able to lock a user out.
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().session.sourceChainId).toBeUndefined()
    expect(saveSession).toHaveBeenCalledTimes(1)
    // Marked so the gate does not ask the user to sign again on every check.
    expect(result._unsafeUnwrap().session.sourceAuthorizationFailed).toBe(true)
  })

  it('falls back when the multi-chain authorization itself fails', async () => {
    createSourceNexus.mockReturnValue(
      okAsync({
        account: {},
        address: '0x' + 'bb'.repeat(20),
        permissionId: '0x',
        salt: '0x',
      }),
    )
    createMultiChainSessions.mockReturnValue(
      errAsync(new FakeSessionEnableError('session nonce read reverted')),
    )

    const result = await createSessionActor(createInput)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().session.sourceChainId).toBeUndefined()
  })
})
