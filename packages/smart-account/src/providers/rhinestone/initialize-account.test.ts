/**
 * Tests for initializeRhinestoneAccount.
 *
 * Covers the package-level concerns: SDK option construction, deploy
 * vs. already-deployed paths, onAccountReady invocation, and the
 * onProgress/onError sequencing. App-side concerns (Para wrapping,
 * env-var resolution, toast wiring) are tested separately in
 * apps/manager/src/lib/smart-account/rhinestone.test.ts.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing

import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_SMART_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as const

// Mock the Rhinestone SDK module. The factory needs to be a function
// so vi.mocked() can later read .mock.results.
let mockIsDeployed = vi.fn().mockResolvedValue(true)
let mockSendTransaction = vi.fn().mockResolvedValue('mock-tx')

vi.mock('@rhinestone/sdk', () => ({
  RhinestoneSDK: vi.fn(function (this: any) {
    this.createAccount = vi.fn().mockResolvedValue({
      getAddress: () => MOCK_SMART_ACCOUNT_ADDRESS,
      isDeployed: mockIsDeployed,
      sendTransaction: mockSendTransaction,
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

describe('initializeRhinestoneAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDeployed = vi.fn().mockResolvedValue(true)
    mockSendTransaction = vi.fn().mockResolvedValue('mock-tx')
  })

  describe('SDK options', () => {
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

    it('passes the owner account into createAccount with sessions enabled', async () => {
      const account = makeOwnerAccount()
      await initializeRhinestoneAccount({
        ownerAccount: account,
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
      })

      const sdk = vi.mocked(RhinestoneSDK).mock.results[0]?.value
      expect(sdk.createAccount).toHaveBeenCalledWith({
        owners: { type: 'ecdsa', accounts: [account] },
        experimental_sessions: { enabled: true },
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
        }),
      ).rejects.toThrow('rhinestoneApiKey is required')
    })
  })

  describe('deploy path', () => {
    it('skips the bootstrap tx when SCA is already deployed', async () => {
      mockIsDeployed.mockResolvedValueOnce(true)

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
      })

      expect(mockSendTransaction).not.toHaveBeenCalled()
    })

    it('sends a noop bootstrap tx when SCA is not yet deployed', async () => {
      mockIsDeployed.mockResolvedValueOnce(false)

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
      })

      expect(mockSendTransaction).toHaveBeenCalledWith({
        chain: MOCK_CHAIN,
        calls: [
          {
            to: '0x0000000000000000000000000000000000000000',
            value: 0n,
            data: '0x',
          },
        ],
        sponsored: true,
      })
    })

    it('emits onProgress("deploying") then onProgress("ready") on a fresh deploy', async () => {
      mockIsDeployed.mockResolvedValueOnce(false)
      const onProgress = vi.fn()

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onProgress,
      })

      expect(onProgress).toHaveBeenNthCalledWith(1, 'deploying')
      expect(onProgress).toHaveBeenLastCalledWith('ready')
    })

    it('does not emit onProgress("deploying") when the SCA is already on-chain', async () => {
      mockIsDeployed.mockResolvedValueOnce(true)
      const onProgress = vi.fn()

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onProgress,
      })

      expect(onProgress).not.toHaveBeenCalledWith('deploying')
      expect(onProgress).toHaveBeenCalledWith('ready')
    })

    it('invokes onError("deploying", err) and rethrows when the bootstrap tx fails', async () => {
      mockIsDeployed.mockResolvedValueOnce(false)
      mockSendTransaction.mockRejectedValueOnce(new Error('boom'))
      const onError = vi.fn()

      await expect(
        initializeRhinestoneAccount({
          ownerAccount: makeOwnerAccount(),
          eoaAddress: MOCK_OWNER_ADDRESS,
          chain: MOCK_CHAIN,
          rhinestoneApiKey: 'test-api-key',
          onError,
        }),
      ).rejects.toThrow('boom')

      expect(onError).toHaveBeenCalledWith('deploying', expect.any(Error))
    })
  })

  describe('onAccountReady hook', () => {
    it('invokes onAccountReady after deploy with wasDeployedInThisCall=true', async () => {
      mockIsDeployed.mockResolvedValueOnce(false)
      const onAccountReady = vi.fn().mockResolvedValue(undefined)

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onAccountReady,
      })

      expect(onAccountReady).toHaveBeenCalledWith({
        rhinestoneAccount: expect.any(Object),
        accountAddress: MOCK_SMART_ACCOUNT_ADDRESS,
        wasDeployedInThisCall: true,
      })
    })

    it('invokes onAccountReady when SCA was already deployed with wasDeployedInThisCall=false', async () => {
      mockIsDeployed.mockResolvedValueOnce(true)
      const onAccountReady = vi.fn().mockResolvedValue(undefined)

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onAccountReady,
      })

      expect(onAccountReady).toHaveBeenCalledWith(
        expect.objectContaining({ wasDeployedInThisCall: false }),
      )
    })

    it('emits onProgress("registering") around onAccountReady', async () => {
      const onProgress = vi.fn()
      const onAccountReady = vi.fn().mockResolvedValue(undefined)

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onAccountReady,
        onProgress,
      })

      expect(onProgress).toHaveBeenCalledWith('registering')
    })

    it('does not emit onProgress("registering") when onAccountReady is not provided', async () => {
      const onProgress = vi.fn()

      await initializeRhinestoneAccount({
        ownerAccount: makeOwnerAccount(),
        eoaAddress: MOCK_OWNER_ADDRESS,
        chain: MOCK_CHAIN,
        rhinestoneApiKey: 'test-api-key',
        onProgress,
      })

      expect(onProgress).not.toHaveBeenCalledWith('registering')
    })

    it('invokes onError("registering", err) and rethrows when onAccountReady throws', async () => {
      const onError = vi.fn()
      const onAccountReady = vi.fn().mockRejectedValue(new Error('hca-failed'))

      await expect(
        initializeRhinestoneAccount({
          ownerAccount: makeOwnerAccount(),
          eoaAddress: MOCK_OWNER_ADDRESS,
          chain: MOCK_CHAIN,
          rhinestoneApiKey: 'test-api-key',
          onAccountReady,
          onError,
        }),
      ).rejects.toThrow('hca-failed')

      expect(onError).toHaveBeenCalledWith('registering', expect.any(Error))
    })
  })

  describe('result shape', () => {
    it('returns the SCA address, EOA, and config', async () => {
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
  })
})
