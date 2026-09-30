import { transactionManager } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

/**
 * Keeps the transaction manager's notion of the connected wallet in sync.
 *
 * Transaction actors outlive the step that created them, and the modal decides
 * whether a step is done by looking one up. Without this, a receipt produced by
 * the previously connected account could still satisfy a step of the flow the
 * *newly* connected account is running.
 *
 * Only a settled connection is reported. wagmi passes through `undefined` while
 * connecting or reconnecting — a locked MetaMask, a page reload, an
 * `accountsChanged: []` — and none of those mean a different wallet has taken
 * over; treating them as a switch would throw away actors the open modal is
 * still rendering. The manager ignores `undefined` for the same reason, so this
 * is belt and braces.
 *
 * Mounted once, at the root.
 */
export const useTransactionManagerAccount = (): void => {
  const { address, status } = useAccount()

  useEffect(() => {
    if (status !== 'connected' || !address) return
    transactionManager.setConnectedAccount(address)
  }, [address, status])
}
