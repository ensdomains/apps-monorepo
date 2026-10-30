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
    intent: 'primary-name',
    replaces: 'resolver',
    open: true,
    onOpenChange: noop,
    onConfirm: noop,
  },
  argTypes: {
    intent: {
      control: 'inline-radio',
      options: ['primary-name', 'edit-profile'],
    },
    replaces: {
      control: 'inline-radio',
      options: ['nothing', 'resolver', 'invalid-resolver'],
    },
  },
} satisfies Meta<typeof ResolverSetupConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

export const PrimaryNameNothingToReplace: Story = {
  args: { replaces: 'nothing' },
}

export const PrimaryNameReplacing: Story = {}

export const PrimaryNameInvalidResolver: Story = {
  args: { replaces: 'invalid-resolver' },
}

export const EditProfileReplacing: Story = {
  args: { intent: 'edit-profile', recordWrites },
}

export const EditProfileInvalidResolver: Story = {
  args: { intent: 'edit-profile', replaces: 'invalid-resolver', recordWrites },
}
