import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { EnableSessionModal } from './EnableSessionModal'

const meta = {
  title: 'Features/Wallet/EnableSessionModal',
  component: EnableSessionModal,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onDismiss: () => {}, onEnableSession: async () => {} },
} satisfies Meta<typeof EnableSessionModal>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Signing: Story = { args: { isEnabling: true } }
export const Failed: Story = { args: { hasError: true } }
