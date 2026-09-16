import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import { render } from '@/utils/test-utils'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const allStepTypes: readonly MigrationStepDescriptor[] = [
  { type: 'deploy-hca' },
  {
    type: 'approval',
    approvalId: 'base-registrar:hca-token',
    name: 'alice.eth',
    tokenId: 1n,
  },
  {
    type: 'approval',
    approvalId: 'base-registrar:hca-token',
    tokenId: 2n,
  },
  { type: 'approval', approvalId: 'base-registrar:hca', count: 2 },
  { type: 'approval', approvalId: 'name-wrapper:hca' },
  { type: 'approval', approvalId: 'eth-registry:hca' },
  {
    type: 'atomic-batch',
    index: 1,
    total: 3,
    count: 2,
    migrateCount: 1,
    copyCount: 1,
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
]

describe('WalletConfirmationStepsDialog', () => {
  it('renders every approved wallet-confirmation row and the exact footer', () => {
    const { getAllByText, getByRole, getByText } = render(
      <WalletConfirmationStepsDialog steps={allStepTypes} />,
    )

    const trigger = getByRole('button', { name: '8 requests' })
    expect(trigger).toHaveAttribute('type', 'button')
    fireEvent.click(trigger)

    expect(getByRole('dialog')).toBeInTheDocument()
    expect(getByText("What you'll approve")).toBeInTheDocument()
    expect(
      getByText('Your wallet will show 8 requests in this order.'),
    ).toBeInTheDocument()

    expect(getByText('Set up temporary access')).toBeInTheDocument()
    expect(
      getByText(
        'Creates a temporary account to carry out the upgrade for you.',
      ),
    ).toBeInTheDocument()
    expect(getByText('Approve alice.eth')).toBeInTheDocument()
    expect(getByText('Approve registration')).toBeInTheDocument()
    expect(
      getAllByText('Allow this temporary account to move this name.'),
    ).toHaveLength(2)
    expect(getByText('Approve 2 names')).toBeInTheDocument()
    expect(
      getByText('One approval covers all the .eth names you selected.'),
    ).toBeInTheDocument()
    expect(getByText('Approve your wrapped names')).toBeInTheDocument()
    expect(
      getByText('Let this temporary account move your wrapped names.'),
    ).toBeInTheDocument()
    expect(getByText('Restore your managers')).toBeInTheDocument()
    expect(
      getByText('Keep the same managers on your names after the upgrade.'),
    ).toBeInTheDocument()
    expect(getByText('Upgrade batch 2 of 3')).toBeInTheDocument()
    expect(
      getByText('Upgrade your names and bring their records across.'),
    ).toBeInTheDocument()
    expect(getByText('Remove temporary access')).toBeInTheDocument()
    expect(
      getByText('Remove the temporary permission after the upgrade.'),
    ).toBeInTheDocument()
    expect(
      getByText(
        'Your names are upgraded in a single transaction. If any part of it fails, nothing changes. Nothing is signed automatically, so review every request in your wallet.',
      ),
    ).toBeInTheDocument()
  })

  it('renders one-request and one-name branches', () => {
    const steps: readonly MigrationStepDescriptor[] = [
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
      },
    ]
    const { getByRole, getByText } = render(
      <WalletConfirmationStepsDialog steps={steps} />,
    )

    fireEvent.click(getByRole('button', { name: '1 request' }))

    expect(getByText('Your wallet will show one request.')).toBeInTheDocument()
    expect(getByText('Upgrade 1 name')).toBeInTheDocument()
  })

  it('preserves trigger focus when the dialog closes with Escape', async () => {
    const { getByRole, queryByRole } = render(
      <WalletConfirmationStepsDialog steps={allStepTypes.slice(0, 1)} />,
    )
    const trigger = getByRole('button', { name: '1 request' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
