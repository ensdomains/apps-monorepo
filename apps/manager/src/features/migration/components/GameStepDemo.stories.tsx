import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect, useState } from 'react'
import type {
  MigrationProgress,
  MigrationStepDescriptor,
} from '../service/migrationService'
import {
  FINAL_HOP_MS,
  REUNION_HOLD_MS,
  REUNION_SLIDE_MS,
} from '../state/migrationAnimationTiming'
import { GameStepView } from './GameStep'
import { GrainOverlay } from './GrainOverlay'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import { PublishedNftStory, publishedNftStoryOwner } from './PublishedNftStory'

const DEMO_HASH = `0x${'1'.repeat(64)}` as const

const useBridgeDemo = (totalSteps: number) => {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hidden, setHidden] = useState(false)
  const finalFrame = totalSteps * 3 + 2
  const complete = frame === finalFrame
  const reuniting = frame === finalFrame - 1

  useEffect(() => {
    if ((!playing && !reuniting) || complete) return
    const delay = reuniting
      ? REUNION_SLIDE_MS + REUNION_HOLD_MS
      : frame === finalFrame - 2
        ? FINAL_HOP_MS
        : frame === 0
          ? 3000
          : [3500, 2500, 1200][(frame - 1) % 3]
    const timer = window.setTimeout(() => setFrame((value) => value + 1), delay)
    return () => window.clearTimeout(timer)
  }, [playing, complete, reuniting, finalFrame, frame])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, textarea')
      )
        return
      switch (event.key.toLowerCase()) {
        case ' ':
          event.preventDefault()
          if (complete) setFrame(0)
          setPlaying((value) => complete || !value)
          break
        case 'n':
          setPlaying(false)
          setFrame((value) => Math.min(value + 1, finalFrame))
          break
        case 'r':
          setFrame(0)
          break
        case 'h':
          setHidden((value) => !value)
          break
        case 'escape':
          setHidden(false)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [complete, finalFrame])

  return {
    frame,
    setFrame,
    playing: playing && !complete,
    setPlaying,
    hidden,
    setHidden,
    finalFrame,
    complete,
    reuniting,
  }
}

const demoButtonClass =
  'min-h-11 rounded-full px-4 text-sm transition-colors hover:bg-ens-garnet-900/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ens-garnet-900 disabled:opacity-35 motion-reduce:transition-none'

const demoPhase = (
  complete: boolean,
  started: boolean,
  submitted: boolean,
  confirmed: boolean,
): string => {
  if (complete) return 'All transactions confirmed'
  if (!started) return 'Ready to play'
  if (confirmed) return 'Transaction succeeded · fill and hop'
  return submitted
    ? 'Transaction submitted · waiting for confirmation'
    : 'Wallet request open · waiting for approval'
}

const bridgeDemoPresentation = (
  totalSteps: number,
  demo: Pick<
    ReturnType<typeof useBridgeDemo>,
    'frame' | 'complete' | 'reuniting'
  >,
) => {
  const started = demo.frame > 0
  const submitted = started && !demo.complete && (demo.frame - 1) % 3 === 1
  const confirmed = started && !demo.complete && (demo.frame - 1) % 3 === 2
  const currentStep =
    demo.complete || demo.reuniting
      ? totalSteps
      : Math.max(0, Math.floor((demo.frame - 1) / 3)) + (confirmed ? 1 : 0)
  const descriptors: readonly MigrationStepDescriptor[] = Array.from(
    { length: totalSteps },
    (_, index) => ({
      type: 'atomic-batch',
      index,
      total: totalSteps,
      count: 47,
      migrateCount: 47,
      copyCount: 0,
    }),
  )
  const progress: MigrationProgress | undefined = started
    ? {
        currentStep,
        totalSteps,
        description: demo.complete ? 'Upgrade complete' : 'Upgrading 47 names',
        ...(submitted
          ? { txHash: DEMO_HASH, isAwaitingConfirmation: true }
          : {}),
      }
    : undefined
  const phase = demo.reuniting
    ? 'Sliding to center · then a 2-second pause'
    : demoPhase(demo.complete, started, submitted, confirmed)

  return { started, currentStep, descriptors, progress, phase }
}

const BridgeDemo = () => {
  const [totalSteps, setTotalSteps] = useState(4)
  const demo = useBridgeDemo(totalSteps)
  const { started, currentStep, descriptors, progress, phase } =
    bridgeDemoPresentation(totalSteps, demo)

  const reset = () => {
    demo.setPlaying(false)
    demo.setFrame(0)
  }

  return (
    <main className="relative h-dvh min-h-[700px] overflow-hidden bg-ens-garnet-100 text-ens-garnet-900">
      <GrainOverlay className="opacity-70" />
      <div
        className={
          demo.reuniting || demo.complete
            ? 'absolute inset-0'
            : 'absolute inset-0 -translate-y-10'
        }
      >
        <GameStepView
          hasCollapsed={false}
          isReuniting={demo.reuniting || demo.complete}
          progress={progress}
          selectedNameCount={47}
          stepDescriptors={descriptors}
        />
      </div>
      {demo.complete && (
        <PublishedNftStory ownerAddress={publishedNftStoryOwner}>
          {({ state, retry }) => (
            <MigrationSuccessDialog
              canMint={false}
              context="migration"
              migratedNameCount={47}
              onClose={reset}
              onMint={() => undefined}
              onOpenDashboard={reset}
              onRetry={retry}
              open
              state={state}
            />
          )}
        </PublishedNftStory>
      )}
      {!demo.hidden && (
        <>
          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="font-semi-mono text-xs uppercase tracking-widest">
                Bridge demo
              </p>
              <p className="mt-1 text-ens-garnet-900/60 text-sm">
                Real animation. Simulated transactions.
              </p>
            </div>
            <button
              className={demoButtonClass}
              onClick={() => demo.setHidden(true)}
              type="button"
            >
              Hide controls <span className="opacity-50">H</span>
            </button>
          </header>
          <section
            aria-label="Demo playback controls"
            className="absolute inset-x-4 bottom-5 z-20 mx-auto max-w-3xl rounded-2xl border border-ens-garnet-900/10 bg-ens-garnet-50/90 p-4 shadow-sm backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p aria-live="polite" className="text-sm">
                  {phase}
                </p>
                <p className="mt-1 font-semi-mono text-[10px] text-ens-garnet-900/50 uppercase tracking-wide">
                  {started
                    ? `Step ${Math.min(currentStep + 1, totalSteps)} of ${totalSteps}`
                    : 'Starts outside · hops after transaction success'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                Transactions
                <select
                  className="min-h-11 rounded-lg border border-ens-garnet-900/15 bg-transparent px-2"
                  onChange={(event) => {
                    reset()
                    setTotalSteps(Number(event.target.value))
                  }}
                  value={totalSteps}
                >
                  {[2, 4, 5, 6, 10].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-ens-garnet-900/10 border-t pt-3">
              <button
                className={`${demoButtonClass} bg-ens-garnet-900 text-ens-garnet-50 hover:bg-ens-garnet-800`}
                onClick={() => {
                  if (demo.complete) demo.setFrame(0)
                  demo.setPlaying(!demo.playing)
                }}
                type="button"
              >
                {demo.playing
                  ? 'Pause'
                  : demo.complete
                    ? 'Replay'
                    : 'Play demo'}
              </button>
              <button
                className={demoButtonClass}
                disabled={demo.complete}
                onClick={() => {
                  demo.setPlaying(false)
                  demo.setFrame((value) => Math.min(value + 1, demo.finalFrame))
                }}
                type="button"
              >
                Next phase
              </button>
              <button className={demoButtonClass} onClick={reset} type="button">
                Reset
              </button>
              <button
                className={`${demoButtonClass} ml-auto`}
                onClick={(event) => {
                  demo.setFrame(0)
                  demo.setPlaying(true)
                  demo.setHidden(true)
                  event.currentTarget.blur()
                }}
                type="button"
              >
                Play & hide controls
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

const meta = {
  title: 'Migration/Bridge Demo',
  component: BridgeDemo,
  parameters: { layout: 'fullscreen', controls: { disable: true } },
} satisfies Meta<typeof BridgeDemo>

export default meta
type Story = StoryObj<typeof meta>

export const Recording: Story = {}
