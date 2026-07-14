import { useLingui } from '@lingui/react/macro'
import { Calligraph } from 'calligraph'
import { lazy, Suspense, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { useRegisteringStage } from '../../../state/registrationUi.selectors'
import { RegistrationCompletionBanner } from './RegistrationCompletionBanner'
import { RegistrationProgressBar } from './RegistrationProgressBar'
import { WeaveTrackPlaceholder } from './WeaveTrackPlaceholder'

const WeaveProgressBar = lazy(() =>
  import('@ens-apps/weave-loader/WeaveProgressBar').then((m) => ({
    default: m.WeaveProgressBar,
  })),
)

const REGISTERING_DOTS_INTERVAL_MS = 700

const useTrailingDots = (max = 3) => {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const timer = setInterval(
      () => setCount((c) => (c + 1) % (max + 1)),
      REGISTERING_DOTS_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [max])
  return '.'.repeat(count)
}

const RegisteringTitle = () => {
  const { t } = useLingui()
  const dots = useTrailingDots()
  return (
    <Calligraph
      animation="smooth"
      as="p"
      className="text-base text-ens-blue"
      initial
    >
      {`${t`Registering name`}${dots}`}
    </Calligraph>
  )
}

type RegisteringStage = ReturnType<typeof useRegisteringStage>

export interface RegisteringHeaderProps {
  isRegistrationComplete: boolean
  uiStage: RegisteringStage
  fillProgress: number
  /** Label for the post-registration setup stages (ETH record / primary name). */
  stageLabel: string
  /** Description for the post-registration setup stages. */
  stageDescription?: string
  /** Progress (0-100) for the post-registration setup stages. */
  stageProgress: number
}

/** Title + progress bar (or completion banner) shown above the registration details. */
export function RegisteringHeader({
  isRegistrationComplete,
  uiStage,
  fillProgress,
  stageLabel,
  stageDescription,
  stageProgress,
}: RegisteringHeaderProps) {
  const { t } = useLingui()

  if (isRegistrationComplete) {
    return <RegistrationCompletionBanner />
  }

  return (
    match(uiStage?.transaction)
      .with('pendingRegistration', () => (
        <div className="flex w-full flex-col items-center gap-2 text-center max-md:px-3">
          <RegisteringTitle />
          <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
            <WeaveProgressBar
              animate={false}
              className="w-full max-w-2xl"
              progress={fillProgress / 100}
            />
          </Suspense>
        </div>
      ))
      .with('success', () => <RegistrationCompletionBanner />)
      .with(undefined, () => (
        <RegistrationProgressBar label={t`Loading...`} progress={0} />
      ))
      // Post-registration setup stages (ETH record sync / primary name).
      .otherwise(() => (
        <RegistrationProgressBar
          description={stageDescription}
          label={stageLabel}
          progress={stageProgress}
        />
      ))
  )
}
