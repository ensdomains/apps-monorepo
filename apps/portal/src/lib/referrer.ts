import type { Hex } from 'viem'

/**
 * The referrer the Explorer sends when a link supplies none (or a malformed
 * one), so ENS Labs' own registrations and renewals are attributed. It is the
 * ASCII string "ENS Labs Explorer", right-padded, so it can never equal a
 * partner's left-padded address. The App uses a different ID.
 */
export const ENS_LABS_REFERRER: Hex =
  '0x454e53204c616273204578706c6f726572000000000000000000000000000000'
