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
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { okAsync } from 'neverthrow'
import type { Chain, PublicClient } from 'viem'
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
const OWNER = '0x1111111111111111111111111111111111111111'

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
    (params: { refundCaps: typeof quotedCaps; validUntil: bigint }) =>
      okAsync({
        permissionId: `0x${'22'.repeat(32)}`,
        validUntil: params.validUntil,
        hcaSessionNonce: 0n,
        refundCaps: params.refundCaps,
        enableData: {
          userSignature: `0x${'44'.repeat(85)}`,
          hashesAndChainIds: [
            { chainId: 11155111n, sessionDigest: `0x${'55'.repeat(32)}` },
          ],
          sessionToEnableIndex: 0,
        },
      }),
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
  const storeValidSession = () =>
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
      authorization: `0x${'44'.repeat(85)}`,
      hashesAndChainIds: [
        { chainId: '11155111', sessionDigest: `0x${'55'.repeat(32)}` },
      ],
      sessionToEnableIndex: 0,
    })

  it('reuses a valid stored session', async () => {
    storeValidSession()

    const result = await resolveSessionActor(input)

    expect(result._unsafeUnwrap().session.id).toBe('stored')
    expect(mocks.createDestinationSession).not.toHaveBeenCalled()
  })

  it('replaces a valid stored session when asked for new caps', async () => {
    storeValidSession()

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
})
