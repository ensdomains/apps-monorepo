import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  renderHook as renderTestingHook,
  waitFor,
} from '@testing-library/react'
import { Storage } from 'happy-dom'
import { okAsync } from 'neverthrow'
import { createElement, type ReactNode } from 'react'
import { type Address, namehash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContext: vi.fn(),
}))
const wagmiMock = vi.hoisted(() => ({ usePublicClient: vi.fn() }))

vi.mock('@/lib/smart-account', () => smartAccountMock)
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...wagmiMock,
}))

import { bigname } from '@/lib/bigname'
import { makeDomain } from '../service/_fixtures'
import { makeConfirmedMigration } from '../service/_fixtures/confirmedMigration'
import {
  loadMigrationRecoverySnapshot,
  type MigrationRecoverySnapshot,
  persistMigrationRecoverySnapshot,
  persistPendingAtomicMigrationAttempt,
  persistSubmittedAtomicMigrationBatch,
  removePendingAtomicMigrationIntent,
} from '../service/migrationBatchJournal'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }

const renderHook = <T>(hook: () => T) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderTestingHook(hook, {
    wrapper: ({ children }: { readonly children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
}

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
    interfaces: [],
    pubkey: null,
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
    managerRestorationNames: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', new Storage())
  vi.spyOn(bigname, 'nameHistory').mockReturnValue(
    okAsync({ data: [], meta: { as_of: {} } }),
  )
  smartAccountMock.useSmartAccountContext.mockReturnValue({
    ownerAddress: OWNER,
    accountAddress: HCA,
  })
  wagmiMock.usePublicClient.mockReturnValue({ chain: { id: CHAIN_ID } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useMigrationRecoverySnapshot', () => {
  it('settles an upgrade confirmed while unmounted when the app is reopened', async () => {
    const confirmed = makeConfirmedMigration()
    wagmiMock.usePublicClient.mockReturnValue(confirmed.publicClient)
    const recovery = makeRecoverySnapshot()
    const operations = [{ name: 'alice.eth', action: 'migrate' as const }]
    persistMigrationRecoverySnapshot(scope, {
      ...recovery,
      registryDomains: [makeDomain({ id: namehash('alice.eth') })],
      registryOperations: operations,
      remainingOperations: operations,
      completedOperations: [],
      profiles: new Map(),
    })
    persistSubmittedAtomicMigrationBatch(scope, {
      intentId: 'closed-tab',
      hash: confirmed.hash,
      names: ['alice.eth'],
      operations,
    })
    confirmed.getReceipt.mockRejectedValueOnce(new Error('Still pending'))
    const firstMount = renderHook(() => useMigrationRecoverySnapshot())
    await waitFor(() => expect(confirmed.getReceipt).toHaveBeenCalledOnce())
    expect(firstMount.result.current?.remainingOperations).toEqual(operations)
    firstMount.unmount()

    const reopened = renderHook(() => useMigrationRecoverySnapshot())
    await waitFor(() => expect(reopened.result.current).toBeNull())
    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
    reopened.unmount()
  })

  it('keeps an uncertain registration grant before any migration batch was submitted', () => {
    const recovery = makeRecoverySnapshot()
    const temporaryRegistrationApproval = {
      contractAddress: RESOLVER,
      operatorAddress: HCA,
      state: {
        status: 'grant-pending' as const,
        transactionId: 'approval-before-migration',
      },
    }
    persistMigrationRecoverySnapshot(scope, {
      ...recovery,
      remainingOperations: recovery.registryOperations,
      completedOperations: [],
      registrationApprovalStrategy: 'temporary-operator',
      temporaryRegistrationApproval,
    })

    const { result } = renderHook(() => useMigrationRecoverySnapshot())

    expect(result.current?.temporaryRegistrationApproval).toEqual(
      temporaryRegistrationApproval,
    )
    expect(
      loadMigrationRecoverySnapshot(scope)?.temporaryRegistrationApproval,
    ).toEqual(temporaryRegistrationApproval)
  })

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

  it('discards a fresh recovery snapshot after its pending attempt is rejected', () => {
    const recovery = makeRecoverySnapshot()
    const freshRecovery = {
      ...recovery,
      remainingOperations: recovery.registryOperations,
      completedOperations: [],
    }
    const intent = {
      id: 'intent-1',
      names: freshRecovery.remainingOperations.map(({ name }) => name),
      operations: freshRecovery.remainingOperations,
    }
    persistPendingAtomicMigrationAttempt(scope, {
      recovery: freshRecovery,
      intent,
    })

    const { result } = renderHook(() => useMigrationRecoverySnapshot())
    expect(result.current).toMatchObject({ completedOperations: [] })

    act(() => removePendingAtomicMigrationIntent(scope, intent.id))

    expect(result.current).toBeNull()
    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
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
