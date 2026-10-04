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
  describe('subnames', () => {
    const subname = (
      stage: PersonalNotificationPayloads['name-expiry']['stage'],
      expiryDate = Date.now() + 7 * 86_400_000,
    ) =>
      getNameExpiryStaticPresentation({
        name: 'pay.alice.eth',
        expiryDate,
        stage,
        isOwner: true,
        watchReason: 'owned',
      })

    it.each([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
    ] as const)('names the parent owner without an action at %s', (stage) => {
      expect(subname(stage)).toMatchObject({
        description:
          'This name is expiring soon. The owner of alice.eth can extend it.',
        action: 'none',
      })
    })

    it('says an expired subname has expired', () => {
      expect(subname('expired', Date.now() - 1_000)).toEqual({
        description:
          'This name has expired. The owner of alice.eth can extend it.',
        statusText: 'Expired',
        action: 'none',
      })
    })

    it('reads a stageless subname row from its expiry', () => {
      expect(subname(undefined, Date.now() - 1_000).description).toBe(
        'This name has expired. The owner of alice.eth can extend it.',
      )
    })
  })

  it('keeps an expired .eth name renewable in its grace', () => {
    expect(presentation('expired')).toMatchObject({
      action: 'renew',
      statusText: 'Grace period started',
    })
  })
})
