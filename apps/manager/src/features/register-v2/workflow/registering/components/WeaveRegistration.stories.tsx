import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
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
