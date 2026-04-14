import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import type { SkipReason } from '@/features/migration/service/migrationService'

export const SkipReasonLabel = ({ reason }: { reason: SkipReason }) =>
  match(reason)
    .with('not-premigrated', () => <Trans>Not yet premigrated in ENS v2</Trans>)
    .with('frozen-approval', () => (
      <Trans>Has a frozen approval that prevents migration</Trans>
    ))
    .with('already-migrated', () => <Trans>Already migrated to ENS v2</Trans>)
    .with('transfer-failed', () => <Trans>Transfer reverted on-chain</Trans>)
    .with('invalid-data', () => <Trans>Invalid migration data encoding</Trans>)
    .with('name-data-mismatch', () => (
      <Trans>Name data does not match the migration receiver</Trans>
    ))
    .with('name-is-locked', () => (
      <Trans>Name is locked and was sent to the wrong controller</Trans>
    ))
    .with('name-not-locked', () => (
      <Trans>
        Name is not locked/emancipated and cannot use this controller
      </Trans>
    ))
    .with('frozen-token-approval', () => (
      <Trans>Has an irrevocable approval that blocks migration</Trans>
    ))
    .exhaustive()
