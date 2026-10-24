import type { RecordEditLock } from '@/features/records/helpers/recordEditLock'

export const RECORD_EDIT_LOCK_TITLE = 'Records cannot be edited'

/** Why the owner of a wrapped V1 name cannot write its records, or change that. */
export const RecordEditLockReason = ({
  name,
  lock,
}: {
  readonly name: string
  readonly lock: RecordEditLock
}) => {
  if (lock !== 'resolver-locked') return null

  return (
    <>
      The resolver <strong>{name}</strong> uses does not authorise your wallet
      to write its records, and the name's fuses leave no way to change that:{' '}
      <code>CANNOT_SET_RESOLVER</code> is burned, so it cannot be pointed at a
      resolver you control, and <code>CANNOT_UNWRAP</code> is burned, so it
      cannot be unwrapped to clear them. Editing is disabled because any change
      would be rejected by the resolver.
    </>
  )
}
