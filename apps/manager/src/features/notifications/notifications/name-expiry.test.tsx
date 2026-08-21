import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NameExpiryComponent } from './name-expiry'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

const expiryDate = new Date('2026-03-13T12:00:00Z')

const renderExpiry = (
  overrides: Partial<Parameters<typeof NameExpiryComponent>[0]['payload']> = {},
  now: Date,
) => {
  vi.setSystemTime(now)
  return render(
    <NameExpiryComponent
      payload={{
        name: 'alice.eth',
        expiryDate: expiryDate.getTime(),
        protocol: 'v2',
        stage: 'expiry-7d',
        watchReason: 'owned',
        ...overrides,
      }}
      seen={false}
      timestamp={now.getTime()}
    />,
  )
}

describe('NameExpiryComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('links pre-expiry names to renew', () => {
    const now = new Date(expiryDate.getTime() - 7 * MS_PER_DAY)
    const { getByText } = renderExpiry({ stage: 'expiry-7d' }, now)
    const link = getByText('Renew Now')
    expect(link).toHaveAttribute('to', '/renew/$name')
  })

  it('links grace names to renew instead of register', () => {
    const stillInGrace = new Date(expiryDate.getTime() + MS_PER_DAY)
    const { getByText, queryByText } = renderExpiry(
      { stage: 'grace-start' },
      stillInGrace,
    )

    expect(getByText('Renew Now')).toHaveAttribute('to', '/renew/$name')
    expect(queryByText('Register Name')).toBeNull()
  })

  it('links past-grace names to register', () => {
    const pastGrace = getGraceEndDate(expiryDate, 'v2')
    const { getByText } = renderExpiry({ stage: 'premium-start' }, pastGrace)
    expect(getByText('Register Name')).toHaveAttribute('to', '/register/$name')
  })
})
