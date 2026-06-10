import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect, useRef, useState } from 'react'
import { WeaveProgressBar } from './WeaveProgressBar'

const meta = {
  title: 'Components/WeaveLoader/WeaveProgressBar',
  component: WeaveProgressBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    height: { control: { type: 'range', min: 4, max: 40, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
  args: {
    progress: 0.5,
    height: 12,
  },
} satisfies Meta<typeof WeaveProgressBar>

export default meta
type Story = StoryObj<typeof meta>

/** Half-filled weave bar. */
export const Default: Story = {}

/** Empty. */
export const Empty: Story = {
  args: { progress: 0 },
}

/** Full. */
export const Full: Story = {
  args: { progress: 1 },
}

/** Animated fill ramping 0→1 then restarting. */
export const Animated: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(0)
    const startRef = useRef<number | null>(null)
    useEffect(() => {
      const DURATION = 6000
      let raf = 0
      const tick = (now: number) => {
        if (startRef.current === null) startRef.current = now
        setProgress(((now - startRef.current) % DURATION) / DURATION)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [])
    return <WeaveProgressBar {...args} progress={progress} />
  },
}
