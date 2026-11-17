import { match } from 'ts-pattern'

/** What the node knows about a journaled batch hash whose receipt is missing. */
export type SubmittedBatchLookup =
  | { readonly status: 'not-found' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'mined' }
  | {
      readonly status: 'pending'
      readonly nonce: bigint
      readonly confirmedNonce: bigint
    }

/** A pending batch can still land, so it blocks a retry until its nonce is reused or it is dropped. */
export const canReadStateForSubmittedBatch = (
  lookup: SubmittedBatchLookup,
): boolean =>
  match(lookup)
    .with({ status: 'not-found' }, { status: 'mined' }, () => true)
    .with({ status: 'unavailable' }, () => false)
    .with(
      { status: 'pending' },
      ({ nonce, confirmedNonce }) => confirmedNonce > nonce,
    )
    .exhaustive()
