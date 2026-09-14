import type { Signer } from '@ens-apps/transaction-manager'
import { act, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Actor } from 'xstate'
import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import {
  MigrationUiProvider,
  useMigrationUiContext,
} from '@/features/migration/state/migrationUi.context'
import type { migrationUiMachine } from '@/features/migration/state/migrationUi.machine'
import { render } from '@/utils/test-utils'
import { GameStep } from './GameStep'

// The machine kicks off the real service on `migration.start`; hold it open
// so the screen stays on its pre-progress state.
vi.mock('@/features/migration/service/migrationService', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/migration/service/migrationService')
  >('@/features/migration/service/migrationService')
  return { ...actual, executeMigration: vi.fn(() => new Promise(() => {})) }
})

type UiActor = Actor<typeof migrationUiMachine>

const ActorProbe = ({
  onActor,
}: {
  readonly onActor: (a: UiActor) => void
}) => {
  const { uiActor } = useMigrationUiContext()
  useEffect(() => onActor(uiActor), [onActor, uiActor])
  return null
}

const planWith = (
  names: readonly string[],
  stepDescriptors: readonly MigrationStepDescriptor[],
): MigrationPlan =>
  ({
    classified: names.map((name) => ({ domain: { name } })),
    stepDescriptors,
  }) as unknown as MigrationPlan

const startUpgrade = (
  names: readonly string[],
  stepDescriptors: readonly MigrationStepDescriptor[],
) => {
  let actor: UiActor | undefined
  render(
    <MigrationUiProvider>
      <ActorProbe
        onActor={(a) => {
          actor = a
        }}
      />
      <GameStep />
    </MigrationUiProvider>,
  )
  if (!actor) throw new Error('migration UI actor was not provided')
  const uiActor = actor
  act(() => {
    uiActor.send({ type: 'selection.set', names: [...names] })
    uiActor.send({
      type: 'migration.start',
      plan: planWith(names, stepDescriptors),
      signer: {} as Signer,
      hcaClient: { getAddress: vi.fn(), getInitData: vi.fn() },
      refreshAccount: vi.fn(),
    })
  })
  return uiActor
}

const ATOMIC_BATCH = {
  type: 'atomic-batch',
  index: 0,
  total: 1,
  count: 1,
  migrateCount: 1,
  copyCount: 0,
} as const satisfies MigrationStepDescriptor

describe('GameStep', () => {
  it('addresses a single selected name in the singular', () => {
    startUpgrade(['alice.eth'], [ATOMIC_BATCH])

    expect(screen.getByText('Upgrading your name...')).toBeInTheDocument()
  })

  it('addresses several selected names in the plural', () => {
    startUpgrade(['alice.eth', 'bob.eth'], [{ ...ATOMIC_BATCH, count: 2 }])

    expect(screen.getByText('Upgrading your names...')).toBeInTheDocument()
  })

  it('keeps addressing one name in the singular on a cleanup-only retry', () => {
    const uiActor = startUpgrade(
      ['alice.eth'],
      [ATOMIC_BATCH, { type: 'cleanup', approvalId: 'eth-registry:hca' }],
    )

    act(() => {
      uiActor.send({
        type: 'migration.batchComplete',
        operations: [{ name: 'alice.eth', action: 'migrate' }],
        txHash: '0x01',
      })
      uiActor.send({
        type: 'migration.failed',
        error: { type: 'cleanup-failed' },
      })
      uiActor.send({ type: 'retry' })
    })

    expect(screen.getByText('Upgrading your name...')).toBeInTheDocument()
  })

  it.each<[MigrationStepDescriptor, string]>([
    [{ type: 'deploy-hca' }, 'Setting things up...'],
    [
      { type: 'approval', approvalId: 'base-registrar:hca-token' },
      'Approve this name in your wallet...',
    ],
    [
      { type: 'approval', approvalId: 'base-registrar:hca' },
      'Approve the temporary account in your wallet...',
    ],
    [
      { type: 'approval', approvalId: 'name-wrapper:hca' },
      'Approve the temporary account in your wallet...',
    ],
    [
      { type: 'approval', approvalId: 'eth-registry:hca' },
      'Approve restoring your managers in your wallet...',
    ],
    [ATOMIC_BATCH, 'Upgrading 1 name...'],
    [{ ...ATOMIC_BATCH, count: 3, migrateCount: 3 }, 'Upgrading 3 names...'],
    [
      { ...ATOMIC_BATCH, index: 1, total: 2, count: 2, migrateCount: 2 },
      'Upgrading batch 2 of 2 (2 names)...',
    ],
    [
      { type: 'cleanup', approvalId: 'eth-registry:hca' },
      'Removing temporary access...',
    ],
  ])('describes the first planned step %o before the service reports progress', (descriptor, subtitle) => {
    startUpgrade(['alice.eth'], [descriptor])

    expect(screen.getByText(subtitle)).toBeInTheDocument()
    expect(screen.queryAllByText(/migrat|HCA|atomic|revok/i)).toHaveLength(0)
  })

  it('shows the service status once progress arrives', () => {
    const uiActor = startUpgrade(['alice.eth'], [ATOMIC_BATCH])

    act(() => {
      uiActor.send({
        type: 'migration.progress',
        progress: {
          currentStep: 0,
          totalSteps: 1,
          description: 'Upgrading alice.eth',
        },
      })
    })

    expect(screen.getByText('Upgrading alice.eth')).toBeInTheDocument()
  })
})
