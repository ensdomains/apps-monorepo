import { transactionManager } from '@ens-apps/transaction-manager'
import { createAtom, useAtom } from '@xstate/store-react'

const transactionModalAtom = createAtom(false)

export const useTransactionModal = () => {
  const isOpen = useAtom(transactionModalAtom)

  const openModal = () => transactionModalAtom.set(true)
  const closeModal = () => transactionModalAtom.set(false)
  const clearTransaction = () => {
    transactionManager.clear()
  }

  return { isOpen, openModal, closeModal, clearTransaction }
}
