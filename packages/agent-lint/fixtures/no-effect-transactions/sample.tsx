import { useEffect, useState } from 'react'

declare const transactionManager: { startTransaction: (intent: unknown) => string }
declare function useWriteContract(): { writeContractAsync: (args: unknown) => Promise<string> }
declare const firstTx: { status: 'pending' | 'success' }

export const Violation1 = () => {
  const [hasTriggered, setHasTriggered] = useState(false) // the tell: a guard flag
  useEffect(() => { // expect: no-effect-transactions
    if (firstTx.status === 'success' && !hasTriggered) {
      setHasTriggered(true)
      transactionManager.startTransaction({ kind: 'second' })
    }
  }, [hasTriggered])
  return <div />
}

export const Violation2 = () => {
  const { writeContractAsync } = useWriteContract()
  useEffect(() => { // expect: no-effect-transactions
    if (firstTx.status === 'success') {
      void writeContractAsync({ functionName: 'second' })
    }
  }, [writeContractAsync])
  return <div />
}

export const Passes = () => {
  const { writeContractAsync } = useWriteContract()
  const onClick = () => {
    void writeContractAsync({ functionName: 'first' })
  }
  useEffect(() => {
    document.title = 'Register'
  }, [])
  return <button type="button" onClick={onClick} />
}
