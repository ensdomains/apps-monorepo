import type { Signer } from '@ens-apps/transaction-manager'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useActorRef } from '@xstate/react'
import { useEffect } from 'react'
import { useConfig } from 'wagmi'
import { fromCallback } from 'xstate'
import type { MigrationPlan } from '../service/buildMigrationPlan'
import type { MigrationStepDescriptor } from '../service/buildStepDescriptors'
import type { MigrationProgress } from '../service/migrationService'
import { MigrationUiContext } from '../state/migrationUi.context'
import { migrationUiMachine } from '../state/migrationUi.machine'
import { GameStep } from './GameStep'
import { GrainOverlay } from './GrainOverlay'
import { MigrationStoryProviders } from './MigrationStoryProviders'

const steps: readonly MigrationStepDescriptor[] = [
  { type: 'deploy-hca' },
  { type: 'approval', approvalId: 'base-registrar:hca', count: 3 },
  {
    type: 'atomic-batch',
    index: 0,
    total: 1,
    count: 3,
    migrateCount: 2,
    copyCount: 1,
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
]

type ProgressPreset =
  | 'beforeFirstStep'
  | 'settingUp'
  | 'permission'
  | 'upgradingBatch'
  | 'recoveredMixed'
  | 'recoveredLongName'
  | 'complete'

const progressFor = (preset: ProgressPreset): MigrationProgress | undefined => {
  switch (preset) {
    case 'beforeFirstStep':
      return undefined
    case 'settingUp':
      return { currentStep: 0, totalSteps: 4, description: 'Getting ready' }
    case 'permission':
      return {
        currentStep: 1,
        totalSteps: 4,
        description: 'Getting permission to upgrade your names',
        txHash: '0x01',
      }
    case 'upgradingBatch':
      return {
        currentStep: 2,
        totalSteps: 4,
        description: 'Upgrading 2 names, copying 1',
        txHash: '0x02',
      }
    case 'recoveredMixed':
      return {
        currentStep: 3,
        totalSteps: 4,
        description:
          'Picking up where you left off: 2 already upgraded, 1 already copied',
      }
    case 'recoveredLongName':
      return {
        currentStep: 3,
        totalSteps: 4,
        description:
          'Picking up where you left off: averyveryverylongname.eth was already upgraded',
      }
    case 'complete':
      return {
        currentStep: 4,
        totalSteps: 4,
        description: 'Upgrade complete',
        txHash: '0x03',
      }
  }
}

const noopAsync = () => Promise.resolve()

// The real machine would run the migration service on `migration.start`;
// the story swaps that actor for one that never reports, so the screen holds
// whatever progress the story replays into it.
const idleMachine = migrationUiMachine.provide({
  actors: { runMigration: fromCallback(() => undefined) },
})

// Drives the UI machine the way the page does: start an upgrade for the
// selected names, then replay one progress event so the screen lands on the
// state the story is about.
const StoryMigrationUi = ({
  children,
  nameCount,
  preset,
}: {
  readonly children: React.ReactNode
  readonly nameCount: number
  readonly preset: ProgressPreset
}) => {
  const wagmiConfig = useConfig()
  const uiActor = useActorRef(idleMachine, { input: { wagmiConfig } })
  useEffect(() => {
    const names = Array.from({ length: nameCount }, (_, i) => `name${i}.eth`)
    uiActor.send({ type: 'selection.set', names })
    uiActor.send({
      type: 'migration.start',
      plan: {
        classified: names.map((name) => ({ domain: { name } })),
        stepDescriptors: steps,
      } as unknown as MigrationPlan,
      signer: {} as Signer,
      hcaClient: {
        getAddress: () => '0x0000000000000000000000000000000000000002',
        getInitData: () => ({}),
      } as never,
      refreshAccount: noopAsync,
    })
    const progress = progressFor(preset)
    if (progress) uiActor.send({ type: 'migration.progress', progress })
  }, [nameCount, preset, uiActor])
  return (
    <MigrationUiContext.Provider value={{ uiActor }}>
      {children}
    </MigrationUiContext.Provider>
  )
}

const GameStepPreview = ({
  nameCount,
  preset,
}: {
  readonly nameCount: number
  readonly preset: ProgressPreset
}) => (
  <StoryMigrationUi
    key={`${nameCount}-${preset}`}
    nameCount={nameCount}
    preset={preset}
  >
    <div className="relative h-160 w-full overflow-clip bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200">
      <GrainOverlay className="opacity-70" />
      <GameStep />
    </div>
  </StoryMigrationUi>
)

const meta = {
  title: 'Features/Migration/Upgrade progress',
  component: GameStepPreview,
  parameters: { layout: 'fullscreen' },
  args: { nameCount: 3, preset: 'beforeFirstStep' },
  decorators: [
    (Story) => (
      <MigrationStoryProviders>
        <Story />
      </MigrationStoryProviders>
    ),
  ],
} satisfies Meta<typeof GameStepPreview>

export default meta
type Story = StoryObj<typeof meta>

export const BeforeFirstStep: Story = {}
export const SingleName: Story = { args: { nameCount: 1 } }
export const SettingUp: Story = { args: { preset: 'settingUp' } }
export const GettingPermission: Story = { args: { preset: 'permission' } }
export const UpgradingBatch: Story = { args: { preset: 'upgradingBatch' } }
export const RecoveredMixed: Story = { args: { preset: 'recoveredMixed' } }
export const RecoveredLongName: Story = {
  args: { preset: 'recoveredLongName' },
}
export const Complete: Story = { args: { preset: 'complete' } }
