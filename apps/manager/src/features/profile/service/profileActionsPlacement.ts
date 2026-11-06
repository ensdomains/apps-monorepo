import { match, P } from 'ts-pattern'

/** Where desktop favorite, share and renew go; `none` until the viewer's bar is known, so they never jump. */
export type ProfileActionsPlacement = 'header' | 'bar' | 'none'

/** The header is only for viewers who don't own the name; owners keep the actions in the bottom bar. */
export const getProfileActionsPlacement = ({
  hasFloatingBar,
  isAccountPending,
  isCopySourcePending,
  isOwner,
  isWriteAccessPending,
}: {
  readonly hasFloatingBar: boolean
  /** The connected wallet isn't known yet, so ownership can't be either. */
  readonly isAccountPending: boolean
  /** A resolver to copy records from brings the editor bar, and is still being read. */
  readonly isCopySourcePending: boolean
  readonly isOwner: boolean | undefined
  /** Resolver write access, which brings the editor bar, is still being read. */
  readonly isWriteAccessPending: boolean
}): ProfileActionsPlacement =>
  match({
    hasFloatingBar,
    isAccountPending,
    isOwner,
    isEditAccessPending: isWriteAccessPending || isCopySourcePending,
  })
    .returnType<ProfileActionsPlacement>()
    .with({ hasFloatingBar: true }, () => 'bar')
    .with(
      P.union({ isAccountPending: true }, { isOwner: P.nullish }),
      () => 'none',
    )
    .with({ isOwner: true, isEditAccessPending: true }, () => 'none')
    .with({ isOwner: true }, () => 'bar')
    .otherwise(() => 'header')
