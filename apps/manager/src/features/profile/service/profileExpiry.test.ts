import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getV1Expiry: vi.fn(),
  getV2Expiry: vi.fn(),
  getV2RegistrationDate: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getExpiry: mocks.getV1Expiry,
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getExpiry: mocks.getV2Expiry,
  getRegistrationDate: mocks.getV2RegistrationDate,
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import { getExpiry } from './profileExpiry'

describe('getExpiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses V1 registrar expiry when V2 has no registration date', async () => {
    mocks.getV2RegistrationDate.mockResolvedValue(null)
    mocks.getV2Expiry.mockResolvedValue(1_801_218_936n)
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 1_793_442_936n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('fgeorgescu.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({ expiry: 1_793_442_936n })
    expect(mocks.getV1Expiry).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
    })
    expect(mocks.getV2Expiry).not.toHaveBeenCalled()
  })
})
