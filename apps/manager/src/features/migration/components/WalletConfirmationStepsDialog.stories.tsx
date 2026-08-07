import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const steps = [
  { type: 'deploy-hca' },
  { type: 'approval', approvalId: 'name-wrapper:hca' },
  { type: 'atomic-batch', count: 10, index: 0, total: 1 },
] satisfies readonly MigrationStepDescriptor[]

const meta = {
  title: 'Features/Migration/WalletConfirmationStepsDialog',
  component: WalletConfirmationStepsDialog,
  parameters: {
    layout: 'centered',
  },
  args: { steps },
} satisfies Meta<typeof WalletConfirmationStepsDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
