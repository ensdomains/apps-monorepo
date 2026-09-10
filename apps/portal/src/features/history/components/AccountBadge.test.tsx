import { render as baseRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { TEST_ACCOUNTS } from '@/test-utils/wagmi.mock'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { TransactionSenderBadge } from './AccountBadge'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a href="#link" {...props}>
      {children}
    </a>
  ),
}))

// The reverse lookup is a network call; the badge under test is about which
// unresolved state shows, not what the address resolves to.
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useEnsName: () => ({ data: undefined }),
}))

const render = (ui: ReactElement) =>
  baseRender(ui, { wrapper: createTestWrapper() })

const txHash = '0xabc'

describe('TransactionSenderBadge', () => {
  it('holds a skeleton, not a dash, while the page lookup is in flight', () => {
    render(
      <TransactionSenderBadge
        txHash={txHash}
        senders={{ data: undefined, error: null }}
      />,
    )
    expect(document.querySelector('[aria-busy]')).not.toBeNull()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('says the lookup failed rather than passing it off as no sender', () => {
    render(
      <TransactionSenderBadge
        txHash={txHash}
        senders={{ data: undefined, error: new Error('rate limited') }}
      />,
    )
    expect(screen.getByText('unknown sender')).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('dashes only when the page lookup has no sender for the transaction', () => {
    render(
      <TransactionSenderBadge
        txHash={txHash}
        senders={{ data: new Map(), error: null }}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy]')).toBeNull()
  })

  it('renders the sender as a wallet pill once looked up', () => {
    render(
      <TransactionSenderBadge
        txHash={txHash}
        senders={{
          data: new Map([[txHash, TEST_ACCOUNTS.alice]]),
          error: null,
        }}
      />,
    )
    expect(
      screen.getByText(truncateAddress(TEST_ACCOUNTS.alice)),
    ).toBeInTheDocument()
  })
})
