import { match, P } from 'ts-pattern'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  RECORD_EDIT_LOCK_TITLE,
  RecordEditLockReason,
} from '@/features/records/components/RecordEditLockReason'
import type { RecordEditLock } from '@/features/records/helpers/recordEditLock'

/** Why the editor refused: locked out, unreadable permissions, or simply not permitted. */
export const EditRecordsDeniedMessage = ({
  name,
  editLock,
  isPermissionsError,
}: {
  readonly name: string
  readonly editLock: RecordEditLock | undefined
  readonly isPermissionsError: boolean
}) =>
  match({ editLock, isPermissionsError })
    .with({ editLock: P.not(undefined) }, ({ editLock: lock }) => (
      <ErrorMessage
        description={<RecordEditLockReason lock={lock} name={name} />}
        title={RECORD_EDIT_LOCK_TITLE}
      />
    ))
    .with({ isPermissionsError: true }, () => (
      <ErrorMessage
        description={
          <>
            We couldn’t read your resolver permissions for{' '}
            <strong>{name}</strong>, so editing is disabled. Try again in a
            moment.
          </>
        }
        title="Permissions unavailable"
      />
    ))
    .otherwise(() => (
      <ErrorMessage
        description={
          <>
            You don't have permission to edit records for{' '}
            <strong>{name}</strong>. Record edits require the relevant resolver
            roles (or ownership on a non-permissioned resolver).
          </>
        }
        title="Permission Denied"
      />
    ))
