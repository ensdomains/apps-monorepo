/** biome-ignore-all lint/suspicious/noExplicitAny: Need to mock the transaction manager */
import { permissionedResolverSetTextSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { encodeFunctionData, namehash, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
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

// ensjs' v2 `setRecordsWriteParameters` is deliberately NOT mocked — it is a
// pure encoder, and the whole point of these tests is that the bytes we send
// match the deployed PermissionedResolver. Mocking it is what let the v1
// encoding (`setText(bytes32,…)`, which the contract does not expose) pass here
// while reverting on chain.
const encodeSetText = (name: string, key: string, value: string) =>
  encodeFunctionData({
    abi: permissionedResolverSetTextSnippet,
    functionName: 'setText',
    args: [toHex(packetToBytes(name)), key, value],
  })

// Import after mocking
import { type SaveRecordsParameters, saveRecords } from './saveRecords'

describe('saveRecords', () => {
  const mockAccountAddress = '0x0987654321098765432109876543210987654321'
  const mockWalletClient = {
    account: { address: mockAccountAddress },
    chain: { id: 11155111 },
  } as any

  const mockParams: SaveRecordsParameters = {
    id: 'mock-tx-id',
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
    walletClient: mockWalletClient,
    publicClient: {} as any,
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
          from: mockAccountAddress,
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

  it('targets the resolver with a V2 setter selector', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    await saveRecords(mockParams)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const request = (call[0] as any).request

    expect(request.to).toBe(mockParams.resolverAddress)
    // setText(bytes,string,string) — NOT the v1 setText(bytes32,…) 0x10f13a8c,
    // which the deployed PermissionedResolver does not expose.
    expect(request.data.slice(0, 10)).toBe('0xc7279f88')
  })

  it('throws error when wallet client has no account', async () => {
    const paramsWithNoAccount = {
      ...mockParams,
      walletClient: { chain: { id: 11155111 } } as any,
    }

    await expect(saveRecords(paramsWithNoAccount)).rejects.toThrow(
      'Wallet client must have account and chain configured',
    )
  })

  it('throws error when wallet client has no chain', async () => {
    const paramsWithNoChain = {
      ...mockParams,
      walletClient: { account: { address: mockAccountAddress } } as any,
    }

    await expect(saveRecords(paramsWithNoChain)).rejects.toThrow(
      'Wallet client must have account and chain configured',
    )
  })
})

describe('saveRecords encoding (integration)', () => {
  const mockWalletClient = {
    account: { address: '0x0987654321098765432109876543210987654321' },
    chain: { id: 11155111 },
  } as any

  it('generates setText call for edited text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      id: 'mock-tx-id',
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'description', value: 'old' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map([['text-description', 'new description']]),
        deletedIds: new Set(),
      },
      walletClient: mockWalletClient,
      publicClient: {} as any,
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    // Verify the multicall data contains the expected setText call
    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // The data should contain the encoded setText for 'description' -> 'new description'
    const expectedSetTextCall = encodeSetText(
      'test.eth',
      'description',
      'new description',
    )
    expect(requestData).toContain(expectedSetTextCall.slice(2)) // slice to remove 0x prefix
  })

  it('generates setText call with empty string for deleted text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      id: 'mock-tx-id',
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'twitter', value: '@john' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['text-twitter']),
      },
      walletClient: mockWalletClient,
      publicClient: {} as any,
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // The data should contain setText('twitter', '') for deletion
    const expectedSetTextCall = encodeSetText('test.eth', 'twitter', '')
    expect(requestData).toContain(expectedSetTextCall.slice(2))
  })

  it('generates setText call for new text records', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      id: 'mock-tx-id',
      name: 'test.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [],
      pendingChanges: {
        newRecords: [{ type: 'text', key: 'github', value: 'johndoe' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      },
      walletClient: mockWalletClient,
      publicClient: {} as any,
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    const expectedSetTextCall = encodeSetText('test.eth', 'github', 'johndoe')
    expect(requestData).toContain(expectedSetTextCall.slice(2))
  })

  it('addresses records by DNS-encoded name, never by namehash', async () => {
    const { transactionManager } = await import('@ens-apps/transaction-manager')
    vi.mocked(transactionManager.startTransaction).mockClear()

    const params: SaveRecordsParameters = {
      id: 'mock-tx-id',
      name: 'myname.eth',
      resolverAddress: '0x1234567890123456789012345678901234567890',
      originalRecords: [{ type: 'text', key: 'name', value: 'old' }],
      pendingChanges: {
        newRecords: [],
        editedValues: new Map([['text-name', 'new']]),
        deletedIds: new Set(),
      },
      walletClient: mockWalletClient,
      publicClient: {} as any,
      signer: { type: 'eoa', walletClient: {} as any },
      chainId: 11155111,
    }

    await saveRecords(params)

    const call = vi.mocked(transactionManager.startTransaction).mock.calls[0]
    const requestData = (call[0] as any).request.data as string

    // V2 setters take the DNS-encoded name...
    const dnsName = toHex(packetToBytes('myname.eth')).slice(2)
    expect(requestData.toLowerCase()).toContain(dnsName.toLowerCase())

    // ...and never the namehash. This is the regression that made every record
    // write revert with empty data against the deployed resolver.
    const node = namehash('myname.eth').slice(2)
    expect(requestData.toLowerCase()).not.toContain(node.toLowerCase())
  })
})
