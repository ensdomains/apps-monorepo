import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import {
  buildNameExpiryEmailContent,
  type NameExpiryRenderOptions,
} from './name-expiry.js'
import { buildNameExpiryPushNotification } from './push.js'
import { buildNameExpiryTelegramMessage } from './telegram.js'

const expiryDate = new Date('2026-03-13T12:00:00Z')
const TEST_APP_URL = 'https://app.ens.dev'

const payload = (
  overrides: Partial<PersonalNotificationPayloads['name-expiry']> = {},
): PersonalNotificationPayloads['name-expiry'] => ({
  name: 'alice.eth',
  expiryDate: expiryDate.getTime(),
  protocol: 'v2',
  stage: 'expiry-7d',
  watchReason: 'owned',
  ...overrides,
})

const options = (now: Date): NameExpiryRenderOptions => ({
  managerAppUrl: TEST_APP_URL,
  now,
})

describe('name-expiry email mapping', () => {
  it('exposes pre-expiry dynamic data from stage, not days-until-expiry alone', () => {
    const now = new Date(expiryDate.getTime() - 7 * MS_PER_DAY)
    const { dynamicData, subject } = buildNameExpiryEmailContent(
      payload({ stage: 'expiry-7d' }),
      options(now),
    )

    expect(subject).toBe('Domain expiration alert')
    expect(dynamicData).toMatchObject({
      name: 'alice.eth',
      protocol: 'v2',
      stage: 'expiry-7d',
      lifecycleState: 'expiring',
      daysUntilExpiry: 7,
      daysUntilGraceEnd: 35,
      renewUrl: `${TEST_APP_URL}/renew/alice.eth`,
      registerUrl: `${TEST_APP_URL}/register/alice.eth`,
    })
    expect(dynamicData.graceEndDate).toBe(
      getGraceEndDate(expiryDate, 'v2').toLocaleDateString(),
    )
  })

  it('exposes grace-start dynamic data', () => {
    const { dynamicData, subject } = buildNameExpiryEmailContent(
      payload({ stage: 'grace-start' }),
      options(expiryDate),
    )

    expect(subject).toBe('Domain grace period started')
    expect(dynamicData).toMatchObject({
      stage: 'grace-start',
      lifecycleState: 'grace',
      daysUntilExpiry: 0,
      daysUntilGraceEnd: 28,
    })
  })

  it('exposes grace-ending dynamic data from the 28-day v2 window', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const now = new Date(graceEnd.getTime() - MS_PER_DAY)
    const { dynamicData, subject } = buildNameExpiryEmailContent(
      payload({ stage: 'grace-1d' }),
      options(now),
    )

    expect(subject).toBe('Domain grace period ending soon')
    expect(dynamicData).toMatchObject({
      stage: 'grace-1d',
      lifecycleState: 'grace',
      daysUntilGraceEnd: 1,
    })
  })

  it('exposes premium-start dynamic data', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const { dynamicData, subject } = buildNameExpiryEmailContent(
      payload({ stage: 'premium-start' }),
      options(graceEnd),
    )

    expect(subject).toBe('Domain grace period ended')
    expect(dynamicData).toMatchObject({
      stage: 'premium-start',
      lifecycleState: 'premium',
      daysUntilGraceEnd: 0,
      registerUrl: `${TEST_APP_URL}/register/alice.eth`,
    })
  })

  it('leaves the name unescaped for Handlebars and URL-encodes path segments', () => {
    const { dynamicData } = buildNameExpiryEmailContent(
      payload({ name: '{{constructor}}.eth' }),
      options(expiryDate),
    )

    expect(dynamicData.name).toBe('{{constructor}}.eth')
    expect(dynamicData.renewUrl).toBe(
      `${TEST_APP_URL}/renew/%7B%7Bconstructor%7D%7D.eth`,
    )
  })
})

describe('name-expiry telegram copy', () => {
  it('describes pre-expiry as expiring with a renew action', () => {
    const now = new Date(expiryDate.getTime() - 7 * MS_PER_DAY)
    const message = buildNameExpiryTelegramMessage(
      payload({ stage: 'expiry-7d' }),
      options(now),
    )

    expect(message.parseMode).toBe('HTML')
    expect(message.text).toContain('expires in <b>7 days</b>')
    expect(message.buttons?.[0]?.[0]).toMatchObject({
      text: 'Renew Now',
      url: `${TEST_APP_URL}/renew/alice.eth`,
    })
  })

  it('describes grace-start as expired but still renewable', () => {
    const message = buildNameExpiryTelegramMessage(
      payload({ stage: 'grace-start' }),
      options(expiryDate),
    )

    expect(message.text).toContain('Grace period started')
    expect(message.text).toContain('has expired but can still be renewed')
    expect(message.buttons?.[0]?.[0]?.text).toBe('Renew Now')
  })

  it('describes grace-ending as the grace period ending soon', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const now = new Date(graceEnd.getTime() - MS_PER_DAY)
    const message = buildNameExpiryTelegramMessage(
      payload({ stage: 'grace-1d' }),
      options(now),
    )

    expect(message.text).toContain('Grace period ending soon')
    expect(message.text).toContain('ends in <b>1 day</b>')
    expect(message.buttons?.[0]?.[0]?.text).toBe('Renew Now')
  })

  it('describes premium-start as post-grace temporary premium', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const message = buildNameExpiryTelegramMessage(
      payload({ stage: 'premium-start' }),
      options(graceEnd),
    )

    expect(message.text).toContain('Grace period ended')
    expect(message.text).toContain('temporary premium')
    expect(message.text).not.toMatch(
      /simply expired|now available to register/i,
    )
    expect(message.buttons?.[0]?.[0]).toMatchObject({
      text: 'Register Name',
      url: `${TEST_APP_URL}/register/alice.eth`,
    })
  })

  it('HTML-escapes names inside <code> instead of using Markdown', () => {
    const message = buildNameExpiryTelegramMessage(
      payload({ name: 'foo<script>`bar.eth', stage: 'expiry-7d' }),
      options(expiryDate),
    )

    expect(message.parseMode).toBe('HTML')
    expect(message.text).toContain('<code>foo&lt;script&gt;`bar.eth</code>')
    expect(message.text).not.toContain('<script>')
  })
})

describe('name-expiry push copy', () => {
  it('keeps pre-expiry copy short', () => {
    const now = new Date(expiryDate.getTime() - 7 * MS_PER_DAY)
    const notification = buildNameExpiryPushNotification(
      payload({ stage: 'expiry-7d' }),
      options(now),
    )

    expect(notification.title).toBe('ENS name expiring soon')
    expect(notification.body).toBe('alice.eth expires in 7 days')
    expect(notification.data?.url).toBe(`${TEST_APP_URL}/renew/alice.eth`)
  })

  it('says grace-start names can still be renewed', () => {
    const notification = buildNameExpiryPushNotification(
      payload({ stage: 'grace-start' }),
      options(expiryDate),
    )

    expect(notification.title).toBe('ENS name in grace period')
    expect(notification.body).toContain('can still be renewed')
    expect(notification.body).not.toContain('Your name expired')
  })

  it('warns that grace is ending soon', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const now = new Date(graceEnd.getTime() - MS_PER_DAY)
    const notification = buildNameExpiryPushNotification(
      payload({ stage: 'grace-1d' }),
      options(now),
    )

    expect(notification.title).toBe('ENS grace period ending soon')
    expect(notification.body).toBe('alice.eth grace period ends in 1 day')
  })

  it('describes premium-start as temporary premium, not generic expiry', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const notification = buildNameExpiryPushNotification(
      payload({ stage: 'premium-start' }),
      options(graceEnd),
    )

    expect(notification.title).toBe('ENS grace period ended')
    expect(notification.body).toContain('temporary premium')
    expect(notification.data?.url).toBe(`${TEST_APP_URL}/register/alice.eth`)
  })
})
