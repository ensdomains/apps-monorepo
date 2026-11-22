/** Whether the re-read expiry reached the one the renewal paid for: its starting expiry plus its duration. */
export const hasReachedRenewalTarget = ({
  expiry,
  currentExpiry,
  duration,
}: {
  readonly expiry: bigint | null
  readonly currentExpiry: bigint
  readonly duration: bigint
}): boolean => expiry !== null && expiry >= currentExpiry + duration
