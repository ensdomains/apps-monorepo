import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/profile/service/profileExpiry', () => ({
  getExpiry: vi.fn(),
}))
vi.mock('@/features/renew/data/queries/v1Renewable.query', () => ({
  getIsV1Renewable: vi.fn(),
}))

import { okAsync } from 'neverthrow'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import { getIsV1Renewable } from '@/features/renew/data/queries/v1Renewable.query'
import {
  getGracePeriodRenewalQuote,
  getGraceRenewalDuration,
} from './gracePeriodRenewal'

const DAY = 86_400n
const NOW = 1_800_000_000n

describe('fixed migration grace renewal', () => {
  it('pays the full grace debt plus seven days, even near the end of grace', () => {
    expect(getGraceRenewalDuration(NOW - 89n * DAY, NOW)).toBe(96n * DAY)
  })

  it('uses seven days at the start of grace', () => {
    expect(getGraceRenewalDuration(NOW, NOW)).toBe(7n * DAY)
  })

  it('refuses active names and names at or beyond the grace boundary', () => {
    expect(getGraceRenewalDuration(NOW + 1n, NOW)).toBeNull()
    expect(getGraceRenewalDuration(NOW - 90n * DAY, NOW)).toBeNull()
    expect(getGraceRenewalDuration(NOW - 91n * DAY, NOW)).toBeNull()
  })

  it('uses current contract expiry and renewability for the quote', async () => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    vi.mocked(getExpiry).mockReturnValue(
      okAsync({ expiry: now - DAY, protocol: 'v1', isNonExpiring: false }),
    )
    vi.mocked(getIsV1Renewable).mockReturnValue(okAsync(true))
    const result = await getGracePeriodRenewalQuote('alice.eth')
    expect(result.isOk()).toBe(true)
    if (result.isOk())
      expect(result.value.duration).toBeGreaterThanOrEqual(8n * DAY)
    expect(getExpiry).toHaveBeenCalledWith('alice.eth', 'v1')
  })

  it('refuses a name the V1 renewer no longer accepts', async () => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    vi.mocked(getExpiry).mockReturnValue(
      okAsync({ expiry: now - DAY, protocol: 'v1', isNonExpiring: false }),
    )
    vi.mocked(getIsV1Renewable).mockReturnValue(okAsync(false))
    expect((await getGracePeriodRenewalQuote('alice.eth')).isErr()).toBe(true)
  })
})
