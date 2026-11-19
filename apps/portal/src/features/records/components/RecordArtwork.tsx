import type {
  AddressRecordOption,
  TextRecordOption,
} from '@ens-apps/record-catalog'
import { lazy, type ReactNode, Suspense } from 'react'
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

/** Fixed box, so a logo arriving later never moves the text beside it. */
const ArtworkFrame = ({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}) => (
  <span
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

/** Decorative logo for a coin or chain; its name stays the accessible label. */
export const AddressRecordArtwork = ({
  option,
  className,
}: ArtworkProps<AddressRecordOption>) => (
  <ArtworkFrame className={className}>
    <Suspense fallback={<LoadingArtwork />}>
      <AddressRecordGlyph
        coinType={option.coinType}
        fallback={<MonogramArtwork name={option.name} />}
      />
    </Suspense>
  </ArtworkFrame>
)
