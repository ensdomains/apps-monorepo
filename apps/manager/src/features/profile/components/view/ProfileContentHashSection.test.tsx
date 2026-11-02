import { fireEvent, screen, waitFor } from '@testing-library/react'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { ProfileCards } from './ProfileCards'
import { ProfileContentHashSection } from './ProfileContentHashSection'

const { currentChain } = vi.hoisted(() => ({ currentChain: vi.fn() }))

vi.mock('@/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config')>()),
  get chain() {
    return currentChain()
  },
}))
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

const IPFS = 'ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiRAz9LxqD9H9tGZpWZHYB'

const renderSection = (
  contentHash: string | undefined,
  name = 'docs.ens.eth',
  contentHashProtocol?: string,
) =>
  render(
    <ProfileContentHashSection
      name={name}
      records={{
        ...newEmptyProfileRecords(),
        contentHash,
        contentHashProtocol,
      }}
    />,
  )

describe('ProfileContentHashSection', () => {
  it.each([undefined, '', '   ', '0x'])(
    'hides unset value %s',
    (contentHash) => {
      currentChain.mockReturnValue(mainnet)
      const { container } = renderSection(contentHash)

      expect(container).toBeEmptyDOMElement()
    },
  )

  it('links a mainnet IPFS site through the profile cards', () => {
    currentChain.mockReturnValue(mainnet)
    render(
      <ProfileCards
        name="docs.ens.eth"
        records={{
          ...newEmptyProfileRecords(),
          contentHash: IPFS,
          contentHashProtocol: 'ipfs',
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Content hash' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: IPFS })).toHaveAttribute(
      'href',
      'https://docs.ens.eth.limo',
    )
  })

  it('shows a record it cannot link as copyable text', async () => {
    currentChain.mockReturnValue(sepolia)
    renderSection(IPFS, 'bright-lemur.eth', 'ipfs')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: IPFS }))
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(IPFS))
  })

  it.each(['javascript:alert(1)', '<img src=x onerror=alert(1)>'])(
    'renders %s as plain text',
    (contentHash) => {
      currentChain.mockReturnValue(mainnet)
      const { container } = renderSection(contentHash)

      expect(screen.getByText(contentHash)).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(container.querySelector('img')).toBeNull()
    },
  )
})
