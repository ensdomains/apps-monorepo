import type {
  AddressRecordOption,
  TextRecordOption,
} from '@ens-apps/record-catalog'
import {
  lazy,
  type ReactNode,
  type Ref,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

// Each kind loads its artwork in its own chunk, only when a list or pick renders it.
const TextRecordGlyph = lazy(() =>
  import('./TextRecordGlyph').then((module) => ({
    default: module.TextRecordGlyph,
  })),
)
const AddressRecordGlyph = lazy(() =>
  import('./AddressRecordGlyph').then((module) => ({
    default: module.AddressRecordGlyph,
  })),
)

type ArtworkProps<T> = {
  readonly option: T
  /** Overrides the default 20px size. */
  readonly className?: string
}

/** A scrolling list whose artwork loads only near its visible rows; `pending` until it mounts. */
export type ArtworkViewport =
  | { readonly status: 'pending' }
  | {
      readonly status: 'ready'
      /** Calls `onNear` once `element` comes near view; returns an unwatch. */
      readonly watch: (element: Element, onNear: () => void) => () => void
    }

// About two rows past each edge, so a logo is usually ready as its row scrolls in.
const VIEWPORT_LOOKAHEAD = '96px 0px'

const watchList = (list: Element) => {
  const listeners = new Map<Element, () => void>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue
        listeners.get(target)?.()
        listeners.delete(target)
        observer.unobserve(target)
      }
    },
    { root: list, rootMargin: VIEWPORT_LOOKAHEAD },
  )
  const watch = (element: Element, onNear: () => void) => {
    listeners.set(element, onNear)
    observer.observe(element)
    return () => {
      listeners.delete(element)
      observer.unobserve(element)
    }
  }
  return { watch, disconnect: () => observer.disconnect() }
}

/** One observer per list, scoped to its scroller; without IntersectionObserver artwork loads at once. */
export const useArtworkViewport = () => {
  const [list, setList] = useState<HTMLElement | null>(null)
  const [viewport, setViewport] = useState<ArtworkViewport>({
    status: 'pending',
  })
  // cmdk hands a fresh ref every render; the same list is a no-op update.
  const listRef = useCallback((element: HTMLElement | null) => {
    if (element) setList(element)
  }, [])
  const isSupported = typeof IntersectionObserver !== 'undefined'

  useEffect(() => {
    if (!list || !isSupported) return
    const { watch, disconnect } = watchList(list)
    setViewport({ status: 'ready', watch })
    return () => {
      disconnect()
      setViewport({ status: 'pending' })
    }
  }, [list, isSupported])

  return {
    listRef: isSupported ? listRef : undefined,
    viewport: isSupported ? viewport : undefined,
  }
}

/** Whether artwork in `viewport` may load: always outside a list, else once near view. */
const useIsNearViewport = (viewport: ArtworkViewport | undefined) => {
  const [hasNeared, setHasNeared] = useState(false)
  const watch = viewport?.status === 'ready' ? viewport.watch : undefined
  const frameRef = useCallback(
    (frame: HTMLElement | null) =>
      frame && watch ? watch(frame, () => setHasNeared(true)) : undefined,
    [watch],
  )
  return {
    frameRef: hasNeared ? undefined : frameRef,
    isNear: viewport === undefined || hasNeared,
  }
}

/** Fixed box, so a logo arriving later never moves the text beside it. */
const ArtworkFrame = ({
  ref,
  className,
  children,
}: {
  readonly ref?: Ref<HTMLSpanElement>
  readonly className?: string
  readonly children: ReactNode
}) => (
  <span
    ref={ref}
    aria-hidden="true"
    data-slot="record-artwork"
    className={cn(
      'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full',
      className,
    )}
  >
    {children}
  </span>
)

const LoadingArtwork = () => (
  <span className="size-full rounded-full bg-muted" />
)

/** Stands in for a record without a logo: its first letter on a muted disc. */
const MonogramArtwork = ({ name }: { readonly name: string }) => (
  <span
    data-slot="record-artwork-monogram"
    className="flex size-full items-center justify-center rounded-full border border-border bg-muted text-[0.625rem] leading-none font-medium text-muted-foreground uppercase"
  >
    {name.match(/[\p{L}\p{N}]/u)?.[0] ?? ''}
  </span>
)

/** Decorative logo for a text record; its name stays the accessible label. */
export const TextRecordArtwork = ({
  option,
  className,
}: ArtworkProps<TextRecordOption>) => (
  <ArtworkFrame className={className}>
    <Suspense fallback={<LoadingArtwork />}>
      <TextRecordGlyph
        recordKey={option.key}
        fallback={<MonogramArtwork name={option.name} />}
      />
    </Suspense>
  </ArtworkFrame>
)

/** Decorative coin or chain logo; in a list, `viewport` limits fetches to rows near view. */
export const AddressRecordArtwork = ({
  option,
  className,
  viewport,
}: ArtworkProps<AddressRecordOption> & {
  readonly viewport?: ArtworkViewport
}) => {
  const { frameRef, isNear } = useIsNearViewport(viewport)
  return (
    <ArtworkFrame ref={frameRef} className={className}>
      {isNear ? (
        <Suspense fallback={<LoadingArtwork />}>
          <AddressRecordGlyph
            coinType={option.coinType}
            fallback={<MonogramArtwork name={option.name} />}
          />
        </Suspense>
      ) : (
        <LoadingArtwork />
      )}
    </ArtworkFrame>
  )
}
