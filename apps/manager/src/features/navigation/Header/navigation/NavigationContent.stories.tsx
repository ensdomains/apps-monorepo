import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NavigationContent } from './NavigationContent'

const meta = {
  title: 'Features/Navigation/NavigationContent',
  component: NavigationContent,
  parameters: {
    layout: 'centered',
  },
  args: {
    onAction: () => {},
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NavigationContent>

export default meta
type Story = StoryObj<typeof meta>

/** As in the desktop popover, which sizes to its content. */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="w-fit bg-white p-6">
        <Story />
      </div>
    ),
  ],
}

/** As in the mobile drawer, which spans the screen. */
export const Mobile: Story = {
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="bg-white px-4.5 pt-6 pb-14">
        <Story />
      </div>
    ),
  ],
}
