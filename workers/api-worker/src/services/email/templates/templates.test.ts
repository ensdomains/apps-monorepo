import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import { renderNameExpiryEmail } from './NameExpiryEmail.js'
import { renderNameTransferredEmail } from './NameTransferredEmail.js'
import { renderWelcomeEmail } from './WelcomeEmail.js'

const managerAppUrl = 'https://app.ens.dev'

describe('welcome email', () => {
  it('links to notification settings in both parts', async () => {
    const email = await renderWelcomeEmail({ managerAppUrl })
    expect(email.subject).toBe('Welcome to ENS Notifications')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Welcome to ENS Notifications')
      expect(part).toContain('https://app.ens.dev/notifications/settings')
    }
  })
})

describe('name expiry email', () => {
  const expiry = new Date('2026-03-13T12:00:00Z')
  const graceEnd = getGraceEndDate(expiry, 'v2')
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

  it.each([
    ['expiry-7d', expiry, 'Domain expiration alert', '/renew/alice.eth'],
    ['grace-start', expiry, 'Domain grace period started', '/renew/alice.eth'],
    [
      'grace-1d',
      new Date(graceEnd.getTime() - MS_PER_DAY),
      'Domain grace period ending soon',
      '/renew/alice.eth',
    ],
    [
      'premium-start',
      graceEnd,
      'Domain grace period ended',
      '/register/alice.eth',
    ],
  ] as const)('renders the %s lifecycle notice', async (stage, now, subject, path) => {
    const email = await renderNameExpiryEmail(payload({ stage }), {
      managerAppUrl,
      now,
    })
    expect(email.subject).toBe(subject)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(`${managerAppUrl}${path}`)
    }
    const otherPath = path.startsWith('/renew') ? '/register/' : '/renew/'
    expect(email.html).not.toContain(otherPath)
  })

  it('renders hostile names as literal content with an encoded link', async () => {
    const email = await renderNameExpiryEmail(
      payload({ name: ' <script>alert(1)</script>{{name}}&.eth\n' }),
      { managerAppUrl, now: expiry },
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.text).toContain('<script>alert(1)</script>{{name}}&.eth')
    expect(email.html).toContain(
      `${managerAppUrl}/renew/${encodeURIComponent('<script>alert(1)</script>{{name}}&.eth')}`,
    )
  })

  it('tells watchers apart from owners', async () => {
    const options = { managerAppUrl, now: expiry }
    const owner = await renderNameExpiryEmail(payload(), options)
    const watcher = await renderNameExpiryEmail(
      payload({ isOwner: false, watchReason: 'favourited' }),
      options,
    )
    expect(owner.text).toContain('you own this name')
    expect(watcher.text).toContain('you are watching this name')
  })
})

describe('name transferred email', () => {
  const payload = {
    name: 'alice.eth',
    to: '0x1234567890abcdef1234567890abcdef12345678',
    txHash: '0xdeadbeef',
  }

  it('shows the name, recipient and transaction with navigation links', async () => {
    const email = await renderNameTransferredEmail(payload, { managerAppUrl })
    expect(email.subject).toBe('Domain Transferred')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(payload.to)
      expect(part).toContain(payload.txHash)
      expect(part).toContain('https://etherscan.io/tx/0xdeadbeef')
      expect(part).toContain('https://app.ens.dev/alice.eth')
    }
  })

  it('renders hostile names literally', async () => {
    const email = await renderNameTransferredEmail(
      { ...payload, name: '<img src=x onerror=alert(1)>.eth' },
      { managerAppUrl },
    )
    expect(email.html).not.toContain('<img src=x')
    expect(email.text).toContain('<img src=x onerror=alert(1)>.eth')
  })
})
