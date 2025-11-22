import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckAvailability } from './CheckAvailability'

const meta = {
  title: 'Features/Register/CheckAvailability/CheckAvailability',
  component: CheckAvailability,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/10 p-12">
        <div className="w-full max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {},
} satisfies Meta<typeof CheckAvailability>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
