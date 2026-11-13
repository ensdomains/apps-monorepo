import type { RegistryLabel } from '@ens-apps/indexer/bigname'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getRegistryLabelOwnersQueryOptions } from './getRegistryLabelOwners'

vi.mock('@/lib/bigname', () => ({ bigname: { registryLabels: vi.fn() } }))

const REGISTRY = '0x1111111111111111111111111111111111111111'
const OWNER = '0x2222222222222222222222222222222222222222'

const label = (name: string, owner?: string): RegistryLabel =>
  ({
    name,
    display_name: name,
    namespace: 'ens',
    namehash: '0x01',
    status: 'active',
    ...(owner && { owner }),
  }) as RegistryLabel

const page = (
  data: readonly RegistryLabel[],
  {
    next,
    isPartial = false,
  }: { readonly next?: string; readonly isPartial?: boolean } = {},
): ReturnType<typeof bigname.registryLabels> =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next ?? null,
      page_size: 100,
      total_count: null,
      has_more: Boolean(next),
    },
    meta: { as_of: {}, ...(isPartial && { completeness: 'partial' }) },
  })

const readOwners = async () => {
  const observer = new QueryObserver(new QueryClient(), {
    ...getRegistryLabelOwnersQueryOptions({ registryAddress: REGISTRY }),
    retry: false,
  })
  const result = await observer.refetch()
  observer.destroy()
  return result
}

beforeEach(() => vi.clearAllMocks())

describe('getRegistryLabelOwnersQueryOptions', () => {
  it('collects the owner of every label across pages, skipping labels without one', async () => {
    vi.mocked(bigname.registryLabels)
      .mockReturnValueOnce(
        page([label('a.x.eth', OWNER), label('b.x.eth')], { next: 'c1' }),
      )
      .mockReturnValueOnce(page([label('c.x.eth', OWNER)]))

    const result = await readOwners()

    expect(result.data).toEqual([OWNER, OWNER])
  })

  it('refuses a partial list, so ownership is never guessed', async () => {
    vi.mocked(bigname.registryLabels).mockReturnValueOnce(
      page([label('a.x.eth', OWNER)], { isPartial: true }),
    )

    const result = await readOwners()

    expect(result.status).toBe('error')
  })
})
