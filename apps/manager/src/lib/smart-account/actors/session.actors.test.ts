/**
 * @vitest-environment happy-dom
 */
import {
  clearAllSessions,
  getSession,
  LEGACY_REFUND_CAPS,
  saveSession,
  serializeRefundCaps,
  sizeRefundCaps,
  storedRefundCaps,
} from '@ens-apps/smart-account'
import { getSessionAuthorizationDigest } from '@ens-apps/smart-account/providers/rhinestone/session-authorization'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { fromSafePromise } from 'neverthrow'
import {
  type Chain,
  concat,
  type Hex,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSessionActor,
  type ResolveSessionInput,
  resolveSessionActor,
} from './session.actors'

const mocks = vi.hoisted(() => ({
  createDestinationSession: vi.fn(),
  quoteSessionRefundCaps: vi.fn(),
}))

vi.mock('@ens-apps/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/smart-account')>()),
  createDestinationSession: mocks.createDestinationSession,
  quoteSessionRefundCaps: mocks.quoteSessionRefundCaps,
}))

const HCA = '0xaaaa000000000000000000000000000000000001'
const OWNER_ACCOUNT = privateKeyToAccount(`0x${'02'.repeat(32)}`)
const OWNER = OWNER_ACCOUNT.address
const SESSION_DIGEST = `0x${'55'.repeat(32)}` as const
// The validator's digest over `[{ chainId: 11155111, sessionDigest: SESSION_DIGEST }]`, so the SDK's signature recovers to OWNER.
const signAuthorization = async (signer = OWNER_ACCOUNT): Promise<Hex> =>
  concat([
    zeroAddress,
    await signer.sign({
      hash: getSessionAuthorizationDigest([
        { chainId: 11155111n, sessionDigest: SESSION_DIGEST },
      ]),
    }),
  ])

const quotedCaps = sizeRefundCaps(2_972_344n)

const input: ResolveSessionInput = {
  ownerAddress: OWNER,
  accountAddress: HCA,
  chain: sepolia as Chain,
  rhinestoneAccount: {} as RhinestoneAccount,
  publicClient: {} as PublicClient,
  alreadyDeployed: true,
}

beforeEach(() => {
  clearAllSessions()
  mocks.quoteSessionRefundCaps.mockReset()
  mocks.createDestinationSession.mockReset()
  mocks.createDestinationSession.mockImplementation(
    (params: {
      readonly refundCaps: typeof quotedCaps
      readonly validUntil: bigint
    }) =>
      fromSafePromise(signAuthorization()).map((userSignature) => ({
        permissionId: `0x${'22'.repeat(32)}`,
        validUntil: params.validUntil,
        hcaSessionNonce: 0n,
        refundCaps: params.refundCaps,
        enableData: {
          userSignature,
          hashesAndChainIds: [
            { chainId: 11155111n, sessionDigest: SESSION_DIGEST },
          ],
          sessionToEnableIndex: 0,
        },
      })),
  )
})

describe('createSessionActor', () => {
  it('authorizes and stores the caps sized from a live quote', async () => {
    mocks.quoteSessionRefundCaps.mockResolvedValue({
      source: 'quote',
      caps: quotedCaps,
    })

    const result = await createSessionActor({ ...input, chainId: sepolia.id })

    expect(mocks.createDestinationSession).toHaveBeenCalledWith(
      expect.objectContaining({ refundCaps: quotedCaps }),
    )
    const stored = getSession(HCA)
    expect(stored && storedRefundCaps(stored)).toEqual(quotedCaps)
    expect(result._unsafeUnwrap().session.refundCaps).toEqual(
      serializeRefundCaps(quotedCaps),
    )
  })

  it('falls back to the legacy caps when the quote is unavailable', async () => {
    mocks.quoteSessionRefundCaps.mockResolvedValue({
      source: 'legacy',
      caps: LEGACY_REFUND_CAPS,
      reason: 'orchestrator 500',
    })

    await createSessionActor({ ...input, chainId: sepolia.id })

    expect(mocks.createDestinationSession).toHaveBeenCalledWith(
      expect.objectContaining({ refundCaps: LEGACY_REFUND_CAPS }),
    )
  })

  it('authorizes the caps it is given without quoting', async () => {
    await createSessionActor({
      ...input,
      chainId: sepolia.id,
      config: { refundCaps: quotedCaps },
    })

    expect(mocks.quoteSessionRefundCaps).not.toHaveBeenCalled()
    expect(mocks.createDestinationSession).toHaveBeenCalledWith(
      expect.objectContaining({ refundCaps: quotedCaps }),
    )
  })
})

describe('resolveSessionActor', () => {
  const storeValidSession = async (signer = OWNER_ACCOUNT) =>
    saveSession({
      id: 'stored',
      provider: 'rhinestone',
      sessionKeyAddress: '0x9999999999999999999999999999999999999999',
      smartAccountAddress: HCA,
      ownerAddress: OWNER,
      createdAt: Date.now(),
      chainId: sepolia.id,
      validUntil: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      sessionPrivateKey: `0x${'11'.repeat(32)}`,
      permissionId: `0x${'22'.repeat(32)}`,
      resolver: '0x3333333333333333333333333333333333333333',
      hcaSessionNonce: '0',
      authorization: await signAuthorization(signer),
      hashesAndChainIds: [
        { chainId: '11155111', sessionDigest: SESSION_DIGEST },
      ],
      sessionToEnableIndex: 0,
    })

  it('reuses a valid stored session', async () => {
    await storeValidSession()

    const result = await resolveSessionActor(input)

    expect(result._unsafeUnwrap().session.id).toBe('stored')
    expect(mocks.createDestinationSession).not.toHaveBeenCalled()
  })

  it('replaces a stored session whose authorization another key signed', async () => {
    await storeValidSession(privateKeyToAccount(`0x${'03'.repeat(32)}`))
    mocks.quoteSessionRefundCaps.mockResolvedValue({
      source: 'quote',
      caps: quotedCaps,
    })

    const result = await resolveSessionActor(input)

    expect(mocks.createDestinationSession).toHaveBeenCalledOnce()
    const session = result._unsafeUnwrap().session
    expect(session.id).not.toBe('stored')
    expect(getSession(HCA)?.id).toBe(session.id)
  })

  it('replaces a valid stored session when asked for new caps', async () => {
    await storeValidSession()

    const result = await resolveSessionActor({
      ...input,
      replaceWithCaps: quotedCaps,
    })

    expect(mocks.createDestinationSession).toHaveBeenCalledWith(
      expect.objectContaining({ refundCaps: quotedCaps }),
    )
    expect(mocks.quoteSessionRefundCaps).not.toHaveBeenCalled()
    const session = result._unsafeUnwrap().session
    expect(session.id).not.toBe('stored')
    expect(getSession(HCA)?.id).toBe(session.id)
  })

  it('authorizes a session in another refund token beside the stored one, then reuses it', async () => {
    const circleUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
    await storeValidSession()
    mocks.quoteSessionRefundCaps.mockResolvedValue({
      source: 'quote',
      caps: quotedCaps,
    })

    const first = await resolveSessionActor({
      ...input,
      refundToken: circleUsdc,
    })
    const second = await resolveSessionActor({
      ...input,
      refundToken: circleUsdc,
    })

    expect(mocks.quoteSessionRefundCaps).toHaveBeenCalledWith(
      expect.objectContaining({ refundToken: circleUsdc }),
    )
    expect(mocks.createDestinationSession).toHaveBeenCalledOnce()
    expect(mocks.createDestinationSession).toHaveBeenCalledWith(
      expect.objectContaining({ refundToken: circleUsdc }),
    )
    const circleSession = first._unsafeUnwrap().session
    expect(circleSession.refundToken).toBe(circleUsdc)
    expect(second._unsafeUnwrap().session.id).toBe(circleSession.id)
    // The deployment-USDC session is still the default one.
    expect(getSession(HCA)?.id).toBe('stored')
  })
})
