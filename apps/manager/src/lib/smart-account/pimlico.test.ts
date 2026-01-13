/**
 * Pimlico Account Initialization Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')

vi.mock('viem', () => ({
  http: vi.fn(() => 'mock-transport'),
}))

vi.mock('viem/account-abstraction', () => ({
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
}))

vi.mock('@getpara/viem-v2-integration', () => ({
  createParaAccount: vi.fn().mockReturnValue({
    address: '0xParaAccountAddress1234567890123456789012345',
    signMessage: vi.fn(),
  }),
}))

vi.mock('permissionless', () => ({
  createSmartAccountClient: vi.fn().mockReturnValue({
    account: { address: '0xSmartAccountAddress123456789012345678901234' },
    sendUserOperation: vi.fn(),
  }),
}))

vi.mock('permissionless/accounts', () => ({
  toSimpleSmartAccount: vi.fn().mockResolvedValue({
    address: '0xSmartAccountAddress123456789012345678901234',
  }),
}))

vi.mock('permissionless/clients/pimlico', () => ({
  createPimlicoClient: vi.fn().mockReturnValue({
    getUserOperationGasPrice: vi.fn().mockResolvedValue({
      fast: { maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n },
    }),
  }),
}))

vi.mock('permissionless/utils', () => ({
  toOwner: vi.fn().mockResolvedValue({
    address: '0xOwnerAddress12345678901234567890123456789',
  }),
}))

vi.mock('@/lib/wagmi', () => ({
  customSepolia: { id: 11155111, name: 'Sepolia' },
  publicClient: { chain: { id: 11155111 } },
}))

vi.mock('./hca-registry', () => ({
  registerHCAOwnership: vi.fn().mockResolvedValue({
    isOk: () => true,
    isErr: () => false,
    value: { status: 'already_registered' },
  }),
}))

vi.mock('./utils', () => ({
  wrapParaAccount: vi.fn().mockReturnValue({
    address: '0xParaAccountAddress1234567890123456789012345',
    signMessage: vi.fn(),
  }),
}))

import { createParaAccount } from '@getpara/viem-v2-integration'
import { toOwner } from 'permissionless/utils'

import { registerHCAOwnership } from './hca-registry'
import { initializePimlicoAccount } from './pimlico'
import { wrapParaAccount } from './utils'

describe('initializePimlicoAccount', () => {
  const mockWalletClient = {
    account: {
      address: '0xOwnerAddress12345678901234567890123456789' as const,
    },
    signMessage: vi.fn(),
  } as any

  const mockParaClient = { isConnected: true } as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates account with external wallet', async () => {
    const result = await initializePimlicoAccount({
      walletSource: 'external-wallet',
      walletClient: mockWalletClient,
    })

    expect(result.address).toBe('0xSmartAccountAddress123456789012345678901234')
    expect(result.config.accountType).toBe('simple')
    expect(result.eoaAddress).toBe(
      '0xOwnerAddress12345678901234567890123456789',
    )
    expect(toOwner).toHaveBeenCalledWith({ owner: mockWalletClient })
  })

  it('creates account with Para embedded wallet', async () => {
    const result = await initializePimlicoAccount({
      walletSource: 'para-embedded',
      paraClient: mockParaClient,
    })

    expect(result.address).toBe('0xSmartAccountAddress123456789012345678901234')
    expect(createParaAccount).toHaveBeenCalledWith(mockParaClient)
    expect(wrapParaAccount).toHaveBeenCalled()
  })

  it('registers HCA ownership for HCA account type', async () => {
    await initializePimlicoAccount({
      walletSource: 'external-wallet',
      walletClient: mockWalletClient,
      accountType: 'hca',
    })

    expect(registerHCAOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: '0xSmartAccountAddress123456789012345678901234',
        eoaAddress: '0xOwnerAddress12345678901234567890123456789',
      }),
    )
  })

  it('does not register HCA for simple account type', async () => {
    await initializePimlicoAccount({
      walletSource: 'external-wallet',
      walletClient: mockWalletClient,
      accountType: 'simple',
    })

    expect(registerHCAOwnership).not.toHaveBeenCalled()
  })

  it('throws error when no valid wallet connection', async () => {
    await expect(
      initializePimlicoAccount({
        walletSource: 'external-wallet',
        // No walletClient provided
      }),
    ).rejects.toThrow('No valid wallet connection')
  })

  it('throws error when Pimlico API key is missing', async () => {
    vi.stubEnv('VITE_PIMLICO_API_KEY', '')

    await expect(
      initializePimlicoAccount({
        walletSource: 'external-wallet',
        walletClient: mockWalletClient,
      }),
    ).rejects.toThrow('Pimlico API key not configured')
  })

  it('throws error when HCA registration fails', async () => {
    vi.mocked(registerHCAOwnership).mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: { reason: 'failed', details: 'error' },
    } as any)

    await expect(
      initializePimlicoAccount({
        walletSource: 'external-wallet',
        walletClient: mockWalletClient,
        accountType: 'hca',
      }),
    ).rejects.toThrow('HCA registration failed')
  })
})
