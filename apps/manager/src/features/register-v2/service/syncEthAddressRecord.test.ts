import type { PublicClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ensdomains/ensjs/wallet', () => ({
  setRecordsWriteParameters: vi.fn(async () => ({
    abi: [
      {
        type: 'function',
        name: 'setAddr',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'addr', type: 'address' }],
        outputs: [],
      },
    ],
    functionName: 'setAddr',
    args: ['0x4444444444444444444444444444444444444444'],
  })),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: (signer: { config: { accountAddress: Address } }) =>
    signer.config.accountAddress,
  transactionManager: { startTransaction: vi.fn(() => 'tx-record') },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))

import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import { checksumAddress, type WalletClient } from 'viem'
import {
  startSyncEthAddressRecordTransaction,
  syncEthAddressRecord,
} from './syncEthAddressRecord'

const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address
const SMART_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address
const OWNER = '0x3333333333333333333333333333333333333333' as Address
const RESOLVER = '0x4444444444444444444444444444444444444444' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const start = vi.mocked(transactionManager.startTransaction)
const wait = vi.mocked(waitForTransaction)
const setRecords = vi.mocked(setRecordsWriteParameters)

afterEach(() => {
  vi.clearAllMocks()
})

describe('syncEthAddressRecord', () => {
  it('starts an EOA request and returns its tx id', async () => {
    const onTxId = vi.fn()

    const txId = await startSyncEthAddressRecordTransaction({
      name: 'leon',
      ownerAddress: OWNER,
      resolverAddress: RESOLVER,
      signer: { type: 'eoa', walletClient: {} as never },
      publicClient,
      chainId: CHAIN_ID,
      onTxId,
    })

    expect(txId).toBe('tx-record')
    expect(setRecords).toHaveBeenCalledWith(publicClient, {
      name: 'leon.eth',
      resolverAddress: RESOLVER,
      coins: [{ coin: 60, value: checksumAddress(OWNER) }],
    })
    expect(start).toHaveBeenCalledWith(
      {
        type: 'custom',
        request: expect.objectContaining({
          type: 'eoa',
          from: OWNER,
          to: RESOLVER,
          value: 0n,
          chainId: CHAIN_ID,
        }),
      },
      { type: 'eoa', walletClient: {} as never },
      expect.objectContaining({
        description: 'Set ETH address record for leon.eth',
        publicClient,
        chainId: CHAIN_ID,
        operation: 'set-addr-record',
        name: 'leon.eth',
      }),
    )
    expect(onTxId).toHaveBeenCalledWith('tx-record')
  })

  it('waits for transaction completion in the async wrapper', async () => {
    await syncEthAddressRecord({
      name: 'leon',
      ownerAddress: OWNER,
      resolverAddress: RESOLVER,
      signer: { type: 'eoa', walletClient: {} as never },
      publicClient,
      chainId: CHAIN_ID,
    })

    expect(wait).toHaveBeenCalledWith('tx-record')
  })

  it('uses the owner EOA wallet for smart-account record sync', async () => {
    const walletClient = { account: { address: OWNER } } as WalletClient

    await startSyncEthAddressRecordTransaction({
      name: 'leon.eth',
      ownerAddress: OWNER,
      resolverAddress: RESOLVER,
      signer: {
        type: 'rhinestone',
        account: {} as never,
        config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
      },
      walletClient,
      publicClient,
      chainId: CHAIN_ID,
    })

    expect(start.mock.calls[0]?.[0]).toEqual({
      type: 'custom',
      request: expect.objectContaining({
        type: 'eoa',
        from: OWNER,
        to: RESOLVER,
        value: 0n,
        chainId: CHAIN_ID,
      }),
    })
    expect(start.mock.calls[0]?.[1]).toEqual({
      type: 'eoa',
      walletClient,
    })
  })
})
