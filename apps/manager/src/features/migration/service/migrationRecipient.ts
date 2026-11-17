import { type Address, keccak256, type PublicClient } from 'viem'
import { MigrationRecipientCheckError } from './migrationRecipientError'
import {
  getMigrationRecipientDelegate,
  isKnownIncompatibleMigrationDelegate,
} from './migrationRecipientPolicy'
import { withRequestDeadline } from './requestDeadline'

/** Reject only proven incompatible runtimes; the actual migration remains authoritative. */
export const assertMigrationRecipientsCanReceive = async (params: {
  readonly publicClient: Pick<PublicClient, 'getCode'>
  readonly recipients: readonly Address[]
  readonly signal?: AbortSignal
}): Promise<void> => {
  const recipients = [
    ...new Map(
      params.recipients.map((recipient) => [
        recipient.toLowerCase(),
        recipient,
      ]),
    ).values(),
  ]
  await Promise.all(
    recipients.map(async (recipient) => {
      params.signal?.throwIfAborted()
      const codeRead = await withRequestDeadline(
        () => params.publicClient.getCode({ address: recipient }),
        { signal: params.signal },
      ).then(
        (code) => ({ status: 'read', code }) as const,
        (cause: unknown) => ({ status: 'failed', cause }) as const,
      )
      params.signal?.throwIfAborted()
      if (codeRead.status === 'failed')
        throw new MigrationRecipientCheckError({
          recipient,
          reason: 'unavailable',
          cause: codeRead.cause,
        })
      const delegate = getMigrationRecipientDelegate(codeRead.code)
      if (!delegate) return

      const runtimeRead = await withRequestDeadline(
        () => params.publicClient.getCode({ address: delegate }),
        { signal: params.signal },
      ).then(
        (code) => ({ status: 'read', code }) as const,
        (cause: unknown) => ({ status: 'failed', cause }) as const,
      )
      params.signal?.throwIfAborted()
      if (runtimeRead.status === 'failed')
        throw new MigrationRecipientCheckError({
          recipient,
          reason: 'unavailable',
          cause: runtimeRead.cause,
        })
      const runtimeHash =
        runtimeRead.code && runtimeRead.code !== '0x'
          ? keccak256(runtimeRead.code)
          : null
      if (isKnownIncompatibleMigrationDelegate(runtimeHash))
        throw new MigrationRecipientCheckError({
          recipient,
          reason: 'incompatible',
          cause: { delegate, runtimeHash },
        })
    }),
  )
}
