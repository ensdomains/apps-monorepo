import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  PREMIUM_DURATION_MS,
  pointAtDate,
} from '../temporary-premium/TemporaryPremiumChart'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import type { PriceCooldownBannerProps } from './types'
import { usePriceCooldownChartSelection } from './usePriceCooldownChartSelection'

const mockWindowProgress = 0.22

const mockPremiumStartDate = (() => {
  const nowMs = Date.now()
  const startMs = Math.round(nowMs - mockWindowProgress * PREMIUM_DURATION_MS)
  return new Date(startMs)
})()

const mockNowPoint = pointAtDate(new Date(), mockPremiumStartDate)

const staticProps = {
  basePricePerYearLabel: '$8/year',
  currentPremiumLabel: '$4,720',
  premiumEndsAtLabel: 'August 28, 2026 at 2:30 PM',
  periodDays: 21,
  timezoneLabel: 'UTC-07:00',
  premiumStartDate: mockPremiumStartDate,
  nowPoint: mockNowPoint,
  favoriteCount: 425,
  searchCount30d: 40,
} satisfies Omit<
  PriceCooldownBannerProps,
  | 'selectedPoint'
  | 'onSelectedPointChange'
  | 'targetPriceInput'
  | 'onTargetPriceInputChange'
  | 'onTargetPriceInputBlur'
  | 'targetPriceReachLabel'
>

function InteractivePriceCooldownBanner(
  props: Omit<
    PriceCooldownBannerProps,
    | 'selectedPoint'
    | 'onSelectedPointChange'
    | 'targetPriceInput'
    | 'onTargetPriceInputChange'
    | 'onTargetPriceInputBlur'
    | 'targetPriceReachLabel'
  >,
) {
  const {
    selectedPoint,
    targetPriceInput,
    handleSelectedPointChange,
    handleTargetPriceInputChange,
    handleTargetPriceInputBlur,
    targetPriceReachLabel,
  } = usePriceCooldownChartSelection(props.premiumStartDate, props.nowPoint)

  return (
    <PriceCooldownBanner
      {...props}
      onSelectedPointChange={handleSelectedPointChange}
      onTargetPriceInputBlur={handleTargetPriceInputBlur}
      onTargetPriceInputChange={handleTargetPriceInputChange}
      selectedPoint={selectedPoint}
      targetPriceInput={targetPriceInput}
      targetPriceReachLabel={targetPriceReachLabel}
    />
  )
}

const meta = {
  title: 'Register v2/Pricing/Price cooldown/Banner',
  component: InteractivePriceCooldownBanner,
  parameters: {
    layout: 'padded',
  },
  args: staticProps,
} satisfies Meta<typeof InteractivePriceCooldownBanner>

export default meta

type Story = StoryObj<typeof meta>

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
