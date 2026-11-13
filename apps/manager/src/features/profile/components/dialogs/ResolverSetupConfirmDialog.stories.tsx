import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ResolverSetupConfirmDialog } from './ResolverSetupConfirmDialog'

const noop = () => undefined

const recordWrites = [
  { key: 'text:description', value: 'Building on ENS' },
  { key: 'addr:60', value: '0x1111111111111111111111111111111111111111' },
]

const meta = {
  title: 'Features/Profile/ResolverSetupConfirmDialog',
  component: ResolverSetupConfirmDialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onOpenChange: noop,
    onConfirm: noop,
  },
} satisfies Meta<typeof ResolverSetupConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

export const PrimaryNameNothingToReplace: Story = {
  args: { intent: 'primary-name', replaces: 'nothing' },
}

export const PrimaryNameReplacing: Story = {
  args: { intent: 'primary-name', replaces: 'resolver' },
}

export const PrimaryNameInvalidResolver: Story = {
  args: { intent: 'primary-name', replaces: 'invalid-resolver' },
}

export const EditProfileReplacing: Story = {
  args: { intent: 'edit-profile', isReplacing: true, recordWrites },
}
