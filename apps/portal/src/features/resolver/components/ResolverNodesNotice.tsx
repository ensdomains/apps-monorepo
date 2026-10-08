export const ResolverNodesNotice = ({
  count,
  isPartial,
}: {
  readonly count: number
  readonly isPartial?: boolean
}) =>
  isPartial ? (
    <p className="text-sm text-muted-foreground">
      {`Showing ${count.toLocaleString()} nodes. More nodes could not be loaded. Refresh to retry.`}
    </p>
  ) : null
