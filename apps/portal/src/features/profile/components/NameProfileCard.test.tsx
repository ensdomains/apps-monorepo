import { getRecords } from '@ensdomains/ensjs/public'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { ok } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { NameProfileCard } from './NameProfileCard'

vi.mock('./NameAvatar', () => ({ NameAvatar: () => null }))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('@ensdomains/ensjs/public', () => ({ getRecords: vi.fn() }))

const SOCIAL_RECORDS = [
  ['com.twitter', '@alice', 'https://x.com/@alice', 'X.png', 'X'],
  ['org.telegram', 'alice', 'https://t.me/alice', 'telegram.png', 'Telegram'],
  [
    'com.discord',
    'alice',
    'https://discord.com/users/alice',
    'discord.png',
    'Discord',
  ],
  [
    'com.github',
    'alice/dev',
    'https://github.com/alice/dev',
    'github.svg',
    'GitHub',
  ],
  [
    'com.instagram',
    'alice',
    'https://instagram.com/alice',
    'instagram.png',
    'Instagram',
  ],
  [
    'com.linkedin',
    'alice',
    'https://linkedin.com/in/alice',
    'linkedin.svg',
    'LinkedIn',
  ],
  [
    'xyz.farcaster',
    'alice',
    'https://warpcast.com/alice',
    'farcaster.svg',
    'Farcaster',
  ],
  [
    'com.reddit',
    'u/alice',
    'https://reddit.com/user/u/alice',
    'reddit.svg',
    'Reddit',
  ],
  [
    'com.youtube',
    'https://youtube.com/@alice',
    'https://youtube.com/@/https://youtube.com/@alice',
    'youtube.png',
    'YouTube',
  ],
] as const

describe('NameProfileCard', () => {
  it('requests and displays the compact records in order with their existing artwork and links', async () => {
    const texts = [
      { key: 'name', value: 'Alice' },
      { key: 'description', value: 'ENS builder' },
      ...SOCIAL_RECORDS.map(([key, value]) => ({ key, value })),
    ]
    const records = {
      texts: texts.toReversed(),
      resolverAddress: '0x1111111111111111111111111111111111111111',
    } as const
    vi.mocked(getRecords).mockResolvedValue(records)

    render(
      <QueryClientProvider client={new QueryClient()}>
        <NameProfileCard name="alice.eth" stacked />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('ENS builder')).toBeInTheDocument()
    expect(vi.mocked(getRecords).mock.lastCall?.[1].texts).toEqual(
      texts.map(({ key }) => key),
    )
    expect(
      screen.getAllByRole('link').map((link) => ({
        value: link.textContent?.trim(),
        href: link.getAttribute('href'),
        art: within(link).getByRole('img').getAttribute('src'),
        alt: within(link).getByRole('img').getAttribute('alt'),
      })),
    ).toEqual(
      SOCIAL_RECORDS.map(([, value, href, file, alt]) => ({
        value,
        href,
        art: `/icons/profile/${file}`,
        alt,
      })),
    )
  })
})
