import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
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
      <div className="mx-auto flex min-h-[420px] max-w-6xl items-center px-4">
        <Story />
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

/** Mid-registration — square weaving, name partly filled, step copy tracking progress. */
export const Default: Story = {}

/** Just dismissed notifications — nothing filled yet. */
export const Start: Story = {
  args: { progress: 2 },
}

/** Registration finished — name fully filled. */
export const Complete: Story = {
  args: { progress: 100 },
}

/** Completion hold — fully filled with the Continue button that skips the 1s wait. */
export const CompleteWithContinue: Story = {
  args: {
    progress: 100,
    footer: (
      <Button
        className="mt-2 w-fit uppercase tracking-[0.12em] max-md:mx-auto"
        size="lg"
        variant="lightBlue"
      >
        Continue
      </Button>
    ),
  },
}

/** With the commitment-cooldown countdown as the secondary line. */
export const WithCooldown: Story = {
  args: {
    progress: 40,
    description: 'Waiting for commitment cooldown — register unlocks in 38s',
  },
}

/** Long name to check wrapping / measurement. */
export const LongName: Story = {
  args: { name: 'verylongname.eth', progress: 55 },
}

// ENS labels can be up to 255 characters — the fill must wrap and stay perceivable.
const SIXTY_THREE_CHAR_NAME = `${'pneumonoultramicroscopicsilicovolcanoconiosis-and-then-some'.slice(0, 59)}.eth`
const MAX_LENGTH_NAME = `${'q'.repeat(251)}.eth`

/** 63-char name — multi-line fill, mid-progress. */
export const SixtyThreeCharName: Story = {
  args: { name: SIXTY_THREE_CHAR_NAME, progress: 55 },
}

/** Maximum-length (255-char) name — stress test for wrapping and fill velocity. */
export const MaxLengthName: Story = {
  args: { name: MAX_LENGTH_NAME, progress: 55 },
}

/**
 * Simulates the live flow: progress ramps 0→100 over ~12s (stepping like the real stages),
 * then holds at 100 with the name fully filled — exactly what you'd see end-to-end.
 */
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
        // Ease-out so it slows near the end, like waiting on confirmations.
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

// Real machine milestones in flow order, used to simulate stage jumps.
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

// Compressed cooldown for the demo (real flows wait ~60s; the pacing is identical).
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
      // Hold on the cooldown stage and tick its countdown, like the real machine.
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
  const { progress, fillDone } = useForwardProgress(
    stageProgress,
    isComplete,
    args.name.length,
    cooldownLeft,
  )

  return (
    <WeaveRegistration
      {...args}
      animate={false}
      footer={
        fillDone ? (
          <Button
            className="mt-2 w-fit uppercase tracking-[0.12em] max-md:mx-auto"
            size="lg"
            variant="lightBlue"
          >
            Continue
          </Button>
        ) : null
      }
      progress={progress}
    />
  )
}

/**
 * Exercises the real `useForwardProgress` driver: the machine's stage milestones advance
 * every ~2.5s, and the displayed fill sweeps from 0 letter-by-letter, catching up then
 * creeping continuously between them — exactly how the live flow animates. Completes at
 * the end and shows the Continue button.
 */
export const LiveForwardProgress: Story = {
  render: (args) => <LiveForwardProgressDemo {...args} />,
}

/** The live driver with a maximum-length name — velocity scales with name length. */
export const LiveForwardProgressMaxLength: Story = {
  args: { name: MAX_LENGTH_NAME },
  render: (args) => <LiveForwardProgressDemo {...args} />,
}
