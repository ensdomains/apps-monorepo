/**
 * Rhinestone Account Initialization Tests
 *
 * Tests for the initializeRhinestoneAccount function.
 * Uses mocked SDK dependencies to avoid actual blockchain calls.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up environment before any imports
vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')

const { MOCK_OWNER_ADDRESS, MOCK_SMART_ACCOUNT_ADDRESS } = vi.hoisted(() => ({
  MOCK_OWNER_ADDRESS: '0x2222222222222222222222222222222222222222' as const,
  MOCK_SMART_ACCOUNT_ADDRESS:
    '0x1111111111111111111111111111111111111111' as const,
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    HCAFactory: '0x3333333333333333333333333333333333333333' as const,
  },
}))

// Mock RhinestoneSDK
vi.mock(import('@rhinestone/sdk'), () => ({
  RhinestoneSDK: vi.fn(function (this: RhinestoneSDK) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => '0x1111111111111111111111111111111111111111' as const,
      isDeployed: vi.fn().mockResolvedValue(true),
      deploy: vi.fn().mockResolvedValue(true),
      sendTransaction: vi.fn().mockResolvedValue('mock-hca-tx'),
      waitForExecution: vi.fn().mockResolvedValue({ fill: { hash: '0x01' } }),
    })

    return this
  }),
}))

vi.mock('./utils', () => ({
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

vi.mock('./hca-registry', () => ({
  registerHCAOwnership: vi.fn().mockResolvedValue({
    isOk: () => true,
    isErr: () => false,
    value: { status: 'already-registered' },
  }),
}))

// Mock Para viem integration
vi.mock('@getpara/viem-v2-integration', () => ({
  createParaAccount: vi.fn().mockReturnValue({
    address: '0x4444444444444444444444444444444444444444' as const,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
}))

import { RhinestoneSDK } from '@rhinestone/sdk'
import { registerHCAOwnership } from './hca-registry'
import {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'
import { walletClientToAccount, wrapParaAccount } from './utils'

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
    vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
    vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')
    vi.mocked(registerHCAOwnership).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: { status: 'already-registered' },
    } as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a Rhinestone account with default simple type', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS)
    expect(result.ownerAddress).toBe(MOCK_OWNER_ADDRESS)
    expect(result.config.accountType).toBe('simple')
    expect(result.config.rhinestoneApiKey).toBe('test-rhinestone-key')
  })

  it('calls SDK without bundler for default warp infrastructure', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // Verify walletClientToAccount was called
    expect(walletClientToAccount).toHaveBeenCalledWith(mockWalletClient)

    // External wallets should NOT be wrapped with wrapParaAccount (Para v-byte adjustment)
    expect(wrapParaAccount).not.toHaveBeenCalled()

    // SDK always includes bundler when Pimlico key is available (needed for session UserOps)
    expect(RhinestoneSDK).toHaveBeenCalledWith({
      apiKey: 'test-rhinestone-key',
      bundler: {
        type: 'pimlico',
        apiKey: 'test-pimlico-key',
      },
    })

    // Verify createAccount was called with ECDSA owner and sessions enabled
    const mockSdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(mockSdk?.createAccount).toHaveBeenCalledWith({
      owners: {
        type: 'ecdsa',
        accounts: expect.any(Array),
      },
      experimental_sessions: { enabled: true },
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

  it('creates a Rhinestone account with HCA type and registers ownership', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
    })

    expect(result.config.accountType).toBe('hca')
    expect(registerHCAOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: MOCK_SMART_ACCOUNT_ADDRESS,
        eoaAddress: MOCK_OWNER_ADDRESS,
        signer: expect.objectContaining({
          type: 'rhinestone',
        }),
      }),
    )
  })

  it('does not register HCA ownership for simple account type', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'simple',
    })

    expect(registerHCAOwnership).not.toHaveBeenCalled()
  })

  it('respects explicit registerHCA=false for HCA account type', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
      registerHCA: false,
    })

    expect(registerHCAOwnership).not.toHaveBeenCalled()
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
      accountType: 'simple',
      bundlerUrl: undefined,
      paymasterUrl: undefined,
      sponsorshipPolicyId: undefined,
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
    ).rejects.toThrow('Pimlico API key not configured')
  })

  it('does not require Pimlico API key for warp infrastructure', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      infrastructure: 'warp',
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS)
  })

  it('throws error when HCA registration fails', async () => {
    vi.mocked(registerHCAOwnership).mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: {
        reason: 'tx-failed',
        details: 'Transaction reverted',
      },
    } as any)

    await expect(
      initializeRhinestoneAccount({
        walletClient: mockWalletClient,
        accountType: 'hca',
      }),
    ).rejects.toThrow('HCA registration failed')
  })
})
