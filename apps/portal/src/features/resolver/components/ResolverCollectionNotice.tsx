import type { Completeness } from '@ens-apps/indexer/bigname'

/** An unavailable collection is not evidence that no grants or links exist. */
export const ResolverCollectionNotice = ({
  collection,
  status,
}: {
  readonly collection: 'links' | 'roles'
  readonly status?: Completeness
}) =>
  status && status !== 'full' ? (
    <p className="text-sm text-muted-foreground">
      {status === 'unsupported'
        ? `The ${collection} for this resolver are unavailable.`
        : `Only some ${collection} for this resolver are available. The list may be incomplete.`}
    </p>
  ) : null
