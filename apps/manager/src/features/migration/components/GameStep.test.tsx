import { describe, expect, it, vi } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import type { MigrationProgress } from '@/features/migration/service/migrationService'
import { render } from '@/utils/test-utils'

const gameState = vi.hoisted(() => ({
  progress: undefined as MigrationProgress | undefined,
  selectedNames: ['alice.eth'] as string[],
  stepDescriptors: [] as MigrationStepDescriptor[],
  substep: 'running' as 'running' | 'failing',
}))

vi.mock('@/features/migration/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: 960 }),
}))

vi.mock('@/features/migration/state/migrationUi.context', () => ({
  useMigrationUiContext: () => ({ uiActor: {} }),
}))

vi.mock('@/features/migration/state/migrationUi.selectors', () => ({
  useMigrateSubstep: () => gameState.substep,
  useMigrationProgress: () => gameState.progress,
  useMigrationSelectedNames: () => gameState.selectedNames,
  useMigrationStepDescriptors: () => gameState.stepDescriptors,
}))

// eslint-disable-next-line import/first
import { GameStep } from './GameStep'

const renderGame = ({
  description,
  descriptor,
  isRecovering = false,
  selectedNames = ['alice.eth'],
}: {
  readonly description?: string
  readonly descriptor?: MigrationStepDescriptor
  readonly isRecovering?: boolean
  readonly selectedNames?: string[]
} = {}) => {
  gameState.progress = description
    ? { currentStep: 0, totalSteps: 1, description, isRecovering }
    : undefined
  gameState.selectedNames = selectedNames
  gameState.stepDescriptors = descriptor ? [descriptor] : []
  gameState.substep = 'running'
  return render(<GameStep />)
}

const approval = (
  approvalId: Extract<
    MigrationStepDescriptor,
    { type: 'approval' }
  >['approvalId'],
): MigrationStepDescriptor => ({ type: 'approval', approvalId })

const batch = ({
  count,
  index = 0,
  total = 1,
}: {
  readonly count: number
  readonly index?: number
  readonly total?: number
}): MigrationStepDescriptor => ({
  type: 'atomic-batch',
  index,
  total,
  count,
  migrateCount: count,
  copyCount: 0,
})

describe('GameStep migration copy', () => {
  it.each([
    [['alice.eth'], 'Upgrading your name...'],
    [['alice.eth', 'bob.eth'], 'Upgrading your names...'],
  ])('renders the count-aware heading for %j', (selectedNames, heading) => {
    const { getByText } = renderGame({ selectedNames })
    expect(getByText(heading)).toBeInTheDocument()
  })

  it.each([
    ['preparing', undefined, 'Getting ready...'],
    ['setup', { type: 'deploy-hca' } as const, 'Setting things up...'],
    [
      'one registration approval',
      approval('base-registrar:hca-token'),
      'Approve this name in your wallet...',
    ],
    [
      'registration approval',
      approval('base-registrar:hca'),
      'Approve the temporary account in your wallet...',
    ],
    [
      'wrapped approval',
      approval('name-wrapper:hca'),
      'Approve the temporary account in your wallet...',
    ],
    [
      'manager restoration',
      approval('eth-registry:hca'),
      'Approve restoring your managers in your wallet...',
    ],
    ['one-name batch', batch({ count: 1 }), 'Upgrading 1 name...'],
    ['many-name batch', batch({ count: 3 }), 'Upgrading 3 names...'],
    [
      'one-name multi-batch',
      batch({ count: 1, index: 1, total: 3 }),
      'Upgrading batch 2 of 3 (1 name)...',
    ],
    [
      'many-name multi-batch',
      batch({ count: 4, index: 1, total: 3 }),
      'Upgrading batch 2 of 3 (4 names)...',
    ],
    [
      'cleanup',
      { type: 'cleanup', approvalId: 'eth-registry:hca' } as const,
      'Removing temporary access...',
    ],
  ])('renders the approved $s fallback', (_, descriptor, expected) => {
    const { getByText } = renderGame({ descriptor })
    expect(getByText(expected)).toBeInTheDocument()
  })

  it.each([
    'alice.eth was already upgraded',
    'alice.eth was already copied',
    'alice.eth was already done',
    '2 names were already upgraded',
    '2 names were already copied',
    '2 already upgraded, 1 already copied',
  ])('renders recovery text in the existing single status slot: %s', (text) => {
    const { container, getByText, queryByText } = renderGame({
      description: text,
      descriptor: batch({ count: 2 }),
      isRecovering: true,
    })

    expect(getByText(text)).toBeInTheDocument()
    expect(queryByText('Upgrading 2 names...')).not.toBeInTheDocument()
    expect(getByText('Picking up where you left off')).toBeInTheDocument()
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('renders a long runtime name without replacing its placeholder value', () => {
    const longName = `${'very-long-label-'.repeat(8)}.eth`
    const { getByText } = renderGame({ description: `Upgrading ${longName}` })
    expect(getByText(`Upgrading ${longName}`)).toBeInTheDocument()
  })
})
