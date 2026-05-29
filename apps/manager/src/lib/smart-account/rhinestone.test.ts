/**
 * Rhinestone Account Initialization Tests
 *
 * Tests for the manager-side `initializeRhinestoneAccount` wrapper.
 * Uses mocked SDK + bootstrap dependencies to avoid actual blockchain
 * calls.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { i18n } from '@lingui/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up environment before any imports
vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')

const { MOCK_OWNER_ADDRESS, MOCK_HCA_ADDRESS } = vi.hoisted(() => ({
  MOCK_OWNER_ADDRESS: '0x2222222222222222222222222222222222222222' as const,
  // The HCA proxy address that `bootstrapHCA` would have returned
  // (`HCAFactory.computeAccountAddress(eoa)` in real flow). The SDK mock's
  // `getAddress()` returns this same value because the SDK is told via
  // `initData: { address }` to bind to it.
  MOCK_HCA_ADDRESS: '0x1111111111111111111111111111111111111111' as const,
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    HCAFactory: '0x3333333333333333333333333333333333333333' as const,
  },
}))

// Mock the Rhinestone SDK. We need to surface three exports: the
// `RhinestoneSDK` class (used by the package's
// `initializeRhinestoneAccount`), and the `walletClientToAccount` /
// `wrapParaAccount` helpers (used by the manager-side wrapper to build
// the owner account before handing off to the package).
vi.mock(import('@rhinestone/sdk'), () => ({
  RhinestoneSDK: vi.fn(function (this: RhinestoneSDK) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => MOCK_HCA_ADDRESS,
      isDeployed: vi.fn().mockResolvedValue(true),
      deploy: vi.fn().mockResolvedValue(true),
      sendTransaction: vi.fn().mockResolvedValue('mock-hca-tx'),
      waitForExecution: vi.fn().mockResolvedValue({ fill: { hash: '0x01' } }),
    })

    return this
  }),
  walletClientToAccount: vi.fn().mockReturnValue({
    address: MOCK_OWNER_ADDRESS,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
  wrapParaAccount: vi.fn().mockReturnValue({
    address: MOCK_OWNER_ADDRESS,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
}))

// Mock wagmi
vi.mock('@/lib/wagmi', () => ({
  customSepolia: {
    id: 11155111,
    name: 'Sepolia',
  },
  publicClient: {
    chain: { id: 11155111 },
  },
}))

// Mock the HCA bootstrap from `@ens-apps/smart-account`. The manager
// wrapper imports `bootstrapHCA` from the package, not from a local
// file. We mock only the bootstrap symbol; the package's
// `initializeRhinestoneAccount` is exercised through the SDK mock
// further up.
vi.mock('@ens-apps/smart-account', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ens-apps/smart-account')>()
  return {
    ...actual,
    bootstrapHCA: vi.fn().mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: {
        hcaAddress: MOCK_HCA_ADDRESS,
        wasDeployedInThisCall: true,
        hash: '0xdeadbeef',
      },
    }),
  }
})

// Mock Para viem integration
vi.mock('@getpara/viem-v2-integration', () => ({
  createParaAccount: vi.fn().mockReturnValue({
    address: '0x4444444444444444444444444444444444444444' as const,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
}))

import { bootstrapHCA } from '@ens-apps/smart-account'
import {
  RhinestoneSDK,
  walletClientToAccount,
  wrapParaAccount,
} from '@rhinestone/sdk'
import {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'

type WalletClientParam = Parameters<
  typeof initializeRhinestoneAccount
>[0]['walletClient']

describe('initializeRhinestoneAccount', () => {
  const mockWalletClient = {
    account: {
      address: MOCK_OWNER_ADDRESS as `0x${string}`,
    },
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as WalletClientParam

  beforeEach(() => {
    vi.clearAllMocks()
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
    vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')
    vi.mocked(bootstrapHCA).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: {
        hcaAddress: MOCK_HCA_ADDRESS,
        wasDeployedInThisCall: true,
        hash: '0xdeadbeef',
      },
    } as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs the HCA bootstrap and binds the SDK to the HCA address by default', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe(MOCK_HCA_ADDRESS)
    expect(result.ownerAddress).toBe(MOCK_OWNER_ADDRESS)
    expect(result.config.rhinestoneApiKey).toBe('test-rhinestone-key')
    expect(bootstrapHCA).toHaveBeenCalledWith(
      expect.objectContaining({
        eoaAddress: MOCK_OWNER_ADDRESS,
        // ownerAccount is the viem Account from walletClientToAccount.
        ownerAccount: expect.any(Object),
        chain: expect.objectContaining({ id: 11155111 }),
        publicClient: expect.objectContaining({ chain: { id: 11155111 } }),
        // Manager now injects the factory address + ABI rather than
        // letting the package import them.
        factoryAddress: '0x3333333333333333333333333333333333333333',
        factoryAbi: expect.any(Array),
        sdk: expect.objectContaining({
          rhinestoneApiKey: 'test-rhinestone-key',
        }),
      }),
    )
  })

  it('binds the SDK to the bootstrap-returned address via initData: { address }', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    expect(walletClientToAccount).toHaveBeenCalledWith(mockWalletClient)
    expect(wrapParaAccount).not.toHaveBeenCalled()

    expect(RhinestoneSDK).toHaveBeenCalledWith({
      apiKey: 'test-rhinestone-key',
      bundler: {
        type: 'pimlico',
        apiKey: 'test-pimlico-key',
      },
    })

    // The SDK's `createAccount` must be told `initData: { address }`
    // so it skips its own Nexus-derived address derivation and binds
    // to the bootstrap-returned HCA proxy address.
    const mockSdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(mockSdk?.createAccount).toHaveBeenCalledWith({
      owners: {
        type: 'ecdsa',
        accounts: expect.any(Array),
      },
      experimental_sessions: { enabled: true },
      initData: { address: MOCK_HCA_ADDRESS },
    })
  })

  it('calls SDK with Pimlico bundler for pimlico infrastructure', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      infrastructure: 'pimlico',
    })

    expect(RhinestoneSDK).toHaveBeenCalledWith({
      apiKey: 'test-rhinestone-key',
      bundler: {
        type: 'pimlico',
        apiKey: 'test-pimlico-key',
      },
    })
  })

  it('throws error when neither walletClient nor paraClient provided', async () => {
    await expect(initializeRhinestoneAccount({})).rejects.toThrow(
      'Either walletClient or paraClient must be provided',
    )
  })

  it('throws error when wallet client has no account address', async () => {
    const walletClientNoAccount = {
      account: null,
    } as unknown as WalletClientParam

    await expect(
      initializeRhinestoneAccount({
        walletClient: walletClientNoAccount,
      }),
    ).rejects.toThrow('Either walletClient or paraClient must be provided')
  })

  it('returns correct config shape', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    const config: RhinestoneConfig = result.config

    expect(config).toEqual({
      chain: expect.objectContaining({ id: 11155111 }),
      rhinestoneApiKey: 'test-rhinestone-key',
    })
  })

  it('throws error when Rhinestone API key is missing', async () => {
    vi.stubEnv('VITE_RHINESTONE_API_KEY', '')

    await expect(
      initializeRhinestoneAccount({
        walletClient: mockWalletClient,
      }),
    ).rejects.toThrow('Rhinestone API key not configured')
  })

  it('throws error when Pimlico API key is missing for pimlico infrastructure', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    await expect(
      initializeRhinestoneAccount({
        walletClient: mockWalletClient,
        infrastructure: 'pimlico',
      }),
    ).rejects.toThrow(/pimlicoApiKey is required/)
  })

  it('does not require Pimlico API key for warp infrastructure', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      infrastructure: 'warp',
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe(MOCK_HCA_ADDRESS)
  })

  it('throws when HCA bootstrap fails', async () => {
    vi.mocked(bootstrapHCA).mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: {
        _tag: 'HCABootstrapError',
        reason: 'create-account-failed',
        cause: new Error('Transaction reverted'),
      },
    } as any)

    await expect(
      initializeRhinestoneAccount({
        walletClient: mockWalletClient,
      }),
    ).rejects.toThrow('HCA bootstrap failed: create-account-failed')
  })
})
