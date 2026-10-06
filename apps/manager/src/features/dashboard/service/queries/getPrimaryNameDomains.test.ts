import type { DomainsQuery } from '@ens-apps/indexer'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetDomainsError, getDomains } from './getDashboardDomains'
import { getPrimaryNameDomains } from './getPrimaryNameDomains'

vi.mock('./getDashboardDomains', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./getDashboardDomains')>()),
  getDomains: vi.fn(),
}))

const domain = (index: number) =>
  ({
    id: `name-${index}.eth`,
    name: `name-${index}.eth`,
  }) as DomainsQuery['domains'][number]

describe('getPrimaryNameDomains', () => {
  beforeEach(() => {
    vi.mocked(getDomains).mockReset()
  })

  it('fetches every page, including names beyond the old 100-name limit', async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => domain(index))
    const finalPage = [domain(200)]
    vi.mocked(getDomains)
      .mockReturnValueOnce(okAsync({ domains: firstPage }))
      .mockReturnValueOnce(okAsync({ domains: finalPage }))
    const result = await getPrimaryNameDomains('0xABC')
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual([...firstPage, ...finalPage])
    expect(getDomains).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { owner: '0xabc' },
        first: 200,
        skip: 0,
      }),
    )
    expect(getDomains).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 200 }),
    )
  })

  it('returns an empty list for an account with no names', async () => {
    vi.mocked(getDomains).mockReturnValueOnce(okAsync({ domains: [] }))
    expect((await getPrimaryNameDomains('0xabc'))._unsafeUnwrap()).toEqual([])
    expect(getDomains).toHaveBeenCalledTimes(1)
  })

  it('reports a failed later page instead of returning incomplete search results', async () => {
    const error = new GetDomainsError({
      cause: new Error('Indexer unavailable'),
    })
    vi.mocked(getDomains)
      .mockReturnValueOnce(
        okAsync({
          domains: Array.from({ length: 200 }, (_, index) => domain(index)),
        }),
      )
      .mockReturnValueOnce(errAsync(error))
    expect((await getPrimaryNameDomains('0xabc'))._unsafeUnwrapErr()).toBe(
      error,
    )
  })
})
