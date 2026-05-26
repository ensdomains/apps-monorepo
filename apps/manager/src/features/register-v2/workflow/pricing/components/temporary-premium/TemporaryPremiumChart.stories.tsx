import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import {
  PREMIUM_DURATION_MS,
  pointAtDate,
  pointAtPrice,
  posAtPoint,
  TemporaryPremiumChart,
  UNIT_CHART_GEO,
} from './TemporaryPremiumChart'

const mockWindowProgress = 0.22
const mockStartDate = (() => {
  const nowMs = Date.now()
  const startMs = Math.round(nowMs - mockWindowProgress * PREMIUM_DURATION_MS)
  return new Date(startMs)
})()

const mockNowPoint = pointAtDate(new Date(), mockStartDate)

function InteractiveTemporaryPremiumChart({
  startDate,
  nowPoint,
  height = 240,
}: {
  startDate: Date
  nowPoint: number
  height?: number
}) {
  const [selectedPoint, setSelectedPoint] = useState(nowPoint)
  const [priceInput, setPriceInput] = useState('')

  const handleSelect = (point: number) => {
    setSelectedPoint(point)
    setPriceInput(formatPriceForInput(posAtPoint(point, UNIT_CHART_GEO).price))
  }

  const handlePriceChange = (raw: string) => {
    setPriceInput(raw)
    const parsed = Number.parseFloat(raw.replace(/,/g, ''))
    if (!Number.isFinite(parsed) || parsed < 0) return
    setSelectedPoint(pointAtPrice(parsed))
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        Target price
        <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-[#e5e5e5] bg-white">
          <span className="flex items-center border-[#e5e5e5] border-r px-3 text-[#64748B]">
            $
          </span>
          <input
            className="min-w-0 flex-1 px-3 text-sm outline-none"
            inputMode="decimal"
            onChange={(e) =>
              handlePriceChange(e.target.value.replace(/[^0-9.,]/g, ''))
            }
            placeholder="Enter a price"
            value={priceInput}
          />
        </div>
      </label>
      <TemporaryPremiumChart
        allowPastSelection
        height={height}
        nowPoint={nowPoint}
        onSelect={handleSelect}
        selectedPoint={selectedPoint}
        startDate={startDate}
      />
    </div>
  )
}

const meta = {
  title: 'Register v2/Pricing/Price cooldown/Temporary premium chart',
  component: InteractiveTemporaryPremiumChart,
  parameters: {
    layout: 'padded',
  },
  args: {
    startDate: mockStartDate,
    nowPoint: mockNowPoint,
  },
} satisfies Meta<typeof InteractiveTemporaryPremiumChart>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Compact: Story = {
  args: {
    height: 180,
  },
}
