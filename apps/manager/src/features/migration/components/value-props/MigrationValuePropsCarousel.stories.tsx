import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { GrainOverlay } from '../GrainOverlay'
import { MigrationValuePropMediaCard } from './MigrationValuePropMediaCard'
import { MigrationValuePropsCarousel } from './MigrationValuePropsCarousel'
import { getMigrationValuePropSlides } from './migrationValueProps'

const meta = {
  title: 'Migration/Value Props Carousel',
  component: MigrationValuePropsCarousel,
  args: {
    isNftSlideVisible: false,
  },
  decorators: [
    // Same background and width as the migration modal
    (Story) => (
      <div className="relative mx-auto w-full max-w-160 overflow-hidden bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-5">
        <GrainOverlay />
        <div className="relative z-10">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MigrationValuePropsCarousel>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithNftSlide: Story = {
  args: {
    isNftSlideVisible: true,
  },
}

export const Mobile: Story = {
  args: {
    isNftSlideVisible: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}

/** Every slide's art side by side, to check the assets against Figma. */
export const AllCards: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
      {getMigrationValuePropSlides(true).map((slide) => (
        <MigrationValuePropMediaCard key={slide.id} media={slide.media} />
      ))}
    </div>
  ),
}
