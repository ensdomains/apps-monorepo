import type { RecordInventory } from '@ens-apps/bigname'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { describe, expect, it, vi } from 'vitest'

const getName = vi.fn()
const getNameRecords = vi.fn()
const getRecords = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getName, getNameRecords } }))
vi.mock('./useRecords', () => ({ getRecords }))

const { getProfileQueryOptions, recordKeysToRead } = await import(
  './useProfile'
)

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: [],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: null,
  ...overrides,
})

describe('recordKeysToRead', () => {
  it('reads the default keys when bigname has no inventory for the name', () => {
    const { texts, coins } = recordKeysToRead(undefined)

    expect(texts).toEqual([
      'name',
      'description',
      'com.twitter',
      'org.telegram',
      'header',
      'avatar',
    ])
    expect(coins).toContain(coinNameToTypeMap.eth)
    expect(coins).toContain(coinNameToTypeMap.btc)
  })

  it('adds every key the inventory knows is set, without duplicates', () => {
    const { texts, coins } = recordKeysToRead(
      inventory({
        known_keys: [
          'text:url',
          'text:name',
          'avatar',
          'addr:60',
          'addr:2147492101',
          'contenthash',
        ],
      }),
    )

    expect(texts).toContain('url')
    expect(texts.filter((key) => key === 'name')).toHaveLength(1)
    expect(texts.filter((key) => key === 'avatar')).toHaveLength(1)
    expect(coins).toContain(2147492101)
    expect(coins.filter((coin) => coin === 60)).toHaveLength(1)
  })

  // An unsupported key is one bigname cannot vouch for either way, not an
  // unset one, so the chain is asked about it.
  it('reads keys bigname cannot vouch for too', () => {
    const { texts, coins } = recordKeysToRead(
      inventory({ unsupported_keys: ['text:com.github', 'addr:501'] }),
    )

    expect(texts).toContain('com.github')
    expect(coins).toContain(501)
  })

  it('does not read keys the inventory says are unset', () => {
    const { texts } = recordKeysToRead(
      inventory({ unset_keys: ['text:email'] }),
    )

    expect(texts).not.toContain('email')
  })
})

describe('getProfileQueryOptions', () => {
  const read = () => {
    const { queryFn, queryKey } = getProfileQueryOptions({
      name: 'jefflau.eth',
    })
    return (queryFn as (context: unknown) => Promise<unknown>)({ queryKey })
  }

  it('reports a name that resolves to nothing instead of reading default keys', async () => {
    getNameRecords.mockResolvedValue({ data: { inventory: inventory() } })
    getName.mockResolvedValue({
      data: {
        status: 'ok',
        name: 'jefflau.eth',
        unresolvable_reason: 'no_live_ens_v2_entry',
      },
    })
    getRecords.mockReset()

    await expect(read()).resolves.toMatchObject({
      unresolvableReason: 'no_live_ens_v2_entry',
      records: { texts: [], coins: [] },
    })
    expect(getRecords).not.toHaveBeenCalled()
  })
})
