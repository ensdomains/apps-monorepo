import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, Chain, Hex } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { ENS_HCA_MODULE } from './registration-policy'
import { createRhinestoneSession, restoreRhinestoneSession } from './session'
import type { RhinestoneStoredSession } from './types'

const OWNER = '0x1111111111111111111111111111111111111111' as const
const HCA = '0xaAaA000000000000000000000000000000000001' as const

const updateConfigAbi = parseAbi([
  'struct Owner { address addr; uint48 expiration; }',
  'function updateConfig(uint256 newThreshold, Owner[] ownersToAdd, address[] ownersToRemove)',
])

function mockAccount() {
  const sendTransaction = vi.fn().mockResolvedValue('mock-intent-id')
  const waitForExecution = vi.fn().mockResolvedValue({ fill: { hash: '0x1' } })
  return {
    account: {
      sendTransaction,
      waitForExecution,
    } as unknown as RhinestoneAccount,
    sendTransaction,
    waitForExecution,
  }
}

describe('createRhinestoneSession (owner-key model)', () => {
  it('submits ONE owner-signed add-owner Intent and returns a stored session', async () => {
    const { account, sendTransaction, waitForExecution } = mockAccount()

    const result = await createRhinestoneSession({
      ownerAddress: OWNER,
      smartAccountAddress: HCA,
      chainId: 11155111,
      rhinestoneAccount: account,
      chain: sepolia as Chain,
    })

    expect(result.isOk()).toBe(true)
    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(waitForExecution).toHaveBeenCalledTimes(1)
    // Accept preconfirmation (true) rather than waiting for full settlement.
    expect(waitForExecution).toHaveBeenCalledWith(expect.anything(), true)

    // The single Intent adds the ephemeral key as an HCA owner via updateConfig.
    const tx = sendTransaction.mock.calls[0][0]
    expect(tx.sponsored).toBe(true)
    expect(tx.calls).toHaveLength(1)
    expect(tx.calls[0].to).toBe(ENS_HCA_MODULE)
    const decoded = decodeFunctionData({
      abi: updateConfigAbi,
      data: tx.calls[0].data as Hex,
    })
    expect(decoded.functionName).toBe('updateConfig')

    const { session, sessionPrivateKey } = result._unsafeUnwrap()
    expect(session.provider).toBe('rhinestone')
    expect(session.ownerAddress).toBe(OWNER)
    expect(session.smartAccountAddress).toBe(HCA)
    expect(session.sessionKeyAddress.toLowerCase()).not.toBe(
      OWNER.toLowerCase(),
    )
    expect(sessionPrivateKey).toMatch(/^0x[0-9a-f]{64}$/)
    // The added owner in calldata is the session key.
    const addedOwner = (
      decoded.args as readonly [bigint, readonly { addr: Address }[], unknown]
    )[1][0].addr
    expect(addedOwner.toLowerCase()).toBe(
      session.sessionKeyAddress.toLowerCase(),
    )
  })

  it('surfaces a tagged SessionEnableError when the add-owner Intent fails', async () => {
    const { account, sendTransaction } = mockAccount()
    sendTransaction.mockRejectedValueOnce(new Error('user rejected'))
    const result = await createRhinestoneSession({
      ownerAddress: OWNER,
      smartAccountAddress: HCA,
      chainId: 11155111,
      rhinestoneAccount: account,
      chain: sepolia as Chain,
    })
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('SessionEnableError')
  })
})

describe('restoreRhinestoneSession', () => {
  const base: RhinestoneStoredSession = {
    id: 'x',
    provider: 'rhinestone',
    sessionKeyAddress: '0x9999999999999999999999999999999999999999',
    smartAccountAddress: HCA,
    ownerAddress: OWNER,
    createdAt: Date.now(),
    chainId: 11155111,
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    sessionPrivateKey: `0x${'1'.repeat(64)}` as Hex,
  }

  it('restores a non-expired session', async () => {
    const result = await restoreRhinestoneSession({ session: base })
    expect(result.isOk()).toBe(true)
  })

  it('rejects an expired session with a tagged error', async () => {
    const expired = { ...base, validUntil: Math.floor(Date.now() / 1000) - 10 }
    const result = await restoreRhinestoneSession({ session: expired })
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('SessionRestoreError')
  })
})
