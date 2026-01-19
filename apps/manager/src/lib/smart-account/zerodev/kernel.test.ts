/**
 * ZeroDev Account Initialization Tests
 *
 * Tests for the initializeZeroDevAccount function.
 * Uses mocked SDK dependencies to avoid actual blockchain calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up environment before any imports
vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-api-key')

// Mock viem first to avoid import issues
vi.mock('viem', () => ({
  http: vi.fn(() => 'mock-transport'),
}))

vi.mock('viem/account-abstraction', () => ({
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
}))

// Mock ZeroDev SDK - using inline values to avoid hoisting issues
vi.mock('@zerodev/ecdsa-validator', () => ({
  signerToEcdsaValidator: vi.fn().mockResolvedValue({
    type: 'ECDSAValidator',
    address: '0x1234567890123456789012345678901234567890',
  }),
}))

vi.mock('@zerodev/sdk', () => ({
  createKernelAccount: vi.fn().mockResolvedValue({
    address: '0xSmartAccountAddress123456789012345678901234',
  }),
  createKernelAccountClient: vi.fn().mockReturnValue({
    account: {
      address: '0xSmartAccountAddress123456789012345678901234',
    },
    sendUserOperation: vi.fn(),
  }),
  toSigner: vi.fn().mockResolvedValue({
    address: '0xOwnerAddress12345678901234567890123456789',
    signMessage: vi.fn(),
  }),
}))

vi.mock('@zerodev/sdk/constants', () => ({
  KERNEL_V3_1: '3.1',
}))

vi.mock('permissionless/clients/pimlico', () => ({
  createPimlicoClient: vi.fn().mockReturnValue({
    getUserOperationGasPrice: vi.fn().mockResolvedValue({
      fast: { maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n },
    }),
  }),
}))

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

vi.mock('../hca-registry', () => ({
  registerHCAOwnership: vi.fn().mockResolvedValue({
    isOk: () => true,
    isErr: () => false,
    value: { status: 'already_registered' },
  }),
}))

import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import {
  createKernelAccount,
  createKernelAccountClient,
  toSigner,
} from '@zerodev/sdk'

import { registerHCAOwnership } from '../hca-registry'
import { initializeZeroDevAccount, type ZeroDevConfig } from './kernel'

type WalletClientParam = Parameters<
  typeof initializeZeroDevAccount
>[0]['walletClient']

describe('initializeZeroDevAccount', () => {
  const mockWalletClient = {
    account: {
      address: '0xOwnerAddress12345678901234567890123456789' as `0x${string}`,
    },
    signMessage: vi.fn(),
  } as unknown as WalletClientParam

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-api-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a ZeroDev account with default simple type', async () => {
    const result = await initializeZeroDevAccount({
      walletClient: mockWalletClient,
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe('0xSmartAccountAddress123456789012345678901234')
    expect(result.config.accountType).toBe('simple')
    expect(result.config.kernelVersion).toBe('3.1')
    expect(result.ecdsaValidator).toBeDefined()
  })

  it('calls SDK functions with correct parameters', async () => {
    await initializeZeroDevAccount({
      walletClient: mockWalletClient,
    })

    // Verify toSigner was called with wallet client
    expect(toSigner).toHaveBeenCalledWith({ signer: mockWalletClient })

    // Verify ECDSA validator was created
    expect(signerToEcdsaValidator).toHaveBeenCalledWith(
      expect.anything(), // publicClient
      expect.objectContaining({
        entryPoint: expect.objectContaining({
          version: '0.7',
        }),
        kernelVersion: '3.1',
      }),
    )

    // Verify kernel account was created
    expect(createKernelAccount).toHaveBeenCalledWith(
      expect.anything(), // publicClient
      expect.objectContaining({
        kernelVersion: '3.1',
        plugins: expect.objectContaining({
          sudo: expect.objectContaining({
            type: 'ECDSAValidator',
          }),
        }),
      }),
    )

    // Verify client was created
    expect(createKernelAccountClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          address: '0xSmartAccountAddress123456789012345678901234',
        }),
        chain: expect.objectContaining({ id: 11155111 }),
      }),
    )
  })

  it('creates a ZeroDev account with HCA type and registers ownership', async () => {
    const result = await initializeZeroDevAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
    })

    expect(result.config.accountType).toBe('hca')
    expect(registerHCAOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: '0xSmartAccountAddress123456789012345678901234',
        eoaAddress: '0xOwnerAddress12345678901234567890123456789',
      }),
    )
  })

  it('does not register HCA ownership for simple account type', async () => {
    await initializeZeroDevAccount({
      walletClient: mockWalletClient,
      accountType: 'simple',
    })

    expect(registerHCAOwnership).not.toHaveBeenCalled()
  })

  it('throws error when wallet client has no account', async () => {
    const walletClientNoAccount = {
      account: null,
    } as unknown as WalletClientParam

    await expect(
      initializeZeroDevAccount({
        walletClient: walletClientNoAccount,
      }),
    ).rejects.toThrow('Wallet client must have an account')
  })

  it('returns correct config shape', async () => {
    const result = await initializeZeroDevAccount({
      walletClient: mockWalletClient,
    })

    const config: ZeroDevConfig = result.config

    expect(config).toEqual({
      chain: expect.objectContaining({ id: 11155111 }),
      accountType: 'simple',
      kernelVersion: '3.1',
      pimlicoApiKey: 'test-api-key',
    })
  })

  it('throws error when Pimlico API key is missing', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    await expect(
      initializeZeroDevAccount({
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
      initializeZeroDevAccount({
        walletClient: mockWalletClient,
        accountType: 'hca',
      }),
    ).rejects.toThrow('HCA registration failed')
  })
})
