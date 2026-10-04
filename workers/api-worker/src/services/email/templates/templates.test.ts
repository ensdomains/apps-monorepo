import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import type { RenderedEmail } from '../render.js'
import { renderNameExpiryEmail } from './NameExpiryEmail.js'
import { renderNameTransferredEmail } from './NameTransferredEmail.js'
import { renderVerificationEmail } from './VerificationEmail.js'
import { renderWelcomeEmail } from './WelcomeEmail.js'

const managerAppUrl = 'https://app.ens.dev'
const expiry = new Date('2026-03-13T12:00:00Z')
const expiryPayload = (
  overrides: Partial<PersonalNotificationPayloads['name-expiry']> = {},
): PersonalNotificationPayloads['name-expiry'] => ({
  name: 'alice.eth',
  expiryDate: expiry.getTime(),
  stage: 'expiry-7d',
  isOwner: true,
  watchReason: 'owned',
  ...overrides,
})
const transferPayload = {
  name: 'alice.eth',
  to: '0x1234567890abcdef1234567890abcdef12345678',
  txHash: '0xdeadbeef',
}

// Precedent: no transactional email carries a link, so a lookalike email with
// one is recognisable as fake.
describe('link-free emails', () => {
  it.each([
    [
      'verification',
      () =>
        renderVerificationEmail({
          otp: '004219',
          accountAddress: '0xabc123',
          expiresInMinutes: 10,
        }),
    ],
    ['welcome', () => renderWelcomeEmail()],
    [
      'name expiry',
      () =>
        renderNameExpiryEmail(expiryPayload(), { managerAppUrl, now: expiry }),
    ],
    [
      'subname expiry',
      () =>
        renderNameExpiryEmail(
          expiryPayload({ name: 'pay.alice.eth', stage: 'expired' }),
          { managerAppUrl, now: expiry },
        ),
    ],
    ['name transferred', () => renderNameTransferredEmail(transferPayload)],
  ] as const)('%s has no links or URLs', async (_name, render) => {
    const email: RenderedEmail = await render()
    expect(email.html).not.toMatch(/<a[\s>]/i)
    expect(email.html).not.toContain('href=')
    expect(email.text).not.toMatch(/https?:\/\//)
    expect(email.text).not.toContain('[')
  })
})

describe('welcome email', () => {
  it('points to Notification Settings in both parts', async () => {
    const email = await renderWelcomeEmail()
    expect(email.subject).toBe('Welcome to ENS Notifications')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Welcome to ENS Notifications')
      expect(part).toContain('Notification Settings')
    }
  })
})

describe('name expiry email', () => {
  const graceEnd = getGraceEndDate(expiry, 'v2')

  it.each([
    ['expiry-7d', expiry, 'Domain expiration alert', 'renew'],
    ['grace-start', expiry, 'Domain grace period started', 'renew'],
    [
      'grace-1d',
      new Date(graceEnd.getTime() - MS_PER_DAY),
      'Domain grace period ending soon',
      'renew',
    ],
    ['premium-start', graceEnd, 'Domain grace period ended', 'register'],
  ] as const)('renders the %s lifecycle notice', async (stage, now, subject, action) => {
    const email = await renderNameExpiryEmail(expiryPayload({ stage }), {
      managerAppUrl,
      now,
    })
    expect(email.subject).toBe(subject)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(`${action} this name`)
    }
  })

  it.each([
    ['expiry-7d', 'Domain expiration alert', 'expires on'],
    ['expired', 'Domain expired', 'expired on'],
  ] as const)('tells a subname holder who can extend it at %s', async (stage, subject, body) => {
    const email = await renderNameExpiryEmail(
      expiryPayload({ name: 'pay.alice.eth', stage }),
      { managerAppUrl, now: expiry },
    )
    expect(email.subject).toBe(subject)
    expect(email.text).toContain(`pay.alice.eth ${body}`)
    expect(email.text).toContain('The owner of alice.eth can extend this name.')
    for (const part of [email.html, email.text]) {
      expect(part).not.toMatch(/renew|register/i)
    }
  })

  it('renders hostile names as literal content', async () => {
    const email = await renderNameExpiryEmail(
      expiryPayload({ name: ' <script>alert(1)</script>{{name}}&.eth\n' }),
      { managerAppUrl, now: expiry },
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.text).toContain('<script>alert(1)</script>{{name}}&.eth')
  })

  it('tells watchers apart from owners', async () => {
    const options = { managerAppUrl, now: expiry }
    const owner = await renderNameExpiryEmail(expiryPayload(), options)
    const watcher = await renderNameExpiryEmail(
      expiryPayload({ isOwner: false, watchReason: 'favourited' }),
      options,
    )
    expect(owner.text).toContain('you own this name')
    expect(watcher.text).toContain('you are watching this name')
  })
})

describe('name transferred email', () => {
  it('shows the name, recipient and transaction', async () => {
    const email = await renderNameTransferredEmail(transferPayload)
    expect(email.subject).toBe('Domain Transferred')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(transferPayload.to)
      expect(part).toContain(transferPayload.txHash)
    }
  })

  it('renders hostile names literally', async () => {
    const email = await renderNameTransferredEmail({
      ...transferPayload,
      name: '<img src=x onerror=alert(1)>.eth',
    })
    expect(email.html).not.toContain('<img src=x')
    expect(email.text).toContain('<img src=x onerror=alert(1)>.eth')
  })
})
