/**
 * Rhinestone Account Initialization Tests
 *
 * Tests for the initializeRhinestoneAccount function.
 * Uses mocked SDK dependencies to avoid actual blockchain calls.
 */

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
    }),
  })),
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

// Mock utils
vi.mock('./utils', () => ({
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
    expect(result.config.accountType).toBe('simple')
    expect(result.config.rhinestoneApiKey).toBe('test-rhinestone-key')
  })

  it('calls SDK with correct parameters', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // Verify walletClientToAccount was called
    expect(walletClientToAccount).toHaveBeenCalledWith(mockWalletClient)

    // Verify wrapParaAccount was called with the account
    expect(wrapParaAccount).toHaveBeenCalled()

    // Verify RhinestoneSDK was initialized with correct config
    expect(RhinestoneSDK).toHaveBeenCalledWith({
      apiKey: 'test-rhinestone-key',
      bundler: {
        type: 'pimlico',
        apiKey: 'test-pimlico-key',
      },
    })

    // Verify createAccount was called with ECDSA owner
    const mockSdk = vi.mocked(RhinestoneSDK).mock.results[0].value
    expect(mockSdk.createAccount).toHaveBeenCalledWith({
      owners: {
        type: 'ecdsa',
        accounts: expect.any(Array),
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

  it('throws error when wallet client has no account', async () => {
    const walletClientNoAccount = {
      account: null,
    } as unknown as WalletClientParam

    await expect(
      initializeRhinestoneAccount({
        walletClient: walletClientNoAccount,
      }),
    ).rejects.toThrow('Wallet client must have an account address')
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

  it('throws error when Pimlico API key is missing', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    await expect(
      initializeRhinestoneAccount({
        walletClient: mockWalletClient,
      }),
    ).rejects.toThrow('Pimlico API key not configured')
  })

  it('throws error when HCA registration fails', async () => {
    vi.mocked(registerHCAOwnership).mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: {
        reason: 'registration_failed',
        details: 'Transaction reverted',
      },
      // biome-ignore lint/suspicious/noExplicitAny: Test mock type
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
