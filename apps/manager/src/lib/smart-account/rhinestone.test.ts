/**
 * Rhinestone HCA Account Initialization Tests (manager wrapper)
 *
 * Tests the manager-side `initializeRhinestoneAccount` wrapper: owner
 * resolution from the connected external wallet, env-derived SDK options
 * (Warp-only, no ERC-4337 bundler), and the HCA + ENS-owner createAccount
 * shape. The `@rhinestone/sdk` is mocked; the `@ens-apps/smart-account`
 * package runs for real against the mocked SDK.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { i18n } from '@lingui/core'
import { maxUint48 } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up environment before any imports
vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')

const { MOCK_OWNER_ADDRESS, MOCK_SMART_ACCOUNT_ADDRESS } = vi.hoisted(() => ({
  MOCK_OWNER_ADDRESS: '0x2222222222222222222222222222222222222222' as const,
  MOCK_SMART_ACCOUNT_ADDRESS:
    '0x1111111111111111111111111111111111111111' as const,
}))

// Hoisted JWT-auth callback stubs so the JWT-mode test can assert the SDK was
// constructed with these exact callbacks.
const { MOCK_ACCESS_TOKEN_FN, MOCK_EXTENSION_TOKEN_FN } = vi.hoisted(() => ({
  MOCK_ACCESS_TOKEN_FN: vi.fn(),
  MOCK_EXTENSION_TOKEN_FN: vi.fn(),
}))

// The manager wrapper builds JWT-auth callbacks via this module when the
// experimental_jwt flag is on. Mock it so we don't reach the real backend.
vi.mock('./sponsorship-jwt', () => ({
  createJwtAuthCallbacks: vi.fn(() => ({
    accessToken: MOCK_ACCESS_TOKEN_FN,
    getIntentExtensionToken: MOCK_EXTENSION_TOKEN_FN,
  })),
}))

// Mock the Rhinestone SDK. We surface the `RhinestoneSDK` class (used by
// the package's `initializeRhinestoneAccount`) plus the
// `walletClientToAccount` helper (used by the manager-side wrapper to
// build the owner account).
vi.mock(import('@rhinestone/sdk'), () => ({
  RhinestoneSDK: vi.fn(function (this: any) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => MOCK_SMART_ACCOUNT_ADDRESS,
      isDeployed: vi.fn().mockResolvedValue(true),
      getInitData: () => ({
        factory: '0x358680728dedb552adaa9f5eb5d4395b291cf943' as const,
        factoryData: '0xdeadbeef' as const,
      }),
      prepareTransaction: vi.fn().mockResolvedValue({ prepared: true }),
      signTransaction: vi.fn().mockResolvedValue({ signed: true }),
      submitTransaction: vi.fn().mockResolvedValue({ submitted: true }),
      waitForExecution: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
    })

    return this
  }),
  walletClientToAccount: vi.fn().mockReturnValue({
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
}))

import { RhinestoneSDK, walletClientToAccount } from '@rhinestone/sdk'
import {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'

type WalletClientParam = Parameters<
  typeof initializeRhinestoneAccount
>[0]['walletClient']

describe('initializeRhinestoneAccount (HCA)', () => {
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
    // JWT is now the default path, so the API-key baseline tests must opt OUT
    // explicitly by setting the flag to 'false'. The default-on case is covered
    // by its own test (flag unset).
    vi.stubEnv('VITE_FF_EXPERIMENTAL_JWT', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a Rhinestone HCA account with an ENS owner', async () => {
    const result = await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    expect(result.client).toBeDefined()
    expect(result.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS)
    expect(result.ownerAddress).toBe(MOCK_OWNER_ADDRESS)
    expect(result.config.rhinestoneApiKey).toBe('test-rhinestone-key')

    const mockSdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
    expect(mockSdk?.createAccount).toHaveBeenCalledWith({
      account: { type: 'hca' },
      owners: {
        type: 'ens',
        accounts: expect.any(Array),
        ownerExpirations: [Number(maxUint48)],
      },
    })
  })

  it('configures the SDK without an ERC-4337 bundler (Warp only)', async () => {
    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // External wallets are converted via walletClientToAccount.
    expect(walletClientToAccount).toHaveBeenCalledWith(mockWalletClient)

    // Warp-only: the SDK is constructed with just the API key — no bundler.
    expect(RhinestoneSDK).toHaveBeenCalledWith({
      apiKey: 'test-rhinestone-key',
    })
  })

  it('builds the SDK in JWT mode when VITE_FF_EXPERIMENTAL_JWT is true', async () => {
    vi.stubEnv('VITE_FF_EXPERIMENTAL_JWT', 'true')

    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // JWT mode swaps the static API key for the experimental_jwt auth
    // callbacks — the SDK must be constructed with the token callbacks and
    // never a raw `apiKey`.
    expect(RhinestoneSDK).toHaveBeenCalledWith({
      auth: {
        mode: 'experimental_jwt',
        accessToken: MOCK_ACCESS_TOKEN_FN,
        getIntentExtensionToken: MOCK_EXTENSION_TOKEN_FN,
      },
    })
  })

  it('builds the SDK in JWT mode by default when the flag is unset', async () => {
    vi.stubEnv('VITE_FF_EXPERIMENTAL_JWT', undefined as unknown as string)

    await initializeRhinestoneAccount({
      walletClient: mockWalletClient,
    })

    // JWT is the default sponsorship path — an unset flag still builds the SDK
    // with the experimental_jwt auth callbacks, not a raw API key.
    expect(RhinestoneSDK).toHaveBeenCalledWith({
      auth: {
        mode: 'experimental_jwt',
        accessToken: MOCK_ACCESS_TOKEN_FN,
        getIntentExtensionToken: MOCK_EXTENSION_TOKEN_FN,
      },
    })
  })

  it('throws error when no walletClient is provided', async () => {
    await expect(initializeRhinestoneAccount({})).rejects.toThrow(
      'A walletClient must be provided',
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
    ).rejects.toThrow('A walletClient must be provided')
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
})
