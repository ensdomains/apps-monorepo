/**
 * Tests for initializeRhinestoneAccount.
 *
 * Covers the package-level concerns: SDK option construction, the
 * `onPrepareDeploy` contract, and `onProgress`/`onError` sequencing.
 * App-side concerns (Para wrapping, env-var resolution, toast wiring)
 * are tested separately in
 * apps/manager/src/lib/smart-account/rhinestone.test.ts.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing

import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_SMART_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as const

// Mock the Rhinestone SDK module. The factory needs to be a function
// so vi.mocked() can later read .mock.results.
vi.mock('@rhinestone/sdk', () => ({
  RhinestoneSDK: vi.fn(function (this: any) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => MOCK_SMART_ACCOUNT_ADDRESS,
    })
    return this
  }),
}))

import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Account, Address, Chain } from 'viem'
import { initializeRhinestoneAccount } from './initialize-account'

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

/**
 * Default `onPrepareDeploy` that reports a fresh deploy at the SDK
 * mock's bound address. Override per-test for the
 * "already deployed" / "hook threw" cases.
 */
function makeOnPrepareDeploy(opts: { wasDeployedInThisCall?: boolean } = {}) {
  return vi.fn().mockResolvedValue({
    hcaAddress: MOCK_SMART_ACCOUNT_ADDRESS,
    wasDeployedInThisCall: opts.wasDeployedInThisCall ?? true,
  })
}

describe('initializeRhinestoneAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('SDK options', () => {
    it('passes the api key', async () => {
      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
      })

      expect(RhinestoneSDK).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-api-key' }),
      )
    })

    it('includes the Pimlico bundler when pimlicoApiKey is provided', async () => {
      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        pimlicoApiKey: 'test-pim-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
      })

      expect(RhinestoneSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          bundler: { type: 'pimlico', apiKey: 'test-pim-key' },
        }),
      )
    })

    it('omits the bundler when pimlicoApiKey is not provided', async () => {
      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
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
        onPrepareDeploy: makeOnPrepareDeploy(),
      })

      expect(RhinestoneSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: 'http://localhost:3007',
          customRpcUrls: { 11155111: 'http://localhost:8545' },
        }),
      )
    })

    it('binds the SDK to onPrepareDeploy.hcaAddress via initData', async () => {
      const account = makeOwnerAccount()
      await initializeRhinestoneAccount({
        ownerAccount: account,
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
      })

      const sdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
      expect(sdk.createAccount).toHaveBeenCalledWith({
        owners: { type: 'ecdsa', accounts: [account] },
        experimental_sessions: { enabled: true },
        initData: { address: MOCK_SMART_ACCOUNT_ADDRESS },
      })
    })
  })

  describe('validation', () => {
    it('throws when rhinestoneApiKey is empty', async () => {
      await expect(
        initializeRhinestoneAccount({
          ownerAccount: makeOwnerAccount(),
          eoaAddress: MOCK_OWNER_ADDRESS,
          chain: MOCK_CHAIN,
          rhinestoneApiKey: '',
          onPrepareDeploy: makeOnPrepareDeploy(),
        }),
      ).rejects.toThrow('rhinestoneApiKey is required')
    })

    it('throws when infrastructure === "pimlico" but pimlicoApiKey is missing', async () => {
      await expect(
        initializeRhinestoneAccount({
          ownerAccount: makeOwnerAccount(),
          eoaAddress: MOCK_OWNER_ADDRESS,
          chain: MOCK_CHAIN,
          rhinestoneApiKey: 'test-api-key',
          infrastructure: 'pimlico',
          onPrepareDeploy: makeOnPrepareDeploy(),
        }),
      ).rejects.toThrow(/pimlicoApiKey is required/)
    })

    it('does not require pimlicoApiKey for the default (warp) infrastructure', async () => {
      const result = await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
      })

      expect(result.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS)
    })
  })

  describe('onPrepareDeploy', () => {
    it('emits onProgress("deploying") before onPrepareDeploy and onProgress("ready") after', async () => {
      const onProgress = vi.fn()
      const onPrepareDeploy = vi.fn().mockResolvedValue({
        hcaAddress: MOCK_SMART_ACCOUNT_ADDRESS,
        wasDeployedInThisCall: true,
      })

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy,
        onProgress,
      })

      expect(onProgress).toHaveBeenNthCalledWith(1, 'deploying')
      expect(onProgress).toHaveBeenLastCalledWith('ready')
    })

    it('still emits "deploying" when onPrepareDeploy reports a cached account', async () => {
      // The hook is the source of truth for whether work was done; we
      // emit the progress stage regardless so toasts have a chance to
      // render even on the fast path. The `wasDeployedInThisCall: false`
      // value is forwarded to the caller via the hook's own return, not
      // through this progress channel.
      const onProgress = vi.fn()
      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onProgress,
        onPrepareDeploy: makeOnPrepareDeploy({ wasDeployedInThisCall: false }),
      })

      expect(onProgress).toHaveBeenCalledWith('deploying')
      expect(onProgress).toHaveBeenCalledWith('ready')
    })

    it('invokes onError("deploying", err) and rethrows when onPrepareDeploy throws', async () => {
      const onError = vi.fn()
      const onPrepareDeploy = vi.fn().mockRejectedValue(new Error('boom'))

      await expect(
        initializeRhinestoneAccount({
          ownerAccount: makeOwnerAccount(),
          eoaAddress: MOCK_OWNER_ADDRESS,
          chain: MOCK_CHAIN,
          rhinestoneApiKey: 'test-api-key',
          onPrepareDeploy,
          onError,
        }),
      ).rejects.toThrow('boom')

      expect(onError).toHaveBeenCalledWith('deploying', expect.any(Error))
    })
  })

  describe('result shape', () => {
    it('returns the SCA address, EOA, and config', async () => {
      const result = await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onPrepareDeploy: makeOnPrepareDeploy(),
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
  })
})
