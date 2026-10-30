import { Link } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import type { RecordEditLock } from '@/features/records/helpers/recordEditLock'

export const RECORD_EDIT_LOCK_TITLE = 'Records cannot be edited'

/** Why nobody can write a name's records, or why its wrapped V1 owner cannot and cannot change that. */
export const RecordEditLockReason = ({
  name,
  lock,
}: {
  readonly name: string
  readonly lock: RecordEditLock
}) =>
  match(lock)
    .with('resolver-not-contract', () => (
      <>
        The resolver set on <strong>{name}</strong> is not a contract: the
        address has no code, as with a wallet address. It cannot store records,
        and any record transaction sent to it would fail. Set a resolver
        contract on the name from its{' '}
        <Link
          to="/$name/resolver"
          params={{ name }}
          className="underline underline-offset-2"
        >
          Resolver
        </Link>{' '}
        page to edit its records.
      </>
    ))
    .with('resolver-locked', () => (
      <>
        The resolver <strong>{name}</strong> uses does not authorise your wallet
        to write its records, and the name's fuses leave no way to change that:{' '}
        <code>CANNOT_SET_RESOLVER</code> is burned, so it cannot be pointed at a
        resolver you control, and <code>CANNOT_UNWRAP</code> is burned, so it
        cannot be unwrapped to clear them. Editing is disabled because any
        change would be rejected by the resolver.
      </>
    ))
    .exhaustive()
