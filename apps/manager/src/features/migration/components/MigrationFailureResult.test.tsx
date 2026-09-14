import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MigrationError } from '@/features/migration/service/decodeMigrationError'
import { render } from '@/utils/test-utils'
import { MigrationFailureResult } from './MigrationFailureResult'

const renderFailure = (error: MigrationError | undefined) => {
  const onBack = vi.fn()
  const onRetry = vi.fn()
  render(
    <MigrationFailureResult error={error} onBack={onBack} onRetry={onRetry} />,
  )
  return { onBack, onRetry }
}

const untouchedNameErrors: readonly [MigrationError, string][] = [
  [
    { type: 'plan-changed' },
    'Your permissions changed. Go back to check the updated estimate.',
  ],
  [
    { type: 'retry-blocked' },
    "We couldn't safely retry. Nothing new was submitted.",
  ],
  [
    { type: 'profile-fetch-failed', phase: 'subgraph', message: 'boom' },
    "We couldn't read your current records.",
  ],
  [{ type: 'user-rejected' }, 'You cancelled the request.'],
  [
    { type: 'preflight-timeout', message: 'slow' },
    'This is taking longer than expected.',
  ],
  [{ type: 'permission-missing' }, 'A permission is missing. Try again.'],
  [
    { type: 'token-owner-changed' },
    'One of your names changed owners. Refresh and select it again.',
  ],
  [
    { type: 'hca-owner-mismatch' },
    "This wasn't set up with the wallet you're using now. Connect the original wallet.",
  ],
  [
    {
      type: 'direct-transfer-unauthorized',
      caller: '0x0000000000000000000000000000000000000001',
    },
    'Something went wrong. Refresh and try again.',
  ],
  [
    { type: 'name-data-mismatch', tokenId: 1n },
    'Something went wrong. Refresh and try again.',
  ],
  [{ type: 'invalid-data' }, 'Something went wrong. Refresh and try again.'],
  [
    { type: 'name-not-locked', tokenId: 1n },
    "We couldn't upgrade one of your names. Try again.",
  ],
  [
    { type: 'name-requires-migration' },
    "We couldn't upgrade one of your names. Try again.",
  ],
  [
    { type: 'name-is-locked', tokenId: 1n },
    "One of your names can't be upgraded right now. Contact support if this keeps happening.",
  ],
  [
    { type: 'frozen-token-approval', tokenId: 1n },
    "One of your names can't be upgraded right now. Contact support if this keeps happening.",
  ],
  [
    {
      type: 'generic',
      message: 'Upgrade the parent name first, then its subnames.',
    },
    'Upgrade the parent name first, then its subnames.',
  ],
]

describe('MigrationFailureResult', () => {
  it.each(
    untouchedNameErrors,
  )('reassures the user and explains %o', (error, message) => {
    renderFailure(error)

    expect(screen.getByText("Upgrade didn't finish")).toBeInTheDocument()
    expect(screen.getByText('Your names are safe.')).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    expect(screen.queryAllByText(/migrat|HCA|revoke/i)).toHaveLength(0)
  })

  it('does not claim the names are untouched after a cleanup failure', () => {
    renderFailure({ type: 'cleanup-failed' })

    expect(screen.getByText("Upgrade didn't finish")).toBeInTheDocument()
    expect(screen.queryByText('Your names are safe.')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Your names were upgraded. One thing left: a temporary permission on your names still needs to be removed.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove temporary access' }),
    ).toBeInTheDocument()
  })

  it('shows a provider message verbatim for an unclassified failure', () => {
    renderFailure({ type: 'generic', message: 'Insufficient funds for gas' })

    expect(screen.getByText('Insufficient funds for gas')).toBeInTheDocument()
    expect(screen.getByText('Your names are safe.')).toBeInTheDocument()
  })

  it('wires the back and retry actions', () => {
    const { onBack, onRetry } = renderFailure({ type: 'user-rejected' })

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
