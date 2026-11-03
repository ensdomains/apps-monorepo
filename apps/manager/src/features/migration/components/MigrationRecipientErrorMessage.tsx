import { useLingui } from '@lingui/react'
import type { MigrationError } from '../service/decodeMigrationError'
import { migrationRecipientMessage } from '../service/migrationRecipientError'

export const MigrationRecipientErrorMessage = ({
  error,
}: {
  readonly error: Extract<
    MigrationError,
    { readonly type: 'recipient-incompatible' | 'recipient-unavailable' }
  >
}) => {
  const { _ } = useLingui()
  return (
    <span className="break-words">
      {_(
        migrationRecipientMessage({
          recipient: error.recipient,
          reason: error.type,
        }),
      )}
    </span>
  )
}
