import { transactionManager } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

/**
 * Keeps the transaction manager's notion of the connected wallet in sync.
 *
 * Transaction actors outlive the step that created them, and the modal decides
 * whether a step is done by looking one up. Without this, a receipt produced by
 * the previously connected account could still satisfy a step of the flow the
 * *newly* connected account is running. The manager retires the actors another
 * account owns as soon as it learns of the switch.
 *
 * Mounted once, at the root.
 */
export const useTransactionManagerAccount = (): void => {
  const { address } = useAccount()

  useEffect(() => {
    transactionManager.setConnectedAccount(address)
  }, [address])
}
