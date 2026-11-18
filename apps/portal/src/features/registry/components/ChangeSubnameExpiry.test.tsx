import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Address, labelhash } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'

const REGISTRY: Address = '0x8C7c50D4400CE8DE9Bc7534CEDf9a7Cc50d87F01'
const RESOURCE_ID = resourceIdFromChainValue(labelhash('admin'))._unsafeUnwrap()
// Midday UTC, so the shown UTC day is the same in every zone.
const EXPIRY = new Date(Date.UTC(2027, 9, 13, 12))

const extendExpiry = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useExtendSubnameExpiryMutation', () => ({
  useExtendSubnameExpiryMutation: () => ({ mutateAsync: extendExpiry }),
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    address: '0x801D2e48d378F161Dba7AD7ad002Ad557714c191',
  }),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: true,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: ({
    transactions,
  }: {
    transactions: {
      details: { label: string; value: string }[]
      onStart: () => void
    }[]
  }) => (
    <div>
      {transactions[0]?.details.map(({ label, value }) => (
        <p key={label}>{`${label}: ${value}`}</p>
      ))}
      <button type="button" onClick={() => transactions[0]?.onStart()}>
        Start
      </button>
    </div>
  ),
}))

const { ChangeSubnameExpiry } = await import('./ChangeSubnameExpiry')

const onClose = vi.fn()
const renderChange = () =>
  render(
    <ChangeSubnameExpiry
      parentName="chakri.eth"
      registryAddress={REGISTRY}
      subname={{
        name: 'admin.chakri.eth',
        resourceId: RESOURCE_ID,
        expiryDate: EXPIRY,
      }}
      onClose={onClose}
    />,
  )

beforeEach(() => {
  extendExpiry.mockReset()
  onClose.mockReset()
})

it('moves the expiration a year later and signs that same date', async () => {
  renderChange()
  expect(
    screen.getByText(/admin\.chakri\.eth expires on October 13, 2027/),
  ).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(
    screen.getByText('New expiration: October 13, 2028'),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Start' }))

  expect(extendExpiry).toHaveBeenCalledWith(
    expect.objectContaining({
      subname: 'admin.chakri.eth',
      resourceId: RESOURCE_ID,
      expires: BigInt(EXPIRY.getTime() / 1000) + BigInt(366 * SECONDS_PER_DAY),
    }),
  )
})

it('closes without a transaction on Cancel', async () => {
  renderChange()

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onClose).toHaveBeenCalled()
  expect(extendExpiry).not.toHaveBeenCalled()
})
