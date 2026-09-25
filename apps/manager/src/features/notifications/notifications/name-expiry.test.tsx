import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { describe, expect, it } from 'vitest'
import { getNameExpiryStaticPresentation } from './name-expiry'

const presentation = (
  stage?: PersonalNotificationPayloads['name-expiry']['stage'],
) =>
  getNameExpiryStaticPresentation({
    name: 'alice.eth',
    expiryDate: Date.now() + 86_400_000,
    stage,
    isOwner: true,
    watchReason: 'owned',
  })

describe('static name expiry presentation', () => {
  it.each([
    'expiry-30d',
    'expiry-7d',
    'expiry-1d',
  ] as const)('keeps %s as a renewal notification', (stage) =>
    expect(presentation(stage).action).toBe('renew'))

  it('renders grace-start as renewable grace history', () => {
    expect(presentation('grace-start')).toMatchObject({
      action: 'renew',
      statusText: 'Grace period started',
    })
  })

  it.each([
    ['grace-7d', '7 days remaining'],
    ['grace-1d', '1 day remaining'],
  ] as const)('renders %s as grace ending', (stage, statusText) => {
    expect(presentation(stage)).toMatchObject({ action: 'renew', statusText })
  })

  it('renders premium-start as registration history', () => {
    expect(presentation('premium-start')).toMatchObject({
      action: 'register',
      statusText: 'Grace period ended',
    })
  })

  it('retains the legacy no-stage fallback', () => {
    expect(presentation()).toMatchObject({ action: 'renew' })
  })
})
