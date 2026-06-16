import {
  type MouseEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { cn } from '@/lib/utils'
import { ChartValuePill } from './ChartValuePill'
import { useElementSize, useTweenedValue } from './premiumChartHooks'
import {
  buildCurvePath,
  buildSteepZonePath,
  type ChartGeometry,
  chooseLeaderDirection,
  computeLeaderGeometry,
  dateAtPoint,
  findHorizontalLeaderClearance,
  formatChartDate,
  formatMoney,
  type LeaderConfig,
  type LeaderPlacement,
  labelBox,
  PREMIUM_RES_PER_DAY,
  PREMIUM_RESOLUTION,
  pointAtPrice,
  pointAtX,
  posAtPoint,
  priceAtDay,
} from './premiumChartMath'

// Re-export the math, hooks, and debug-controls modules so existing importers
// of `./TemporaryPremiumChart` keep their import surface unchanged after the
// file was split for size.
export * from './premiumChartHooks'
export * from './premiumChartMath'
export {
  TemporaryPremiumChartDebugControls,
  type TemporaryPremiumChartDebugControlsProps,
  type TemporaryPremiumChartDebugState,
} from './TemporaryPremiumChartDebugControls'

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const PADDING = 10

const DEFAULT_LEADER_CONFIG: LeaderConfig = {
  steepThreshold: 1.0,
  leaderLength: 70,
  labelWidth: 110,
  labelHeight: 44,
  labelGap: 8,
  padding: PADDING,
}

export type TemporaryPremiumChartDebugProps = {
  showOverlay?: boolean
  onPlacementChange?: (placement: LeaderPlacement | null) => void
  simulatePolling?: {
    intervalMs: number
    decayPerTick: number
  }
}

export type TemporaryPremiumChartProps = {
  startDate: Date
  nowPoint: number
  selectedPoint: number
  onSelect: (point: number) => void
  leaderConfig?: Partial<LeaderConfig>
  height?: number
  className?: string
  debug?: TemporaryPremiumChartDebugProps | boolean
  tweenNowPrice?: boolean
  tweenDurationMs?: number
  allowPastSelection?: boolean
  /**
   * When true, the selected-point pill renders below the chart (with a
   * vertical dashed leader) instead of as a floating pill on the chart
   * surface. Used on mobile/compact layouts where horizontal leader lines
   * collide with the chart edges. Hover pills are suppressed in this mode.
   */
  selectedLabelBelow?: boolean
  ref?: Ref<HTMLButtonElement>
}

type LabelView = {
  pos: { x: number; y: number; price: number }
  placement: LeaderPlacement
  leader: ReturnType<typeof computeLeaderGeometry>
  isPast: boolean
  didCollideWithNow: boolean
  topLine: string
  bottomLine: string
}

/**
 * A single value label rendered below the chart (mobile/compact layout),
 * centered under its dot. It measures its own rendered width and clamps its
 * horizontal position so it never spills past the left or right edge of the
 * chart — important for wide "millions" values near the ends of the curve.
 */
function BelowLabel({
  view,
  chartWidth,
  ghost = false,
}: {
  view: LabelView
  chartWidth: number
  ghost?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [labelWidth, setLabelWidth] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the displayed text changes
  useEffect(() => {
    if (ref.current) setLabelWidth(ref.current.offsetWidth)
  }, [view.topLine, view.bottomLine])

  const half = labelWidth / 2
  const margin = 4
  const left =
    labelWidth > 0
      ? Math.min(
          Math.max(view.pos.x, half + margin),
          chartWidth - half - margin,
        )
      : view.pos.x

  return (
    <div
      className={cn(
        '-translate-x-1/2 absolute top-0 whitespace-nowrap',
        ghost && 'opacity-60',
      )}
      ref={ref}
      style={{ left }}
    >
      <div
        className={cn(
          'whitespace-nowrap text-center font-normal font-sans text-xs leading-[1.4] tracking-[-0.132px]',
          view.isPast ? 'text-ens-lapis-surface italic' : 'text-ens-quartz-400',
        )}
      >
        {view.isPast ? `was — ${view.topLine}` : view.topLine}
      </div>
      <div
        className={cn(
          'whitespace-nowrap text-center font-medium font-mono text-[16px] tabular-nums leading-none tracking-[-0.176px]',
          view.isPast ? 'text-ens-lapis-surface' : 'text-ens-lapis-900',
        )}
      >
        {view.bottomLine}
      </div>
    </div>
  )
}

export function TemporaryPremiumChart({
  startDate,
  nowPoint,
  selectedPoint,
  onSelect,
  leaderConfig,
  height = 240,
  className,
  debug,
  tweenNowPrice = true,
  tweenDurationMs = 800,
  allowPastSelection = false,
  selectedLabelBelow = false,
  ref,
}: TemporaryPremiumChartProps) {
  const containerRef = useRef<HTMLButtonElement>(null)
  const { width } = useElementSize(containerRef)

  const [hoverPoint, setHoverPoint] = useState<number | null>(null)
  const hoverRafRef = useRef<number | null>(null)

  const debugProps: TemporaryPremiumChartDebugProps | null =
    debug === true ? {} : debug || null
  const debugEnabled = debugProps !== null

  const [simulatedNowPoint, setSimulatedNowPoint] = useState<number | null>(
    null,
  )

  useEffect(() => {
    const sim = debugProps?.simulatePolling
    if (!sim) {
      setSimulatedNowPoint(null)
      return
    }
    setSimulatedNowPoint(nowPoint)
    const id = setInterval(() => {
      setSimulatedNowPoint((prev) => {
        const base = prev ?? nowPoint
        const next = base + (PREMIUM_RES_PER_DAY / 24) * sim.decayPerTick
        return Math.min(next, PREMIUM_RESOLUTION)
      })
    }, sim.intervalMs)
    return () => clearInterval(id)
  }, [debugProps?.simulatePolling, nowPoint])

  const effectiveNowPoint = simulatedNowPoint ?? nowPoint

  const targetNowPrice = useMemo(
    () => priceAtDay(effectiveNowPoint / PREMIUM_RES_PER_DAY),
    [effectiveNowPoint],
  )
  const tweenedNowPrice = useTweenedValue(targetNowPrice, {
    duration: tweenDurationMs,
    disabled: !tweenNowPrice,
  })

  const cfg: LeaderConfig = useMemo(
    () => ({ ...DEFAULT_LEADER_CONFIG, ...leaderConfig }),
    [leaderConfig],
  )

  const geo: ChartGeometry = useMemo(
    () => ({ width, height, padding: PADDING }),
    [width, height],
  )

  const curveD = useMemo(
    () => (width > 0 ? buildCurvePath(geo) : ''),
    [geo, width],
  )

  const nowView = useMemo(() => {
    if (width === 0) return null
    const displayPoint = pointAtPrice(tweenedNowPrice)
    const pos = posAtPoint(displayPoint, geo)
    const placement = chooseLeaderDirection(displayPoint, pos, geo, cfg)
    const leader = computeLeaderGeometry(pos, placement, cfg)
    return {
      pos,
      displayPrice: tweenedNowPrice,
      displayPoint,
      placement,
      leader,
    }
  }, [tweenedNowPrice, geo, cfg, width])

  const nowViewRef = useRef(nowView)
  nowViewRef.current = nowView

  const computeLabelView = useCallback(
    (point: number, avoidNow = true): LabelView | null => {
      if (width === 0 || point < 0) return null
      const pos = posAtPoint(point, geo)
      const date = dateAtPoint(point, startDate)
      const isPast = point < effectiveNowPoint

      let placement = chooseLeaderDirection(point, pos, geo, cfg)
      let leader = computeLeaderGeometry(pos, placement, cfg)
      let didCollideWithNow = false

      const currentNowView = nowViewRef.current
      if (avoidNow && currentNowView) {
        const obstacleBox = labelBox(
          currentNowView.leader.labelAnchor,
          currentNowView.leader.labelTransform,
          cfg.labelWidth,
          cfg.labelHeight,
        )
        const myBox = labelBox(
          leader.labelAnchor,
          leader.labelTransform,
          cfg.labelWidth,
          cfg.labelHeight,
        )
        const collides = !(
          myBox.right < obstacleBox.left ||
          myBox.left > obstacleBox.right ||
          myBox.bottom < obstacleBox.top ||
          myBox.top > obstacleBox.bottom
        )

        if (collides) {
          didCollideWithNow = true
          if (placement.axis === 'horizontal') {
            const newLen = findHorizontalLeaderClearance(
              pos,
              placement,
              cfg,
              obstacleBox,
              geo,
            )
            if (newLen == null) {
              const flipped: LeaderPlacement = {
                ...placement,
                dir: placement.dir === 'right' ? 'left' : 'right',
              }
              const flippedLen = findHorizontalLeaderClearance(
                pos,
                flipped,
                cfg,
                obstacleBox,
                geo,
              )
              if (flippedLen == null) {
                leader = computeLeaderGeometry(pos, flipped, cfg)
              } else {
                placement = flipped
                leader = computeLeaderGeometry(pos, flipped, cfg, flippedLen)
              }
            } else {
              leader = computeLeaderGeometry(pos, placement, cfg, newLen)
            }
          } else {
            const longerLeader = cfg.leaderLength + cfg.labelHeight + 14
            leader = computeLeaderGeometry(pos, placement, cfg, longerLeader)
          }
        }
      }

      return {
        pos,
        placement,
        leader,
        isPast,
        didCollideWithNow,
        topLine: formatChartDate(date),
        bottomLine: formatMoney(pos.price),
      }
    },
    [width, geo, cfg, effectiveNowPoint, startDate],
  )

  const selectedView = useMemo(() => {
    if (selectedPoint < 0) return null
    const isAtNow =
      Math.abs(selectedPoint - effectiveNowPoint) < PREMIUM_RES_PER_DAY / 24
    if (isAtNow) return null
    return computeLabelView(selectedPoint)
  }, [selectedPoint, effectiveNowPoint, computeLabelView])

  const hoverView = useMemo(() => {
    if (hoverPoint == null) return null
    const nearNow =
      Math.abs(hoverPoint - effectiveNowPoint) < PREMIUM_RES_PER_DAY / 24
    const nearSelected =
      selectedPoint >= 0 &&
      Math.abs(hoverPoint - selectedPoint) < PREMIUM_RES_PER_DAY / 24
    if (nearNow || nearSelected) return null
    return computeLabelView(hoverPoint)
  }, [hoverPoint, effectiveNowPoint, selectedPoint, computeLabelView])

  const onPlacementChange = debugProps?.onPlacementChange
  const lastReportedPlacementKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onPlacementChange) return
    const placement = selectedView?.placement ?? null
    const key = placement
      ? `${placement.axis}:${placement.dir}:${placement.slope}:${placement.isSteep}`
      : 'none'
    if (key === lastReportedPlacementKeyRef.current) return
    lastReportedPlacementKeyRef.current = key
    onPlacementChange(placement)
  }, [onPlacementChange, selectedView])

  const steepZonePath = useMemo(() => {
    if (!debugEnabled || !debugProps?.showOverlay || width === 0) return ''
    return buildSteepZonePath(geo, cfg.steepThreshold)
  }, [debugEnabled, debugProps?.showOverlay, geo, cfg.steepThreshold, width])

  // Pointer events unify mouse and touch handling. On touch devices the
  // browser only fires pointermove while a finger is in contact, so dragging
  // updates the hover point and lifting the finger fires the synthetic click
  // for selection.
  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (width === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left - PADDING
      const pt = pointAtX(x, geo)
      if (hoverRafRef.current !== null)
        cancelAnimationFrame(hoverRafRef.current)
      hoverRafRef.current = requestAnimationFrame(() => {
        setHoverPoint(pt)
        hoverRafRef.current = null
      })
    },
    [geo, width],
  )

  const handlePointerLeave = useCallback(() => {
    if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current)
    hoverRafRef.current = null
    setHoverPoint(null)
  }, [])

  // Touch end: clear the hover point so a tapped finger doesn't leave a stale
  // hover dot lingering on the chart.
  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') handlePointerLeave()
    },
    [handlePointerLeave],
  )

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (width === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left - PADDING
      const pt = pointAtX(x, geo)
      // Clicks in the past area are ignored (hover-only). Past selection only
      // applies in debug/story contexts that opt in via allowPastSelection.
      if (!allowPastSelection && pt < effectiveNowPoint) return
      onSelect(pt)
    },
    [geo, effectiveNowPoint, onSelect, width, allowPastSelection],
  )

  // When the cursor is hovering the past area and selection isn't allowed
  // there, drop the crosshair cursor so the area reads as hover-only.
  const isHoverInPastAndLocked =
    !allowPastSelection && hoverPoint !== null && hoverPoint < effectiveNowPoint

  let selectedLeaderStroke = 'var(--premium-chart-selected, #0F1E33)'
  if (selectedView?.isPast)
    selectedLeaderStroke = 'var(--premium-chart-past, #94A3B8)'
  if (selectedView?.didCollideWithNow)
    selectedLeaderStroke = 'var(--premium-chart-muted, #CBD5E1)'

  const chart = (
    <button
      aria-label="Temporary premium decay chart"
      className={cn(
        'premium-chart relative block w-full select-none overflow-visible rounded-xl border-0 bg-transparent p-0 text-left',
        isHoverInPastAndLocked ? 'cursor-default' : 'cursor-crosshair',
        className,
      )}
      data-debug={debugEnabled ? 'true' : undefined}
      onClick={handleClick}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={(node) => {
        containerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      style={{
        height,
        background:
          'repeating-linear-gradient(90deg, var(--premium-chart-stripe, rgba(57,180,234,0.10)) 0%, var(--premium-chart-stripe, rgba(57,180,234,0.10)) calc((100% - 42px) / 21), transparent calc((100% - 42px) / 21) calc((100% - 42px) / 21 + 2px))',
        backgroundSize: 'calc(100% + 2px) 100%',
      }}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 block"
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${Math.max(width, 1)} ${height}`}
        width="100%"
      >
        {curveD && (
          <path
            d={curveD}
            fill="none"
            stroke="var(--premium-chart-curve, #39B4EA)"
            strokeLinecap="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {steepZonePath && (
          <path
            d={steepZonePath}
            data-debug-overlay="steep-zone"
            fill="none"
            opacity={0.35}
            stroke="hsl(var(--destructive))"
            strokeLinecap="round"
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hoverView && !selectedLabelBelow && (
          <line
            opacity={0.7}
            stroke="var(--premium-chart-hover, #94A3B8)"
            strokeDasharray="3 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={hoverView.leader.leaderStart.x}
            x2={hoverView.leader.leaderEnd.x}
            y1={hoverView.leader.leaderStart.y}
            y2={hoverView.leader.leaderEnd.y}
          />
        )}
        {nowView && (
          <line
            opacity={0.85}
            stroke="var(--premium-chart-now, #0082BB)"
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={nowView.leader.leaderStart.x}
            x2={nowView.leader.leaderEnd.x}
            y1={nowView.leader.leaderStart.y}
            y2={nowView.leader.leaderEnd.y}
          />
        )}
        {selectedView && !selectedLabelBelow && (
          <line
            stroke={selectedLeaderStroke}
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={selectedView.leader.leaderStart.x}
            x2={selectedView.leader.leaderEnd.x}
            y1={selectedView.leader.leaderStart.y}
            y2={selectedView.leader.leaderEnd.y}
          />
        )}
        {selectedView && selectedLabelBelow && (
          <line
            stroke={selectedLeaderStroke}
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={selectedView.pos.x}
            x2={selectedView.pos.x}
            y1={selectedView.pos.y}
            y2={height - 4}
          />
        )}
        {hoverView && selectedLabelBelow && (
          // Same, ghosted, for the hover preview (its horizontal leader is hidden here).
          <line
            opacity={0.6}
            stroke="var(--premium-chart-hover, #94A3B8)"
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={hoverView.pos.x}
            x2={hoverView.pos.x}
            y1={hoverView.pos.y}
            y2={height - 4}
          />
        )}
      </svg>

      <div
        className="pointer-events-none absolute font-medium font-mono text-[16px] tabular-nums"
        style={{
          top: 6,
          left: 12,
          color: 'var(--premium-chart-axis, #39B4EA)',
          letterSpacing: '-0.176px',
        }}
      >
        $100M
      </div>
      <div
        className="pointer-events-none absolute font-medium font-mono text-[16px] tabular-nums"
        style={{
          bottom: 14,
          right: 12,
          color: 'var(--premium-chart-axis, #39B4EA)',
          letterSpacing: '-0.176px',
        }}
      >
        $0
      </div>

      {hoverView && (
        <>
          <div
            className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute z-[1] h-2.5 w-2.5 rounded-full"
            style={{
              left: hoverView.pos.x,
              top: hoverView.pos.y,
              background: 'var(--premium-chart-hover, #94A3B8)',
              opacity: 0.85,
            }}
          />
          {!selectedLabelBelow && (
            <div
              className="pointer-events-none absolute z-2"
              style={{
                left: hoverView.leader.labelAnchor.x,
                top: hoverView.leader.labelAnchor.y,
                transform: hoverView.leader.labelTransform,
              }}
            >
              <ChartValuePill
                label={hoverView.topLine}
                value={hoverView.bottomLine}
                variant="hover"
              />
            </div>
          )}
        </>
      )}

      {nowView && (
        <>
          <div
            className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute z-3 size-3 rounded-full"
            style={{
              left: nowView.pos.x,
              top: nowView.pos.y,
              background: 'var(--premium-chart-now, #0082BB)',
              boxShadow:
                '0 0 0 4px var(--premium-chart-now-halo, rgba(57,180,234,0.2))',
            }}
          />
          <div
            className="pointer-events-none absolute z-4"
            style={{
              left: nowView.leader.labelAnchor.x,
              top: nowView.leader.labelAnchor.y,
              transform: nowView.leader.labelTransform,
            }}
          >
            <ChartValuePill
              label="Now"
              value={formatMoney(nowView.displayPrice)}
              variant="now"
            />
          </div>
        </>
      )}

      {selectedView && (
        <>
          <div
            className={cn(
              '-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute z-5 h-3 w-3 rounded-full',
              selectedView.isPast && 'border-2 bg-transparent',
            )}
            style={{
              left: selectedView.pos.x,
              top: selectedView.pos.y,
              background: selectedView.isPast
                ? 'transparent'
                : 'var(--premium-chart-selected, #0F1E33)',
              borderColor: selectedView.isPast
                ? 'var(--premium-chart-muted-text, #64748B)'
                : undefined,
            }}
          />
          {!selectedLabelBelow && (
            <div
              className="pointer-events-none absolute z-6"
              style={{
                left: selectedView.leader.labelAnchor.x,
                top: selectedView.leader.labelAnchor.y,
                transform: selectedView.leader.labelTransform,
              }}
            >
              <ChartValuePill
                isPast={selectedView.isPast}
                label={
                  selectedView.isPast
                    ? `was — ${selectedView.topLine}`
                    : selectedView.topLine
                }
                value={selectedView.bottomLine}
                variant="selected"
              />
            </div>
          )}
        </>
      )}
    </button>
  )

  // Below-chart labels (selected + ghosted hover), rendered as a sibling of the
  // chart button so they sit outside its click area and don't perturb the
  // pointer math (which is relative to the button). "Now" stays on the chart.
  const belowLabel =
    selectedLabelBelow && width > 0 && (selectedView || hoverView) ? (
      <div className="relative mt-1 h-10 w-full">
        {selectedView && <BelowLabel chartWidth={width} view={selectedView} />}
        {hoverView && <BelowLabel chartWidth={width} ghost view={hoverView} />}
      </div>
    ) : null

  if (!selectedLabelBelow) return chart

  return (
    <div className="flex w-full flex-col">
      {chart}
      {belowLabel}
    </div>
  )
}
