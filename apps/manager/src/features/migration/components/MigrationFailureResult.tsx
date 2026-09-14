import { Trans } from '@lingui/react/macro'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import type { MigrationError } from '@/features/migration/service/decodeMigrationError'
import { MigrationPrimaryButton } from './MigrationPrimaryButton'

const formatMigrationError = (error: MigrationError): ReactNode =>
  match(error)
    .with({ type: 'generic' }, ({ message }) => message)
    .with({ type: 'plan-changed' }, () => (
      <Trans>
        Your permissions changed. Go back to check the updated estimate.
      </Trans>
    ))
    .with({ type: 'retry-blocked' }, () => (
      <Trans>We couldn&apos;t safely retry. Nothing new was submitted.</Trans>
    ))
    .with({ type: 'cleanup-failed' }, () => (
      <Trans>
        Your names were upgraded. One thing left: a temporary permission on your
        names still needs to be removed.
      </Trans>
    ))
    .with({ type: 'profile-fetch-failed' }, () => (
      <Trans>We couldn&apos;t read your current records.</Trans>
    ))
    .with({ type: 'user-rejected' }, () => (
      <Trans>You cancelled the request.</Trans>
    ))
    .with({ type: 'preflight-timeout' }, () => (
      <Trans>This is taking longer than expected.</Trans>
    ))
    .with({ type: 'permission-missing' }, () => (
      <Trans>A permission is missing. Try again.</Trans>
    ))
    .with({ type: 'token-owner-changed' }, () => (
      <Trans>
        One of your names changed owners. Refresh and select it again.
      </Trans>
    ))
    .with({ type: 'hca-owner-mismatch' }, () => (
      <Trans>
        This wasn&apos;t set up with the wallet you&apos;re using now. Connect
        the original wallet.
      </Trans>
    ))
    .with(
      { type: 'direct-transfer-unauthorized' },
      { type: 'name-data-mismatch' },
      { type: 'invalid-data' },
      () => <Trans>Something went wrong. Refresh and try again.</Trans>,
    )
    .with(
      { type: 'name-not-locked' },
      { type: 'name-requires-migration' },
      () => (
        <Trans>We couldn&apos;t upgrade one of your names. Try again.</Trans>
      ),
    )
    .with({ type: 'name-is-locked' }, { type: 'frozen-token-approval' }, () => (
      <Trans>
        One of your names can&apos;t be upgraded right now. Contact support if
        this keeps happening.
      </Trans>
    ))
    .exhaustive()

// An interrupted cleanup is the one failure that leaves work behind: the names
// were upgraded but a temporary permission is still outstanding, so the screen
// offers to remove it instead of reassuring the user that nothing changed.
const isCleanupPending = (error: MigrationError | undefined): boolean =>
  error?.type === 'cleanup-failed'

type MigrationFailureResultProps = {
  readonly error: MigrationError | undefined
  readonly onBack: () => void
  readonly onRetry: () => void
}

export const MigrationFailureResult = ({
  error,
  onBack,
  onRetry,
}: MigrationFailureResultProps) => {
  const hasPendingCleanup = isCleanupPending(error)
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-5"
      initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="flex flex-col items-center gap-2">
        <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
          <Trans>Upgrade didn&apos;t finish</Trans>
        </p>
        {hasPendingCleanup ? null : (
          <p className="text-center text-base text-ens-garnet-800/75 leading-normal">
            <Trans>Your names are safe.</Trans>
          </p>
        )}
      </div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="max-h-50 w-full max-w-md overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <p className="whitespace-pre-wrap break-words font-mono text-ens-garnet-900/70 text-xs leading-normal">
          {error ? formatMigrationError(error) : null}
        </p>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="flex max-w-full flex-wrap justify-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.4, delay: 0.35 }}
      >
        <button
          className="rounded-sm bg-ens-garnet-900/10 px-4 py-3 font-semi-mono text-ens-garnet-900 text-sm uppercase tracking-[1.68px]"
          onClick={onBack}
          type="button"
        >
          <Trans>Back</Trans>
        </button>
        <MigrationPrimaryButton onClick={onRetry} type="button">
          {hasPendingCleanup ? (
            <Trans>Remove temporary access</Trans>
          ) : (
            <Trans>Try again</Trans>
          )}
        </MigrationPrimaryButton>
      </motion.div>
    </motion.div>
  )
}
