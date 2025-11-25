import type { Meta, StoryObj } from '@storybook/react-vite'
import { NotificationSettings } from './NotificationSettings'

const meta = {
  title: 'Features/Register/NotificationSettings',
  component: NotificationSettings,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/10 p-12">
        <div className="w-full max-w-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    onConfirm: (settings) => {
      console.log('Notification preferences confirmed:', settings)
    },
    onSkip: () => {
      console.log('Skip clicked')
    },
  },
} satisfies Meta<typeof NotificationSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithEmail: Story = {
  render: (args) => {
    // This story demonstrates the component with pre-filled email
    // Note: The component manages its own state, so we can't directly set initial values
    // This is just for visual reference
    return <NotificationSettings {...args} />
  },
}
