import { useMachine } from '@xstate/react'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { migrationMachine } from '@/features/migration/machines/migrationMachine'

export const MigrationPage = () => {
  const [state, send] = useMachine(migrationMachine)

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-[#feeaf0] to-[#ffc5df]">
      <GrainOverlay />

      {state.matches('selectNames') && (
        <SelectNamesStep
          onNamesChange={(names) => send({ type: 'SELECT_NAMES', names })}
          onNext={() => send({ type: 'BEGIN_UPGRADE' })}
        />
      )}
      {state.matches('game') && (
        <GameStep onNext={() => send({ type: 'GAME_COMPLETE' })} />
      )}

      <SuccessModal
        onClose={() => send({ type: 'DONE' })}
        open={state.matches('success')}
      />
    </div>
  )
}
