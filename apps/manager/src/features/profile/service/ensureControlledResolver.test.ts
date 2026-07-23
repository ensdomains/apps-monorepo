import type { Address, PublicClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: vi.fn(),
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))
vi.mock('@/features/migration/service/ensureOwnedPermRes', () => ({
  ensureOwnedPermResViaSigner: vi.fn(),
}))
vi.mock('./changeResolver', () => ({
  changeResolver: vi.fn(() => 'tx-mock'),
}))

import type { Signer } from '@ens-apps/transaction-manager'
import { waitForTransaction } from '@ens-apps/transaction-manager'
import { ensureOwnedPermResViaSigner } from '@/features/migration/service/ensureOwnedPermRes'
import { changeResolver } from './changeResolver'
import { ensureControlledResolver } from './ensureControlledResolver'

const EOA = '0x1111111111111111111111111111111111111111' as Address
const OWNED_RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient
const signer: Signer = { type: 'eoa', walletClient: {} as never }

const mockedEnsure = vi.mocked(ensureOwnedPermResViaSigner)
const mockedChange = vi.mocked(changeResolver)
const mockedWait = vi.mocked(waitForTransaction)

afterEach(() => {
  vi.clearAllMocks()
})

const run = () =>
  ensureControlledResolver({
    name: 'leon.eth',
    signer,
    accountAddress: EOA,
    publicClient,
    chainId: CHAIN_ID,
  })

describe('ensureControlledResolver', () => {
  it('deploys/reuses the owned resolver, points the name at it, and returns it', async () => {
    mockedEnsure.mockResolvedValue(OWNED_RESOLVER)

    const resolver = await run()

    expect(resolver).toBe(OWNED_RESOLVER)
    expect(mockedEnsure).toHaveBeenCalledWith({
      account: EOA,
      signer,
      chainId: CHAIN_ID,
      publicClient,
    })
    expect(mockedChange).toHaveBeenCalledWith({
      name: 'leon.eth',
      newResolver: OWNED_RESOLVER,
      signer,
      accountAddress: EOA,
      publicClient,
      chainId: CHAIN_ID,
    })
    expect(mockedWait).toHaveBeenCalledWith('tx-mock')
  })

  it('deploys the resolver before assigning it and waits for confirmation', async () => {
    const order: string[] = []
    mockedEnsure.mockImplementation(async () => {
      order.push('deploy')
      return OWNED_RESOLVER
    })
    mockedChange.mockImplementation(() => {
      order.push('setResolver')
      return 'tx-mock'
    })
    mockedWait.mockImplementation(async () => {
      order.push('wait')
      return { hash: '0xhash' } as never
    })

    await run()

    expect(order).toEqual(['deploy', 'setResolver', 'wait'])
  })

  it('propagates a deploy failure without assigning a resolver', async () => {
    mockedEnsure.mockRejectedValue(new Error('deploy reverted'))

    await expect(run()).rejects.toThrow('deploy reverted')
    expect(mockedChange).not.toHaveBeenCalled()
    expect(mockedWait).not.toHaveBeenCalled()
  })

  it('rejects subnames before deploying anything (changeResolver is 2LD-only)', async () => {
    const runSubname = () =>
      ensureControlledResolver({
        name: 'sub.leon.eth',
        signer,
        accountAddress: EOA,
        publicClient,
        chainId: CHAIN_ID,
      })

    await expect(runSubname()).rejects.toThrow(/subname/i)
    // No on-chain work: neither the resolver deploy nor setResolver runs.
    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedChange).not.toHaveBeenCalled()
    expect(mockedWait).not.toHaveBeenCalled()
  })
})
