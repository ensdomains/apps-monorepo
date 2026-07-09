import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getBlock: vi.fn(),
  getNameHistory: vi.fn(),
  getRegistrationDate: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getRegistrationDate: mocks.getRegistrationDate,
}))

vi.mock('@ensdomains/ensjs/subgraph', () => ({
  getNameHistory: mocks.getNameHistory,
}))

vi.mock('viem/actions', () => ({
  getBlock: mocks.getBlock,
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import { getRegistration } from './profileRegistration'

describe('getRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the V1 registration event block timestamp when V2 has no registration date', async () => {
    mocks.getRegistrationDate.mockResolvedValue(null)
    mocks.getNameHistory.mockResolvedValue({
      domainEvents: [],
      registrationEvents: [
        {
          blockNumber: 9529458,
          type: 'NameRegistered',
        },
      ],
      resolverEvents: [],
    })
    mocks.getBlock.mockResolvedValue({ timestamp: 1_761_906_936n })

    const result = await getRegistration('fgeorgescu.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_761_906_936 })
    expect(mocks.getNameHistory).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
      orderDirection: 'asc',
      first: 1,
    })
    expect(mocks.getBlock).toHaveBeenCalledWith(mocks.client, {
      blockNumber: 9529458n,
    })
  })
})
