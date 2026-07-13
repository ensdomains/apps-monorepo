import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensjsMocks = vi.hoisted(() => ({
  getName: vi.fn(),
  getNames: vi.fn(),
  getRecords: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public', () => ensjsMocks)

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({}),
}))

import { getReverseName } from './profileReverseName'

const ADDRESS = '0xA6362Dcb7Db14C357E788C876eE99e1f982f1115' as Address

describe('getReverseName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to getName when the batched reverse name cannot be validated', async () => {
    ensjsMocks.getNames.mockResolvedValue([' v21rtl.eth'])
    ensjsMocks.getRecords.mockRejectedValueOnce(
      new Error('Invalid label " v21rtl": disallowed character: " "'),
    )
    ensjsMocks.getName.mockResolvedValue({
      match: true,
      name: 'fgeorgescu.eth',
    })

    const result = await getReverseName(ADDRESS)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('fgeorgescu.eth')
    expect(ensjsMocks.getName).toHaveBeenCalledWith(
      {},
      {
        address: ADDRESS,
        allowMismatch: true,
      },
    )
  })
})
