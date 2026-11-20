import type { NameRegistrationStatus } from '../reads/common.types'

type StatusInput = Readonly<{
  /** False when no account holds the name at all. */
  isHeld: boolean
  expiresAt: Date | null
  /** `expiresAt` itself for a name with no grace. */
  graceEndsAt: Date | null
  now: Date
}>

/** bigname's lifecycle: `expired` within the grace, `released` after it, `unregistered` when nobody holds the name. */
export const toRegistrationStatus = ({
  isHeld,
  expiresAt,
  graceEndsAt,
  now,
}: StatusInput): NameRegistrationStatus => {
  if (expiresAt === null || now < expiresAt) {
    return isHeld ? 'active' : 'unregistered'
  }
  return graceEndsAt !== null && now < graceEndsAt ? 'expired' : 'released'
}
