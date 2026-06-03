/**
 * Tests for initializeRhinestoneAccount (HCA).
 *
 * Covers the package-level concerns: SDK option construction (Warp-only,
 * no Pimlico bundler), the HCA + ENS-owner createAccount call, the
 * deploy-via-Intent path (prepare → sign → submit → wait), and the
 * onProgress/onError sequencing. App-side concerns (Para wrapping,
 * env-var resolution, toast wiring) are tested separately in
 * apps/manager/src/lib/smart-account/rhinestone.test.ts.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing

import { maxUint48 } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_SMART_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as const
const MOCK_FACTORY = '0x3586807280000000000000000000000000000000' as const
const MOCK_FACTORY_DATA = '0xdeadbeef' as const

// Mock the Rhinestone SDK module. The factory needs to be a function
// so vi.mocked() can later read .mock.results.
let mockIsDeployed = vi.fn().mockResolvedValue(true)
let mockGetInitData = vi.fn(() => ({
  factory: MOCK_FACTORY,
  factoryData: MOCK_FACTORY_DATA,
}))
let mockPrepareTransaction = vi.fn().mockResolvedValue({ prepared: true })
let mockSignTransaction = vi.fn().mockResolvedValue({ signed: true })
let mockSubmitTransaction = vi.fn().mockResolvedValue({ submitted: true })
let mockWaitForExecution = vi.fn().mockResolvedValue({ status: 'COMPLETED' })

vi.mock('@rhinestone/sdk', () => ({
  RhinestoneSDK: vi.fn(function (this: any) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => MOCK_SMART_ACCOUNT_ADDRESS,
      isDeployed: mockIsDeployed,
      getInitData: mockGetInitData,
      prepareTransaction: mockPrepareTransaction,
      signTransaction: mockSignTransaction,
      submitTransaction: mockSubmitTransaction,
      waitForExecution: mockWaitForExecution,
    })
    return this
  }),
}))

import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Account, Address, Chain } from 'viem'
import {
  deployRhinestoneAccountCore,
  initializeRhinestoneAccount,
  initializeRhinestoneAccountCore,
} from './initialize-account'

const MOCK_OWNER_ADDRESS =
  '0x2222222222222222222222222222222222222222' as Address

const MOCK_CHAIN = { id: 11155111, name: 'Sepolia' } as Chain

function makeOwnerAccount(): Account {
  return {
    address: MOCK_OWNER_ADDRESS,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as Account
}

describe('initializeRhinestoneAccountCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDeployed = vi.fn().mockResolvedValue(true)
    mockGetInitData = vi.fn(() => ({
      factory: MOCK_FACTORY,
      factoryData: MOCK_FACTORY_DATA,
    }))
    mockPrepareTransaction = vi.fn().mockResolvedValue({ prepared: true })
    mockSignTransaction = vi.fn().mockResolvedValue({ signed: true })
    mockSubmitTransaction = vi.fn().mockResolvedValue({ submitted: true })
    mockWaitForExecution = vi.fn().mockResolvedValue({ status: 'COMPLETED' })
  })

  it('creates an in-memory account without deploying on-chain', async () => {
    await initializeRhinestoneAccountCore({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    // SDK createAccount was called
    const sdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(sdk.createAccount).toHaveBeenCalledWith({
      account: { type: 'hca' },
      owners: {
        type: 'ens',
        accounts: [expect.any(Object)],
        ownerExpirations: [Number(maxUint48)],
      },
    })

    // No deploy happened — isDeployed/prepareTransaction/submitTransaction not called
    expect(mockIsDeployed).not.toHaveBeenCalled()
    expect(mockPrepareTransaction).not.toHaveBeenCalled()
    expect(mockSubmitTransaction).not.toHaveBeenCalled()
  })

  it('returns the HCA address, owner address, and config', async () => {
    const result = await initializeRhinestoneAccountCore({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    expect(result).toEqual({
      client: expect.any(Object),
      address: MOCK_SMART_ACCOUNT_ADDRESS,
      ownerAddress: MOCK_OWNER_ADDRESS,
      config: {
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
      },
    })
  })

  it('throws when rhinestoneApiKey is empty', async () => {
    await expect(
      initializeRhinestoneAccountCore({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: '',
      }),
    ).rejects.toThrow('rhinestoneApiKey is required')
  })
})

describe('deployRhinestoneAccountCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDeployed = vi.fn().mockResolvedValue(true)
    mockGetInitData = vi.fn(() => ({
      factory: MOCK_FACTORY,
      factoryData: MOCK_FACTORY_DATA,
    }))
    mockPrepareTransaction = vi.fn().mockResolvedValue({ prepared: true })
    mockSignTransaction = vi.fn().mockResolvedValue({ signed: true })
    mockSubmitTransaction = vi.fn().mockResolvedValue({ submitted: true })
    mockWaitForExecution = vi.fn().mockResolvedValue({ status: 'COMPLETED' })
  })

  function makeMockAccount() {
    return {
      getAddress: () => MOCK_SMART_ACCOUNT_ADDRESS,
      isDeployed: mockIsDeployed,
      getInitData: mockGetInitData,
      prepareTransaction: mockPrepareTransaction,
      signTransaction: mockSignTransaction,
      submitTransaction: mockSubmitTransaction,
      waitForExecution: mockWaitForExecution,
    } as any
  }

  it('skips deploy when the HCA is already on-chain', async () => {
    mockIsDeployed.mockResolvedValueOnce(true)

    await deployRhinestoneAccountCore(makeMockAccount(), MOCK_CHAIN)

    expect(mockPrepareTransaction).not.toHaveBeenCalled()
    expect(mockSubmitTransaction).not.toHaveBeenCalled()
  })

  it('deploys via a sponsored factory Intent when not deployed', async () => {
    mockIsDeployed.mockResolvedValueOnce(false)

    await deployRhinestoneAccountCore(makeMockAccount(), MOCK_CHAIN)

    expect(mockPrepareTransaction).toHaveBeenCalledWith({
      chain: MOCK_CHAIN,
      sponsored: true,
      calls: [
        {
          to: MOCK_FACTORY,
          value: 0n,
          data: MOCK_FACTORY_DATA,
        },
      ],
    })
    expect(mockSignTransaction).toHaveBeenCalledWith({ prepared: true })
    expect(mockSubmitTransaction).toHaveBeenCalledWith({ signed: true })
    expect(mockWaitForExecution).toHaveBeenCalledWith({ submitted: true })
  })

  it('emits onProgress("deploying") then onProgress("ready") on a fresh deploy', async () => {
    mockIsDeployed.mockResolvedValueOnce(false)
    const onProgress = vi.fn()

    await deployRhinestoneAccountCore(makeMockAccount(), MOCK_CHAIN, onProgress)

    expect(onProgress).toHaveBeenNthCalledWith(1, 'deploying')
    expect(onProgress).toHaveBeenLastCalledWith('ready')
  })

  it('emits only onProgress("ready") when already deployed', async () => {
    mockIsDeployed.mockResolvedValueOnce(true)
    const onProgress = vi.fn()

    await deployRhinestoneAccountCore(makeMockAccount(), MOCK_CHAIN, onProgress)

    expect(onProgress).not.toHaveBeenCalledWith('deploying')
    expect(onProgress).toHaveBeenCalledWith('ready')
  })

  it('invokes onError("deploying", err) and rethrows when deploy fails', async () => {
    mockIsDeployed.mockResolvedValueOnce(false)
    mockSubmitTransaction.mockRejectedValueOnce(new Error('boom'))
    const onError = vi.fn()

    await expect(
      deployRhinestoneAccountCore(
        makeMockAccount(),
        MOCK_CHAIN,
        undefined,
        onError,
      ),
    ).rejects.toThrow('boom')

    expect(onError).toHaveBeenCalledWith('deploying', expect.any(Error))
  })
})

describe('initializeRhinestoneAccount (backward-compatible wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDeployed = vi.fn().mockResolvedValue(true)
    mockGetInitData = vi.fn(() => ({
      factory: MOCK_FACTORY,
      factoryData: MOCK_FACTORY_DATA,
    }))
    mockPrepareTransaction = vi.fn().mockResolvedValue({ prepared: true })
    mockSignTransaction = vi.fn().mockResolvedValue({ signed: true })
    mockSubmitTransaction = vi.fn().mockResolvedValue({ submitted: true })
    mockWaitForExecution = vi.fn().mockResolvedValue({ status: 'COMPLETED' })
  })

  it('creates account AND deploys in a single call', async () => {
    mockIsDeployed.mockResolvedValueOnce(false)

    await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    // SDK createAccount called
    const sdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(sdk.createAccount).toHaveBeenCalled()

    // Deploy happened
    expect(mockPrepareTransaction).toHaveBeenCalled()
    expect(mockSubmitTransaction).toHaveBeenCalled()
  })

  it('skips deploy when already on-chain', async () => {
    mockIsDeployed.mockResolvedValueOnce(true)

    await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    expect(mockPrepareTransaction).not.toHaveBeenCalled()
  })

  it('returns the HCA address, owner address, and config', async () => {
    const result = await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    expect(result).toEqual({
      client: expect.any(Object),
      address: MOCK_SMART_ACCOUNT_ADDRESS,
      ownerAddress: MOCK_OWNER_ADDRESS,
      config: {
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
      },
    })
  })

  it('passes the api key', async () => {
    await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    expect(RhinestoneSDK).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-api-key' }),
    )
  })

  it('never configures an ERC-4337 (Pimlico) bundler — Warp only', async () => {
    await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    const opts = vi.mocked(RhinestoneSDK).mock.calls[0]?.[0] as any
    expect(opts).not.toHaveProperty('bundler')
  })

  it('forwards endpointUrl and customRpcUrls when provided', async () => {
    await initializeRhinestoneAccount({
      ownerAccount: makeOwnerAccount(),
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
      rhinestoneEndpointUrl: 'http://localhost:3007',
      rhinestoneCustomRpcUrls: { 11155111: 'http://localhost:8545' },
    })

    expect(RhinestoneSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointUrl: 'http://localhost:3007',
        customRpcUrls: { 11155111: 'http://localhost:8545' },
      }),
    )
  })

  it('creates an HCA account with an ENS owner (never-expiring) and no sessions', async () => {
    const account = makeOwnerAccount()
    await initializeRhinestoneAccount({
      ownerAccount: account,
      eoaAddress: MOCK_OWNER_ADDRESS,
      chain: MOCK_CHAIN,
      rhinestoneApiKey: 'test-api-key',
    })

    const sdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(sdk.createAccount).toHaveBeenCalledWith({
      account: { type: 'hca' },
      owners: {
        type: 'ens',
        accounts: [account],
        ownerExpirations: [Number(maxUint48)],
      },
    })
    // Must not request smart sessions — the SDK rejects them for HCA.
    expect(sdk.createAccount).not.toHaveBeenCalledWith(
      expect.objectContaining({ experimental_sessions: expect.anything() }),
    )
  })

  it('throws when rhinestoneApiKey is empty', async () => {
    await expect(
      initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: '',
      }),
    ).rejects.toThrow('rhinestoneApiKey is required')
  })
})
