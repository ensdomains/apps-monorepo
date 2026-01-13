/**
 * Smart Account Type Guards Tests
 *
 * Tests for type guard functions that discriminate between
 * Rhinestone and ZeroDev account states.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { describe, expect, it } from 'vitest'

import {
  isRhinestoneAccount,
  isZeroDevAccount,
  type RhinestoneAccountState,
  type ZeroDevAccountState,
} from './types'

const createBaseState = () => ({
  accountAddress: null,
  isLoading: false,
  error: null,
  isConnected: false,
  walletSource: null as const,
  ownerAddress: null,
  stablecoinBalances: [],
  isLoadingBalances: false,
  smartAccountEthBalance: null,
  isLoadingSmartAccountEth: false,
  autoFundingMutation: {} as any,
  signer: null,
})

const createRhinestoneState = (
  overrides: Partial<RhinestoneAccountState> = {},
): RhinestoneAccountState => ({
  ...createBaseState(),
  type: 'rhinestone',
  client: null,
  config: null,
  ...overrides,
})

const createZeroDevState = (
  overrides: Partial<ZeroDevAccountState> = {},
): ZeroDevAccountState => ({
  ...createBaseState(),
  type: 'zerodev',
  client: null,
  config: null,
  session: null,
  isSessionClient: false,
  ecdsaValidator: null,
  isAccountReady: false,
  setSessionData: () => {},
  ...overrides,
})

describe('isRhinestoneAccount', () => {
  it('returns true for Rhinestone account state', () => {
    const rhinestoneState = createRhinestoneState()

    expect(isRhinestoneAccount(rhinestoneState)).toBe(true)
  })

  it('returns false for ZeroDev account state', () => {
    const zerodevState = createZeroDevState()

    expect(isRhinestoneAccount(zerodevState)).toBe(false)
  })

  it('correctly narrows type for Rhinestone account', () => {
    const rhinestoneState = createRhinestoneState({
      client: { getAddress: () => '0x123' } as any,
      config: {
        chain: {} as any,
        accountType: 'simple',
        rhinestoneApiKey: 'test-key',
      },
    })

    if (isRhinestoneAccount(rhinestoneState)) {
      // TypeScript should allow access to Rhinestone-specific properties
      expect(rhinestoneState.type).toBe('rhinestone')
      expect(rhinestoneState.client).toBeDefined()
      expect(rhinestoneState.config?.rhinestoneApiKey).toBe('test-key')
    }
  })
})

describe('isZeroDevAccount', () => {
  it('returns true for ZeroDev account state', () => {
    const zerodevState = createZeroDevState()

    expect(isZeroDevAccount(zerodevState)).toBe(true)
  })

  it('returns false for Rhinestone account state', () => {
    const rhinestoneState = createRhinestoneState()

    expect(isZeroDevAccount(rhinestoneState)).toBe(false)
  })

  it('correctly narrows type for ZeroDev account', () => {
    const zerodevState = createZeroDevState({
      client: { account: { address: '0x123' } } as any,
      config: {
        chain: {} as any,
        accountType: 'hca',
        kernelVersion: '3.1',
        pimlicoApiKey: 'test-key',
      },
      isSessionClient: true,
      isAccountReady: true,
    })

    if (isZeroDevAccount(zerodevState)) {
      // TypeScript should allow access to ZeroDev-specific properties
      expect(zerodevState.type).toBe('zerodev')
      expect(zerodevState.isSessionClient).toBe(true)
      expect(zerodevState.isAccountReady).toBe(true)
      expect(zerodevState.config?.kernelVersion).toBe('3.1')
    }
  })

  it('correctly identifies ZeroDev account with session', () => {
    const session = {
      id: 'session-123',
      sessionKeyAddress: '0xSessionKey' as const,
      smartAccountAddress: '0xSmartAccount' as const,
      ownerAddress: '0xOwner' as const,
      createdAt: Date.now(),
      chainId: 11155111,
      serializedSessionAccount: 'serialized-data',
      sessionPrivateKey: '0xprivatekey' as const,
    }

    const zerodevState = createZeroDevState({
      session,
      isSessionClient: true,
    })

    expect(isZeroDevAccount(zerodevState)).toBe(true)
    if (isZeroDevAccount(zerodevState)) {
      expect(zerodevState.session).toEqual(session)
    }
  })
})

describe('type guard mutual exclusivity', () => {
  it('exactly one guard returns true for any valid state', () => {
    const rhinestoneState = createRhinestoneState()
    const zerodevState = createZeroDevState()

    // Rhinestone state
    expect(isRhinestoneAccount(rhinestoneState)).toBe(true)
    expect(isZeroDevAccount(rhinestoneState)).toBe(false)

    // ZeroDev state
    expect(isRhinestoneAccount(zerodevState)).toBe(false)
    expect(isZeroDevAccount(zerodevState)).toBe(true)
  })

  it('can be used in switch-like pattern matching', () => {
    const states = [createRhinestoneState(), createZeroDevState()]

    const results = states.map((state) => {
      if (isRhinestoneAccount(state)) {
        return `rhinestone:${state.config?.rhinestoneApiKey ?? 'no-key'}`
      }
      if (isZeroDevAccount(state)) {
        return `zerodev:${state.config?.kernelVersion ?? 'no-version'}`
      }
      return 'unknown'
    })

    expect(results).toEqual(['rhinestone:no-key', 'zerodev:no-version'])
  })
})
