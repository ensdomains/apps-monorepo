import type { RecordInventory } from '@ens-apps/bigname'
import { namehash } from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { bignameRequest, bignameResponse } from './_fixtures'
import {
  getV1ProfileKeys,
  hasV1ProfileRecords,
  PROBED_ABI_CONTENT_TYPES,
  profileKeysFromInventory,
} from './v1ProfileKeys'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/bigname')
  return {
    bigname: createBignameClient({
      baseUrl: 'https://bigname.test',
      fetch: fetchMock,
      retry: false,
    }),
  }
})

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: [],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})

const target = (name: string) => ({ id: namehash(name), name })

const lookupResult = (name: string, inv?: RecordInventory) => ({
  input: { id: namehash(name), name },
  kind: 'name',
  status: 'ok',
  record: {
    name,
    display_name: name,
    namespace: 'ens',
    namehash: namehash(name),
    status: 'ok',
    ...(inv ? { inventory: inv } : {}),
  },
})

beforeEach(() => {
  fetchMock.mockReset()
})

describe('profileKeysFromInventory', () => {
  it('maps known keys onto texts, coin types and contenthash', () => {
    expect(
      profileKeysFromInventory(
        '0xABC',
        inventory({
          known_keys: [
            'text:email',
            'avatar',
            'addr:60',
            'addr:2147483658',
            'contenthash',
          ],
          unset_keys: ['text:url'],
          abi_content_types: ['1', '4'],
        }),
      ),
    ).toEqual({
      id: '0xabc',
      texts: ['email', 'avatar'],
      coinTypes: [60, 2147483658],
      hasContentHash: true,
      abiContentTypes: [1n, 4n],
    })
  })

  it('reads unsupported keys too, since they may still be set', () => {
    const keys = profileKeysFromInventory(
      '0xabc',
      inventory({
        unsupported_keys: ['text:com.twitter', 'addr:0'],
        abi_content_types: null,
        abi_unsupported_reason: 'inventory_not_authoritative',
      }),
    )
    expect(keys.texts).toEqual(['com.twitter'])
    expect(keys.coinTypes).toEqual([0])
    expect(hasV1ProfileRecords(keys)).toBe(true)
  })

  it('probes the standard ABI content types when bigname cannot list them', () => {
    const keys = profileKeysFromInventory(
      '0xabc',
      inventory({
        abi_content_types: null,
        abi_unsupported_reason: 'abi_observations_not_supported',
      }),
    )
    expect(keys.abiContentTypes).toEqual(PROBED_ABI_CONTENT_TYPES)
  })

  it('treats an empty ABI list as no ABI records', () => {
    const keys = profileKeysFromInventory('0xabc', inventory())
    expect(keys.abiContentTypes).toEqual([])
    expect(hasV1ProfileRecords(keys)).toBe(false)
  })
})

describe('getV1ProfileKeys', () => {
  it('returns ok([]) without a request for no names', async () => {
    const result = await getV1ProfileKeys([])
    assert(result.isOk())
    expect(result.value).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the inventory for each name through one detail lookup', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse({
        data: [
          lookupResult('a.eth', inventory({ known_keys: ['text:email'] })),
          lookupResult('b.eth', inventory()),
        ],
        meta: {},
      }),
    )

    const result = await getV1ProfileKeys([target('a.eth'), target('b.eth')])
    assert(result.isOk())
    expect(result.value.map(({ id, texts }) => ({ id, texts }))).toEqual([
      { id: namehash('a.eth'), texts: ['email'] },
      { id: namehash('b.eth'), texts: [] },
    ])

    const { url, body } = bignameRequest(fetchMock.mock.calls[0])
    expect(url.pathname).toBe('/v1/lookup')
    expect(body).toEqual({
      inputs: [target('a.eth'), target('b.eth')],
      profile: 'detail',
      include: 'inventory',
    })
  })

  it('leaves out names without an inventory container so callers fail closed', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse({
        data: [
          lookupResult('a.eth'),
          { input: target('b.eth'), kind: 'name', status: 'not_found' },
        ],
        meta: {},
      }),
    )
    const result = await getV1ProfileKeys([target('a.eth'), target('b.eth')])
    assert(result.isOk())
    expect(result.value).toEqual([])
  })

  it('splits more than 1,000 names into several lookups and dedupes by node', async () => {
    const names = Array.from({ length: 1001 }, (_, i) => `n${i}.eth`)
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const { body } = bignameRequest([input, init])
      const inputs = (body as { inputs: { name: string }[] }).inputs
      return bignameResponse({
        data: inputs.map(({ name }) => lookupResult(name, inventory())),
        meta: {},
      })
    })

    const result = await getV1ProfileKeys([
      ...names.map(target),
      target('n0.eth'),
    ])
    assert(result.isOk())
    expect(result.value).toHaveLength(1001)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns err when the lookup fails', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse(
        { error: { code: 'overloaded', message: 'busy', details: {} } },
        503,
      ),
    )
    const result = await getV1ProfileKeys([target('a.eth')])
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1ProfilesError')
  })
})
