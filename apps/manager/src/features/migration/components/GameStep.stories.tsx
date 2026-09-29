import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { GameStepView } from './GameStep'

const BridgePreview = ({
  completedSteps,
  totalSteps,
  hasCollapsed,
  isAwaitingConfirmation,
}: {
  readonly completedSteps: number
  readonly totalSteps: number
  readonly hasCollapsed: boolean
  readonly isAwaitingConfirmation: boolean
}) => (
  <div className="relative h-[700px] bg-ens-garnet-100">
    <GameStepView
      hasCollapsed={hasCollapsed}
      progress={{
        currentStep: completedSteps,
        totalSteps,
        isAwaitingConfirmation,
        description: isAwaitingConfirmation
          ? 'Waiting for your transaction to confirm…'
          : 'Confirm the next transaction in your wallet…',
      }}
      selectedNameCount={12}
      stepDescriptors={[]}
    />
  </div>
)

const meta = {
  title: 'Migration/Transaction Bridge',
  component: BridgePreview,
  parameters: { layout: 'fullscreen' },
  args: {
    completedSteps: 0,
    totalSteps: 6,
    hasCollapsed: false,
    isAwaitingConfirmation: false,
  },
  argTypes: {
    completedSteps: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    totalSteps: { control: { type: 'range', min: 1, max: 12, step: 1 } },
  },
} satisfies Meta<typeof BridgePreview>
export default meta
type Story = StoryObj<typeof meta>

export const WaitingForFirstTransaction: Story = {}
export const FirstPlankComplete: Story = { args: { completedSteps: 1 } }
export const WalletSubmitted: Story = {
  args: { totalSteps: 2, isAwaitingConfirmation: true },
}
export const MultipleTransactions: Story = {
  args: { completedSteps: 4, totalSteps: 10 },
}
export const Complete: Story = { args: { completedSteps: 6 } }

export const ApprovingRenewalPayment: Story = {
  render: ({ isAwaitingConfirmation }) => (
    <div className="relative h-[700px] bg-ens-garnet-100">
      <GameStepView
        hasCollapsed={false}
        progress={{
          currentStep: 0,
          totalSteps: 2,
          description: '',
          isAwaitingConfirmation,
        }}
        selectedNameCount={3}
        stepDescriptors={[
          { type: 'renewal-approval' },
          { type: 'renew-grace', count: 3 },
        ]}
      />
    </div>
  ),
}

export const ConfirmingRenewalPaymentApproval: Story = {
  ...ApprovingRenewalPayment,
  args: { isAwaitingConfirmation: true },
}

export const RenewingGraceNames: Story = {
  render: () => (
    <div className="relative h-[700px] bg-ens-garnet-100">
      <GameStepView
        hasCollapsed={false}
        progress={{
          currentStep: 1,
          totalSteps: 2,
          description: '',
          isAwaitingConfirmation: true,
        }}
        selectedNameCount={3}
        stepDescriptors={[
          { type: 'renewal-approval' },
          { type: 'renew-grace', count: 3 },
        ]}
      />
    </div>
  ),
}
