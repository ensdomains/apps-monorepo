import { renderHook } from '@testing-library/react'
import { type Address, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useMigrationEligibility: vi.fn(),
  useMigrationRecoverySnapshot: vi.fn(),
  useSmartAccountContext: vi.fn(),
  useV1Names: vi.fn(),
  useConnection: vi.fn(),
}))

vi.mock('./useMigrationEligibility', () => ({
  useMigrationEligibility: mocks.useMigrationEligibility,
}))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: mocks.useMigrationRecoverySnapshot,
}))
vi.mock('./useV1Names', () => ({ useV1Names: mocks.useV1Names }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: mocks.useConnection,
}))

import { makeDomain } from '../service/_fixtures'
import { useEligibleV1Names } from './useEligibleV1Names'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSmartAccountContext.mockReturnValue({ ownerAddress: OWNER })
  mocks.useConnection.mockReturnValue({ address: OWNER })
  mocks.useV1Names.mockReturnValue({ data: [], isPending: false })
  mocks.useMigrationEligibility.mockReturnValue({
    data: undefined,
    isPending: false,
  })
})

describe('useEligibleV1Names durable recovery', () => {
  it('surfaces the remaining copy even after the migrated root disappears from V1 results', () => {
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
    mocks.useMigrationRecoverySnapshot.mockReturnValue({
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
      plannedApprovals: [],
    })

    const { result } = renderHook(() => useEligibleV1Names())

    expect(result.current.isPending).toBe(false)
    expect(result.current.eligible).toEqual([
      expect.objectContaining({
        action: 'copy',
        domain: expect.objectContaining({ name: copy.name }),
        managerAddress: null,
      }),
    ])
    expect(mocks.useMigrationEligibility).toHaveBeenCalledWith([], OWNER)
  })
})
