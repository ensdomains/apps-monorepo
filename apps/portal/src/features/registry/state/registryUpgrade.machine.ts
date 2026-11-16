import { assign, fromPromise, setup } from 'xstate'
import type { RegistryUpdatePlan } from '../queries/getRegistryUpdatePlan'
import {
  getRegistryUpdateSteps,
  type RegistryUpdateStep,
} from '../utils/registryUpdate'

/** The side effects the machine runs; the hook supplies them so the machine stays free of wallet and query code. */
export type RegistryUpgradeRuntime = {
  /** Reads both registries and the name, and plans what is left to send. */
  readonly plan: () => Promise<RegistryUpdatePlan>
  /** Signs one step and resolves once it is mined; rejects when it fails or is declined. */
  readonly sendStep: (step: RegistryUpdateStep, index: number) => Promise<void>
  /** Opens the transaction modal for a planned upgrade. */
  readonly openFlow: () => void
  /** Closes the modal and ends the attempt. */
  readonly closeFlow: () => void
  /** Refreshes what the page reads once the name has switched. */
  readonly finished: () => void
}

type Context = {
  readonly runtime: RegistryUpgradeRuntime
  readonly canBatchAtomically: boolean
  readonly plan: RegistryUpdatePlan | null
  readonly steps: readonly RegistryUpdateStep[]
  readonly index: number
}

export type RegistryUpgradeEvent =
  /** The card's button: plan the upgrade, or resume a stopped one. */
  | { readonly type: 'START' }
  /** The modal's "Open wallet" for the current step, or a retry after it failed. */
  | { readonly type: 'SEND' }
  /** The modal closed; the copy stays where it is and the next start resumes it. */
  | { readonly type: 'CANCEL' }

const isCopyComplete = (plan: RegistryUpdatePlan) =>
  plan.plan.copyCalls.length === 0

/** Plan, wait for the user, send each step, and re-check the copy and the name before every finishing step. */
export const registryUpgradeMachine = setup({
  types: {
    context: {} as Context,
    events: {} as RegistryUpgradeEvent,
    /** `startable`: the card's button can start or resume; `inModal`: the transaction modal shows the steps. */
    tags: {} as 'startable' | 'inModal',
    input: {} as {
      readonly runtime: RegistryUpgradeRuntime
      readonly canBatchAtomically: boolean
    },
  },
  actors: {
    plan: fromPromise<RegistryUpdatePlan, RegistryUpgradeRuntime>(({ input }) =>
      input.plan(),
    ),
    sendStep: fromPromise<
      void,
      {
        readonly runtime: RegistryUpgradeRuntime
        readonly step: RegistryUpdateStep
        readonly index: number
      }
    >(({ input }) => input.runtime.sendStep(input.step, input.index)),
  },
  actions: {
    openFlow: ({ context }) => context.runtime.openFlow(),
    closeFlow: ({ context }) => context.runtime.closeFlow(),
    finished: ({ context }) => context.runtime.finished(),
  },
  guards: {
    isLastStep: ({ context }) => context.index >= context.steps.length - 1,
    isNextFinishing: ({ context }) =>
      context.steps[context.index + 1]?.kind === 'finish',
  },
}).createMachine({
  id: 'registryUpgrade',
  context: ({ input }) => ({
    runtime: input.runtime,
    canBatchAtomically: input.canBatchAtomically,
    plan: null,
    steps: [],
    index: 0,
  }),
  initial: 'idle',
  states: {
    idle: { tags: 'startable', on: { START: 'planning' } },
    planFailed: { tags: 'startable', on: { START: 'planning' } },
    incomplete: { tags: 'startable', on: { START: 'planning' } },
    planning: {
      invoke: {
        src: 'plan',
        input: ({ context }) => context.runtime,
        onDone: {
          target: 'ready',
          actions: [
            assign(({ context, event }) => ({
              plan: event.output,
              steps: getRegistryUpdateSteps({
                plan: event.output.plan,
                canBatchAtomically: context.canBatchAtomically,
              }),
              index: 0,
            })),
            'openFlow',
          ],
        },
        onError: 'planFailed',
      },
    },
    ready: {
      tags: 'inModal',
      on: { SEND: 'sending', CANCEL: 'idle' },
    },
    sending: {
      tags: 'inModal',
      invoke: {
        src: 'sendStep',
        input: ({ context }) => ({
          runtime: context.runtime,
          step: context.steps[context.index] ?? { kind: 'copy', calls: [] },
          index: context.index,
        }),
        onDone: [
          { guard: 'isLastStep', target: 'done' },
          {
            guard: 'isNextFinishing',
            target: 'checking',
            actions: assign({ index: ({ context }) => context.index + 1 }),
          },
          {
            target: 'sending',
            reenter: true,
            actions: assign({ index: ({ context }) => context.index + 1 }),
          },
        ],
        onError: 'stepFailed',
      },
      on: { CANCEL: 'idle' },
    },
    stepFailed: {
      tags: 'inModal',
      on: { SEND: 'sending', CANCEL: 'idle' },
    },
    checking: {
      tags: 'inModal',
      invoke: {
        src: 'plan',
        input: ({ context }) => context.runtime,
        onDone: [
          {
            guard: ({ event }) => !isCopyComplete(event.output),
            target: 'incomplete',
            actions: 'closeFlow',
          },
          { target: 'sending' },
        ],
        onError: { target: 'planFailed', actions: 'closeFlow' },
      },
      on: { CANCEL: 'idle' },
    },
    done: {
      entry: ['closeFlow', 'finished'],
      type: 'final',
    },
  },
})
