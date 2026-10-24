import { BignameError } from '@ens-apps/indexer/bigname'
import { encodeContentHash } from '@ensdomains/ensjs/utils'
import {
  publicResolverAbiSnippet,
  publicResolverContenthashSnippet,
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
  publicResolverTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { errAsync, okAsync } from 'neverthrow'
import {
  type Address,
  BaseError,
  decodeFunctionData,
  ExecutionRevertedError,
  encodeAbiParameters,
  type Hex,
  namehash,
  type PublicClient,
  toHex,
  zeroAddress,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  readContract: vi.fn(),
  multicall: vi.fn(),
  nameRecords: vi.fn(),
}))
vi.mock('@/lib/wagmi', async () => ({
  publicClient: { ...mocks, chain: (await import('@/config')).envConfig.chain },
  sepoliaWithEns: (await import('@/config')).envConfig.chain,
}))
vi.mock('@/lib/bigname', () => ({
  bigname: { nameRecords: mocks.nameRecords },
}))

import { envConfig } from '@/config'
import { publicClient } from '@/lib/wagmi'
import type { ServiceRecordSnapshot } from './profileRecordTransactions'
import {
  importResolverRecords,
  type ResolverCopySource,
  verifyResolverRecords,
} from './resolverImport'

const NAME = 'blog.alice.eth'
const RESOLVER = '0x2222222222222222222222222222222222222222'
const REGISTRY = '0x3333333333333333333333333333333333333333'
const WALLET = '0x1111111111111111111111111111111111111111'
const CONTENT_HASH =
  'ipfs://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4'
const CUSTOM_KEY = 'org.example.MixedCase'
const source: ResolverCopySource = {
  kind: 'copy',
  resolver: RESOLVER,
  location: { label: 'blog', registryAddress: REGISTRY },
  wallet: WALLET,
  chainId: envConfig.chain.id,
}
const recordAbi = [
  ...publicResolverTextSnippet,
  ...publicResolverSingleAddrSnippet,
  ...publicResolverMultiAddrSnippet,
  ...publicResolverContenthashSnippet,
  ...publicResolverAbiSnippet,
] as const
const bytes = (value: Hex) => encodeAbiParameters([{ type: 'bytes' }], [value])
const expected: ServiceRecordSnapshot = {
  texts: [
    { key: 'description', value: 'An existing profile' },
    { key: CUSTOM_KEY, value: '  café\nKeep whitespace  ' },
  ],
  coins: [
    { coinType: 60, value: WALLET },
    { coinType: 2147483658, value: RESOLVER },
  ],
  contentHash: CONTENT_HASH,
  abi: '[{"type":"function","name":"hello","inputs":[],"outputs":[]}]',
}

const fixture = (nameBased = false) => {
  const state = {
    texts: {
      description: 'An existing profile',
      [CUSTOM_KEY]: '  café\nKeep whitespace  ',
    } as Record<string, string>,
    eth: WALLET as Address,
    contentHash: encodeContentHash(CONTENT_HASH),
    abi: '[{"type":"function","name":"hello","inputs":[],"outputs":[]}]',
    resolver: RESOLVER as Address,
    registry: REGISTRY as Address,
    failure: null as 'rpc' | 'unsupported' | 'malformed' | null,
  }
  const readText = (key: string): Hex => {
    if (key === CUSTOM_KEY && state.failure) {
      if (state.failure === 'rpc') throw new Error('RPC request timed out')
      if (state.failure === 'malformed') return '0x1234'
      throw new BaseError('Unsupported record', {
        cause: new ExecutionRevertedError(),
      })
    }
    return encodeAbiParameters([{ type: 'string' }], [state.texts[key] ?? ''])
  }
  const read = (data: Hex): Hex => {
    const call = decodeFunctionData({ abi: recordAbi, data })
    if (call.args[0] !== namehash(NAME)) throw new Error('Wrong record node')
    switch (call.functionName) {
      case 'text':
        return readText(call.args[1])
      case 'addr':
        return call.args.length === 1
          ? encodeAbiParameters([{ type: 'address' }], [state.eth])
          : bytes(call.args[1] === 2147483658n ? RESOLVER : '0x')
      case 'contenthash':
        return bytes(state.contentHash)
      case 'ABI':
        return encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes' }],
          [state.abi ? 1n : 0n, toHex(state.abi)],
        )
    }
  }
  mocks.multicall.mockResolvedValue([{ status: 'success', result: nameBased }])
  mocks.call.mockImplementation(
    async ({ to, data }: { to: Address; data: Hex }) => {
      if (to !== RESOLVER) throw new Error('Wrong source resolver')
      return { data: read(data) }
    },
  )
  mocks.readContract.mockImplementation(
    async ({
      functionName,
      address,
      args,
    }: {
      functionName: string
      address: Address
      args: readonly unknown[]
    }) => {
      switch (functionName) {
        case 'findRegistries':
          return [zeroAddress, state.registry]
        case 'getResolver':
          return state.resolver
        case 'resolve':
          if (
            address !== RESOLVER ||
            args[0] !== '0x04626c6f6705616c6963650365746800'
          )
            throw new Error('Wrong name-based source')
          return read(args[1] as Hex)
        default:
          throw new Error(`Unexpected contract read: ${functionName}`)
      }
    },
  )
  mocks.nameRecords.mockReturnValue(
    okAsync({
      data: {
        namespace: 'ens',
        resolver: { chain_id: envConfig.chain.id, address: RESOLVER },
        records: {},
        inventory: {
          known_keys: [`text:${CUSTOM_KEY}`, 'addr:2147483658'],
          unset_keys: [],
          unsupported_keys: [],
          abi_content_types: ['1'],
        },
      },
      meta: {},
    }),
  )
  return state
}

beforeEach(() => vi.resetAllMocks())

describe('resolver record import', () => {
  it.each([false, true])(
    'recovers indexed and probed records exactly (name-based: %s)',
    async (nameBased) => {
      fixture(nameBased)
      const imported = await importResolverRecords(NAME, source)
      expect(imported.records).toMatchObject({
        ...expected,
        resolverAddress: RESOLVER,
      })
      expect(imported.records.texts).toHaveLength(2)
      expect(imported.records.coins).toHaveLength(2)
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          {
            ...expected,
            abi: '[ { "type": "function", "name": "hello", "inputs": [], "outputs": [] } ]',
          },
          publicClient as PublicClient,
        ),
      ).resolves.toBeUndefined()
    },
  )

  it('warns about unavailable inventory while recovering common records', async () => {
    fixture()
    mocks.nameRecords.mockReturnValue(
      errAsync(new BignameError({ code: 'network', message: 'offline' })),
    )
    const imported = await importResolverRecords(NAME, source)
    expect(imported.records.texts).toEqual([
      { key: 'description', value: 'An existing profile' },
    ])
    expect(imported.warnings.join('\n')).toMatch(
      /index is unavailable or incomplete/,
    )
  })

  it.each(['rpc', 'unsupported', 'malformed'] as const)(
    'warns rather than silently losing a record on %s failure',
    async (failure) => {
      fixture().failure = failure
      const imported = await importResolverRecords(NAME, source)
      expect(imported.records.texts).toEqual([
        { key: 'description', value: 'An existing profile' },
      ])
      expect(imported.warnings.join('\n')).toContain(
        `Some records could not be read: text:${CUSTOM_KEY}`,
      )
    },
  )

  it.each(['resolver', 'registry'] as const)(
    'rejects an import if its source %s changed while reading',
    async (field) => {
      fixture()[field] = WALLET
      await expect(importResolverRecords(NAME, source)).rejects.toThrow(
        /source resolver changed/,
      )
    },
  )
})

describe('replacement record verification', () => {
  it.each([
    'missing text',
    'changed text',
    'address',
    'contenthash',
    'ABI',
  ] as const)(
    'rejects %s mismatch before resolver replacement',
    async (field) => {
      const state = fixture()
      switch (field) {
        case 'missing text':
          delete state.texts[CUSTOM_KEY]
          break
        case 'changed text':
          state.texts[CUSTOM_KEY] = 'Changed'
          break
        case 'address':
          state.eth = RESOLVER
          break
        case 'contenthash':
          state.contentHash = '0x'
          break
        case 'ABI':
          state.abi = ''
          break
      }
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          expected,
          publicClient as PublicClient,
        ),
      ).rejects.toThrow(/replacement records could not be verified/)
    },
  )

  it.each(['rpc', 'unsupported', 'malformed'] as const)(
    'refuses verification when a required record has a %s failure',
    async (failure) => {
      fixture().failure = failure
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          { ...expected, texts: [{ key: CUSTOM_KEY, value: '' }] },
          publicClient as PublicClient,
        ),
      ).rejects.toThrow(/replacement records could not be verified/)
    },
  )
})
