const SKELETON_WIDTHS = [120, 140, 180, 100, 160]

export const NameListSkeleton = () => (
  <>
    {SKELETON_WIDTHS.map((width) => (
      <div className="flex animate-pulse items-center gap-3" key={width}>
        <div className="size-7 shrink-0 rounded-sm bg-ens-garnet-900/10" />
        <div className="size-9 shrink-0 rounded-full bg-ens-garnet-900/10" />
        <div
          className="h-7 rounded-xs bg-ens-garnet-900/10"
          style={{ width }}
        />
      </div>
    ))}
  </>
)
