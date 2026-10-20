import { useEffect, useState } from 'react'

type ExtendModalBaseStep = 'disclaimer' | 'settings'

/** Owners skip the ownership disclaimer; closing resets to the first step they will see. */
export const useExtendModalStep = <Step extends string>({
  open,
  isOwner,
}: {
  readonly open: boolean
  readonly isOwner: boolean
}) => {
  const [step, setStep] = useState<Step | ExtendModalBaseStep>('disclaimer')

  useEffect(() => {
    if (!open) {
      setStep(isOwner ? 'settings' : 'disclaimer')
    } else if (isOwner) {
      setStep((current) => (current === 'disclaimer' ? 'settings' : current))
    }
  }, [open, isOwner])

  return [step, setStep] as const
}
