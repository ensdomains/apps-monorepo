import type { RecordGroups } from '@ens-apps/bigname'
import { namehash } from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { bignameRequest, bignameResponse } from './_fixtures'
import {
  getV1ProfileKeys,
  hasV1ProfileRecords,
  PROBED_ABI_CONTENT_TYPES,
  profileKeysFromRecords,
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

/** Grouped `records` as lookup `profile=detail` serves them (bigname v0.4.1). */
const records = (overrides: Partial<RecordGroups> = {}): RecordGroups => ({
  seen_addresses: [],
  addresses: {},
  seen_texts: [],
  texts: {},
  seen_abis: [],
  abis: {},
  seen_singletons: [],
  contenthash: null,
  name: null,
  ...overrides,
})

const target = (name: string) => ({ id: namehash(name), name })

const lookupResult = (name: string, groups?: RecordGroups) => ({
  input: { id: namehash(name), name },
  kind: 'name',
  status: 'ok',
  record: {
    name,
    display_name: name,
    namespace: 'ens',
    namehash: namehash(name),
    status: 'ok',
    ...(groups ? { records: groups } : {}),
  },
})

beforeEach(() => {
  fetchMock.mockReset()
})

describe('profileKeysFromRecords', () => {
  it('maps the seen keys onto texts, coin types, contenthash and ABI types', () => {
    expect(
      profileKeysFromRecords(
        '0xABC',
        records({
          seen_texts: ['avatar', 'email'],
          texts: { avatar: 'https://example.com/a.png', email: 'a@b.c' },
          seen_addresses: ['60', '2147483658'],
          addresses: { '60': '0x01', '2147483658': '0x02' },
          seen_singletons: ['contenthash'],
          contenthash: '0xe301',
          seen_abis: ['1', '4'],
        }),
      ),
    ).toEqual({
      id: '0xabc',
      texts: ['avatar', 'email'],
      coinTypes: [60, 2147483658],
      hasContentHash: true,
      abiContentTypes: [1n, 4n],
    })
  })

  it('skips keys bigname knows were cleared, and reads keys whose value it cannot vouch for', () => {
    const keys = profileKeysFromRecords(
      '0xabc',
      records({
        seen_texts: ['com.github', 'url'],
        texts: { 'com.github': null },
        seen_addresses: ['0', '60'],
        addresses: { '60': null },
        seen_singletons: ['contenthash'],
        contenthash: null,
      }),
    )
    expect(keys.texts).toEqual(['url'])
    expect(keys.coinTypes).toEqual([0])
    expect(keys.hasContentHash).toBe(false)
    expect(hasV1ProfileRecords(keys)).toBe(true)
  })

  it('reads an unknown contenthash value', () => {
    const { contenthash: _cleared, ...unknown } = records({
      seen_singletons: ['contenthash'],
    })
    expect(profileKeysFromRecords('0xabc', unknown).hasContentHash).toBe(true)
  })

  it('probes the standard ABI content types when bigname cannot list them', () => {
    const { seen_abis: _listed, ...unlisted } = records({
      abi_unsupported_reason: 'abi_observations_not_supported',
    })
    const keys = profileKeysFromRecords('0xabc', unlisted)
    expect(keys.abiContentTypes).toEqual(PROBED_ABI_CONTENT_TYPES)
  })

  it('treats an empty ABI list as no ABI records', () => {
    const keys = profileKeysFromRecords('0xabc', records())
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

  it('reads the records for each name through one detail lookup, without include', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse({
        data: [
          lookupResult(
            'a.eth',
            records({ seen_texts: ['email'], texts: { email: 'a@b.c' } }),
          ),
          lookupResult('b.eth', records()),
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
    })
  })

  it('leaves out names without records so callers fail closed', async () => {
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
        data: inputs.map(({ name }) => lookupResult(name, records())),
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
