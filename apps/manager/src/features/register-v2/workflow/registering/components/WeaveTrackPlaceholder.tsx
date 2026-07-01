/** Skeleton stand-in for the weave track while a lazy chunk loads. */
export function WeaveTrackPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`h-3 w-full rounded-full bg-ens-gray-two ${className ?? ''}`}
    />
  )
}
