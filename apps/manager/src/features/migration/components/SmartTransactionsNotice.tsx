import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'

const METAMASK_SMART_TRANSACTIONS_URL =
  'https://support.metamask.io/manage-crypto/transactions/smart-transactions/'

/**
 * With MetaMask Smart Transactions on, users report wallet transactions the app
 * loses track of, or that never broadcast. A dapp can't read the setting, so
 * every MetaMask user is asked to check it.
 */
export const SmartTransactionsNotice = () => (
  <p className="flex items-start gap-1 text-ens-garnet-900" role="note">
    <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
    <span>
      <Trans>
        Using MetaMask? Turn off Smart Transactions in its settings before you
        start, or this page can lose track of your upgrade.
      </Trans>{' '}
      <a
        className="rounded-xs font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900/50"
        href={METAMASK_SMART_TRANSACTIONS_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Trans>About Smart Transactions</Trans>
      </a>
    </span>
  </p>
)
