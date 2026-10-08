import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import type { NameExpiryRenderOptions } from './name-expiry.js'
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
})
