import {
  WEAVE_REGISTRATION_LONG_NAME as LONG_NAME,
  JACQUARD_PATTERN6_DYE_BLEED_OPTIONS as LONG_NAME_WEAVE_OPTIONS,
} from '@ens-apps/weave-loader'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect, useRef, useState } from 'react'
import { REGISTRATION_STAGE_PROGRESS } from '../../../state/registration.stages'
import { useForwardProgress } from '../lib/useForwardProgress'
import { WeaveRegistration } from './WeaveRegistration'

const meta = {
  title: 'Features/RegisterV2/WeaveRegistration',
  component: WeaveRegistration,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen w-full items-center justify-center p-8">
        <div className="w-full max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    name: 'erni.eth',
    progress: 45,
  },
} satisfies Meta<typeof WeaveRegistration>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Start: Story = {
  args: { progress: 2 },
}

export const Complete: Story = {
  args: { progress: 100 },
}

export const WithCooldown: Story = {
  args: {
    progress: 40,
    description: 'Waiting for commitment cooldown — register unlocks in 38s',
  },
}

export const LongName: Story = {
  args: {
    name: LONG_NAME,
    progress: 55,
    weaveOptions: LONG_NAME_WEAVE_OPTIONS,
  },
}

export const AnimatedRegistration: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(0)
    const startRef = useRef<number | null>(null)
    useEffect(() => {
      const DURATION = 12000
      let raf = 0
      const tick = (now: number) => {
        if (startRef.current === null) startRef.current = now
        const t = Math.min(1, (now - startRef.current) / DURATION)
        const eased = 1 - (1 - t) ** 2
        setProgress(Math.round(eased * 100))
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [])
    return <WeaveRegistration {...args} progress={progress} />
  },
}

const STAGE_SEQUENCE = [
  REGISTRATION_STAGE_PROGRESS.settingUpRegistration,
  REGISTRATION_STAGE_PROGRESS.preparingCommitment,
  REGISTRATION_STAGE_PROGRESS.committingTransaction,
  REGISTRATION_STAGE_PROGRESS.waitingForCommitment,
  REGISTRATION_STAGE_PROGRESS.commitmentCooldown,
  REGISTRATION_STAGE_PROGRESS.checkingAllowance,
  REGISTRATION_STAGE_PROGRESS.waitingForApproval,
  REGISTRATION_STAGE_PROGRESS.registeringDomain,
  REGISTRATION_STAGE_PROGRESS.waitingForRegistration,
  REGISTRATION_STAGE_PROGRESS.verifyingRegistration,
]

const COOLDOWN_DEMO_SECONDS = 8

const LiveForwardProgressDemo = (
  args: React.ComponentProps<typeof WeaveRegistration>,
) => {
  const [stageIndex, setStageIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null)
  useEffect(() => {
    let i = 0
    let cooldown: number | null = null
    const interval = setInterval(() => {
      if (
        STAGE_SEQUENCE[i] === REGISTRATION_STAGE_PROGRESS.commitmentCooldown
      ) {
        if (cooldown === null) cooldown = COOLDOWN_DEMO_SECONDS
        cooldown -= 1
        setCooldownLeft(cooldown > 0 ? cooldown : null)
        if (cooldown > 0) return
      }
      if (i + 1 >= STAGE_SEQUENCE.length) {
        clearInterval(interval)
        setCooldownLeft(null)
        setIsComplete(true)
        return
      }
      i += 1
      setStageIndex(i)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const stageProgress = STAGE_SEQUENCE[stageIndex] ?? 0
  const { progress } = useForwardProgress(
    stageProgress,
    isComplete,
    args.name.length,
    cooldownLeft,
  )

  return <WeaveRegistration {...args} animate={false} progress={progress} />
}

export const LiveForwardProgress: Story = {
  render: (args) => <LiveForwardProgressDemo {...args} />,
}

export const LiveForwardProgressMaxLength: Story = {
  args: {
    name: LONG_NAME,
    weaveOptions: LONG_NAME_WEAVE_OPTIONS,
  },
  render: (args) => <LiveForwardProgressDemo {...args} />,
}

const RegisteringCompletionHoldDemo = ({
  name = 'erni.eth',
}: {
  name?: string
}) => {
  const [isComplete, setIsComplete] = useState(false)
  const [exitReady, setExitReady] = useState(false)
  const machineProgress = isComplete ? 100 : 88

  useEffect(() => {
    if (!isComplete) setExitReady(false)
  }, [isComplete])

  const { progress: fillProgress, fillDone } = useForwardProgress(
    machineProgress,
    isComplete,
    name.length,
    null,
  )

  useEffect(() => {
    if (!isComplete || !fillDone) return undefined
    const id = window.setTimeout(() => setExitReady(true), 200)
    return () => window.clearTimeout(id)
  }, [fillDone, isComplete])

  const showCenteredLoader = !isComplete || !exitReady

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <button
        className="rounded-lg bg-ens-blue px-4 py-2 text-sm text-white"
        disabled={isComplete}
        onClick={() => setIsComplete(true)}
        type="button"
      >
        Complete registration (fill at ~88%)
      </button>
      <p className="text-ens-gray text-sm">
        Fill progress: {fillProgress.toFixed(1)}%
        {fillDone ? ' — 100% reached' : ''}
        {exitReady ? ' — showing details' : ''}
      </p>
      {showCenteredLoader ? (
        <WeaveRegistration animate={false} name={name} progress={fillProgress} />
      ) : (
        <div className="w-full max-w-2xl space-y-4 rounded-xl border border-ens-gray-two p-6">
          <p className="font-medium text-ens-blue text-lg">
            Registration complete
          </p>
          <p className="text-ens-gray text-sm">
            Registration details (shown after fill progress reaches 100%)
          </p>
        </div>
      )}
    </div>
  )
}

export const CompletionHoldTransition: Story = {
  render: () => <RegisteringCompletionHoldDemo />,
}

export const CompletionHoldTransitionLongName: Story = {
  render: () => <RegisteringCompletionHoldDemo name="vitalik.eth" />,
}
