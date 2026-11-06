/** Desktop favorite, share and renew sit in the header only once the viewer is known not to get the profile bar. */
export const shouldShowHeaderActions = ({
  hasFloatingBar,
  isAccountPending,
  isCopySourcePending,
  isOwner,
  isWriteAccessPending,
}: {
  readonly hasFloatingBar: boolean
  /** The connected wallet isn't known yet, so ownership can't be either. */
  readonly isAccountPending: boolean
  /** A resolver to copy records from also brings the bar, and is still being read. */
  readonly isCopySourcePending: boolean
  readonly isOwner: boolean | undefined
  /** Resolver write access, which brings the bar, is still being read. */
  readonly isWriteAccessPending: boolean
}): boolean =>
  !hasFloatingBar &&
  !isAccountPending &&
  isOwner !== undefined &&
  !(isOwner && (isWriteAccessPending || isCopySourcePending))
