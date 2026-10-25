import { TaggedError } from '@ens-apps/utils/neverthrow'

export class SubnameRecreationError extends TaggedError(
  'SubnameRecreationError',
)<{
  readonly message: string
  readonly ensName: string
}> {}

/** Older prototypes used different recipients, roles and resolver ownership. */
export const assertSubnameRecreationSnapshotCurrent = (snapshot: {
  readonly version: number
  readonly roots: readonly string[]
}): void => {
  if (snapshot.version !== 5) {
    throw new SubnameRecreationError({
      ensName: snapshot.roots[0] ?? 'selection',
      message:
        'This saved subname import uses an older permission mapping. Keep its transaction history and reconcile it before preparing a new direct-subname import.',
    })
  }
}
