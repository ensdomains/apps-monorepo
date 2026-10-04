import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import {
  buildNameExpiryDeliveryContext,
  type NameExpiryRenderOptions,
} from './name-expiry.js'
import { buildNameExpiryPushNotification } from './push.js'
import { buildNameExpiryTelegramMessage } from './telegram.js'

const expiry = new Date('2026-03-13T12:00:00Z')
const payload = (
  overrides: Partial<PersonalNotificationPayloads['name-expiry']> = {},
): PersonalNotificationPayloads['name-expiry'] => ({
  name: 'alice.eth',
  expiryDate: expiry.getTime(),
  stage: 'expiry-7d',
  isOwner: true,
  watchReason: 'owned',
  ...overrides,
})
const options = (now: Date): NameExpiryRenderOptions => ({
  managerAppUrl: 'https://app.ens.dev',
  now,
})

describe('name expiry lifecycle delivery rendering', () => {
  it('uses stage-specific push copy and encoded navigation paths', () => {
    const grace = buildNameExpiryPushNotification(
      payload({ name: 'foo/bar.eth', stage: 'grace-7d' }),
      options(
        new Date(getGraceEndDate(expiry, 'v2').getTime() - 7 * MS_PER_DAY),
      ),
    )
    const premium = buildNameExpiryPushNotification(
      payload({ name: 'foo/bar.eth', stage: 'premium-start' }),
      options(getGraceEndDate(expiry, 'v2')),
    )
    expect(grace.title).toBe('ENS grace period ending soon')
    expect(grace.data?.url).toBe('/renew/foo%2Fbar.eth')
    expect(premium.title).toBe('ENS grace period ended')
    expect(premium.data?.url).toBe('/register/foo%2Fbar.eth')
  })

  it('renders hostile Telegram names literally and uses an absolute Manager URL', () => {
    const message = buildNameExpiryTelegramMessage(
      payload({ name: 'foo<script>\n&.eth', stage: 'grace-start' }),
      options(expiry),
    )
    expect(message.parseMode).toBe('HTML')
    expect(message.text).toContain('<code>foo&lt;script&gt;&amp;.eth</code>')
    expect(message.text).not.toContain('<script>')
    expect(message.buttons?.[0]?.[0]?.url).toBe(
      'https://app.ens.dev/renew/foo%3Cscript%3E%26.eth',
    )
  })

  it('counts down to the grace end the payload carries (ENSv1 leases: 90 days)', () => {
    const graceEndDate = expiry.getTime() + 90 * MS_PER_DAY
    const context = buildNameExpiryDeliveryContext(
      { ...payload({ stage: 'grace-7d' }), graceEndDate },
      options(new Date(graceEndDate - 7 * MS_PER_DAY)),
    )
    expect(context.graceEndDate).toEqual(new Date(graceEndDate))
    expect(context.daysUntilGraceEnd).toBe(7)
  })

  it('falls back to the ENSv2 grace for payloads written without a grace end', () => {
    const context = buildNameExpiryDeliveryContext(
      payload({ stage: 'grace-start' }),
      options(expiry),
    )
    expect(context.graceEndDate).toEqual(getGraceEndDate(expiry, 'v2'))
  })
  describe('subnames', () => {
    const subname = (stage: 'expiry-7d' | 'expired') =>
      payload({ name: 'pay.alice.eth', stage })

    it('names the parent owner and links to the profile instead of renewing', () => {
      const pre = buildNameExpiryPushNotification(
        subname('expiry-7d'),
        options(new Date(expiry.getTime() - 7 * MS_PER_DAY)),
      )
      const expired = buildNameExpiryPushNotification(
        subname('expired'),
        options(expiry),
      )

      expect(pre).toMatchObject({
        title: 'ENS name expiring soon',
        body: 'pay.alice.eth expires in 7 days. The owner of alice.eth can extend it',
        data: { url: '/pay.alice.eth', stage: 'expiry-7d' },
      })
      expect(expired).toMatchObject({
        title: 'ENS name expired',
        body: 'pay.alice.eth has expired. The owner of alice.eth can extend it',
        data: { url: '/pay.alice.eth', stage: 'expired' },
      })
    })

    it.each([
      'expiry-7d',
      'expired',
    ] as const)('sends %s to Telegram with a profile button and no renewal', (stage) => {
      const message = buildNameExpiryTelegramMessage(
        subname(stage),
        options(expiry),
      )

      expect(message.text).toContain(
        'The owner of <code>alice.eth</code> can extend it.',
      )
      expect(message.text).not.toMatch(/renew|register/i)
      expect(message.buttons).toEqual([
        [{ text: 'View Name', url: 'https://app.ens.dev/pay.alice.eth' }],
      ])
    })

    it('treats any name but a .eth second-level name as a subname', () => {
      expect(
        buildNameExpiryDeliveryContext(
          payload({ name: 'sub.example.com', stage: 'expired' }),
          options(expiry),
        ).notice,
      ).toEqual({ kind: 'subname-expired', parentName: 'example.com' })
      expect(
        buildNameExpiryDeliveryContext(payload(), options(expiry)).notice,
      ).toEqual({ kind: 'pre-expiry' })
    })

    it('reads a stageless legacy subname payload as pre-expiry or expired', () => {
      const notice = (now: Date) =>
        buildNameExpiryDeliveryContext(
          payload({ name: 'pay.alice.eth', stage: undefined }),
          options(now),
        ).notice.kind
      expect(notice(new Date(expiry.getTime() - MS_PER_DAY))).toBe(
        'subname-pre-expiry',
      )
      expect(notice(new Date(expiry.getTime() + MS_PER_DAY))).toBe(
        'subname-expired',
      )
    })
  })
})
