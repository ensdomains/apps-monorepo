const SKELETON_WIDTHS = [120, 140, 180, 100, 160, 120]

export const NameListSkeleton = () => (
  <>
    {SKELETON_WIDTHS.map((width, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
      <div className="flex animate-pulse items-center gap-1" key={i}>
        <div className="size-4.5 shrink-0 rounded-sm bg-ens-garnet-900/10" />
        <div className="size-9.25 shrink-0 rounded-md bg-ens-garnet-900/10" />
        <div
          className="h-9.25 rounded-md bg-ens-garnet-900/10"
          style={{ width }}
        />
      </div>
    ))}
  </>
)
