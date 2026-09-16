import { fireEvent } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MigrationError } from '@/features/migration/service/decodeMigrationError'
import { render } from '@/utils/test-utils'

const migrationState = vi.hoisted(() => ({
  completedOperations: [] as readonly {
    readonly name: string
    readonly action: 'copy' | 'migrate'
  }[],
  lastError: undefined as MigrationError | undefined,
  selectedNames: ['alice.eth', 'bob.eth'] as string[],
  send: vi.fn(),
  step: 'failure' as 'failure' | 'migrate' | 'select' | 'success',
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useCanGoBack: () => false,
  useNavigate: () => vi.fn(),
}))

vi.mock('@/features/migration/hooks/useMigrationGasEstimate', () => ({
  useMigrationGasEstimate: () => ({ status: 'idle' }),
}))

vi.mock('@/features/migration/hooks/useMigrationGasFunding', () => ({
  useMigrationGasFunding: () => 'settled',
}))

vi.mock('@/features/migration/hooks/useV1Names', () => ({
  useV1Names: () => ({ data: [] }),
}))

vi.mock('@/features/migration/state/migrationUi.context', () => ({
  useMigrationUiContext: () => ({
    uiActor: { send: migrationState.send },
  }),
}))

vi.mock('@/features/migration/state/migrationUi.selectors', () => ({
  useMigrationCompletedOperations: () => migrationState.completedOperations,
  useMigrationLastError: () => migrationState.lastError,
  useMigrationSelectedNames: () => migrationState.selectedNames,
  useMigrationStep: () => migrationState.step,
}))

vi.mock('@/lib/posthog/useMigrationNftEnabled', () => ({
  useMigrationNftEnabled: () => false,
}))

vi.mock('@/lib/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/smart-account')>()),
  useSmartAccountContext: () => ({
    ownerAddress: undefined,
    accountAddress: undefined,
    client: undefined,
    error: null,
    refreshAccount: vi.fn(),
  }),
}))

// eslint-disable-next-line import/first
import { MigrationPage } from './MigrationPage'

const CALLER = '0x1111111111111111111111111111111111111111' as Address

const renderFailure = (
  lastError: MigrationError,
  selectedNames = ['alice.eth', 'bob.eth'],
) => {
  migrationState.lastError = lastError
  migrationState.selectedNames = selectedNames
  migrationState.step = 'failure'
  return render(<MigrationPage />)
}

const failureRows: readonly {
  readonly error: MigrationError
  readonly expected: string
}[] = [
  {
    error: { type: 'plan-changed' },
    expected:
      'Your permissions changed. Go back to check the updated estimate.',
  },
  {
    error: { type: 'retry-blocked' },
    expected:
      "We couldn't safely retry. Nothing was submitted and nothing changed.",
  },
  {
    error: {
      type: 'profile-fetch-failed',
      phase: 'subgraph',
      message: 'raw profile detail',
    },
    expected: "We couldn't read your current records.",
  },
  {
    error: { type: 'user-rejected' },
    expected: 'You cancelled the request.',
  },
  {
    error: {
      type: 'preflight-timeout',
      message: 'raw timeout detail',
      timeoutMs: 15_000,
    },
    expected: 'This is taking longer than expected.',
  },
  {
    error: { type: 'permission-missing', tokenId: 1n },
    expected: 'A permission is missing. Try again.',
  },
  {
    error: { type: 'token-owner-changed', tokenId: 1n },
    expected: 'One of your names changed owners. Refresh and select it again.',
  },
  {
    error: { type: 'hca-owner-mismatch' },
    expected:
      "This wasn't set up with the wallet you're using now. Connect the original wallet.",
  },
  {
    error: { type: 'direct-transfer-unauthorized', caller: CALLER },
    expected: 'Something went wrong. Refresh and try again.',
  },
  {
    error: { type: 'name-data-mismatch', tokenId: 1n },
    expected: 'Something went wrong. Refresh and try again.',
  },
  {
    error: { type: 'invalid-data' },
    expected: 'Something went wrong. Refresh and try again.',
  },
  {
    error: { type: 'name-not-locked', tokenId: 1n },
    expected: "We couldn't upgrade one of your names. Try again.",
  },
  {
    error: { type: 'name-requires-migration' },
    expected: "We couldn't upgrade one of your names. Try again.",
  },
  {
    error: { type: 'name-is-locked', tokenId: 1n },
    expected:
      "One of your names can't be upgraded right now. Contact support if this keeps happening.",
  },
  {
    error: { type: 'frozen-token-approval', tokenId: 1n },
    expected:
      "One of your names can't be upgraded right now. Contact support if this keeps happening.",
  },
  {
    error: { type: 'parent-not-upgraded' },
    expected: 'Upgrade the parent name first, then its subnames.',
  },
]

describe('MigrationPage failure copy', () => {
  beforeEach(() => {
    migrationState.send.mockReset()
    migrationState.completedOperations = []
    migrationState.selectedNames = ['alice.eth', 'bob.eth']
  })

  it.each(failureRows)('renders $expected', ({ error, expected }) => {
    const { getByRole, getByText } = renderFailure(error)

    expect(getByText("Upgrade didn't finish")).toBeInTheDocument()
    expect(getByText('Your names are safe.')).toBeInTheDocument()
    expect(getByText(expected)).toBeInTheDocument()
    expect(getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('renders the singular standing reassurance', () => {
    const { getByText, queryByText } = renderFailure(
      { type: 'user-rejected' },
      ['alice.eth'],
    )

    expect(getByText('Your name is safe.')).toBeInTheDocument()
    expect(queryByText('Your names are safe.')).not.toBeInTheDocument()
  })

  it('prefixes the raw generic detail exactly as approved', () => {
    const { getByText } = renderFailure({
      type: 'generic',
      message: 'RPC request failed',
    })

    expect(
      getByText('Your wallet reported: RPC request failed'),
    ).toBeInTheDocument()
  })

  it.each([
    [
      ['alice.eth'],
      'Your name was upgraded. One thing left: a temporary permission on your name still needs to be removed.',
    ],
    [
      ['alice.eth', 'bob.eth'],
      'Your names were upgraded. One thing left: a temporary permission on your names still needs to be removed.',
    ],
  ])('renders count-aware cleanup copy for %j', (selectedNames, expected) => {
    const { getByRole, getByText, queryByText } = renderFailure(
      { type: 'cleanup-failed' },
      selectedNames,
    )

    expect(getByText(expected)).toBeInTheDocument()
    expect(queryByText('Your name is safe.')).not.toBeInTheDocument()
    expect(queryByText('Your names are safe.')).not.toBeInTheDocument()
    expect(
      getByRole('button', { name: 'Remove temporary access' }),
    ).toBeInTheDocument()
  })

  it('preserves the failure actions and their events', () => {
    const { getByRole } = renderFailure({ type: 'user-rejected' })

    fireEvent.click(getByRole('button', { name: 'Back' }))
    fireEvent.click(getByRole('button', { name: 'Try again' }))

    expect(migrationState.send).toHaveBeenNthCalledWith(1, { type: 'cancel' })
    expect(migrationState.send).toHaveBeenNthCalledWith(2, { type: 'retry' })
  })
})
