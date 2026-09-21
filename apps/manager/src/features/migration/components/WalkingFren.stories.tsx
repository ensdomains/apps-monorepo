import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { WalkingFren } from './WalkingFren'

const meta = {
  title: 'Migration/Walking Frens',
  component: WalkingFren,
  parameters: { layout: 'centered' },
  args: { character: 'peanut', className: 'h-48 w-48', isWalking: true },
  argTypes: {
    character: {
      control: 'select',
      options: ['peanut', 'kuzco', 'bittu', 'earl'],
    },
  },
} satisfies Meta<typeof WalkingFren>

export default meta
type Story = StoryObj<typeof meta>
export const WalkCycle: Story = {}
export const Standing: Story = { args: { isWalking: false } }
export const Party: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {(['peanut', 'kuzco', 'bittu', 'earl'] as const).map((character) => (
        <WalkingFren
          character={character}
          className="h-40 w-40"
          isWalking
          key={character}
        />
      ))}
    </div>
  ),
}
