import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { PaymentAction } from './PaymentAction'

const meta = {
  title: 'Features/Register/Payment action',
  component: PaymentAction,
  decorators: [
    (Story) => (
      <div className="max-w-[420px] bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Continue in wallet',
    warning: null,
    onNext: () => {},
    onRetry: undefined,
    canNext: true,
    isBusy: false,
    isSettling: false,
    helpMessage: 'You sign a payment approval, then the renewal.',
  },
} satisfies Meta<typeof PaymentAction>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithCancel: Story = {
  args: { label: 'Sign payment approval', onCancel: () => {} },
}

export const Retry: Story = {
  args: { onRetry: () => {}, canNext: false },
}

export const Busy: Story = {
  args: { label: 'Signing renewal…', isBusy: true, isSettling: true },
}
