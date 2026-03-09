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

// Mock RhinestoneSDK
vi.mock('@rhinestone/sdk', () => ({
  RhinestoneSDK: vi.fn().mockImplementation(() => ({
    createAccount: vi.fn().mockResolvedValue({
      getAddress: () =>
        '0xSmartAccountAddress123456789012345678901234' as const,
      isDeployed: vi.fn().mockResolvedValue(true),
      deploy: vi.fn().mockResolvedValue(true),
    }),
  })),
  walletClientToAccount: vi.fn().mockReturnValue({
    address: '0xOwnerAddress12345678901234567890123456789' as const,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
  wrapParaAccount: vi.fn().mockReturnValue({
    address: '0xOwnerAddress12345678901234567890123456789' as const,
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
    readContract: vi.fn(),
  },
}))

// Mock HCA registry
vi.mock('./hca-registry', () => ({
  registerHCAOwnership: vi.fn().mockResolvedValue({
    isOk: () => true,
    isErr: () => false,
    value: { status: 'already_registered' },
  }),
}))

// Mock Para viem integration
vi.mock('@getpara/viem-v2-integration', () => ({
  createParaAccount: vi.fn().mockReturnValue({
    address: '0xParaAddress123456789012345678901234567890' as const,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
}))

import {
  RhinestoneSDK,
  walletClientToAccount,
  wrapParaAccount,
} from '@rhinestone/sdk'

import { registerHCAOwnership } from './hca-registry'
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
      address: '0xOwnerAddress12345678901234567890123456789' as `0x${string}`,
    },
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as WalletClientParam

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
    vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a Rhinestone account with default simple type', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe('0xSmartAccountAddress123456789012345678901234')
    expect(result.ownerAddress).toBe(
      '0xOwnerAddress12345678901234567890123456789',
    )
    expect(result.config.accountType).toBe('simple')
    expect(result.config.rhinestoneApiKey).toBe('test-rhinestone-key')
  })

  it('calls SDK without bundler for default warp infrastructure', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // Verify walletClientToAccount was called
    expect(walletClientToAccount).toHaveBeenCalledWith(mockWalletClient)

    // Verify wrapParaAccount was called with the account
    expect(wrapParaAccount).toHaveBeenCalled()

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
        smartAccountAddress: '0xSmartAccountAddress123456789012345678901234',
        eoaAddress: '0xOwnerAddress12345678901234567890123456789',
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
    expect(result.address).toBe('0xSmartAccountAddress123456789012345678901234')
  })

  it('throws error when HCA registration fails', async () => {
    vi.mocked(registerHCAOwnership).mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: {
        reason: 'registration_failed',
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

  it('passes rhinestone signer config to HCA registration', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
    })

    expect(registerHCAOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        signer: {
          type: 'rhinestone',
          account: expect.any(Object),
          config: expect.objectContaining({
            chain: expect.objectContaining({ id: 11155111 }),
            accountAddress: '0xSmartAccountAddress123456789012345678901234',
            rhinestoneApiKey: 'test-rhinestone-key',
          }),
        },
      }),
    )
  })
})
