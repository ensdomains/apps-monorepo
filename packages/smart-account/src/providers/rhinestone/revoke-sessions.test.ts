/**
 * @vitest-environment happy-dom
 */
import type { Address, Chain, Hex, PublicClient, WalletClient } from 'viem'
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
const CHAIN = { id: 11155111, name: 'Sepolia' } as unknown as Chain
const TX: Hex = `0x${'ab'.repeat(32)}`
const DEPLOY_TX: Hex = `0x${'cd'.repeat(32)}`

/** keccak256("revokeSessions()")[0:4], computed independently of the encoder. */
const REVOKE_SELECTOR = '0xac2d5d4b'
/** keccak256("SessionsRevoked(uint96)") — `cast keccak`, not the encoder. */
const SESSIONS_REVOKED_TOPIC: Hex =
  '0xf528e33e309b774e1127be0439036e1245975bd40e5795551dab22399cca8a0a'

/** A `SessionsRevoked(sessionNonce)` log as the HCA emits it. */
function sessionsRevokedLog(sessionNonce: bigint, address: Address = HCA) {
  return {
    address,
    topics: [
      SESSIONS_REVOKED_TOPIC,
      `0x${sessionNonce.toString(16).padStart(64, '0')}` as Hex,
    ],
    data: '0x' as Hex,
  }
}

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
    /** Logs on the revoke receipt; defaults to the HCA's nonce-1 event. */
    revokeLogs?: ReturnType<typeof sessionsRevokedLog>[]
    walletChainId?: number
    publicChainId?: number
  } = {},
) {
  const sendTransaction = vi.fn().mockResolvedValue(TX)
  const publicClient = {
    chain: { id: overrides.publicChainId ?? CHAIN.id },
    getCode: vi.fn().mockResolvedValue(overrides.code ?? '0x6080'),
    readContract: vi.fn().mockResolvedValue([overrides.owner ?? OWNER, 0n]),
    waitForTransactionReceipt: vi.fn(({ hash }: { hash: Hex }) =>
      Promise.resolve({
        transactionHash: hash,
        status: overrides.receiptStatus ?? 'success',
        // Only the revoke emits SessionsRevoked; a deployment receipt does not.
        logs:
          hash === TX ? (overrides.revokeLogs ?? [sessionsRevokedLog(1n)]) : [],
      }),
    ),
  }
  const walletClient = {
    account: { address: OWNER },
    chain: { id: overrides.walletChainId ?? CHAIN.id },
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
      chain: CHAIN,
      hca: HCA,
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      transactionHash: TX,
      sessionNonce: 1n,
    })
    // A direct owner transaction to the HCA itself — not an executeByOwner or
    // intent wrapper, where the account would be msg.sender and onlyOwner
    // would revert CallerNotOwner().
    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(sendTransaction).toHaveBeenCalledWith({
      account: { address: OWNER },
      chain: CHAIN,
      to: HCA,
      data: REVOKE_SELECTOR,
      value: 0n,
    })
    expect(getSession(HCA)).toBeNull()
  })

  it('returns the bumped nonce the HCA reports', async () => {
    const { publicClient, walletClient } = makeClients({
      revokeLogs: [sessionsRevokedLog(7n)],
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
    })

    expect(result._unsafeUnwrap().sessionNonce).toBe(7n)
  })

  it('treats a receipt without SessionsRevoked as a failure', async () => {
    saveSession(makeSession())
    // A call to an address with no code also "succeeds"; only the HCA's own
    // event proves the nonce moved.
    const { publicClient, walletClient } = makeClients({ revokeLogs: [] })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('transaction-failed')
    expect(getSession(HCA)).not.toBeNull()
  })

  it('ignores a SessionsRevoked emitted by a different contract', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient } = makeClients({
      revokeLogs: [sessionsRevokedLog(1n, OTHER)],
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
    })

    expect(result._unsafeUnwrapErr().reason).toBe('transaction-failed')
    expect(getSession(HCA)).not.toBeNull()
  })

  it('reports a rejected wallet request without clearing the session', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients()
    sendTransaction.mockRejectedValueOnce(new Error('User rejected'))

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
    })

    expect(result._unsafeUnwrapErr()).toMatchObject({
      reason: 'unknown',
      message: 'User rejected',
    })
    expect(getSession(HCA)).not.toBeNull()
  })

  it('keeps the stored session when the transaction reverts', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient } = makeClients({
      receiptStatus: 'reverted',
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
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
      chain: CHAIN,
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
      chain: CHAIN,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('not-deployed')
    expect(sendTransaction).not.toHaveBeenCalled()
    // The authorization outlives our copy, so the row stays until it is real.
    expect(getSession(HCA)).not.toBeNull()
  })

  it('refuses when the wallet is on a different chain than the HCA', async () => {
    saveSession(makeSession())
    // Sending here would be worse than failing: the HCA has no code on another
    // chain, so the call would succeed as a no-op and look like a revocation.
    const { publicClient, walletClient, sendTransaction } = makeClients({
      walletChainId: 1,
    })

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('wrong-chain')
    expect(sendTransaction).not.toHaveBeenCalled()
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
      chain: CHAIN,
      hca: HCA,
      deploymentCall: { to: OTHER, value: 0n, data: '0xdeadbeef' },
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      transactionHash: TX,
      sessionNonce: 1n,
      deploymentTransactionHash: DEPLOY_TX,
    })
    expect(sendTransaction).toHaveBeenCalledTimes(2)
    expect(sendTransaction.mock.calls[0]?.[0]).toMatchObject({
      to: OTHER,
      data: '0xdeadbeef',
    })
    expect(sendTransaction.mock.calls[1]?.[0]).toMatchObject({
      to: HCA,
      data: REVOKE_SELECTOR,
    })
    expect(getSession(HCA)).toBeNull()
  })

  it('stops after a reverted deployment without sending the revoke', async () => {
    saveSession(makeSession())
    const { publicClient, walletClient, sendTransaction } = makeClients({
      code: '0x',
      receiptStatus: 'reverted',
    })
    sendTransaction.mockResolvedValueOnce(DEPLOY_TX)

    const result = await revokeSessionsOnChain({
      publicClient,
      walletClient,
      chain: CHAIN,
      hca: HCA,
      deploymentCall: { to: OTHER, value: 0n, data: '0xdeadbeef' },
    })

    expect(result._unsafeUnwrapErr().reason).toBe('transaction-failed')
    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(getSession(HCA)).not.toBeNull()
  })
})
