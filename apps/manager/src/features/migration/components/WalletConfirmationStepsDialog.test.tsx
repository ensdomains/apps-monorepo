import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import { render } from '@/utils/test-utils'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const firstBatch: MigrationStepDescriptor = {
  type: 'atomic-batch',
  index: 0,
  total: 2,
  count: 2,
  migrateCount: 2,
  copyCount: 0,
}

const fullPlan: readonly MigrationStepDescriptor[] = [
  { type: 'deploy-hca' },
  {
    type: 'approval',
    approvalId: 'base-registrar:hca-token',
    name: 'alice.eth',
    tokenId: 1n,
  },
  { type: 'approval', approvalId: 'base-registrar:hca', count: 3 },
  { type: 'approval', approvalId: 'name-wrapper:hca' },
  { type: 'approval', approvalId: 'eth-registry:hca' },
  firstBatch,
  {
    type: 'atomic-batch',
    index: 1,
    total: 2,
    count: 2,
    migrateCount: 1,
    copyCount: 1,
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
]

const openExplainer = (steps: readonly MigrationStepDescriptor[]) => {
  render(<WalletConfirmationStepsDialog steps={steps} />)
  fireEvent.click(screen.getByRole('button'))
  return screen.getByRole('dialog')
}

describe('WalletConfirmationStepsDialog', () => {
  it('counts the wallet requests on the trigger', () => {
    render(<WalletConfirmationStepsDialog steps={fullPlan} />)

    expect(
      screen.getByRole('button', { name: '8 requests' }),
    ).toBeInTheDocument()
  })

  it('uses the singular for a single request', () => {
    render(<WalletConfirmationStepsDialog steps={[firstBatch]} />)

    expect(
      screen.getByRole('button', { name: '1 request' }),
    ).toBeInTheDocument()
  })

  it('walks through every request in plain language', () => {
    const dialog = openExplainer(fullPlan)

    expect(dialog).toHaveAccessibleName("What you'll approve")
    expect(dialog).toHaveTextContent(
      'Your wallet will show 8 requests in this order.',
    )

    const steps = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(steps).toEqual([
      '1.Set up temporary accessCreates a temporary account to carry out the upgrade for you.',
      '2.Approve alice.ethAllow this temporary account to move this name.',
      '3.Approve 3 namesOne approval covers all the .eth names you selected.',
      '4.Approve your wrapped namesLet this temporary account move your wrapped names.',
      '5.Restore your managersKeep the same managers on your names after the upgrade.',
      '6.Upgrade batch 1 of 2Upgrade your names and bring their records across.',
      '7.Upgrade batch 2 of 2Upgrade your names and bring their records across.',
      '8.Remove temporary accessRemove the temporary permission after the upgrade.',
    ])

    expect(dialog).toHaveTextContent(
      'Your names are upgraded in a single transaction. If any part of it fails, nothing changes. Nothing is signed automatically, so review every request in your wallet.',
    )
    expect(dialog.textContent).not.toMatch(
      /migrat|HCA|atomic|revok|registration/i,
    )
  })

  it('titles a single unbatched upgrade by its name count', () => {
    const dialog = openExplainer([
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 4,
        migrateCount: 4,
        copyCount: 0,
      },
    ])

    expect(dialog).toHaveTextContent('Your wallet will show one request.')
    expect(dialog).toHaveTextContent('Upgrade 4 names')
  })
})
