import { useState } from 'react'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'

type Step = 'select-names' | 'game' | 'success'

export const MigrationPage = () => {
  const [step, setStep] = useState<Step>('select-names')

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-[#feeaf0] to-[#ffc5df]">
      <GrainOverlay />

      {step === 'select-names' && (
        <SelectNamesStep onNext={() => setStep('game')} />
      )}
      {step === 'game' && <GameStep onNext={() => setStep('success')} />}

      <SuccessModal
        onClose={() => setStep('select-names')}
        open={step === 'success'}
      />
    </div>
  )
}
