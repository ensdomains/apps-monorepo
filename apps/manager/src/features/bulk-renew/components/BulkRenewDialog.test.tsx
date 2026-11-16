import { fireEvent, screen } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import type { SummaryRow } from '../types'
import { BulkRenewDialog } from './BulkRenewDialog'

// Control the two data hooks so we can swap what `useBulkRenew` returns AFTER
// confirming — simulating the post-renewal dashboard refetch that rewrites each
// name's expiry — and flip the submit phase to `success`.
const hooks = vi.hoisted(() => ({
  useBulkRenew: vi.fn(),
  useBulkRenewSubmit: vi.fn(),
}))
vi.mock('../hooks/useBulkRenew', () => ({ useBulkRenew: hooks.useBulkRenew }))
vi.mock('../hooks/useBulkRenewSubmit', () => ({
  useBulkRenewSubmit: hooks.useBulkRenewSubmit,
}))

// Strip framer-motion so the crossfade doesn't hold the old view during exit.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children: React.ReactNode }) =>
          children,
    },
  ),
}))

// Light stubs for everything except SuccessStep, which echoes the dates it's
// handed so the assertion can read them.
vi.mock('./DurationPresets', () => ({ DurationPresets: () => <div /> }))
vi.mock('./RenewToDatePopover', () => ({ RenewToDatePopover: () => <div /> }))
vi.mock('./BulkRenewPaymentStep', () => ({
  BulkRenewPaymentStep: ({
    header,
    onConfirm,
  }: {
    header: ReactNode
    onConfirm: () => void
  }) => (
    <>
      {header}
      <button onClick={onConfirm} type="button">
        Confirm
      </button>
    </>
  ),
}))
vi.mock('./NamesBreakdown', () => ({ NamesBreakdown: () => <div /> }))
vi.mock('./RenewingStep', () => ({
  RenewingStep: () => <div data-testid="renewing" />,
}))
vi.mock('./FailureStep', () => ({ FailureStep: () => <div /> }))
vi.mock('./SuccessStep', () => ({
  SuccessStep: ({
    rows,
    total,
    existingBalance,
  }: {
    rows: readonly SummaryRow[]
    total: number
    existingBalance?: number
  }) => (
    <div data-testid="success">
      <div data-testid="success-total">
        {total} {existingBalance}
      </div>
      {rows.map((row) => (
        <div data-testid="success-row" key={row.key}>
          {row.startDate.toISOString()} {row.endDate.toISOString()}
        </div>
      ))}
    </div>
  ),
}))

const makeRow = (startISO: string, endISO: string): SummaryRow => ({
  key: 'seph.eth',
  displayName: 'seph.eth',
  label: 'seph',
  preview: {} as SummaryRow['preview'],
  subtotal: 10,
  startDate: new Date(startISO),
  endDate: new Date(endISO),
})

const bulkRenewResult = (rows: readonly SummaryRow[]) => ({
  minSelectableDate: new Date('2040-07-01T00:00:00.000Z'),
  grandTotal: 10,
  sumPriceRaw: 0n,
  summaryRows: rows,
  renewItems: [{ label: 'seph', duration: 100n }],
  presetSummaries: [],
  payment: {
    isConnected: true,
    isLoadingBalances: false,
    stablecoinBalances: [],
    canProceed: true,
    intentFunding: { displayedDebit: { usdc: 11_000_000n, token: 0n } },
  },
})

const submit = vi.fn()
const reset = vi.fn()
let submitPhase = 'idle'

beforeEach(() => {
  submit.mockClear()
  reset.mockClear()
  submitPhase = 'idle'
  hooks.useBulkRenewSubmit.mockImplementation(() => ({
    phase: submitPhase,
    statuses: {},
    errorMessage: undefined,
    approvalState: { kind: 'idle' },
    approveFunding: vi.fn(),
    declineFunding: vi.fn(),
    submit,
    reset,
  }))
})

describe('BulkRenewDialog payment', () => {
  it('hands the run the token its method pays in, even with nothing to bridge', () => {
    hooks.useBulkRenew.mockImplementation(() => {
      const result = bulkRenewResult([
        makeRow('2040-06-12T00:00:00.000Z', '2040-07-20T00:00:00.000Z'),
      ])
      return {
        ...result,
        payment: { ...result.payment, isCirclePayment: true },
      }
    })
    render(<BulkRenewDialog names={[]} onOpenChange={() => {}} open />)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ isCirclePayment: true }),
    )
  })
})

describe('BulkRenewDialog success receipt', () => {
  it('shows the confirm-time range on success, not the post-renewal recompute', () => {
    // At confirm time the name renews June 12 → July 20.
    hooks.useBulkRenew.mockImplementation(() =>
      bulkRenewResult([
        makeRow('2040-06-12T00:00:00.000Z', '2040-07-20T00:00:00.000Z'),
      ]),
    )

    const { rerender } = render(
      <BulkRenewDialog names={[]} onOpenChange={() => {}} open />,
    )

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(submit).toHaveBeenCalledOnce()

    // The renewal lands and the dashboard refetch rewrites the expiry to July 20,
    // so a live recompute would now read July 20 → August 17.
    hooks.useBulkRenew.mockImplementation(() =>
      bulkRenewResult([
        makeRow('2040-07-20T00:00:00.000Z', '2040-08-17T00:00:00.000Z'),
      ]),
    )
    submitPhase = 'success'
    rerender(<BulkRenewDialog names={[]} onOpenChange={() => {}} open />)

    const row = screen.getByTestId('success-row')
    // Frozen at confirm — the shifted range must NOT leak through.
    expect(row).toHaveTextContent('2040-06-12')
    expect(row).toHaveTextContent('2040-07-20')
    expect(row).not.toHaveTextContent('2040-08-17')
  })

  it('shows the total and existing balance confirmed, not the live ones after renewing', () => {
    const row = makeRow('2040-06-12T00:00:00.000Z', '2040-07-20T00:00:00.000Z')
    const withBalance = (appliedBalance: number, listTotal: number) => {
      const result = bulkRenewResult([row])
      return {
        ...result,
        payment: { ...result.payment, appliedBalance, listTotal },
      }
    }
    // The account's 0.46 covers both names, so the list confirms $0.00.
    hooks.useBulkRenew.mockImplementation(() => withBalance(0.46, 0))

    const { rerender } = render(
      <BulkRenewDialog names={[]} onOpenChange={() => {}} open />,
    )
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    // The renewal spent the balance, so the live list now reads the gross total.
    hooks.useBulkRenew.mockImplementation(() => withBalance(0, 10))
    submitPhase = 'success'
    rerender(<BulkRenewDialog names={[]} onOpenChange={() => {}} open />)

    expect(screen.getByTestId('success-total')).toHaveTextContent('0 0.46')
  })
})

const Harness = () => {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        reopen
      </button>
      <BulkRenewDialog names={[]} onOpenChange={setOpen} open={open} />
    </>
  )
}

const closeDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: /close/i }))

describe('BulkRenewDialog close/reopen', () => {
  beforeEach(() => {
    hooks.useBulkRenew.mockImplementation(() =>
      bulkRenewResult([
        makeRow('2040-06-12T00:00:00.000Z', '2040-07-20T00:00:00.000Z'),
      ]),
    )
  })

  it.each(['Back', '1 year'])(
    'returns to the duration step from the confirm step via %s',
    (name) => {
      render(<Harness />)
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
      expect(screen.getByText('Confirm renewal')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name }))

      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
      expect(screen.queryByText('Confirm renewal')).not.toBeInTheDocument()
    },
  )

  it('resumes the in-flight renewal when reopened mid-flow', () => {
    const { rerender } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    submitPhase = 'renewing'
    rerender(<Harness />)
    expect(screen.getByTestId('renewing')).toBeInTheDocument()

    closeDialog()
    expect(screen.queryByTestId('renewing')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }))

    expect(reset).not.toHaveBeenCalled()
    expect(screen.getByTestId('renewing')).toBeInTheDocument()
  })

  it('shows the outcome of a run that finished while closed', () => {
    const { rerender } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    submitPhase = 'renewing'
    rerender(<Harness />)
    closeDialog()

    submitPhase = 'success'
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }))

    expect(reset).not.toHaveBeenCalled()
    expect(screen.getByTestId('success')).toBeInTheDocument()
  })

  it('starts fresh after closing a finished run', () => {
    submitPhase = 'success'
    render(<Harness />)
    closeDialog()
    expect(reset).toHaveBeenCalledOnce()
  })
})
