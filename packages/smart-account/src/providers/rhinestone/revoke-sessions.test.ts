/**
 * @vitest-environment happy-dom
 */
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRevokeSessionsCall,
  revokeSessionsOnChain,
} from './revoke-sessions'
import { getSession, saveSession } from './session-storage'
import type { RhinestoneStoredSession } from './types'

const HCA: Address = '0xaAaA000000000000000000000000000000000001'
const OWNER: Address = '0x1111111111111111111111111111111111111111'
const OTHER: Address = '0x2222222222222222222222222222222222222222'
const TX: Hex = `0x${'ab'.repeat(32)}`
const DEPLOY_TX: Hex = `0x${'cd'.repeat(32)}`

/** keccak256("revokeSessions()")[0:4], computed independently of the encoder. */
const REVOKE_SELECTOR = '0xac2d5d4b'

function makeSession(): RhinestoneStoredSession {
  return {
    id: crypto.randomUUID(),
    provider: 'rhinestone',
    sessionKeyAddress: '0x9999999999999999999999999999999999999999',
    smartAccountAddress: HCA,
    ownerAddress: OWNER,
    createdAt: Date.now(),
    chainId: 11155111,
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    sessionPrivateKey: `0x${'1'.repeat(64)}` as Hex,
    permissionId: `0x${'2'.repeat(64)}` as Hex,
    resolver: '0x3333333333333333333333333333333333333333',
    hcaSessionNonce: '0',
    authorization: `0x${'4'.repeat(130)}` as Hex,
    hashesAndChainIds: [],
    sessionToEnableIndex: 0,
  }
}

function makeClients(
  overrides: {
    code?: Hex
    owner?: Address
    receiptStatus?: 'success' | 'reverted'
  } = {},
) {
  const sendTransaction = vi.fn().mockResolvedValue(TX)
  const publicClient = {
    getCode: vi.fn().mockResolvedValue(overrides.code ?? '0x6080'),
    readContract: vi.fn().mockResolvedValue([overrides.owner ?? OWNER, 0n]),
    waitForTransactionReceipt: vi
      .fn()
      .mockResolvedValue({ status: overrides.receiptStatus ?? 'success' }),
  }
  const walletClient = {
    account: { address: OWNER },
    chain: { id: 11155111 },
    sendTransaction,
  }
  return {
    publicClient: publicClient as unknown as PublicClient,
    walletClient: walletClient as unknown as WalletClient,
    /** The raw mock, so assertions keep vitest's typing. */
    sendTransaction,
  }
}

describe('buildRevokeSessionsCall', () => {
  it('targets the HCA with zero value and the revokeSessions selector', () => {
    const call = buildRevokeSessionsCall({ hca: HCA })
    expect(call.to).toBe(HCA)
    expect(call.value).toBe(0n)
    expect(call.data).toBe(REVOKE_SELECTOR)
  })
})

describe('revokeSessionsOnChain', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sends the call and clears the stored session once the receipt confirms', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients()

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      hca: HCA,
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().transactionHash).toBe(TX)
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: HCA, data: REVOKE_SELECTOR, value: 0n }),
    )
    expect(getSession(HCA)).toBeNull()
  })

  it('keeps the stored session when the transaction reverts', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient } = makeClients({
      receiptStatus: 'reverted',
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('transaction-failed')
    // A reverted revoke must NOT look like a successful one.
    expect(getSession(HCA)).not.toBeNull()
  })

  it('keeps the stored session when the wallet is not the HCA owner', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients({
      owner: OTHER,
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('not-owner')
    expect(sendTransaction).not.toHaveBeenCalled()
    expect(getSession(HCA)).not.toBeNull()
  })

  it('refuses an undeployed HCA rather than reporting a false success', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients({
      code: '0x',
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('not-deployed')
    expect(sendTransaction).not.toHaveBeenCalled()
    // The authorization outlives our copy, so the row stays until it is real.
    expect(getSession(HCA)).not.toBeNull()
  })

  it('deploys first when given a deployment call, then revokes', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients({
      code: '0x',
    })
    sendTransaction.mockResolvedValueOnce(DEPLOY_TX).mockResolvedValueOnce(TX)

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      hca: HCA,
      deploymentCall: { to: OTHER, value: 0n, data: '0xdeadbeef' },
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      transactionHash: TX,
      deploymentTransactionHash: DEPLOY_TX,
    })
    expect(sendTransaction).toHaveBeenCalledTimes(2)
    expect(getSession(HCA)).toBeNull()
  })
})
