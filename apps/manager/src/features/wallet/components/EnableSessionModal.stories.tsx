import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { fn } from 'storybook/test'
import { EnableSessionModal } from './EnableSessionModal'

const meta = {
  title: 'Features/Wallet/Enable smart sessions',
  component: EnableSessionModal,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onDismiss: fn(),
    onEnableSession: fn(async () => {}),
  },
} satisfies Meta<typeof EnableSessionModal>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}

/** The ENABLE signature is in the wallet or waiting for confirmation. */
export const Signing: Story = { args: { isEnabling: true } }

/** The last attempt failed; the page stays usable without a session. */
export const Failed: Story = { args: { hasError: true } }
