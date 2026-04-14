import { Trans } from '@lingui/react/macro'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SkipReasonLabel } from '@/features/migration/components/SkipReasonLabel'
import type { SkippedName } from '@/features/migration/service/migrationService'

type SuccessModalProps = {
  readonly open: boolean
  readonly migratedNames: readonly string[]
  readonly skippedNames?: readonly SkippedName[]
  readonly onClose: () => void
}

const NAME_PREVIEW_LIMIT = 6

export const SuccessModal = ({
  open,
  migratedNames,
  skippedNames = [],
  onClose,
}: SuccessModalProps) => {
  const count = migratedNames.length
  const preview = migratedNames.slice(0, NAME_PREVIEW_LIMIT)
  const overflow = Math.max(0, count - NAME_PREVIEW_LIMIT)
  const hasSkipped = skippedNames.length > 0
  const allSkipped = count === 0 && hasSkipped

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden border-0 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-0 sm:max-w-[460px]"
        showCloseButton={false}
      >
        <GrainOverlay />

        <div className="relative z-10 flex flex-col items-center gap-5 px-6 pt-10 pb-7">
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative"
            initial={{ opacity: 0, scale: 0.6, y: 12 }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.9 }}
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 3.5,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
              }}
            >
              <img
                alt=""
                className="h-[132px] select-none"
                src="/frens/together.svg"
              />
            </motion.div>
            <motion.span
              animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 1.2] }}
              aria-hidden
              className="-top-2 -right-1 absolute text-2xl"
              transition={{
                duration: 2.2,
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 0.8,
              }}
            >
              ✨
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 1.2] }}
              aria-hidden
              className="-bottom-1 -left-3 absolute text-lg"
              transition={{
                duration: 2.2,
                delay: 0.6,
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 0.8,
              }}
            >
              ✨
            </motion.span>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <DialogTitle className="text-center font-normal text-[32px] text-ens-garnet-900 leading-[1.05] tracking-[-0.64px]">
              {allSkipped ? (
                <Trans>Nothing to migrate</Trans>
              ) : (
                <Trans>You're on ENS v2!</Trans>
              )}
            </DialogTitle>
            <DialogDescription className="text-center font-semi-mono text-[11px] text-ens-garnet-500 uppercase tracking-[0.16px]">
              {match({ count, allSkipped })
                .with({ allSkipped: true }, () => (
                  <Trans>No names were migrated</Trans>
                ))
                .with({ count: 1 }, () => <Trans>1 name migrated</Trans>)
                .otherwise(() => (
                  <Trans>{count} names migrated</Trans>
                ))}
            </DialogDescription>
          </motion.div>

          {preview.length > 0 && (
            <motion.ul
              animate={{ opacity: 1, y: 0 }}
              className="flex max-h-[148px] w-full flex-wrap justify-center gap-1.5 overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3 [scrollbar-width:thin]"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              {preview.map((name) => (
                <li
                  className="max-w-full truncate rounded-[3px] border border-ens-garnet-900/10 bg-white/70 px-2 py-1 font-medium font-semi-mono text-ens-garnet-900 text-xs leading-none tracking-[-0.12px]"
                  key={name}
                  title={name}
                >
                  {name}
                </li>
              ))}
              {overflow > 0 && (
                <li className="rounded-[3px] bg-ens-garnet-900/10 px-2 py-1 font-semi-mono text-[11px] text-ens-garnet-900/60 leading-none">
                  <Trans>+{overflow} more</Trans>
                </li>
              )}
            </motion.ul>
          )}

          {hasSkipped && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="w-full rounded-sm bg-ens-garnet-900/5 p-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-ens-garnet-900/60" />
                <p className="font-semi-mono text-[11px] text-ens-garnet-900/80 uppercase tracking-[0.12px]">
                  {skippedNames.length === 1 ? (
                    <Trans>1 name not migrated</Trans>
                  ) : (
                    <Trans>{skippedNames.length} names not migrated</Trans>
                  )}
                </p>
              </div>
              <ul className="flex max-h-[120px] flex-col gap-1 overflow-y-auto [scrollbar-width:thin]">
                {skippedNames.map((skipped) => (
                  <li
                    className="flex flex-wrap items-start gap-1 text-[11px] leading-[1.4]"
                    key={skipped.name}
                  >
                    <span className="shrink-0 font-medium text-ens-garnet-900/80">
                      {skipped.name}
                    </span>
                    <span className="text-ens-garnet-900/50">
                      &mdash; <SkipReasonLabel reason={skipped.reason} />
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="hover:-translate-y-px mt-1 w-full max-w-[280px] rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] transition-transform active:translate-y-px"
            initial={{ opacity: 0, y: 10 }}
            onClick={onClose}
            transition={{ duration: 0.4, delay: 0.55 }}
            type="button"
          >
            <Trans>Done</Trans>
          </motion.button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
