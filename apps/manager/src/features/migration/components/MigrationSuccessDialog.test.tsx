import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

const noop = vi.fn()

const renderSuccess = ({
  count,
  state,
}: {
  readonly count: number
  readonly state: MigrationSuccessDialogState
}) =>
  render(
    <MigrationSuccessDialog
      canMint={false}
      context="migration"
      migratedNameCount={count}
      onClose={noop}
      onMint={noop}
      onRetry={noop}
      onViewProfile={noop}
      open
      state={state}
    />,
  )

const plainState: MigrationSuccessDialogState = {
  status: 'error',
  stage: 'configuration',
  message: '',
}

describe('MigrationSuccessDialog migration copy', () => {
  it.each([
    [1, 'Your name has been upgraded!'],
    [2, 'Your names have been upgraded!'],
  ])('renders plain completion copy for count %i', (count, heading) => {
    const { getByRole, getByText } = renderSuccess({
      count,
      state: plainState,
    })

    expect(getByText(heading)).toBeInTheDocument()
    expect(
      getByText('Manage your newly upgraded names from the dashboard.'),
    ).toBeInTheDocument()
    expect(getByRole('button', { name: 'Go to dashboard' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it.each([
    [1, 'Your name has been upgraded!'],
    [3, 'Your names have been upgraded!'],
  ])('renders NFT completion heading for count %i', (count, heading) => {
    const { getByText, queryByText } = renderSuccess({
      count,
      state: { status: 'loadingEligibility' },
    })

    expect(getByText(heading)).toBeInTheDocument()
    expect(
      queryByText('Your name(s) have been upgraded!'),
    ).not.toBeInTheDocument()
  })
})
