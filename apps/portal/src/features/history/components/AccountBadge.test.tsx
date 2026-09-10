import { render as baseRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { TEST_ACCOUNTS } from '@/test-utils/wagmi.mock'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { AccountBadge, TransactionSenderBadge } from './AccountBadge'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

// The reverse lookup is a network call; tests set what it resolves to.
const ensNameRef = vi.hoisted(() => ({
  current: undefined as string | undefined,
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useEnsName: () => ({ data: ensNameRef.current }),
}))

beforeEach(() => {
  ensNameRef.current = undefined
})

const render = (ui: ReactElement) =>
  baseRender(ui, { wrapper: createTestWrapper() })

const txHash = '0xabc'

describe('AccountBadge', () => {
  it('renders a resolved primary name as the name pill, with the wallet a chip away', () => {
    ensNameRef.current = 'alice.eth'
    render(<AccountBadge address={TEST_ACCOUNTS.alice} />)

    const pill = screen.getByText('alice.eth').closest('a')
    expect(pill).toHaveAttribute('href', '/$name')
    expect(pill).toHaveAttribute(
      'data-params',
      JSON.stringify({ name: 'alice.eth' }),
    )

    const addressChip = screen.getByText('Address').closest('a')
    expect(addressChip).toHaveAttribute('href', '/addr/$addr')
    expect(addressChip).toHaveAttribute(
      'data-params',
      JSON.stringify({ addr: TEST_ACCOUNTS.alice }),
    )
    expect(screen.queryByText(truncateAddress(TEST_ACCOUNTS.alice))).toBeNull()
  })

  it('falls back to the address pill when no primary name resolves', () => {
    render(<AccountBadge address={TEST_ACCOUNTS.alice} />)

    const pill = screen
      .getByText(truncateAddress(TEST_ACCOUNTS.alice))
      .closest('a')
    expect(pill).toHaveAttribute('href', '/addr/$addr')
  })
})

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
