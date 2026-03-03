import { createAtom, useAtom } from '@xstate/store-react'

const transactionModalAtom = createAtom(false)

export const useTransactionModal = () => {
  const isOpen = useAtom(transactionModalAtom)

  const openModal = () => transactionModalAtom.set(true)
  const closeModal = () => transactionModalAtom.set(false)

  return { isOpen, openModal, closeModal }
}
