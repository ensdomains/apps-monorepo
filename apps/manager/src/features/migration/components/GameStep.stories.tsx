import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { GameStepView } from './GameStep'

const BridgePreview = ({
  completedSteps,
  totalSteps,
  hasCollapsed,
}: {
  readonly completedSteps: number
  readonly totalSteps: number
  readonly hasCollapsed: boolean
}) => (
  <div className="relative h-[700px] bg-ens-garnet-100">
    <GameStepView
      hasCollapsed={hasCollapsed}
      progress={{
        currentStep: completedSteps,
        totalSteps,
        description: 'Confirm the next transaction in your wallet…',
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
  args: { completedSteps: 0, totalSteps: 6, hasCollapsed: false },
  argTypes: {
    completedSteps: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    totalSteps: { control: { type: 'range', min: 1, max: 12, step: 1 } },
  },
} satisfies Meta<typeof BridgePreview>
export default meta
type Story = StoryObj<typeof meta>

export const WaitingForFirstTransaction: Story = {}
export const FirstPlankComplete: Story = { args: { completedSteps: 1 } }
export const MultipleTransactions: Story = {
  args: { completedSteps: 4, totalSteps: 10 },
}
export const Complete: Story = { args: { completedSteps: 6 } }
