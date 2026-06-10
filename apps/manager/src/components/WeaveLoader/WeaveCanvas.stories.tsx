import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { WeaveCanvas } from './WeaveCanvas'

const meta = {
  title: 'Components/WeaveLoader/WeaveCanvas',
  component: WeaveCanvas,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[360px] w-[360px] overflow-hidden rounded-xl border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WeaveCanvas>

export default meta
type Story = StoryObj<typeof meta>

/** Default multi-colorway dye-bleed weave (the pink/blue fabric). */
export const Default: Story = {}

/** Single Lapis (blue) colorway, finer grid. */
export const Lapis: Story = {
  args: { options: { useAllColorways: false, palette: 2, gridSize: 24 } },
}

/** Houndstooth pattern with shimmer sweep enabled. */
export const HoundstoothShimmer: Story = {
  args: {
    options: {
      pattern: 13,
      useAllColorways: false,
      palette: 2,
      gridSize: 40,
      shimmer: true,
      shimmerWidth: 12,
      shimmerIntensity: 0.6,
    },
  },
}

/** Coarse grid, all colorways — shows the weave structure clearly. */
export const CoarseGrid: Story = {
  args: { options: { gridSize: 14 } },
}
