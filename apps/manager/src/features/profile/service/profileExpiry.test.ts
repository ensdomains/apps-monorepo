import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { getExpiry, getProfileExpiryResultStatus } from './profileExpiry'

describe('getExpiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getV2Expiry.mockResolvedValue(0n)
    mocks.getV2RegistrationDate.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses V1 registrar expiry when V2 has no registration date', async () => {
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 1_793_442_936n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('fgeorgescu.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_793_442_936n,
      isNonExpiring: false,
      protocol: 'v1',
    })
    expect(mocks.getV1Expiry).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
    })
  })

  it('uses V1 registrar expiry when V2 expiry exists without V2 registration date', async () => {
    mocks.getV2Expiry.mockResolvedValue(1_801_218_936n)
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 1_793_442_936n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('fgeorgescu.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_793_442_936n,
      isNonExpiring: false,
      protocol: 'v1',
    })
    expect(mocks.getV2RegistrationDate).toHaveBeenCalledWith(mocks.client, {
      label: 'fgeorgescu',
      registryAddress: expect.any(String),
    })
    expect(mocks.getV1Expiry).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
    })
  })

  it('uses V2 expiry when V2 expiry exists with V2 registration date', async () => {
    mocks.getV2Expiry.mockResolvedValue(1_801_218_936n)
    mocks.getV2RegistrationDate.mockResolvedValue(1_760_000_000n)

    const result = await getExpiry('fgeorgescu.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_801_218_936n,
      isNonExpiring: false,
      protocol: 'v2',
    })
    expect(mocks.getV2RegistrationDate).toHaveBeenCalledWith(mocks.client, {
      label: 'fgeorgescu',
      registryAddress: expect.any(String),
    })
    expect(mocks.getV1Expiry).not.toHaveBeenCalled()
  })

  it('preserves non-expiring V1 fallback state', async () => {
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 0n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('pokemon.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: null,
      isNonExpiring: true,
      protocol: 'v1',
    })
  })

  it('uses V1 grace rules for V1 fallback expiry results', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-02-15T00:00:00Z'))

    const status = getProfileExpiryResultStatus({
      expiry: BigInt(
        Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
      ),
      isNonExpiring: false,
      protocol: 'v1',
    })

    expect(status.isInGrace).toBe(true)
  })
})
