import type { Meta, StoryObj } from '@storybook/react-vite'
import { ERNI_PRICE_COOLDOWN_MOCK } from '../PricingStepScreen'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import type { PriceCooldownBannerProps } from './types'

const mockProps: PriceCooldownBannerProps = {
  ...ERNI_PRICE_COOLDOWN_MOCK.banner,
}

const meta = {
  title: 'Register v2/Pricing/PriceCooldownBanner',
  component: PriceCooldownBanner,
  parameters: {
    layout: 'padded',
  },
  args: mockProps,
} satisfies Meta<typeof PriceCooldownBanner>

export default meta

type Story = StoryObj<typeof meta>

/** Isolated banner — use PricingStep (price cooldown) stories for full-page layouts. */
export const DesktopCollapsed: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
}

export const DesktopExpanded: Story = {
  args: {
    defaultExpanded: true,
  },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
}

export const MobileCollapsed: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}

export const MobileExpanded: Story = {
  args: {
    defaultExpanded: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
