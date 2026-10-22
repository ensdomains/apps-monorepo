import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import { buildEmailContext } from '../context.js'
import type { RenderedEmail } from '../render.js'
import { DEFAULT_THEME_COLOR, GRACE_THEME_COLOR } from '../theme.js'
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

  it.each(renderers)('%s loads only its own images', async (_name, render) => {
    const { html } = await render()
    const urls = html.match(/https?:\/\/[^"'\s)]+/g) ?? []
    // The XHTML doctype names its DTD by URL; it is not fetched or shown.
    expect(
      new Set(urls.filter((url) => !url.startsWith('http://www.w3.org/'))),
    ).toEqual(
      new Set([
        'https://app-api.ens.domains/email/ens-logo-white.png',
        'https://app-api.ens.domains/email/pattern.png',
      ]),
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
    expect(email.subject).toBe('[Sepolia] alice.eth was transferred')
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
  const weekBefore = new Date(expiry.getTime() - 7 * MS_PER_DAY)

  it.each([
    [
      'expiry-30d',
      new Date(expiry.getTime() - 30 * MS_PER_DAY),
      'alice.eth expires on 13 Mar',
      'How to renew',
    ],
    ['expiry-7d', weekBefore, 'alice.eth expires in 7 days', 'How to renew'],
    [
      'expiry-1d',
      new Date(expiry.getTime() - MS_PER_DAY),
      'alice.eth expires in 1 day',
      'How to renew',
    ],
    ['grace-start', expiry, 'alice.eth has expired', 'How to renew'],
    [
      'grace-7d',
      new Date(graceEnd.getTime() - 7 * MS_PER_DAY),
      '7 days left to renew alice.eth',
      'How to renew',
    ],
    [
      'grace-1d',
      new Date(graceEnd.getTime() - MS_PER_DAY),
      'Last day to renew alice.eth',
      'How to renew',
    ],
    [
      'premium-start',
      graceEnd,
      'You no longer own alice.eth',
      'How to register it',
    ],
  ] as const)('renders the %s notice for owners', async (stage, now, subject, steps) => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ stage }),
      { managerAppUrl, now },
    )
    expect(email.subject).toBe(subject)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(steps)
    }
  })

  it('says today when a reminder is only sent at expiry', async () => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ stage: 'expiry-1d' }),
      { managerAppUrl, now: expiry },
    )
    expect(email.subject).toBe('alice.eth expires today')
  })

  it('writes dates the same way in every locale', async () => {
    const email = await renderNameExpiryEmail(mainnet, expiryPayload(), {
      managerAppUrl,
      now: weekBefore,
    })
    expect(email.text).toContain('13 Mar 2026, 12:00 UTC')
    expect(email.text).toContain('10 Apr 2026, 12:00 UTC')
  })

  it('keeps labels and values apart in the text part', async () => {
    const email = await renderNameExpiryEmail(mainnet, expiryPayload(), {
      managerAppUrl,
      now: weekBefore,
    })
    expect(email.text).toMatch(/Expires\s+13 Mar 2026/)
    expect(email.text).toMatch(/1\.\s+Type/)
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
    const options = { managerAppUrl, now: weekBefore }
    const owner = await renderNameExpiryEmail(mainnet, expiryPayload(), options)
    const watcher = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ isOwner: false, watchReason: 'favourited' }),
      options,
    )
    expect(owner.text).toContain('you own alice.eth')
    expect(watcher.text).toContain('A name you watch is expiring')
    expect(watcher.text).toContain('you are watching alice.eth')
  })

  // Favourite watchers receive every stage after the 30-day notice.
  it.each([
    ['expiry-7d', 'A name you watch is expiring'],
    ['grace-start', 'A name you watch has expired'],
    ['grace-1d', 'A name you watch may become available'],
    ['premium-start', 'A name you watch is available'],
  ] as const)('never calls a watched name yours at %s', async (stage, heading) => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ stage, isOwner: false, watchReason: 'favourited' }),
      { managerAppUrl, now: expiry },
    )
    expect(email.text).toContain(heading)
    for (const part of [email.subject, email.html, email.text]) {
      expect(part).not.toMatch(/\byour name\b/i)
      expect(part).not.toMatch(/\byou no longer own\b/i)
    }
  })

  it('lets long names wrap instead of widening the email', async () => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ name: `${'a'.repeat(80)}.eth` }),
      { managerAppUrl, now: weekBefore },
    )
    // The innermost paragraph or cell around each mention of the name.
    const nameBlocks =
      email.html.match(
        /<(?:p|td)\b[^>]*>(?:(?!<\/(?:p|td)>|<(?:p|td)\b).)*?a{80}\.eth/gs,
      ) ?? []
    // The header, the body, the directions and the footer all repeat it.
    expect(nameBlocks).toHaveLength(4)
    for (const block of nameBlocks) {
      expect(block).toMatch(/overflow-wrap:anywhere|word-break:break-all/)
    }
  })

  it('colours the header with the name’s theme', async () => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload(),
      { managerAppUrl, now: weekBefore },
      '#e72a96',
    )
    expect(email.html).toContain('background-color:#E72A96')
  })

  it('uses the grace colour whatever the theme', async () => {
    const email = await renderNameExpiryEmail(
      mainnet,
      expiryPayload({ stage: 'grace-start' }),
      { managerAppUrl, now: expiry },
      '#E72A96',
    )
    expect(email.html).toContain(`background-color:${GRACE_THEME_COLOR}`)
    expect(email.html).not.toContain('#E72A96')
  })
})

describe('name transferred email', () => {
  it('shows the name, recipient and transaction', async () => {
    const email = await renderNameTransferredEmail(mainnet, transferPayload)
    expect(email.subject).toBe('alice.eth was transferred')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('alice.eth')
      expect(part).toContain(transferPayload.to)
      expect(part).toContain(transferPayload.txHash)
    }
  })

  it('falls back to the default theme for unknown theme records', async () => {
    const email = await renderNameTransferredEmail(
      mainnet,
      transferPayload,
      'url(https://evil.example)',
    )
    expect(email.html).toContain(`background-color:${DEFAULT_THEME_COLOR}`)
    expect(email.html).not.toContain('evil.example')
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
