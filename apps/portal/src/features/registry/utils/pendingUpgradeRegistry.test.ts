import { getDestinationContracts } from '@ens-apps/smart-account'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  getRoleEditing,
  getUpgradeGate,
  isPastedRegistryBlocked,
  isPendingUpgradeImplementation,
  settledData,
} from './pendingUpgradeRegistry'

describe('isPendingUpgradeImplementation', () => {
  it.each([mainnet.id, sepolia.id])(
    'leaves the current UserRegistry implementation on chain %i alone',
    (chainId) => {
      expect(
        isPendingUpgradeImplementation({
          chainId,
          implementation: getDestinationContracts(chainId).userRegistryImpl,
        }),
      ).toBe(false)
    },
  )

  it.each([mainnet.id, sepolia.id])(
    'leaves the WrapperRegistry implementation on chain %i alone',
    (chainId) => {
      expect(
        isPendingUpgradeImplementation({
          chainId,
          implementation: getDestinationContracts(chainId).wrapperRegistryImpl,
        }),
      ).toBe(false)
    },
  )

  it.each([
    [mainnet.id, '0x43d937F91eC7597c096A1e2e6B7cbd2ddcAEb23D', true],
    [mainnet.id, '0x86013382F943C6214E1433d1e64936F4000925CB', false],
    [sepolia.id, '0x0822d199699f0a9D378617817a1439663234a126', false],
  ] as const)(
    'on chain %i, lists %s: %s',
    (chainId, implementation, expected) => {
      expect(isPendingUpgradeImplementation({ chainId, implementation })).toBe(
        expected,
      )
    },
  )

  it('needs the address on the same chain', () => {
    expect(
      isPendingUpgradeImplementation({
        chainId: sepolia.id,
        implementation: getDestinationContracts(mainnet.id).userRegistryImpl,
      }),
    ).toBe(false)
  })
})

describe('isPastedRegistryBlocked', () => {
  it.each([
    { isPasted: true, isPendingUpgrade: true, expected: true },
    { isPasted: true, isPendingUpgrade: undefined, expected: true },
    { isPasted: true, isPendingUpgrade: false, expected: false },
    { isPasted: false, isPendingUpgrade: undefined, expected: false },
  ])(
    'pasted $isPasted, pending $isPendingUpgrade: blocked $expected',
    ({ isPasted, isPendingUpgrade, expected }) => {
      expect(isPastedRegistryBlocked({ isPasted, isPendingUpgrade })).toBe(
        expected,
      )
    },
  )
})

describe('getUpgradeGate', () => {
  it.each([
    [false, 'open'],
    [true, 'needs-upgrade'],
    [undefined, 'checking'],
  ] as const)('pending upgrade %s: %s', (isPendingUpgrade, expected) => {
    expect(getUpgradeGate(isPendingUpgrade)).toBe(expected)
  })
})

describe('settledData', () => {
  it('counts an answer as unknown once a refresh of it failed', () => {
    expect(
      settledData({ data: false, error: new Error('rpc') }),
    ).toBeUndefined()
    expect(settledData({ data: false, error: null })).toBe(false)
  })
})

describe('getRoleEditing', () => {
  it.each([
    [true, 'open', { canEdit: true, showUpgradeNote: false }],
    [true, 'checking', { canEdit: false, showUpgradeNote: false }],
    [true, 'needs-upgrade', { canEdit: false, showUpgradeNote: true }],
    [false, 'needs-upgrade', { canEdit: false, showUpgradeNote: false }],
  ] as const)('admin %s behind a %s gate', (isAdmin, gate, expected) => {
    expect(getRoleEditing({ isAdmin, gate })).toEqual(expected)
  })
})
