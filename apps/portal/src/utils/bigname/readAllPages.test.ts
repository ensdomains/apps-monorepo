import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { readAllPages } from './readAllPages'

const page = (data: readonly number[], next: string | null) =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next,
      page_size: data.length,
      total_count: null,
      has_more: next !== null,
    },
    meta: { as_of: {} },
  })

const stale = () =>
  errAsync(new BignameError({ code: 'stale', status: 409, message: 'stale' }))

describe('readAllPages', () => {
  it('follows the cursor to the last page', async () => {
    const read = vi
      .fn()
      .mockReturnValueOnce(page([1, 2], 'b'))
      .mockReturnValueOnce(page([3], null))

    expect((await readAllPages(read))._unsafeUnwrap()).toEqual([1, 2, 3])
    expect(read).toHaveBeenLastCalledWith('b')
  })

  it('restarts from the first page when a continuation goes stale', async () => {
    const read = vi
      .fn()
      .mockReturnValueOnce(page([1], 'b'))
      .mockReturnValueOnce(stale())
      .mockReturnValueOnce(page([1], 'b'))
      .mockReturnValueOnce(page([2], null))

    expect((await readAllPages(read))._unsafeUnwrap()).toEqual([1, 2])
  })

  it('fails on a stale first page, which a restart would not fix', async () => {
    const read = vi.fn().mockReturnValue(stale())

    expect((await readAllPages(read)).isErr()).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
