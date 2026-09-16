import { act, renderHook } from '@testing-library/react'
import { type Address, namehash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContext: vi.fn(),
}))
const wagmiMock = vi.hoisted(() => ({ usePublicClient: vi.fn() }))

vi.mock('@/lib/smart-account', () => smartAccountMock)
vi.mock('wagmi', () => wagmiMock)

import { makeDomain } from '../service/_fixtures'
import {
  type MigrationRecoverySnapshot,
  persistMigrationRecoverySnapshot,
} from '../service/migrationBatchJournal'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }

type StorageEventTarget = {
  addEventListener: (
    type: 'storage',
    listener: (event: StorageEvent) => void,
  ) => void
  removeEventListener: (
    type: 'storage',
    listener: (event: StorageEvent) => void,
  ) => void
}

const makeRecoverySnapshot = (): MigrationRecoverySnapshot => {
  const root = makeDomain({
    id: namehash('example.eth'),
    name: 'example.eth',
    labelName: 'example',
    resolverAddress: null,
  })
  const copy = makeDomain({
    id: namehash('foo.example.eth'),
    name: 'foo.example.eth',
    labelName: 'foo',
    parentName: root.name,
    registrantId: null,
    resolverAddress: null,
  })
  const emptyProfile = {
    texts: [],
    addresses: [],
    contentHash: null,
    abis: [],
  } as const

  return {
    registryDomains: [root, copy],
    registryOperations: [
      { name: root.name, action: 'migrate' },
      { name: copy.name, action: 'copy' },
    ],
    remainingOperations: [{ name: copy.name, action: 'copy' }],
    completedOperations: [{ name: root.name, action: 'migrate' }],
    profiles: new Map([
      [namehash(root.name), emptyProfile],
      [namehash(copy.name), emptyProfile],
    ]),
    ownedPermRes: RESOLVER,
    plannedApprovals: [{ id: 'eth-registry:hca' }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  smartAccountMock.useSmartAccountContext.mockReturnValue({
    ownerAddress: OWNER,
    accountAddress: HCA,
  })
  wagmiMock.usePublicClient.mockReturnValue({ chain: { id: CHAIN_ID } })
})

afterEach(() => vi.restoreAllMocks())

describe('useMigrationRecoverySnapshot', () => {
  it('loads the remaining copy tree after a fresh hook mount', () => {
    persistMigrationRecoverySnapshot(scope, makeRecoverySnapshot())

    const { result } = renderHook(() => useMigrationRecoverySnapshot())

    expect(result.current?.remainingOperations).toEqual([
      { name: 'foo.example.eth', action: 'copy' },
    ])
    expect(result.current?.completedOperations).toEqual([
      { name: 'example.eth', action: 'migrate' },
    ])
    expect(result.current?.plannedApprovals).toEqual([
      { id: 'eth-registry:hca' },
    ])
  })

  it('does not load another HCA scope', () => {
    persistMigrationRecoverySnapshot(scope, makeRecoverySnapshot())
    smartAccountMock.useSmartAccountContext.mockReturnValue({
      ownerAddress: OWNER,
      accountAddress: '0x0000000000000000000000000000000000000004',
    })

    const { result } = renderHook(() => useMigrationRecoverySnapshot())

    expect(result.current).toBeNull()
  })

  it('refreshes a mounted hook after a same-tab journal write', () => {
    const { result } = renderHook(() => useMigrationRecoverySnapshot())
    expect(result.current).toBeNull()

    act(() => persistMigrationRecoverySnapshot(scope, makeRecoverySnapshot()))

    expect(result.current?.remainingOperations).toEqual([
      { name: 'foo.example.eth', action: 'copy' },
    ])
  })

  it('refreshes a mounted hook after another tab changes localStorage', () => {
    persistMigrationRecoverySnapshot(scope, makeRecoverySnapshot())
    const storageKey = localStorage.key(0)
    const storedJournal = storageKey ? localStorage.getItem(storageKey) : null
    expect(storageKey).not.toBeNull()
    expect(storedJournal).not.toBeNull()
    localStorage.clear()

    const { result } = renderHook(() => useMigrationRecoverySnapshot())
    expect(result.current).toBeNull()

    act(() => {
      localStorage.setItem(storageKey as string, storedJournal as string)
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: storedJournal,
          storageArea: localStorage,
        }),
      )
    })

    expect(result.current?.remainingOperations).toEqual([
      { name: 'foo.example.eth', action: 'copy' },
    ])
  })

  it('deduplicates the global storage listener across hook instances', () => {
    const storageEventTarget = window as unknown as StorageEventTarget
    const addEventListener = vi.spyOn(storageEventTarget, 'addEventListener')
    const removeEventListener = vi.spyOn(
      storageEventTarget,
      'removeEventListener',
    )

    const first = renderHook(() => useMigrationRecoverySnapshot())
    const second = renderHook(() => useMigrationRecoverySnapshot())

    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'storage'),
    ).toHaveLength(1)

    first.unmount()
    expect(
      removeEventListener.mock.calls.filter(([type]) => type === 'storage'),
    ).toHaveLength(0)

    second.unmount()
    expect(
      removeEventListener.mock.calls.filter(([type]) => type === 'storage'),
    ).toHaveLength(1)
  })
})
