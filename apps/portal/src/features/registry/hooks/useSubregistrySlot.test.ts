import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: mockGraphqlRequest,
  },
}))

const { getSubregistryHistory } = await import('./useSubregistrySlot')

describe('getSubregistryHistory', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue({ eventConnection: { totalCount: 0 } })
  })

  it('looks up the normalized node of a mixed-case name', async () => {
    const result = await getSubregistryHistory({ name: 'Test.eth' })

    expect(result._unsafeUnwrap()).toBe(0)
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      namehash: namehash('test.eth'),
    })
  })

  // A zero count here would read as never-configured and offer the configure
  // form — so a name with no canonical node must come back unknown, unasked.
  it('answers unknown, without querying, for a name that does not normalize', async () => {
    const result = await getSubregistryHistory({ name: 'te‍st.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
    expect(mockGraphqlRequest).not.toHaveBeenCalled()
  })
})
