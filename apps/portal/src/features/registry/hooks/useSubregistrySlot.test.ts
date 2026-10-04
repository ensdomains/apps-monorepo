import { beforeEach, describe, expect, it, vi } from 'vitest'

const getNameHistory = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getNameHistory } }))

const { sepoliaWithEns } = await import('@/lib/wagmi')
const { getSubregistryHistory } = await import('./useSubregistrySlot')

const V1_REGISTRY = sepoliaWithEns.contracts.ensRegistry?.address.toLowerCase()
const V2_REGISTRY = '0x541c00000000000000000000000000000000976f'

const rows = (contracts: (string | null | undefined)[], hasMore = false) => ({
  data: contracts.map((contract_address) => ({
    type: 'subregistry',
    contract_address,
  })),
  page: {
    cursor: null,
    next_cursor: hasMore ? 'next' : null,
    page_size: 50,
    total_count: contracts.length,
    has_more: hasMore,
  },
  meta: {},
})

describe('getSubregistryHistory', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    getNameHistory.mockResolvedValue(rows([]))
  })

  it('reads the subregistry rows of the normalized name', async () => {
    const result = await getSubregistryHistory({ name: 'Test.eth' })

    expect(result._unsafeUnwrap()).toBe(0)
    expect(getNameHistory).toHaveBeenCalledWith('test.eth', {
      type: 'subregistry',
      include: ['data'],
      page_size: 50,
    })
  })

  it('counts ENSv2 links but not ENSv1 NewOwner rows', async () => {
    getNameHistory.mockResolvedValue(rows([V1_REGISTRY, V2_REGISTRY]))
    expect(
      (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap(),
    ).toBe(1)

    getNameHistory.mockResolvedValue(rows([V1_REGISTRY]))
    expect(
      (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap(),
    ).toBe(0)
  })

  it('counts a row with no emitting contract rather than reading it as none', async () => {
    getNameHistory.mockResolvedValue(rows([null]))
    expect(
      (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap(),
    ).toBe(1)
  })

  it('answers unknown when the window held only ENSv1 rows and more remain', async () => {
    getNameHistory.mockResolvedValue(rows([V1_REGISTRY], true))
    expect(
      (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap(),
    ).toBeNull()
  })

  // A zero count here would read as never-configured and offer the configure
  // form — so a name with no canonical node must come back unknown, unasked.
  it('answers unknown, without querying, for a name that does not normalize', async () => {
    const result = await getSubregistryHistory({ name: 'te‍st.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
    expect(getNameHistory).not.toHaveBeenCalled()
  })
})
