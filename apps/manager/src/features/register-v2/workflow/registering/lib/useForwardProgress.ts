import { useEffect, useRef, useState } from 'react'
import { REGISTRATION_STAGE_PROGRESS } from '../../../state/registration.stages'

const COOLDOWN_MACHINE = REGISTRATION_STAGE_PROGRESS.commitmentCooldown
const POST_COOLDOWN_MACHINE = REGISTRATION_STAGE_PROGRESS.validatingCommitment
const PRE_COOLDOWN_DISPLAY = 20
const POST_COOLDOWN_DISPLAY = 80

function remapToDisplay(machineProgress: number): number {
  const m = Math.max(0, Math.min(100, machineProgress))
  if (m <= COOLDOWN_MACHINE) {
    return (m / COOLDOWN_MACHINE) * PRE_COOLDOWN_DISPLAY
  }
  if (m >= POST_COOLDOWN_MACHINE) {
    return (
      POST_COOLDOWN_DISPLAY +
      ((m - POST_COOLDOWN_MACHINE) / (100 - POST_COOLDOWN_MACHINE)) *
        (100 - POST_COOLDOWN_DISPLAY)
    )
  }
  return (
    PRE_COOLDOWN_DISPLAY +
    ((m - COOLDOWN_MACHINE) / (POST_COOLDOWN_MACHINE - COOLDOWN_MACHINE)) *
      (POST_COOLDOWN_DISPLAY - PRE_COOLDOWN_DISPLAY)
  )
}

const MILESTONES = [
  ...new Set(Object.values(REGISTRATION_STAGE_PROGRESS)),
].sort((a, b) => a - b)

function nextMilestone(machineProgress: number): number {
  for (const m of MILESTONES) {
    if (m > machineProgress) return m
  }
  return 100
}

function displayCap(machineProgress: number): number {
  const current = remapToDisplay(machineProgress)
  const next = remapToDisplay(nextMilestone(machineProgress))
  return current + (next - current) * 0.85
}

const GAP_CLOSE_FRACTION_PER_SEC = 0.07
const MIN_SPEED_PCT_PER_SEC = 0.25
const MIN_SPEED_CHARS_PER_SEC = 0.04
const COMPLETE_RATE = 4
const COMPLETE_MIN_SPEED = 30

export interface ForwardProgress {
  progress: number
  fillDone: boolean
}

export function useForwardProgress(
  stageProgress: number,
  isComplete: boolean,
  nameLength: number,
  cooldownRemainingSeconds: number | null = null,
): ForwardProgress {
  const [displayed, setDisplayed] = useState(0)
  const displayedRef = useRef(0)
  const inputsRef = useRef({
    stageProgress,
    isComplete,
    nameLength,
    cooldownRemainingSeconds,
  })
  inputsRef.current = {
    stageProgress,
    isComplete,
    nameLength,
    cooldownRemainingSeconds,
  }

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      const {
        stageProgress: stage,
        isComplete: complete,
        nameLength: chars,
        cooldownRemainingSeconds: cooldownLeft,
      } = inputsRef.current
      const current = displayedRef.current
      let next = current

      const pctPerChar = 100 / Math.max(1, chars)
      const minSpeed = Math.max(
        MIN_SPEED_PCT_PER_SEC,
        MIN_SPEED_CHARS_PER_SEC * pctPerChar,
      )

      if (complete) {
        const speed = Math.max(
          (100 - current) * COMPLETE_RATE,
          COMPLETE_MIN_SPEED,
        )
        next = Math.min(100, current + speed * dt)
      } else if (cooldownLeft !== null && cooldownLeft > 0) {
        const target = POST_COOLDOWN_DISPLAY
        if (current < target) {
          const speed = Math.max(
            (target - current) / Math.max(cooldownLeft, 0.5),
            minSpeed,
          )
          next = Math.min(target, current + speed * dt)
        }
      } else {
        const target = displayCap(stage)
        if (current < target) {
          const speed = Math.max(
            (target - current) * GAP_CLOSE_FRACTION_PER_SEC,
            minSpeed,
          )
          next = Math.min(target, current + speed * dt)
        }
      }

      if (next !== current) {
        displayedRef.current = next
        setDisplayed(next)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return { progress: displayed, fillDone: isComplete && displayed >= 100 }
}
