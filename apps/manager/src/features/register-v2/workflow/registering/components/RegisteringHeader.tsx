import { useLingui } from '@lingui/react/macro'
import { Calligraph } from 'calligraph'
import { lazy, Suspense, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { useRegisteringStage } from '../../../state/registrationUi.selectors'
import { KEEP_BROWSER_OPEN } from '../lib/keepBrowserOpen'
import { RegistrationCompletionBanner } from './RegistrationCompletionBanner'
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

const RegisteringTitle = ({ label }: { label: string }) => {
  const dots = useTrailingDots()
  return (
    <p className="max-w-full text-base text-ens-blue">
      {label}
      <Calligraph animation="smooth" as="span" initial>
        {dots}
      </Calligraph>
    </p>
  )
}

type RegisteringStage = ReturnType<typeof useRegisteringStage>

export interface RegisteringHeaderProps {
  readonly isRegistrationComplete: boolean
  readonly uiStage: RegisteringStage
  readonly fillProgress: number
  /** Label for the post-registration setup stages (ETH record / primary name). */
  readonly stageLabel: string
}

/** Title + progress bar (or completion banner) shown above the registration details. */
export const RegisteringHeader = ({
  isRegistrationComplete,
  uiStage,
  fillProgress,
  stageLabel,
}: RegisteringHeaderProps) => {
  const { t } = useLingui()

  if (isRegistrationComplete || uiStage?.transaction === 'success') {
    return <RegistrationCompletionBanner />
  }

  const label = match(uiStage?.transaction)
    .with('pendingRegistration', () => t(KEEP_BROWSER_OPEN))
    .with(undefined, () => t`Loading...`)
    .otherwise(() => stageLabel)

  return (
    <div className="flex w-full flex-col items-center gap-2 text-center max-md:px-3">
      <RegisteringTitle label={label} />
      <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
        <WeaveProgressBar
          animate={false}
          className="w-full max-w-2xl"
          progress={fillProgress / 100}
        />
      </Suspense>
    </div>
  )
}
