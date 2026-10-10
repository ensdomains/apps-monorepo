import { type Address, isAddress } from 'viem'
import { type HistoryToken, historyTokenId } from '../historyTokenId'
import type { TimelineEventOfType } from '../timelineEvent'

export type TransferRowContent = {
  /** "minted token ID", "transferred token ID", "minted to" or "transferred to". */
  readonly label: string
  /** Present only where the token id is exact (see `historyTokenId`). */
  readonly token?: HistoryToken
  readonly recipient?: Address
}

/**
 * A mint has no previous holder. bigname reports a NameWrapper mint's `from`
 * as the wrapper itself, which never holds its own tokens, so that reads as a
 * mint too.
 */
const isMint = ({
  data,
  contractAddress,
}: TimelineEventOfType<'transfer'>): boolean =>
  !data.from || data.from.toLowerCase() === contractAddress?.toLowerCase()

/**
 * A transfer row's line, "minted token ID {id} to {account}", with the token id
 * where it can be derived exactly and the plain "minted to {account}" where it
 * cannot. Undefined when the row names neither.
 */
export const transferRowContent = (
  event: TimelineEventOfType<'transfer'>,
): TransferRowContent | undefined => {
  const token = historyTokenId(event)
  const { to } = event.data
  const recipient = to && isAddress(to, { strict: false }) ? to : undefined
  if (!token && !recipient) return undefined
  const verb = isMint(event) ? 'minted' : 'transferred'
  return {
    label: token ? `${verb} token ID` : `${verb} to`,
    ...(token && { token }),
    ...(recipient && { recipient }),
  }
}
