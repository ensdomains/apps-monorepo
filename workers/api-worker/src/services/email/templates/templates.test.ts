import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import { buildEmailContext } from '../context.js'
import type { RenderedEmail } from '../render.js'
import { ZERO_WIDTH_NON_JOINER } from './EmailLayout.js'
import { renderNameExpiryEmail } from './NameExpiryEmail.js'
import { renderNameTransferredEmail } from './NameTransferredEmail.js'
import { renderVerificationEmail } from './VerificationEmail.js'
import { renderWelcomeEmail } from './WelcomeEmail.js'

const managerAppUrl = 'https://app.ens.domains'
const mainnet = buildEmailContext({
  network: 'mainnet',
  managerAppUrl,
  workerBaseUrl: 'https://app-api.ens.domains',
})
const sepolia = buildEmailContext({
  network: 'sepolia',
  managerAppUrl: 'https://sepolia.app.ens.domains',
  workerBaseUrl: 'https://sepolia.app-api.ens.domains',
})
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

const renderers = [
  [
    'verification',
    () =>
      renderVerificationEmail(mainnet, {
        otp: '004219',
        accountAddress: '0xabc123',
        expiresInMinutes: 10,
      }),
  ],
  ['welcome', () => renderWelcomeEmail(mainnet)],
  [
    'name expiry',
    () =>
      renderNameExpiryEmail(mainnet, expiryPayload(), {
        managerAppUrl,
        now: expiry,
      }),
  ],
  [
    'name transferred',
    () => renderNameTransferredEmail(mainnet, transferPayload),
  ],
] as const

// Precedent: no transactional email carries a link, so a lookalike email with
// one is recognisable as fake.
describe('link-free emails', () => {
  it.each(renderers)('%s has no links or URLs', async (_name, render) => {
    const email: RenderedEmail = await render()
    expect(email.html).not.toMatch(/<a[\s>]/i)
    expect(email.html).not.toContain('href=')
    expect(email.text).not.toMatch(/https?:\/\//)
    expect(email.text).not.toContain('[')
    expect(email.text).toContain('ENS emails never contain links')
  })

  it.each(renderers)('%s loads only the logo', async (_name, render) => {
    const { html } = await render()
    const urls = html.match(/https?:\/\/[^"'\s)]+/g) ?? []
    // The XHTML doctype names its DTD by URL; it is not fetched or shown.
    expect(urls.filter((url) => !url.startsWith('http://www.w3.org/'))).toEqual(
      ['https://app-api.ens.domains/email/ens-logo.png'],
    )
  })

  it('writes the app host so mail clients cannot link it', async () => {
    const email = await renderWelcomeEmail(mainnet)
    for (const part of [email.html, email.text]) {
      expect(part).not.toContain('app.ens.domains')
      expect(part.replaceAll(ZERO_WIDTH_NON_JOINER, '')).toContain(
        'app.ens.domains',
      )
    }
  })
})

describe('network marking', () => {
  it('leaves mainnet emails unmarked', async () => {
    const email = await renderWelcomeEmail(mainnet)
    expect(email.subject).toBe('Welcome to ENS notifications')
    expect(email.fromName).toBe('ENS')
    expect(email.text).not.toContain('testnet')
  })

  it('marks testnet emails in the subject, sender and body', async () => {
    const email = await renderNameTransferredEmail(sepolia, transferPayload)
    expect(email.subject).toBe('[Sepolia] Your name was transferred')
    expect(email.fromName).toBe('ENS (Sepolia)')
    expect(email.text).toContain('Sepolia testnet')
    expect(email.text.replaceAll(ZERO_WIDTH_NON_JOINER, '')).toContain(
      'sepolia.app.ens.domains',
    )
  })
})

describe('welcome email', () => {
  it('points to Notification Settings in both parts', async () => {
    const email = await renderWelcomeEmail(mainnet)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('You’re all set')
      expect(part).toContain('Notification Settings')
    }
  })
})

describe('verification email', () => {
  it('shows the code and the requesting wallet', async () => {
    const email = await renderVerificationEmail(mainnet, {
      otp: '004219',
      accountAddress: '0xabc123',
      expiresInMinutes: 10,
    })
    expect(email.subject).toBe('Your ENS email verification code')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('004219')
      expect(part).toContain('0xabc123')
      expect(part).toContain('10 minutes')
    }
  })
})

describe('name expiry email', () => {
  const graceEnd = getGraceEndDate(expiry, 'v2')

  it.each([
    ['expiry-7d', expiry, 'Your name is expiring', 'Renew'],
    ['grace-start', expiry, 'Your name has expired', 'Renew'],
    [
      'grace-1d',
      new Date(graceEnd.getTime() - MS_PER_DAY),
      'Your name’s grace period is ending',
      'Renew',
    ],
    [
      'premium-start',
      graceEnd,
      'Your name’s grace period has ended',
      'Register',
    ],
  ] as const)('renders the %s lifecycle notice', async (stage, now, subject, action) => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ stage }),
      { managerAppUrl, now },
    )
    expect(email.subject).toBe(subject)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(`${action} in the ENS app`)
    }
  })

  it('writes dates the same way in every locale', async () => {
    const email = await renderNameExpiryEmail(mainnet, expiryPayload(), {
      managerAppUrl,
      now: new Date(expiry.getTime() - 7 * MS_PER_DAY),
    })
    expect(email.text).toContain('Expires in: 7 days')
    expect(email.text).toContain('Expiry date: 13 Mar 2026, 12:00 UTC')
  })

  it('renders hostile names as literal content', async () => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ name: ' <script>alert(1)</script>{{name}}&.eth\n' }),
      { managerAppUrl, now: expiry },
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.text).toContain('<script>alert(1)</script>{{name}}&.eth')
  })

  it('tells watchers apart from owners', async () => {
    const options = { managerAppUrl, now: expiry }
    const owner = await renderNameExpiryEmail(mainnet, expiryPayload(), options)
    const watcher = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ isOwner: false, watchReason: 'favourited' }),
      options,
    )
    expect(owner.text).toContain('you own this name')
    expect(watcher.subject).toBe('A name you watch is expiring')
    expect(watcher.text).toContain('you are watching this name')
  })
})

describe('name transferred email', () => {
  it('shows the name, recipient and transaction', async () => {
    const email = await renderNameTransferredEmail(mainnet, transferPayload)
    expect(email.subject).toBe('Your name was transferred')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(transferPayload.to)
      expect(part).toContain(transferPayload.txHash)
    }
  })

  it('renders hostile names literally', async () => {
    const email = await renderNameTransferredEmail(mainnet, {
      ...transferPayload,
      name: '<img src=x onerror=alert(1)>.eth',
    })
    expect(email.html).not.toContain('<img src=x')
    expect(email.text).toContain('<img src=x onerror=alert(1)>.eth')
  })
})
