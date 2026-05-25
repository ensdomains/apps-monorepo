import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ERNI_PRICE_COOLDOWN_MOCK,
  PricingStepScreen,
} from './components/PricingStepScreen'

/**
 * Full pricing-step layouts for names in price cooldown (Figma 2639:51105 desktop,
 * 2639:50715 mobile). Uses provider-free shells — no XState or contract queries.
 */
const meta = {
  title: 'Register v2/Pricing/PricingStep (price cooldown)',
  component: PricingStepScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PricingStepScreen>

export default meta

type Story = StoryObj<typeof meta>

const baseArgs = {
  ...ERNI_PRICE_COOLDOWN_MOCK,
  banner: {
    ...ERNI_PRICE_COOLDOWN_MOCK.banner,
    defaultExpanded: false,
  },
}

export const DesktopBannerCollapsed: Story = {
  args: baseArgs,
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
}

export const DesktopBannerExpanded: Story = {
  args: {
    ...baseArgs,
    banner: {
      ...ERNI_PRICE_COOLDOWN_MOCK.banner,
      defaultExpanded: true,
    },
  },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
}

export const MobileBannerCollapsed: Story = {
  args: baseArgs,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}

export const MobileBannerExpanded: Story = {
  args: {
    ...baseArgs,
    banner: {
      ...ERNI_PRICE_COOLDOWN_MOCK.banner,
      defaultExpanded: true,
    },
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
