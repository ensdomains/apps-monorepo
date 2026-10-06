export const ResolverNodesNotice = ({
  count,
  truncated,
  partial,
}: {
  readonly count: number
  readonly truncated?: boolean
  readonly partial?: boolean
}) =>
  truncated ? (
    <p className="text-sm text-muted-foreground">
      {partial
        ? `Showing ${count.toLocaleString()} nodes. More nodes could not be loaded. Refresh to retry.`
        : `Showing the first ${count.toLocaleString()} nodes.`}
    </p>
  ) : null
