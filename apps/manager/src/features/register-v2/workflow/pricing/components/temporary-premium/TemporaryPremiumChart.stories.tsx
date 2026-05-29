import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useMemo, useState } from 'react'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import {
  type LeaderPlacement,
  PREMIUM_RES_PER_DAY,
  pointAtDate,
  pointAtPrice,
  posAtPoint,
  TemporaryPremiumChart,
  TemporaryPremiumChartDebugControls,
  type TemporaryPremiumChartDebugState,
  UNIT_CHART_GEO,
} from './TemporaryPremiumChart'

/** Match ens_premium_chart_final.html: ~6.5 days into the 21-day window. */
const mockStartDate = (() => {
  const nowMs = Date.now()
  const startMs = Math.round(nowMs - 6.5 * 86_400_000)
  return new Date(startMs)
})()

const mockNowPoint = pointAtDate(new Date(), mockStartDate)

type SimulationSettings = {
  enabled: boolean
  intervalMs: number
  /** Multiplier on one hour of decay per tick (reference uses 0.4). */
  decayPerTick: number
}

/** Defaults from ens_premium_chart_final.html */
const DEFAULT_SIMULATION: SimulationSettings = {
  enabled: true,
  intervalMs: 2_000,
  decayPerTick: 0.4,
}

function TemporaryPremiumDebugPlayground() {
  const initialSelectedPoint = useMemo(
    () => mockNowPoint + Math.floor(PREMIUM_RES_PER_DAY * 3),
    [],
  )

  const [selectedPoint, setSelectedPoint] = useState(initialSelectedPoint)
  const [priceInput, setPriceInput] = useState('')
  const [simulation, setSimulation] =
    useState<SimulationSettings>(DEFAULT_SIMULATION)
  const [simulationKey, setSimulationKey] = useState(0)
  const [debugState, setDebugState] = useState<TemporaryPremiumChartDebugState>(
    {
      steepThreshold: 1,
      showOverlay: false,
    },
  )
  const [placement, setPlacement] = useState<LeaderPlacement | null>(null)

  const handleSelect = useCallback((point: number) => {
    setSelectedPoint(point)
    setPriceInput(formatPriceForInput(posAtPoint(point, UNIT_CHART_GEO).price))
  }, [])

  const handlePriceChange = (raw: string) => {
    setPriceInput(raw)
    const parsed = Number.parseFloat(raw.replace(/,/g, ''))
    if (!Number.isFinite(parsed) || parsed < 0) return
    setSelectedPoint(pointAtPrice(parsed))
  }

  const restartSimulation = () => {
    setSimulationKey((value) => value + 1)
    setSelectedPoint(initialSelectedPoint)
    setPriceInput('')
  }

  const simulatePolling = useMemo(
    () =>
      simulation.enabled
        ? {
            intervalMs: simulation.intervalMs,
            decayPerTick: simulation.decayPerTick,
          }
        : undefined,
    [simulation.decayPerTick, simulation.enabled, simulation.intervalMs],
  )

  const chartDebug = useMemo(
    () => ({
      onPlacementChange: setPlacement,
      showOverlay: debugState.showOverlay,
      simulatePolling,
    }),
    [debugState.showOverlay, simulatePolling],
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl text-[#191919]">
          Temporary premium chart
        </h1>
        <p className="text-[#737373] text-sm leading-relaxed">
          Same as the HTML reference: polling advances the now target every 2s,
          and the blue dot glides down the curve while the price label tweens.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="font-medium text-[#353535] text-sm">
            Target price (black dot)
          </h2>
          <div className="flex h-12 items-stretch overflow-hidden rounded-md border border-[#e5e5e5]">
            <span className="flex items-center border-[#e5e5e5] border-r bg-[#f6f6f6] px-4 text-[#64748B]">
              $
            </span>
            <input
              className="min-w-0 flex-1 px-3 text-[#191919] text-sm outline-none"
              inputMode="decimal"
              onChange={(e) =>
                handlePriceChange(e.target.value.replace(/[^0-9.,]/g, ''))
              }
              placeholder="Enter a price"
              value={priceInput}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
          <h2 className="font-medium text-[#353535] text-sm">Simulation</h2>
          <label className="flex cursor-pointer items-center gap-2 text-[#353535] text-sm">
            <input
              checked={simulation.enabled}
              className="accent-[#0082BB]"
              onChange={(e) =>
                setSimulation((prev) => ({
                  ...prev,
                  enabled: e.target.checked,
                }))
              }
              type="checkbox"
            />
            Cooldown polling
          </label>
          <label className="flex flex-col gap-1 text-[#353535] text-xs">
            Interval ({simulation.intervalMs}ms)
            <input
              className="accent-[#0082BB]"
              max={10_000}
              min={500}
              onChange={(e) =>
                setSimulation((prev) => ({
                  ...prev,
                  intervalMs: Number.parseInt(e.target.value, 10),
                }))
              }
              step={250}
              type="range"
              value={simulation.intervalMs}
            />
          </label>
          <label className="flex flex-col gap-1 text-[#353535] text-xs">
            Decay ({simulation.decayPerTick.toFixed(1)}× 1h / tick)
            <input
              className="accent-[#0082BB]"
              max={4}
              min={0.1}
              onChange={(e) =>
                setSimulation((prev) => ({
                  ...prev,
                  decayPerTick: Number.parseFloat(e.target.value),
                }))
              }
              step={0.1}
              type="range"
              value={simulation.decayPerTick}
            />
          </label>
          <button
            className="rounded-md border border-[#0082BB] bg-white px-3 py-2 font-medium text-[#0082BB] text-sm hover:bg-[#effafe]"
            onClick={restartSimulation}
            type="button"
          >
            Restart
          </button>
        </div>
      </section>

      <TemporaryPremiumChartDebugControls
        onChange={setDebugState}
        placement={placement}
        state={debugState}
      />

      <TemporaryPremiumChart
        allowPastSelection
        debug={chartDebug}
        height={260}
        key={`live-${simulationKey}`}
        leaderConfig={{ steepThreshold: debugState.steepThreshold }}
        nowPoint={mockNowPoint}
        onSelect={handleSelect}
        selectedPoint={selectedPoint}
        startDate={mockStartDate}
        tweenDurationMs={1_500}
        tweenNowPrice={simulation.enabled}
      />
    </div>
  )
}

const meta = {
  title: 'Register v2/Pricing/Price cooldown/Temporary premium chart',
  component: TemporaryPremiumDebugPlayground,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof TemporaryPremiumDebugPlayground>

export default meta

type Story = StoryObj<typeof meta>

/** Interactive demo matching ens_premium_chart_final.html */
export const DebugPlayground: Story = {}
