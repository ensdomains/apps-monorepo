import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { CenteredWeaveLoader } from './CenteredWeaveLoader'

const meta = {
  title: 'Features/Register v2/Centered weave loader',
  component: CenteredWeaveLoader,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'blaze.eth',
    progress: 35,
    description: 'Waiting for commitment cooldown — register unlocks in 52s',
    notice: 'Keep this browser open while your name is being registered',
  },
} satisfies Meta<typeof CenteredWeaveLoader>

export default meta
type Story = StoryObj<typeof meta>

export const Registering: Story = {}

/** The short state before the stage has a description. */
export const BeforeDescription: Story = {
  args: { description: undefined },
}
