import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type {
  MigrationRoleGrantDescriptor,
  MigrationStepDescriptor,
} from '@/features/migration/service/buildStepDescriptors'
import { render } from '@/utils/test-utils'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const MANAGER = '0x00000000000000000000000000000000000000c1' as Address

const batchStep = (
  roleGrants: readonly MigrationRoleGrantDescriptor[],
): MigrationStepDescriptor => ({
  type: 'atomic-batch',
  index: 0,
  total: 1,
  count: 1,
  migrateCount: 1,
  copyCount: 0,
  roleGrants,
})

const openDialog = async (steps: readonly MigrationStepDescriptor[]) => {
  render(<WalletConfirmationStepsDialog steps={steps} />)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
}

describe('WalletConfirmationStepsDialog role grants (WEB-1528)', () => {
  it('names the account that will receive a role, and the name it applies to', async () => {
    await openDialog([
      batchStep([
        { name: 'alice.eth', account: MANAGER, role: 'set-resolver' },
      ]),
    ])

    // Truncated in the body, full address on the title so it can be verified.
    expect(screen.getByText('0x0000...00c1')).toBeTruthy()
    expect(screen.getByTitle(MANAGER)).toBeTruthy()
    expect(screen.getByText('alice.eth')).toBeTruthy()
  })

  it('renders one entry per granted name', async () => {
    await openDialog([
      batchStep([
        { name: 'alice.eth', account: MANAGER, role: 'set-resolver' },
        { name: 'bob.eth', account: MANAGER, role: 'set-resolver' },
      ]),
    ])

    expect(screen.getAllByTitle(MANAGER)).toHaveLength(2)
  })

  it('shows no grantee list when the batch grants nothing', async () => {
    await openDialog([batchStep([])])

    expect(screen.queryByTitle(MANAGER)).toBeNull()
  })

  it('names the grantees on the approval that exists to enable them', async () => {
    await openDialog([
      {
        type: 'approval',
        approvalId: 'eth-registry:hca',
        roleGrants: [
          { name: 'alice.eth', account: MANAGER, role: 'set-resolver' },
        ],
      },
    ])

    expect(screen.getByTitle(MANAGER)).toBeTruthy()
  })
})
