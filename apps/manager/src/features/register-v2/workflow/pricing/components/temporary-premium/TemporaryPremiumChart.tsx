import {
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { cn } from '@/lib/utils'
import { ChartValuePill } from './ChartValuePill'

// ---------------------------------------------------------------------------
// Premium decay math
// ---------------------------------------------------------------------------

export const PREMIUM_START_PRICE = 100_000_000
export const PREMIUM_OFFSET = 47.6837158203125
export const PREMIUM_FACTOR = 0.5
export const PREMIUM_DURATION_MS = 21 * 24 * 60 * 60 * 1000
export const PREMIUM_DAYS = 21
export const PREMIUM_RESOLUTION = 65536
export const PREMIUM_RES_PER_DAY = PREMIUM_RESOLUTION / PREMIUM_DAYS

export function priceAtDay(day: number): number {
  return Math.max(
    PREMIUM_START_PRICE * PREMIUM_FACTOR ** day - PREMIUM_OFFSET,
    0,
  )
}

/** Highest premium on the decay curve — at window start (day 0), below the $100M label. */
export function getPremiumMaxPrice(): number {
  return priceAtDay(0)
}

export function dayAtPrice(price: number): number {
  const p = Math.max(0, price)
  return (
    Math.log((p + PREMIUM_OFFSET) / PREMIUM_START_PRICE) /
    Math.log(PREMIUM_FACTOR)
  )
}

export function pointAtPrice(price: number): number {
  const maxPrice = getPremiumMaxPrice()
  const clamped = Math.min(Math.max(0, price), maxPrice)
  const point = Math.floor(dayAtPrice(clamped) * PREMIUM_RES_PER_DAY)
  return Math.min(Math.max(0, point), PREMIUM_RESOLUTION)
}

export function pointAtDate(date: Date, startDate: Date): number {
  return Math.round(
    ((date.getTime() - startDate.getTime()) / PREMIUM_DURATION_MS) *
      PREMIUM_RESOLUTION,
  )
}

export function dateAtPoint(point: number, startDate: Date): Date {
  const relativeMs = (point / PREMIUM_RES_PER_DAY) * 86_400_000
  return new Date(startDate.getTime() + relativeMs)
}

export type ChartGeometry = {
  width: number
  height: number
  padding: number
}

export type PointPosition = {
  x: number
  y: number
  price: number
}

export function posAtPoint(point: number, geo: ChartGeometry): PointPosition {
  const { width, height, padding } = geo
  const yChunk = PREMIUM_START_PRICE / (height - padding * 2)
  const x = (point * (width - padding * 2)) / PREMIUM_RESOLUTION + padding
  const price = priceAtDay(point / PREMIUM_RES_PER_DAY)
  const y = -(price / yChunk) + height - padding
  return { x, y, price }
}

export function pointAtX(x: number, geo: ChartGeometry): number {
  const { width, padding } = geo
  const range = width - padding * 2
  let pt = Math.round((x / range) * PREMIUM_RESOLUTION)
  if (x < 0) pt = 0
  else if (x > range) pt = PREMIUM_RESOLUTION
  return pt
}

export function buildCurvePath(geo: ChartGeometry, step = 500): string {
  let d = `M ${geo.padding} ${geo.padding}`
  for (let i = 0; i < PREMIUM_RESOLUTION; i += step) {
    const { x, y } = posAtPoint(i, geo)
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  const last = posAtPoint(PREMIUM_RESOLUTION, geo)
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`
  return d
}

export function localSlope(point: number, geo: ChartGeometry): number {
  const step = Math.max(50, Math.floor(PREMIUM_RES_PER_DAY / 4))
  const before = posAtPoint(Math.max(0, point - step), geo)
  const after = posAtPoint(Math.min(PREMIUM_RESOLUTION, point + step), geo)
  const dx = after.x - before.x
  const dy = after.y - before.y
  if (dx === 0) return Infinity
  return Math.abs(dy / dx)
}

export function buildSteepZonePath(
  geo: ChartGeometry,
  steepThreshold: number,
  step = 200,
): string {
  const segments: string[] = []
  let current: string | null = null
  for (let i = 0; i <= PREMIUM_RESOLUTION; i += step) {
    const slope = localSlope(i, geo)
    const { x, y } = posAtPoint(i, geo)
    if (slope > steepThreshold) {
      current =
        current === null
          ? `M ${x.toFixed(2)} ${y.toFixed(2)}`
          : `${current} L ${x.toFixed(2)} ${y.toFixed(2)}`
    } else if (current !== null) {
      segments.push(current)
      current = null
    }
  }
  if (current !== null) segments.push(current)
  return segments.join(' ')
}

export type LeaderAxis = 'horizontal' | 'vertical'
export type LeaderDir = 'right' | 'left' | 'up' | 'down'

export type LeaderPlacement = {
  axis: LeaderAxis
  dir: LeaderDir
  slope: number
  isSteep: boolean
}

export type LeaderConfig = {
  steepThreshold: number
  leaderLength: number
  labelWidth: number
  labelHeight: number
  labelGap: number
  padding: number
}

export function chooseLeaderDirection(
  point: number,
  pos: PointPosition,
  geo: ChartGeometry,
  cfg: LeaderConfig,
  forceAxis?: LeaderAxis,
): LeaderPlacement {
  const slope = localSlope(point, geo)
  const isSteep = slope > cfg.steepThreshold

  const horizontalRoom =
    cfg.leaderLength + cfg.labelWidth + cfg.labelGap + cfg.padding
  const verticalRoom =
    cfg.leaderLength + cfg.labelHeight + cfg.labelGap + cfg.padding

  const axis: LeaderAxis = forceAxis ?? (isSteep ? 'horizontal' : 'vertical')

  if (axis === 'horizontal') {
    const spaceRight = geo.width - pos.x
    const spaceLeft = pos.x
    const wantRight = spaceRight >= horizontalRoom
    const wantLeft = spaceLeft >= horizontalRoom
    const dir: LeaderDir = wantRight ? 'right' : wantLeft ? 'left' : 'right'
    return { axis: 'horizontal', dir, slope, isSteep }
  }

  const spaceUp = pos.y
  const spaceDown = geo.height - pos.y
  const wantUp = spaceUp >= verticalRoom
  const wantDown = spaceDown >= verticalRoom
  const dir: LeaderDir = wantUp ? 'up' : wantDown ? 'down' : 'up'
  return { axis: 'vertical', dir, slope, isSteep }
}

export type LeaderGeometry = {
  leaderStart: { x: number; y: number }
  leaderEnd: { x: number; y: number }
  labelAnchor: { x: number; y: number }
  labelTransform: string
  labelTextAlign: 'left' | 'right' | 'center'
}

export function computeLeaderGeometry(
  pos: PointPosition,
  placement: LeaderPlacement,
  cfg: LeaderConfig,
  leaderLengthOverride?: number,
  dotGap = 7,
): LeaderGeometry {
  const len = leaderLengthOverride ?? cfg.leaderLength
  if (placement.axis === 'horizontal') {
    const sign = placement.dir === 'right' ? 1 : -1
    const leaderStart = { x: pos.x + sign * dotGap, y: pos.y }
    const leaderEnd = { x: pos.x + sign * len, y: pos.y }
    const labelAnchor = {
      x: leaderEnd.x + sign * cfg.labelGap,
      y: pos.y,
    }
    return {
      leaderStart,
      leaderEnd,
      labelAnchor,
      labelTransform:
        placement.dir === 'right'
          ? 'translateY(-50%)'
          : 'translate(-100%, -50%)',
      labelTextAlign: placement.dir === 'right' ? 'left' : 'right',
    }
  }

  const sign = placement.dir === 'up' ? -1 : 1
  const leaderStart = { x: pos.x, y: pos.y + sign * dotGap }
  const leaderEnd = { x: pos.x, y: pos.y + sign * len }
  const labelAnchor = {
    x: pos.x,
    y: leaderEnd.y + sign * cfg.labelGap,
  }
  return {
    leaderStart,
    leaderEnd,
    labelAnchor,
    labelTransform:
      placement.dir === 'up' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    labelTextAlign: 'center',
  }
}

export type LabelBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export function labelBox(
  anchor: { x: number; y: number },
  transform: string,
  width: number,
  height: number,
): LabelBox {
  let left = anchor.x
  let top = anchor.y
  if (transform.includes('translate(-100%')) left -= width
  else if (transform.includes('translate(-50%')) left -= width / 2
  if (transform.includes('-100%)')) top -= height
  else if (transform.includes('-50%)')) top -= height / 2
  return { left, top, right: left + width, bottom: top + height }
}

export function labelsCollide(
  anchorA: { x: number; y: number },
  transformA: string,
  anchorB: { x: number; y: number },
  transformB: string,
  width: number,
  height: number,
): boolean {
  const a = labelBox(anchorA, transformA, width, height)
  const b = labelBox(anchorB, transformB, width, height)
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  )
}

export function findHorizontalLeaderClearance(
  pos: PointPosition,
  placement: LeaderPlacement,
  cfg: LeaderConfig,
  obstacleBox: LabelBox,
  geo: ChartGeometry,
  maxExtra = 200,
  step = 10,
): number | null {
  if (placement.axis !== 'horizontal') return null
  const sign = placement.dir === 'right' ? 1 : -1
  for (let extra = 0; extra <= maxExtra; extra += step) {
    const len = cfg.leaderLength + extra
    const labelAnchorX = pos.x + sign * len + sign * cfg.labelGap
    const labelLeft = sign === 1 ? labelAnchorX : labelAnchorX - cfg.labelWidth
    const labelRight = labelLeft + cfg.labelWidth
    if (labelLeft < cfg.padding) return null
    if (labelRight > geo.width - cfg.padding) return null
    const myBox: LabelBox = {
      left: labelLeft,
      top: pos.y - cfg.labelHeight / 2,
      right: labelRight,
      bottom: pos.y + cfg.labelHeight / 2,
    }
    const clears =
      myBox.right < obstacleBox.left ||
      myBox.left > obstacleBox.right ||
      myBox.bottom < obstacleBox.top ||
      myBox.top > obstacleBox.bottom
    if (clears) return len
  }
  return null
}

export function dateToInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function formatMoney(n: number): string {
  // Millions are abbreviated with at most one decimal and no trailing ".0"
  // ($100M, $26.5M, $26M) — matching the clean axis labels rather than the
  // noisy "$26.01M".
  if (n >= 1_000_000) {
    const millions = (n / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `$${millions}M`
  }
  // Pricing page rounds to whole dollars — cents are noise on the big cooldown
  // numbers. Only show cents once the value drops below $1 (the additional fee
  // near the end of its decay).
  if (n >= 1) return `$${Math.round(n).toLocaleString()}`
  return `$${n.toFixed(2)}`
}

export function formatChartDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  })
}

export function formatHoverDate(d: Date): string {
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
  })
}

export const UNIT_CHART_GEO: ChartGeometry = { width: 1, height: 1, padding: 0 }

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

type Size = {
  width: number
  height: number
}

function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

export type EasingFn = (t: number) => number

export const easeOutCubic: EasingFn = (t) => 1 - (1 - t) ** 3
export const easeInOutQuad: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
export const linear: EasingFn = (t) => t

export type UseTweenedValueOptions = {
  duration?: number
  easing?: EasingFn
  disabled?: boolean
}

export function useTweenedValue(
  target: number,
  options: UseTweenedValueOptions = {},
): number {
  const { duration = 600, easing = easeOutCubic, disabled = false } = options

  const [display, setDisplay] = useState<number>(target)
  const startValueRef = useRef<number>(target)
  const startTimeRef = useRef<number>(0)
  const targetRef = useRef<number>(target)
  const rafRef = useRef<number | null>(null)
  const displayRef = useRef<number>(target)
  displayRef.current = display

  useEffect(() => {
    if (disabled) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      setDisplay(target)
      targetRef.current = target
      return
    }

    if (target === targetRef.current) return

    startValueRef.current = displayRef.current
    startTimeRef.current = performance.now()
    targetRef.current = target

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = easing(progress)
      const next =
        startValueRef.current +
        (targetRef.current - startValueRef.current) * eased

      setDisplay(next)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [target, duration, easing, disabled])

  return disabled ? target : display
}

// ---------------------------------------------------------------------------
// Debug controls
// ---------------------------------------------------------------------------

export type TemporaryPremiumChartDebugState = {
  steepThreshold: number
  showOverlay: boolean
}

export type TemporaryPremiumChartDebugControlsProps = {
  state: TemporaryPremiumChartDebugState
  onChange: (next: TemporaryPremiumChartDebugState) => void
  placement?: LeaderPlacement | null
  className?: string
}

export function TemporaryPremiumChartDebugControls({
  state,
  onChange,
  placement,
  className,
}: TemporaryPremiumChartDebugControlsProps) {
  const handleThreshold = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, steepThreshold: Number.parseFloat(e.target.value) })

  const handleOverlay = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, showOverlay: e.target.checked })

  const slopeText = placement
    ? placement.slope > 999
      ? '∞'
      : placement.slope.toFixed(2)
    : '—'
  const classText = placement ? (placement.isSteep ? 'steep' : 'flat') : '—'
  const dirText = placement ? `${placement.axis} → ${placement.dir}` : '—'

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-border bg-card p-3 text-card-foreground text-xs',
        className,
      )}
      data-testid="premium-chart-debug-controls"
    >
      <div className="flex items-center gap-3">
        <label
          className="min-w-[120px] shrink-0 text-muted-foreground"
          htmlFor="premium-chart-debug-threshold"
        >
          Steep threshold
        </label>
        <input
          className="flex-1 accent-primary"
          id="premium-chart-debug-threshold"
          max={5}
          min={0.05}
          onChange={handleThreshold}
          step={0.05}
          type="range"
          value={state.steepThreshold}
        />
        <span className="min-w-[44px] text-right font-medium font-mono text-foreground">
          {state.steepThreshold.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-border border-t pt-3">
        <DebugStat label="Local slope" value={slopeText} />
        <DebugStat
          label="Classification"
          tone={placement?.isSteep ? 'warn' : 'ok'}
          value={classText}
        />
        <DebugStat label="Direction" value={dirText} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
        <input
          checked={state.showOverlay}
          className="accent-primary"
          onChange={handleOverlay}
          type="checkbox"
        />
        Show steep-zone overlay
      </label>
    </div>
  )
}

type DebugStatProps = {
  label: string
  value: string
  tone?: 'ok' | 'warn'
}

function DebugStat({ label, value, tone }: DebugStatProps) {
  return (
    <div>
      <div className="mb-0.5 text-muted-foreground">{label}</div>
      <div
        className={cn(
          'font-medium font-mono',
          tone === 'warn' && 'text-destructive',
          tone === 'ok' && 'text-foreground',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  )
}

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
        'absolute top-0 -translate-x-1/2 whitespace-nowrap',
        ghost && 'opacity-60',
      )}
      ref={ref}
      style={{ left }}
    >
      <div
        className={cn(
          'whitespace-nowrap text-center font-normal font-sans text-[12px] leading-[1.4] tracking-[-0.132px]',
          view.isPast ? 'text-ens-lapis-surface italic' : 'text-[#737373]',
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
            className="pointer-events-none absolute z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: hoverView.pos.x,
              top: hoverView.pos.y,
              background: 'var(--premium-chart-hover, #94A3B8)',
              opacity: 0.85,
            }}
          />
          {!selectedLabelBelow && (
            <div
              className="pointer-events-none absolute z-[2]"
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
            className="pointer-events-none absolute z-[3] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: nowView.pos.x,
              top: nowView.pos.y,
              background: 'var(--premium-chart-now, #0082BB)',
              boxShadow:
                '0 0 0 4px var(--premium-chart-now-halo, rgba(57,180,234,0.2))',
            }}
          />
          <div
            className="pointer-events-none absolute z-[4]"
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
              'pointer-events-none absolute z-[5] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
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
              className="pointer-events-none absolute z-[6]"
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
