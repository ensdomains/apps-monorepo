import { renderHook } from '@testing-library/react'
import { type Address, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContext: vi.fn(),
}))
const wagmiMock = vi.hoisted(() => ({ usePublicClient: vi.fn() }))

vi.mock('@/lib/smart-account', () => smartAccountMock)
vi.mock('wagmi', () => wagmiMock)

import { makeDomain } from '../service/_fixtures'
import { persistMigrationRecoverySnapshot } from '../service/migrationBatchJournal'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  smartAccountMock.useSmartAccountContext.mockReturnValue({
    ownerAddress: OWNER,
    accountAddress: HCA,
  })
  wagmiMock.usePublicClient.mockReturnValue({ chain: { id: CHAIN_ID } })
})

describe('useMigrationRecoverySnapshot', () => {
  it('loads the remaining copy tree after a fresh hook mount', () => {
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
    persistMigrationRecoverySnapshot(
      { chainId: CHAIN_ID, owner: OWNER, hca: HCA },
      {
        registryDomains: [root, copy],
        registryOperations: [
          { name: root.name, action: 'migrate' },
          { name: copy.name, action: 'copy' },
        ],
        remainingOperations: [{ name: copy.name, action: 'copy' }],
        completedOperations: [{ name: root.name, action: 'migrate' }],
        profiles: new Map([
          [
            namehash(root.name),
            { texts: [], addresses: [], contentHash: null, abis: [] },
          ],
          [
            namehash(copy.name),
            { texts: [], addresses: [], contentHash: null, abis: [] },
          ],
        ]),
        ownedPermRes: RESOLVER,
        plannedApprovals: [{ id: 'eth-registry:hca' }],
      },
    )

    const { result } = renderHook(() => useMigrationRecoverySnapshot())

    expect(result.current?.remainingOperations).toEqual([
      { name: copy.name, action: 'copy' },
    ])
    expect(result.current?.completedOperations).toEqual([
      { name: root.name, action: 'migrate' },
    ])
    expect(result.current?.plannedApprovals).toEqual([
      { id: 'eth-registry:hca' },
    ])
  })

  it('does not load another HCA scope', () => {
    smartAccountMock.useSmartAccountContext.mockReturnValue({
      ownerAddress: OWNER,
      accountAddress: '0x0000000000000000000000000000000000000004',
    })

    const { result } = renderHook(() => useMigrationRecoverySnapshot())

    expect(result.current).toBeNull()
  })
})
