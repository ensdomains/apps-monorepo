import { BignameError, type SubnameRow } from '@ens-apps/bigname'
import { labelhash, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListSubnames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { listSubnames: mockListSubnames },
}))

const { getSubnameCount, getSubnames, toSubnames } = await import(
  './useSubnames'
)

const OWNER = '0x1234567890123456789012345678901234567890'
const OWNER_CHECKSUM = '0x1234567890123456789012345678901234567890'

const row = (name: string, overrides: Partial<SubnameRow> = {}): SubnameRow => {
  const label = name.split('.')[0] as string
  return {
    name,
    display_name: name,
    namespace: 'ens',
    namehash: namehash(name),
    labelhash: labelhash(label),
    owner: OWNER,
    ...overrides,
  }
}

const page = (data: SubnameRow[], total_count = data.length) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count,
    has_more: false,
  },
  meta: {},
})

describe('getSubnames', () => {
  beforeEach(() => {
    mockListSubnames.mockReset()
  })

  it('lists live subnames from bigname, ENSv1 and ENSv2 alike', async () => {
    mockListSubnames.mockResolvedValue(page([row('sub.test.eth')]))

    const result = await getSubnames({ name: 'test.eth' })

    expect(result._unsafeUnwrap()).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: labelhash('sub'),
        namehash: namehash('sub.test.eth'),
        owner: OWNER_CHECKSUM,
      },
    ])
    expect(mockListSubnames).toHaveBeenCalledWith('test.eth', {
      include_expired: false,
      sort: 'name',
      page_size: 200,
      cursor: undefined,
    })
  })

  it('returns no subnames for a parent bigname has not indexed', async () => {
    mockListSubnames.mockRejectedValue(
      new BignameError({
        status: 404,
        code: 'not_found',
        message: 'name not found',
        url: '/v1/names/nope.eth/subnames',
      }),
    )

    const result = await getSubnames({ name: 'nope.eth' })

    expect(result._unsafeUnwrap()).toEqual([])
  })

  it('surfaces other bigname failures', async () => {
    mockListSubnames.mockRejectedValue(
      new BignameError({
        status: 503,
        code: 'overloaded',
        message: 'try later',
        url: '/v1/names/test.eth/subnames',
      }),
    )

    const result = await getSubnames({ name: 'test.eth' })

    expect(result.isErr()).toBe(true)
  })
})

describe('toSubnames', () => {
  // `[<labelhash>].<parent>` is bigname's placeholder for a label it cannot
  // state; it is not a name and must not reach a name route or a delete.
  it('drops rows bigname could not state as a name', () => {
    const hidden = labelhash('hidden').slice(2)
    const rows = [
      row('sub.test.eth'),
      row(`[${hidden}].test.eth`, { labelhash: labelhash('hidden') }),
      row('\\377bad.test.eth', { labelhash: labelhash('something-else') }),
    ]

    expect(toSubnames(rows, 'test.eth').map((s) => s.name)).toEqual([
      'sub.test.eth',
    ])
  })

  // The row's name can carry a parent label bigname learned after indexing
  // the child, so the name is rebuilt from the child's label and the parent.
  it('names each subname from its label and the parent asked for', () => {
    const staleParent = labelhash('phantombug01').slice(2)
    const rows = [
      row(`1.[${staleParent}].eth`, {
        labelhash: labelhash('1'),
        namehash: namehash('1.phantombug01.eth'),
      }),
    ]

    expect(toSubnames(rows, 'phantombug01.eth')).toEqual([
      {
        name: '1.phantombug01.eth',
        labelName: '1',
        labelhash: labelhash('1'),
        namehash: namehash('1.phantombug01.eth'),
        owner: OWNER_CHECKSUM,
      },
    ])
  })

  it('drops rows with no current owner', () => {
    expect(
      toSubnames([row('gone.test.eth', { owner: undefined })], 'test.eth'),
    ).toEqual([])
  })
})

describe('getSubnameCount', () => {
  beforeEach(() => {
    mockListSubnames.mockReset()
  })

  it("reads bigname's exact total rather than counting a page", async () => {
    mockListSubnames.mockResolvedValue(page([row('a.test.eth')], 38))

    const result = await getSubnameCount({ name: 'test.eth' })

    expect(result._unsafeUnwrap()).toBe(38)
    expect(mockListSubnames).toHaveBeenCalledWith('test.eth', {
      include_expired: false,
      page_size: 1,
    })
  })
})
