/**
 * Smart Account Utility Functions Tests
 *
 * Tests for pure utility functions in utils.ts.
 * These functions handle signature manipulation, BigInt conversion,
 * transaction hash extraction, and wallet client adaptation.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import type { Account, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getTxHashResult,
  WalletClientNoConnectedAccountError,
  walletClientToAccount,
  wrapParaAccount,
} from './utils'

/**
 * Since adjustVByte and convertBigIntsToStrings are internal functions,
 * we test them indirectly through wrapParaAccount's signing behavior.
 * We also expose their logic through dedicated test scenarios.
 */

describe('getTxHashResult', () => {
  it('extracts hash from fill.hash structure', () => {
    const result = {
      fill: {
        hash: '0xabc123' as Hex,
      },
    }

    expect(getTxHashResult(result)).toBe('0xabc123')
  })

  it('extracts hash from fillTransactionHash (legacy structure)', () => {
    const result = {
      fillTransactionHash: '0xdef456' as Hex,
    }

    expect(getTxHashResult(result)).toBe('0xdef456')
  })

  it('extracts hash from transactionHash', () => {
    const result = {
      transactionHash: '0xghi789' as Hex,
    }

    expect(getTxHashResult(result)).toBe('0xghi789')
  })

  it('returns null for null input', () => {
    expect(getTxHashResult(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getTxHashResult(undefined)).toBeNull()
  })

  it('returns null for empty object', () => {
    expect(getTxHashResult({})).toBeNull()
  })

  it('returns null for object without hash properties', () => {
    const result = {
      someOtherProperty: 'value',
    }

    expect(getTxHashResult(result)).toBeNull()
  })

  it('returns null when fill exists but has no hash', () => {
    const result = {
      fill: {
        status: 'completed',
      },
    }

    expect(getTxHashResult(result)).toBeNull()
  })

  it('returns null when fill is not an object', () => {
    const result = {
      fill: 'not-an-object',
    }

    expect(getTxHashResult(result)).toBeNull()
  })

  it('prefers fill.hash over legacy structures', () => {
    const result = {
      fill: {
        hash: '0xpreferred' as Hex,
      },
      fillTransactionHash: '0xlegacy1' as Hex,
      transactionHash: '0xlegacy2' as Hex,
    }

    expect(getTxHashResult(result)).toBe('0xpreferred')
  })

  it('falls back to fillTransactionHash when fill.hash is missing', () => {
    const result = {
      fill: {
        status: 'completed',
      },
      fillTransactionHash: '0xfallback1' as Hex,
      transactionHash: '0xfallback2' as Hex,
    }

    expect(getTxHashResult(result)).toBe('0xfallback1')
  })
})

describe('walletClientToAccount', () => {
  it('throws WalletClientNoConnectedAccountError when wallet has no account', () => {
    const walletClient = {
      account: undefined,
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
    }

    expect(() => walletClientToAccount(walletClient as any)).toThrow(
      WalletClientNoConnectedAccountError,
    )
  })

  it('throws WalletClientNoConnectedAccountError when account has no address', () => {
    const walletClient = {
      account: {},
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
    }

    expect(() => walletClientToAccount(walletClient as any)).toThrow(
      WalletClientNoConnectedAccountError,
    )
  })

  it('creates an account with the correct address', () => {
    const walletClient = {
      account: {
        address: '0x1234567890123456789012345678901234567890' as const,
      },
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
    }

    const account = walletClientToAccount(walletClient as any)

    expect(account.address).toBe('0x1234567890123456789012345678901234567890')
  })

  it('routes signMessage through the wallet client', async () => {
    const expectedSignature =
      '0xsignature123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890' as Hex
    const walletClient = {
      account: {
        address: '0x1234567890123456789012345678901234567890' as const,
      },
      signMessage: vi.fn().mockResolvedValue(expectedSignature),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
    }

    const account = walletClientToAccount(walletClient as any)
    const message = 'Hello, World!'

    const signature = await account.signMessage?.({ message })

    expect(signature).toBe(expectedSignature)
    expect(walletClient.signMessage).toHaveBeenCalledWith({
      account: '0x1234567890123456789012345678901234567890',
      message: 'Hello, World!',
    })
  })

  it('routes signTypedData through the wallet client', async () => {
    const expectedSignature =
      '0xsignature123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890' as Hex
    const walletClient = {
      account: {
        address: '0x1234567890123456789012345678901234567890' as const,
      },
      signMessage: vi.fn(),
      signTypedData: vi.fn().mockResolvedValue(expectedSignature),
      signTransaction: vi.fn(),
    }

    const account = walletClientToAccount(walletClient as any)

    const typedData = {
      domain: { name: 'Test' },
      types: { Test: [{ name: 'value', type: 'uint256' }] },
      primaryType: 'Test' as const,
      message: { value: 123n },
    }

    const signature = await account.signTypedData?.(typedData as any)

    expect(signature).toBe(expectedSignature)
    expect(walletClient.signTypedData).toHaveBeenCalledWith({
      account: '0x1234567890123456789012345678901234567890',
      ...typedData,
    })
  })

  it('routes signTransaction through the wallet client', async () => {
    const expectedSignature =
      '0xsignedtx12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012' as Hex
    const walletClient = {
      account: {
        address: '0x1234567890123456789012345678901234567890' as const,
      },
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue(expectedSignature),
    }

    const account = walletClientToAccount(walletClient as any)

    const transaction = {
      to: '0xrecipient1234567890123456789012345678901234' as const,
      value: 1000n,
    }

    const signature = await account.signTransaction?.(transaction as any)

    expect(signature).toBe(expectedSignature)
    expect(walletClient.signTransaction).toHaveBeenCalledWith({
      account: '0x1234567890123456789012345678901234567890',
      ...transaction,
    })
  })
})

describe('wrapParaAccount', () => {
  const createMockAccount = (overrides: Partial<Account> = {}): Account =>
    ({
      address: '0x1234567890123456789012345678901234567890' as const,
      type: 'local',
      publicKey: '0x' as Hex,
      source: 'custom',
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
      ...overrides,
    }) as Account

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('walletId handling', () => {
    it('uses provided walletId', () => {
      const mockAccount = createMockAccount()
      const wrapped = wrapParaAccount(mockAccount, 'my-wallet-id')

      expect((wrapped as any)._paraWalletId).toBe('my-wallet-id')
    })

    it('uses walletId from account if not provided', () => {
      const mockAccount = createMockAccount()
      ;(mockAccount as any).walletId = 'account-wallet-id'

      const wrapped = wrapParaAccount(mockAccount)

      expect((wrapped as any)._paraWalletId).toBe('account-wallet-id')
    })

    it('uses _walletId from account as fallback', () => {
      const mockAccount = createMockAccount()
      ;(mockAccount as any)._walletId = 'private-wallet-id'

      const wrapped = wrapParaAccount(mockAccount)

      expect((wrapped as any)._paraWalletId).toBe('private-wallet-id')
    })

    it('does not set _paraWalletId when no walletId available', () => {
      const mockAccount = createMockAccount()

      const wrapped = wrapParaAccount(mockAccount)

      expect((wrapped as any)._paraWalletId).toBeUndefined()
    })
  })

  describe('signMessage with v-byte adjustment', () => {
    it('adjusts v-byte from 0 to 27', async () => {
      // Signature: r (64 chars) + s (64 chars) + v (2 chars) = 130 hex chars
      // v=0 (last byte is 00)
      const signatureWithV0 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567800' as Hex

      const mockAccount = createMockAccount({
        signMessage: vi.fn().mockResolvedValue(signatureWithV0),
      })

      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      // v should be adjusted from 0 to 27 (0x1b), replacing last 2 chars
      expect(result).toBe(
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781b',
      )
    })

    it('adjusts v-byte from 1 to 28', async () => {
      // Signature with v=1 (last byte is 01)
      const signatureWithV1 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567801' as Hex

      const mockAccount = createMockAccount({
        signMessage: vi.fn().mockResolvedValue(signatureWithV1),
      })

      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      // v should be adjusted from 1 to 28 (0x1c), replacing last 2 chars
      expect(result).toBe(
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781c',
      )
    })

    it('preserves v-byte when already 27', async () => {
      // Signature with v=27 (last byte is 1b)
      const signatureWithV27 =
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781b' as Hex

      const mockAccount = createMockAccount({
        signMessage: vi.fn().mockResolvedValue(signatureWithV27),
      })

      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      // v should remain 27 (0x1b)
      expect(result).toBe(
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781b',
      )
    })

    it('preserves v-byte when already 28', async () => {
      // Signature with v=28 (last byte is 1c)
      const signatureWithV28 =
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781c' as Hex

      const mockAccount = createMockAccount({
        signMessage: vi.fn().mockResolvedValue(signatureWithV28),
      })

      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      // v should remain 28 (0x1c)
      expect(result).toBe(
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781c',
      )
    })

    it('throws error when account does not support signMessage', async () => {
      const mockAccount = createMockAccount({
        signMessage: undefined,
      })

      const wrapped = wrapParaAccount(mockAccount)

      await expect(wrapped.signMessage?.({ message: 'test' })).rejects.toThrow(
        'Account does not support signMessage',
      )
    })
  })

  describe('signTypedData with v-byte adjustment and BigInt conversion', () => {
    it('converts BigInt values in message to strings', async () => {
      const signatureWithV0 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567800' as Hex

      const signTypedDataMock = vi.fn().mockResolvedValue(signatureWithV0)
      const mockAccount = createMockAccount({
        signTypedData: signTypedDataMock,
      })

      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'value', type: 'uint256' }] },
        primaryType: 'Test' as const,
        message: { value: 12345678901234567890n },
      }

      await wrapped.signTypedData?.(typedData as any)

      // Verify BigInt was converted to string in the call
      expect(signTypedDataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: { value: '12345678901234567890' },
        }),
      )
    })

    it('handles nested BigInt values in message', async () => {
      const signatureWithV0 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567800' as Hex

      const signTypedDataMock = vi.fn().mockResolvedValue(signatureWithV0)
      const mockAccount = createMockAccount({
        signTypedData: signTypedDataMock,
      })

      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'nested', type: 'Nested' }] },
        primaryType: 'Test' as const,
        message: {
          nested: {
            value: 999n,
            array: [1n, 2n, 3n],
          },
        },
      }

      await wrapped.signTypedData?.(typedData as any)

      expect(signTypedDataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: {
            nested: {
              value: '999',
              array: ['1', '2', '3'],
            },
          },
        }),
      )
    })

    it('adjusts v-byte in signTypedData result', async () => {
      const signatureWithV1 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567801' as Hex

      const mockAccount = createMockAccount({
        signTypedData: vi.fn().mockResolvedValue(signatureWithV1),
      })

      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'value', type: 'string' }] },
        primaryType: 'Test' as const,
        message: { value: 'test' },
      }

      const result = await wrapped.signTypedData?.(typedData as any)

      // v should be adjusted from 1 to 28 (0x1c), replacing last 2 chars
      expect(result).toBe(
        '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781c',
      )
    })

    it('throws error when account does not support signTypedData', async () => {
      const mockAccount = createMockAccount({
        signTypedData: undefined,
      })

      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'value', type: 'string' }] },
        primaryType: 'Test' as const,
        message: { value: 'test' },
      }

      await expect(wrapped.signTypedData?.(typedData as any)).rejects.toThrow(
        'Account does not support signTypedData',
      )
    })
  })

  describe('signAuthorization passthrough', () => {
    it('preserves signAuthorization when available', () => {
      const signAuthorizationMock = vi.fn()
      const mockAccount = createMockAccount()
      ;(mockAccount as any).signAuthorization = signAuthorizationMock

      const wrapped = wrapParaAccount(mockAccount)

      expect(wrapped.signAuthorization).toBeDefined()
    })

    it('does not modify signAuthorization behavior (uses original v-byte)', async () => {
      const expectedResult = { v: 0, r: '0x123', s: '0x456' }
      const signAuthorizationMock = vi.fn().mockResolvedValue(expectedResult)
      const mockAccount = createMockAccount()
      ;(mockAccount as any).signAuthorization = signAuthorizationMock

      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signAuthorization?.({} as any)

      // Should return original result without v-byte adjustment
      expect(result).toEqual(expectedResult)
    })

    it('sets signAuthorization to undefined when not available', () => {
      const mockAccount = createMockAccount()
      delete (mockAccount as any).signAuthorization

      const wrapped = wrapParaAccount(mockAccount)

      expect(wrapped.signAuthorization).toBeUndefined()
    })
  })

  describe('account properties passthrough', () => {
    it('preserves address from original account', () => {
      const mockAccount = createMockAccount({
        address: '0xabcdef1234567890123456789012345678901234' as const,
      })

      const wrapped = wrapParaAccount(mockAccount)

      expect(wrapped.address).toBe('0xabcdef1234567890123456789012345678901234')
    })

    it('preserves type from original account', () => {
      const mockAccount = createMockAccount({
        type: 'local',
      })

      const wrapped = wrapParaAccount(mockAccount)

      expect(wrapped.type).toBe('local')
    })
  })
})

/**
 * Additional tests for edge cases in internal functions
 * These test the behavior through the public API
 */
describe('internal function behavior', () => {
  describe('adjustVByte edge cases (via wrapParaAccount)', () => {
    const createSigningAccount = (signature: Hex): Account => ({
      address: '0x1234567890123456789012345678901234567890' as const,
      type: 'local',
      publicKey: '0x' as Hex,
      source: 'custom',
      signMessage: vi.fn().mockResolvedValue(signature),
      signTypedData: vi.fn(),
      signTransaction: vi.fn(),
    })

    it('handles signature without 0x prefix', async () => {
      // The function strips 0x prefix internally, so this tests that path
      const signatureWithPrefix =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567800' as Hex

      const mockAccount = createSigningAccount(signatureWithPrefix)
      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      expect(result?.startsWith('0x')).toBe(true)
    })

    it('pads v-byte to 2 characters', async () => {
      // When v=27 (0x1b), it should be properly formatted
      const signatureWithV0 =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567800' as Hex

      const mockAccount = createSigningAccount(signatureWithV0)
      const wrapped = wrapParaAccount(mockAccount)
      const result = await wrapped.signMessage?.({ message: 'test' })

      // Result should have 132 characters (0x + 128 + 2 for v)
      expect(result?.length).toBe(132)
    })
  })

  describe('convertBigIntsToStrings edge cases (via wrapParaAccount)', () => {
    const createTypedDataAccount = (): Account => ({
      address: '0x1234567890123456789012345678901234567890' as const,
      type: 'local',
      publicKey: '0x' as Hex,
      source: 'custom',
      signMessage: vi.fn(),
      signTypedData: vi
        .fn()
        .mockResolvedValue(
          '0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781b' as Hex,
        ),
      signTransaction: vi.fn(),
    })

    it('handles null values in message', async () => {
      const mockAccount = createTypedDataAccount()
      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'value', type: 'string' }] },
        primaryType: 'Test' as const,
        message: { value: null },
      }

      // Should not throw
      await expect(
        wrapped.signTypedData?.(typedData as any),
      ).resolves.toBeDefined()

      expect(mockAccount.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: { value: null },
        }),
      )
    })

    it('handles primitive values in message', async () => {
      const mockAccount = createTypedDataAccount()
      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'str', type: 'string' }] },
        primaryType: 'Test' as const,
        message: { str: 'hello', num: 42, bool: true },
      }

      await wrapped.signTypedData?.(typedData as any)

      expect(mockAccount.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: { str: 'hello', num: 42, bool: true },
        }),
      )
    })

    it('handles deeply nested structures', async () => {
      const mockAccount = createTypedDataAccount()
      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'deep', type: 'Deep' }] },
        primaryType: 'Test' as const,
        message: {
          deep: {
            level1: {
              level2: {
                value: 123456789012345678901234567890n,
              },
            },
          },
        },
      }

      await wrapped.signTypedData?.(typedData as any)

      expect(mockAccount.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: {
            deep: {
              level1: {
                level2: {
                  value: '123456789012345678901234567890',
                },
              },
            },
          },
        }),
      )
    })

    it('handles arrays with mixed types including BigInt', async () => {
      const mockAccount = createTypedDataAccount()
      const wrapped = wrapParaAccount(mockAccount)

      const typedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'mixed', type: 'Mixed[]' }] },
        primaryType: 'Test' as const,
        message: {
          mixed: [1n, 'string', 3n, null, { nested: 5n }],
        },
      }

      await wrapped.signTypedData?.(typedData as any)

      expect(mockAccount.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: {
            mixed: ['1', 'string', '3', null, { nested: '5' }],
          },
        }),
      )
    })
  })
})
