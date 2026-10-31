import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { WithdrawLeftoverFundsModal } from '@/features/wallet/components/WithdrawLeftoverFundsModal'
import { useLeftoverFunds } from '@/features/wallet/hooks/useLeftoverFunds'
import { resolveLeftoverFundsNotice } from '../leftoverFundsNotice'

const noticeClassName =
  'flex w-full flex-col gap-3 rounded-xl border border-ens-blue/20 bg-ens-blue/5 px-4 py-4 text-ens-blue-midnight sm:flex-row sm:items-center sm:justify-between md:px-6'

const actionClassName =
  'w-fit shrink-0 rounded-full border border-ens-blue/20 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/60'

/**
 * The smart account's leftover balance, on the dashboard. Registrations fund
 * the account for the highest quoted cost and spend only the actual one, so
 * whatever is left stays there; before this, users only saw it by starting a
 * payment. Hidden unless there is a balance to show (WEB-1997).
 */
export const LeftoverFundsNotice = () => {
  const { t } = useLingui()
  const leftoverFunds = useLeftoverFunds()
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const notice = resolveLeftoverFundsNotice({
    leftover: leftoverFunds.leftover,
    isError: leftoverFunds.isError,
  })

  return (
    <>
      {match(notice)
        .with({ kind: 'hidden' }, () => null)
        .with({ kind: 'funds' }, ({ amount }) => (
          <div className={noticeClassName} role="status">
            <p className="text-sm">
              <Trans>
                Your smart account holds {amount} left over from your payments.
              </Trans>
            </p>
            <button
              className={actionClassName}
              onClick={() => setIsWithdrawOpen(true)}
              type="button"
            >
              <Trans>Withdraw</Trans>
            </button>
          </div>
        ))
        .with({ kind: 'held' }, ({ amount, registrationName }) => (
          <div className={noticeClassName} role="status">
            <p className="text-sm">
              <Trans>
                Your smart account holds {amount}, which your registration of{' '}
                {registrationName} still needs.
              </Trans>
            </p>
            <Link
              className={actionClassName}
              params={{ name: registrationName }}
              to="/register/$name"
            >
              <Trans>Continue registration</Trans>
            </Link>
          </div>
        ))
        .exhaustive()}

      {/* Mounted whatever the banner shows: each attempt re-reads the balance,
          and a held or failed read must not close an open dialog. */}
      <WithdrawLeftoverFundsModal
        errorMessage={leftoverFunds.withdrawError}
        isError={leftoverFunds.isError}
        isLoading={leftoverFunds.isLoading}
        isWithdrawing={leftoverFunds.isWithdrawing}
        leftover={leftoverFunds.leftover}
        onContinueRegistration={() => setIsWithdrawOpen(false)}
        onOpenChange={setIsWithdrawOpen}
        onWithdraw={async () => {
          const outcome = await leftoverFunds.withdraw()
          if (outcome.status !== 'withdrawn') return false
          toast.success(t`Your leftover funds are back in your wallet.`)
          return true
        }}
        open={isWithdrawOpen}
      />
    </>
  )
}
