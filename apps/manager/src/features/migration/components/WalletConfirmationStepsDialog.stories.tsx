import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const allSteps = [
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
    total: 1,
    count: 3,
    migrateCount: 2,
    copyCount: 1,
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
] satisfies readonly MigrationStepDescriptor[]

const meta = {
  title: 'Features/Migration/Wallet confirmation steps',
  component: WalletConfirmationStepsDialog,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="rounded-md bg-ens-garnet-200 p-8 text-ens-garnet-900">
        <Story />
      </div>
    ),
  ],
  args: { steps: allSteps },
  // Step descriptors carry bigint token ids, which the Controls panel cannot
  // serialise; the steps are varied per story instead.
  argTypes: { steps: { control: false } },
} satisfies Meta<typeof WalletConfirmationStepsDialog>

export default meta
type Story = StoryObj<typeof meta>

export const CompletePlan: Story = {}
export const OneRequest: Story = {
  args: {
    steps: [
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
      },
    ],
  },
}
