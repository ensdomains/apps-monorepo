export interface WeaveStep {
  label: string
  end: number
}

export const WEAVE_STEPS: WeaveStep[] = [
  { label: 'Reserving your name', end: 0.16 },
  { label: 'Carving your name into the blockchain', end: 0.32 },
  { label: 'Making your name work everywhere', end: 0.48 },
  { label: 'Planting your name in the infinite garden', end: 0.62 },
  { label: 'Farming aura', end: 0.76 },
  { label: 'Growing your corner of the decentralized web', end: 0.9 },
  { label: 'Placing your new identity in your wallet', end: 1 },
]

export function stepIndexForProgress(
  progress: number,
  steps: WeaveStep[] = WEAVE_STEPS,
): number {
  const p = Math.max(0, Math.min(1, progress))
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step && p <= step.end) return i
  }
  return steps.length - 1
}

export function stepLabelForProgress(
  progress: number,
  steps: WeaveStep[] = WEAVE_STEPS,
): string {
  return steps[stepIndexForProgress(progress, steps)]?.label ?? ''
}
