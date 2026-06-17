import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    DefaultReverseRegistrar: '0x00000000000000000000000000000000000000d0',
    ReverseRegistrar: '0x00000000000000000000000000000000000000e0',
  },
  getSmartAccountAddress: (signer: { config: { accountAddress: Address } }) =>
    signer.config.accountAddress,
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' as Hex })),
}))

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { needsSignatureFlow, setPrimaryName } from './setPrimaryName'

const DEFAULT_REVERSE = '0x00000000000000000000000000000000000000d0'
const REVERSE = '0x00000000000000000000000000000000000000e0'
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address
const SMART_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address
const EOA_OWNER = '0x3333333333333333333333333333333333333333' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const start = vi.mocked(transactionManager.startTransaction)
const wait = vi.mocked(waitForTransaction)

afterEach(() => {
  vi.clearAllMocks()
})

describe('setPrimaryName', () => {
  it('submits two sequential EOA transactions (forward then reverse)', async () => {
    start.mockReturnValueOnce('tx-forward').mockReturnValueOnce('tx-reverse')
    const onTxId = vi.fn()
    const signer: Signer = { type: 'eoa', walletClient: {} as never }

    await setPrimaryName({
      name: 'leon',
      signer,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
      onTxId,
    })

    expect(start).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(2)
    expect(onTxId.mock.calls).toEqual([['tx-forward'], ['tx-reverse']])

    const [forwardIntent, , forwardOpts] = start.mock.calls[0] ?? []
    expect(forwardIntent).toMatchObject({
      type: 'custom',
      request: { type: 'eoa', from: ACCOUNT, to: DEFAULT_REVERSE, value: 0n },
    })
    expect(forwardOpts).toMatchObject({ operation: 'set-primary-name' })

    const [reverseIntent] = start.mock.calls[1] ?? []
    expect(reverseIntent).toMatchObject({
      type: 'custom',
      request: { type: 'eoa', from: ACCOUNT, to: REVERSE, value: 0n },
    })
  })

  it('signs off-chain then submits one batched sponsored tx for smart accounts', async () => {
    start.mockReturnValueOnce('tx-batched')
    const signMessage = vi.fn(async () => '0xsig' as Hex)
    const walletClient = {
      account: { address: EOA_OWNER },
      signMessage,
    } as unknown as WalletClient
    const signer: Signer = {
      type: 'rhinestone',
      account: {} as never,
      config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
    }

    await setPrimaryName({
      name: 'leon',
      signer,
      accountAddress: SMART_ACCOUNT,
      eoaAddress: EOA_OWNER,
      walletClient,
      publicClient,
      chainId: CHAIN_ID,
      now: () => 1_000,
    })

    expect(signMessage).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledTimes(1)

    const [intent, , opts] = start.mock.calls[0] ?? []
    expect(intent).toMatchObject({
      type: 'custom',
      request: {
        type: 'rhinestone-intent',
        from: SMART_ACCOUNT,
        to: DEFAULT_REVERSE,
        rhinestoneParams: { sponsored: true, useSession: false },
      },
    })
    // Batched: setNameForAddrWithSignature on default + setName on reverse
    const request = (
      intent as { request: { rhinestoneParams: { calls: unknown[] } } }
    ).request
    expect(request.rhinestoneParams.calls).toHaveLength(2)
    expect(opts).toMatchObject({ operation: 'set-primary-name' })
  })

  it('rejects when the signature-flow wallet client has no account', async () => {
    // walletClient is present (so the signature flow is selected) but lacks an
    // account to sign with — the signing step must reject, not silently submit.
    const walletClient = {} as unknown as WalletClient
    const signer: Signer = {
      type: 'rhinestone',
      account: {} as never,
      config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
    }

    await expect(
      setPrimaryName({
        name: 'leon',
        signer,
        accountAddress: SMART_ACCOUNT,
        eoaAddress: EOA_OWNER,
        walletClient,
        publicClient,
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow('walletClient.account is required to sign message')

    expect(start).not.toHaveBeenCalled()
    expect(wait).not.toHaveBeenCalled()
  })
})

describe('needsSignatureFlow', () => {
  const eoaSigner: Signer = { type: 'eoa', walletClient: {} as never }
  const rhinestoneSigner: Signer = {
    type: 'rhinestone',
    account: {} as never,
    config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
  }
  const walletClient = {} as WalletClient

  it.each([
    [
      'eoa signer never uses the signature flow',
      { signer: eoaSigner, walletClient, eoaAddress: EOA_OWNER },
      false,
    ],
    [
      'rhinestone with wallet client + eoa owner',
      { signer: rhinestoneSigner, walletClient, eoaAddress: EOA_OWNER },
      true,
    ],
    [
      'rhinestone missing wallet client',
      {
        signer: rhinestoneSigner,
        walletClient: undefined,
        eoaAddress: EOA_OWNER,
      },
      false,
    ],
    [
      'rhinestone missing eoa owner',
      { signer: rhinestoneSigner, walletClient, eoaAddress: undefined },
      false,
    ],
  ] as const)('%s', (_label, params, expected) => {
    expect(needsSignatureFlow(params)).toBe(expected)
  })
})
