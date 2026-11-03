import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { Address } from 'viem'

export class MigrationRecipientCheckError extends TaggedError(
  'MigrationRecipientCheckError',
)<{
  readonly recipient: Address
  readonly reason: 'incompatible' | 'unavailable'
  readonly cause: unknown
}> {}

export const migrationRecipientMessage = (params: {
  readonly recipient: Address
  readonly reason: 'recipient-incompatible' | 'recipient-unavailable'
}): MessageDescriptor => {
  const { recipient } = params
  return params.reason === 'recipient-incompatible'
    ? msg`The wallet ${recipient} cannot receive ENSv2 name tokens with its current configuration. Ask your wallet's support for a compatible configuration before upgrading.`
    : msg`Couldn't verify whether ${recipient} can receive upgraded names. Try again before changing your wallet settings.`
}
