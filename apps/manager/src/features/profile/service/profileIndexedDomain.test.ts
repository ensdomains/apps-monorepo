import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }))

vi.mock('@ens-apps/indexer/urql', () => ({
  default: {},
  graphqlRequest: mocks.graphqlRequest,
}))

import { getProfileIndexedDomain } from './profileIndexedDomain'

describe('getProfileIndexedDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shares concurrent reads but fetches again after they settle', async () => {
    let resolveFirst: (value: {
      domain: { registrationDate: number }
    }) => void = () => undefined
    mocks.graphqlRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    mocks.graphqlRequest.mockResolvedValueOnce({
      domain: { registrationDate: 2 },
    })

    const first = getProfileIndexedDomain('example.eth')
    const second = getProfileIndexedDomain('example.eth')
    expect(first).toBe(second)
    expect(mocks.graphqlRequest).toHaveBeenCalledTimes(1)

    resolveFirst({ domain: { registrationDate: 1 } })
    await expect(first).resolves.toEqual({ registrationDate: 1 })
    await expect(getProfileIndexedDomain('example.eth')).resolves.toEqual({
      registrationDate: 2,
    })
    expect(mocks.graphqlRequest).toHaveBeenCalledTimes(2)
  })
})
