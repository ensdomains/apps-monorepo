/** biome-ignore-all lint/suspicious/noExplicitAny: Need to mock the transaction manager */
import { dedicatedResolverSetTextSnippet } from '@ensdomains/ensjs/contracts'
import { encodeFunctionData, namehash } from 'viem'
import { describe, expect, it, vi } from 'vitest'

// Mock the transaction manager
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    startTransaction: vi.fn().mockReturnValue('mock-tx-id'),
  },
  waitForTransaction: vi.fn().mockResolvedValue({
    hash: '0xmockhash',
    receipt: {},
  }),
}))

// Import after mocking
import { type SaveRecordsParameters, saveRecords } from './saveRecords'

describe('saveRecords', () => {
  const mockParams: SaveRecordsParameters = {
    name: 'test.eth',
    resolverAddress: '0x1234567890123456789012345678901234567890',
    originalRecords: [
      { type: 'text', key: 'name', value: 'John' },
      { type: 'text', key: 'email', value: 'john@example.com' },
      { type: 'address', id: 60, key: 'ETH', value: '0xabc123' },
    ],
    pendingChanges: {
      newRecords: [],
      editedValues: new Map([['text-name', 'Jane']]),
      deletedIds: new Set(),
    },
    publicClient: {} as any,
    accountAddress: '0x0987654321098765432109876543210987654321',
    signer: { type: 'eoa', walletClient: {} as any },
    chainId: 11155111,
  }

  it('throws error when no changes to save', async () => {
    const paramsWithNoChanges = {
      ...mockParams,
      pendingChanges: {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set<string>(),
      },
    }

    await expect(saveRecords(paramsWithNoChanges)).rejects.toThrow(
      'No record changes to save',
    )
  })

  it('returns txId and hash on success', async () => {
    const result = await saveRecords(mockParams)

    expect(result).toEqual({
      txId: 'mock-tx-id',
      hash: '0xmockhash',
    })
  })

  it('calls transactionManager.startTransaction with correct params', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')

    await saveRecords(mockParams)

    expect(transactionManager.startTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        request: expect.objectContaining({
          type: 'eoa',
          from: mockParams.accountAddress,
          to: mockParams.resolverAddress,
          value: 0n,
          chainId: mockParams.chainId,
        }),
      }),
      mockParams.signer,
      expect.objectContaining({
        description: `Update records for ${mockParams.name}`,
        chainId: mockParams.chainId,
      }),
    )
  })
})

describe('buildDedicatedResolverCalls (integration)', () => {
  // Helper to decode what calls would be generated
  const encodeSetText = (key: string, value: string) =>
    encodeFunctionData({
      abi: dedicatedResolverSetTextSnippet,
      functionName: 'setText',
      args: [key, value],
    })

  it('generates setText call for edited text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'description', value: 'old' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map([['text-description', 'new description']]),
        deletedIds: new Set(),
      },
      publicClient: {} as any,
      accountAddress: '0x0987654321098765432109876543210987654321',
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    // Verify the multicall data contains the expected setText call
    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // The data should contain the encoded setText for 'description' -> 'new description'
    const expectedSetTextCall = encodeSetText('description', 'new description')
    expect(requestData).toContain(expectedSetTextCall.slice(2)) // slice to remove 0x prefix
  })

  it('generates setText call with empty string for deleted text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'twitter', value: '@john' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['text-twitter']),
      },
      publicClient: {} as any,
      accountAddress: '0x0987654321098765432109876543210987654321',
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // The data should contain setText('twitter', '') for deletion
    const expectedSetTextCall = encodeSetText('twitter', '')
    expect(requestData).toContain(expectedSetTextCall.slice(2))
  })

  it('generates setText call for new text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [],
      pendingChanges: {
        newRecords: [{ type: 'text', key: 'github', value: 'johndoe' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      },
      publicClient: {} as any,
      accountAddress: '0x0987654321098765432109876543210987654321',
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    const expectedSetTextCall = encodeSetText('github', 'johndoe')
    expect(requestData).toContain(expectedSetTextCall.slice(2))
  })

  it('uses correct namehash for multicallWithNodeCheck', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      name: 'myname.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'name', value: 'old' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map([['text-name', 'new']]),
        deletedIds: new Set(),
      },
      publicClient: {} as any,
      accountAddress: '0x0987654321098765432109876543210987654321',
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // The namehash of 'myname.eth' should be in the data
    const expectedNode = namehash('myname.eth').slice(2) // remove 0x
    expect(requestData.toLowerCase()).toContain(expectedNode.toLowerCase())
  })
})
