/**
 * Tests for `bootstrapHCA` and `encodeHCAInitData`.
 *
 * Covers the happy path, idempotency precheck, the post-fill state
 * verification, and a couple of failure modes (precheck-read failure,
 * Intent submission failure, post-fill mismatch). All blockchain
 * access — both viem reads and Rhinestone SDK Intent submission — is
 * mocked.
 *
 * The factory address and ABI are injected as test fixtures rather
 * than imported from `@ens-apps/transaction-manager` so the package
 * stays chain-agnostic (it doesn't even know what Sepolia is).
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { MOCK_FACTORY, MOCK_FILL_HASH } = vi.hoisted(() => ({
  MOCK_FACTORY: '0x0000000000000000000000000000000000003586' as const,
  MOCK_FILL_HASH: '0xdeadbeef' as const,
}))

// Mocks must be set up before the module-under-test imports.

const mockSendTransaction = vi.fn()
const mockWaitForExecution = vi.fn()

vi.mock('@rhinestone/sdk', () => ({
  RhinestoneSDK: vi.fn(function (this: any) {
    this.createAccount = vi.fn().mockResolvedValue({
      sendTransaction: mockSendTransaction,
      waitForExecution: mockWaitForExecution,
    })
    return this
  }),
}))

vi.mock('viem/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/actions')>()
  return {
    ...actual,
    readContract: vi.fn(),
  }
})

import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Abi, Account, Address, Chain } from 'viem'
import { zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { bootstrapHCA, encodeHCAInitData } from './bootstrap'

const EOA: Address = '0x000000000000000000000000000000000000eaa1'
const HCA: Address = '0x0000000000000000000000000000000000003ca1'

/**
 * Minimal HCAFactory ABI surface this test exercises. Real callers
 * pass the full `HCA_FACTORY_ABI` from the manager; the bootstrap
 * only invokes the four entries listed here.
 */
const FACTORY_ABI: Abi = [
  {
    type: 'function',
    name: 'accountHCAOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'hca', type: 'address' }],
  },
  {
    type: 'function',
    name: 'computeAccountAddress',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getAccountOwner',
    stateMutability: 'view',
    inputs: [{ name: 'hca', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'payable',
    inputs: [{ name: 'initData', type: 'bytes' }],
    outputs: [{ name: 'hca', type: 'address' }],
  },
]

const readContractMock = vi.mocked(readContract)

const ownerAccount = {
  address: EOA,
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
} as unknown as Account
const chain = { id: 11155111, name: 'Sepolia' } as Chain
const publicClient = { chain: { id: 11155111 } } as any
const sdkOpts = {
  rhinestoneApiKey: 'test-api-key',
}

const baseParams = {
  eoaAddress: EOA,
  ownerAccount,
  chain,
  publicClient,
  factoryAddress: MOCK_FACTORY as Address,
  factoryAbi: FACTORY_ABI,
  sdk: sdkOpts,
}

/**
 * Configure `readContract` to answer the three reads `bootstrapHCA`
 * makes in sequence, in order:
 *   1. `accountHCAOf(eoa)` — idempotency precheck.
 *   2. `computeAccountAddress(eoa)` — predict the proxy address.
 *   3. `getAccountOwner(hca)` — post-fill verification.
 *
 * Pass `undefined` for reads we don't expect to happen (e.g. (2) and
 * (3) are skipped on the idempotent path).
 */
function configureReads(
  reads: {
    accountHCAOf?: Address
    computeAccountAddress?: Address
    getAccountOwner?: Address
  } = {},
) {
  readContractMock.mockImplementation((_client, args: any) => {
    switch (args.functionName) {
      case 'accountHCAOf':
        return Promise.resolve(reads.accountHCAOf ?? zeroAddress)
      case 'computeAccountAddress':
        return Promise.resolve(reads.computeAccountAddress ?? HCA)
      case 'getAccountOwner':
        return Promise.resolve(reads.getAccountOwner ?? EOA)
      default:
        return Promise.reject(
          new Error(`unexpected readContract call: ${args.functionName}`),
        )
    }
  })
}

describe('encodeHCAInitData', () => {
  it('encodes (threshold=1, [(eoa, uint48-max)], []) as ENSValidator config', () => {
    const encoded = encodeHCAInitData(EOA)
    // First 32 bytes = threshold (1)
    // Bytes 32..64 = offset to owners array (0x60 = 96)
    // Bytes 64..96 = offset to guardians array (0xc0 = 192)
    // Bytes 96..128 = owners.length (1)
    // Bytes 128..160 = owners[0].owner (left-padded EOA)
    // Bytes 160..192 = owners[0].expiration (uint48-max, left-padded)
    // Bytes 192..224 = guardians.length (0)
    expect(encoded).toBe(
      '0x' +
        '0000000000000000000000000000000000000000000000000000000000000001' + // threshold
        '0000000000000000000000000000000000000000000000000000000000000060' + // owners offset
        '00000000000000000000000000000000000000000000000000000000000000c0' + // guardians offset
        '0000000000000000000000000000000000000000000000000000000000000001' + // owners.length
        '000000000000000000000000' +
        EOA.slice(2) + // owners[0].owner
        '0000000000000000000000000000000000000000000000000000ffffffffffff' + // owners[0].expiration = uint48.max
        '0000000000000000000000000000000000000000000000000000000000000000', // guardians.length
    )
  })
})

describe('bootstrapHCA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('short-circuits when the HCA proxy is already deployed for this EOA', async () => {
    configureReads({ accountHCAOf: HCA })

    const result = await bootstrapHCA(baseParams)

    expect(result.isOk()).toBe(true)
    if (result.isErr()) throw new Error('unreachable')
    expect(result.value).toEqual({
      hcaAddress: HCA,
      wasDeployedInThisCall: false,
    })
    expect(RhinestoneSDK).not.toHaveBeenCalled()
    expect(mockSendTransaction).not.toHaveBeenCalled()
  })

  it('submits a sponsored EOA-mode Intent and verifies ownership post-fill', async () => {
    configureReads({
      accountHCAOf: zeroAddress,
      computeAccountAddress: HCA,
      getAccountOwner: EOA,
    })
    mockSendTransaction.mockResolvedValueOnce({ id: 1n, type: 'intent' })
    mockWaitForExecution.mockResolvedValueOnce({
      fill: { hash: MOCK_FILL_HASH },
    })

    const result = await bootstrapHCA(baseParams)

    expect(result.isOk()).toBe(true)
    if (result.isErr()) throw new Error('unreachable')
    expect(result.value).toEqual({
      hcaAddress: HCA,
      wasDeployedInThisCall: true,
      hash: MOCK_FILL_HASH,
    })

    // The SDK is constructed in EOA mode and given the owner account.
    expect(RhinestoneSDK).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-api-key' }),
    )
    const sdkInstance = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(sdkInstance?.createAccount).toHaveBeenCalledWith({
      account: { type: 'eoa' },
      eoa: ownerAccount,
    })

    // The Intent targets the HCAFactory with `createAccount(initData)`
    // calldata, on the chain we passed in, sponsored.
    expect(mockSendTransaction).toHaveBeenCalledTimes(1)
    const sendArgs = mockSendTransaction.mock.calls[0]?.[0]
    expect(sendArgs).toMatchObject({
      chain,
      calls: [
        {
          to: MOCK_FACTORY,
          value: 0n,
        },
      ],
      sponsored: true,
    })
    // Verify the calldata is the encoded createAccount(initData) call.
    // First 4 bytes = selector `0xa9ea858f` (createAccount(bytes)).
    expect(sendArgs.calls[0].data).toMatch(/^0xa9ea858f/)
  })

  it('surfaces a tagged error when the precheck read fails', async () => {
    readContractMock.mockRejectedValueOnce(new Error('rpc timeout'))

    const result = await bootstrapHCA(baseParams)

    expect(result.isErr()).toBe(true)
    if (result.isOk()) throw new Error('unreachable')
    expect(result.error._tag).toBe('HCABootstrapError')
    expect(result.error.reason).toBe('precheck-read-failed')
  })

  it('surfaces a tagged error when Intent submission throws', async () => {
    configureReads({ accountHCAOf: zeroAddress, computeAccountAddress: HCA })
    mockSendTransaction.mockRejectedValueOnce(
      new Error('orchestrator simulation failed'),
    )

    const result = await bootstrapHCA(baseParams)

    expect(result.isErr()).toBe(true)
    if (result.isOk()) throw new Error('unreachable')
    expect(result.error.reason).toBe('create-account-failed')
  })

  it('surfaces post-deploy-state-mismatch if getAccountOwner returns a different owner', async () => {
    const wrongOwner: Address = '0x000000000000000000000000000000000000beef'
    configureReads({
      accountHCAOf: zeroAddress,
      computeAccountAddress: HCA,
      getAccountOwner: wrongOwner,
    })
    mockSendTransaction.mockResolvedValueOnce({ id: 1n, type: 'intent' })
    mockWaitForExecution.mockResolvedValueOnce({
      fill: { hash: MOCK_FILL_HASH },
    })

    const result = await bootstrapHCA(baseParams)

    expect(result.isErr()).toBe(true)
    if (result.isOk()) throw new Error('unreachable')
    expect(result.error.reason).toBe('post-deploy-state-mismatch')
  })
})
