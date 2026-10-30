import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect, useState } from 'react'
import {
  RegisteringHeader,
  type RegisteringHeaderProps,
} from './RegisteringHeader'

type Stage = RegisteringHeaderProps['uiStage']

const TICK_MS = 50
const PROGRESS_STEP = 0.4
const LOADING_UNTIL = 5
const SETUP_FROM = 80

const LOADING_STAGE: Stage = undefined
const REGISTERING_STAGE: Stage = {
  notifications: 'settings',
  transaction: 'pendingRegistration',
}
const SETUP_STAGE: Stage = {
  notifications: 'settings',
  transaction: 'settingPrimaryNameReverse',
}

const stageFor = (progress: number): Stage => {
  if (progress < LOADING_UNTIL) return LOADING_STAGE
  if (progress < SETUP_FROM) return REGISTERING_STAGE
  return SETUP_STAGE
}

const useLoopingProgress = () => {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((current) =>
        current >= 100 ? 0 : Math.min(100, current + PROGRESS_STEP),
      )
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [])

  return progress
}

const RegistrationFlowDemo = () => {
  const progress = useLoopingProgress()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-mono text-ens-gray text-xs tabular-nums">
        {progress.toFixed(1)}%
      </p>
      <RegisteringHeader
        fillProgress={progress}
        isRegistrationComplete={false}
        stageLabel="Setting primary name"
        uiStage={stageFor(progress)}
      />
    </div>
  )
}

const meta = {
  title: 'Features/Register v2/Registering header',
  component: RegisteringHeader,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-6xl bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    fillProgress: 42,
    isRegistrationComplete: false,
    stageLabel: 'Setting primary name',
    uiStage: REGISTERING_STAGE,
  },
  argTypes: {
    fillProgress: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
} satisfies Meta<typeof RegisteringHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {
  args: { fillProgress: 0, uiStage: LOADING_STAGE },
}

export const Registering: Story = {}

export const PostRegistrationSetup: Story = {
  args: { fillProgress: 90, uiStage: SETUP_STAGE },
}

export const Complete: Story = {
  args: { fillProgress: 100, isRegistrationComplete: true },
}

export const RegistrationFlow: Story = {
  parameters: { controls: { disable: true } },
  render: () => <RegistrationFlowDemo />,
}
