import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { userEvent, within } from 'storybook/test'
import type { MigrationGasEstimateState } from '../hooks/useMigrationGasEstimate'
import type { MigrationPlan } from '../service/buildMigrationPlan'
import type { MigrationStepDescriptor } from '../service/buildStepDescriptors'
import { MigrationStoryProviders } from './MigrationStoryProviders'
import { SelectNamesStepFooter } from './SelectNamesStepFooter'

const noop = () => undefined

const fullPlanSteps: readonly MigrationStepDescriptor[] = [
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
  {
    type: 'atomic-batch',
    index: 0,
    total: 2,
    count: 2,
    migrateCount: 2,
    copyCount: 0,
  },
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

const singleStep: readonly MigrationStepDescriptor[] = [
  {
    type: 'atomic-batch',
    index: 0,
    total: 1,
    count: 1,
    migrateCount: 1,
    copyCount: 0,
  },
]

type EstimatePreset = 'ready' | 'readySingle' | 'loading' | 'error' | 'funding'

// Presets keep bigint token ids out of Storybook args, which are serialised.
const estimateFor = (preset: EstimatePreset): MigrationGasEstimateState => {
  switch (preset) {
    case 'ready':
    case 'funding':
      return {
        status: 'ready',
        plan: { stepDescriptors: fullPlanSteps } as unknown as MigrationPlan,
        formattedEth: '0.0042',
        gasUnits: 1n,
        feeWei: 1n,
        transactionCount: fullPlanSteps.length,
      }
    case 'readySingle':
      return {
        status: 'ready',
        plan: { stepDescriptors: singleStep } as unknown as MigrationPlan,
        formattedEth: '0.0008',
        gasUnits: 1n,
        feeWei: 1n,
        transactionCount: 1,
      }
    case 'loading':
      return { status: 'loading' }
    case 'error':
      return { status: 'error', message: 'execution reverted' }
  }
}

const FooterPreview = ({
  preset,
  totalSelected,
}: {
  readonly preset: EstimatePreset
  readonly totalSelected: number
}) => (
  <div className="flex min-h-80 w-full flex-col justify-end bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200">
    <SelectNamesStepFooter
      gasEstimate={estimateFor(preset)}
      isEstimatingGas={preset === 'loading'}
      isStarting={false}
      isUpgradeDisabled={preset !== 'ready' && preset !== 'readySingle'}
      isWaitingForGasFunding={preset === 'funding'}
      onUpgrade={noop}
      totalSelected={totalSelected}
      visibleCount={totalSelected}
    />
  </div>
)

const meta = {
  title: 'Features/Migration/Select names footer',
  component: FooterPreview,
  parameters: { layout: 'fullscreen' },
  args: { preset: 'ready', totalSelected: 5 },
  decorators: [
    (Story) => (
      <MigrationStoryProviders>
        <Story />
      </MigrationStoryProviders>
    ),
  ],
} satisfies Meta<typeof FooterPreview>

export default meta
type Story = StoryObj<typeof meta>

export const FeeEstimateReady: Story = {}
export const FeeEstimateSingleRequest: Story = {
  args: { preset: 'readySingle', totalSelected: 1 },
}
export const EstimatingFee: Story = { args: { preset: 'loading' } }
export const FeeEstimateUnavailable: Story = { args: { preset: 'error' } }
export const PreparingWallet: Story = { args: { preset: 'funding' } }

export const WalletExplainerOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '8 requests' }))
  },
}
