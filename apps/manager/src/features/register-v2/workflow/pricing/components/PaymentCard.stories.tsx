import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Card } from '@/components/ui/card'
import { ConnectedPaymentButtons } from './ConnectedPaymentButtons'

const meta = {
  title: 'Register V2/Payment choices',
  component: ConnectedPaymentButtons,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ConnectedPaymentButtons>

export default meta
type Story = StoryObj<typeof meta>

export const StablecoinsAndEth: Story = {
  args: {
    canNext: true,
    isPreparing: false,
    onNext: () => {},
    onEth: () => {},
  },
  render: (args) => (
    <Card className="w-105 items-center gap-5 px-12 py-10">
      <p className="text-ens-lapis-surface text-xs uppercase">Total</p>
      <p className="font-medium text-4xl text-ens-blue-midnight">$20.00 USD</p>
      <div className="flex w-full flex-col gap-3">
        <ConnectedPaymentButtons {...args} />
      </div>
    </Card>
  ),
}
