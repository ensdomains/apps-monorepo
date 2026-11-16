import { isAddressEqual } from 'viem'
import {
  assign,
  fromPromise,
  type StateValueFrom,
  setup,
  stateIn,
} from 'xstate'
import type { RegistryUpdatePlan } from '../queries/getRegistryUpdatePlan'
import {
  getRegistryUpdateFailure,
  getRegistryUpdateSteps,
  type RegistryUpdateFailure,
  type RegistryUpdateStep,
} from '../utils/registryUpdate'

/** The side effects the machine runs; the hook supplies them so the machine stays free of wallet and query code. */
export type RegistryUpgradeRuntime = {
  readonly plan: () => Promise<RegistryUpdatePlan>
  /** Resolves once the step is mined; rejects when it fails or is declined. */
  readonly sendStep: (step: RegistryUpdateStep, index: number) => Promise<void>
  readonly openFlow: () => void
  readonly closeFlow: () => void
  readonly finished: () => void
}

type Context = {
  readonly runtime: RegistryUpgradeRuntime
  readonly canBatchAtomically: boolean
  readonly plan: RegistryUpdatePlan | null
  readonly steps: readonly RegistryUpdateStep[]
  readonly index: number
  readonly failure: RegistryUpdateFailure | null
}

export type RegistryUpgradeEvent =
  | { readonly type: 'START'; readonly canBatchAtomically: boolean }
  | { readonly type: 'SEND' }
  | { readonly type: 'CANCEL' }

/** The plan the finishing steps came from no longer describes what is on chain. */
const isStalePlan = (context: Context, fresh: RegistryUpdatePlan) =>
  fresh.plan.copyCalls.length > 0 ||
  !context.plan ||
  !isAddressEqual(fresh.plan.replacement, context.plan.plan.replacement)

// A finishing step is only sent right after a fresh check, also when resumed or retried.
const SEND_CURRENT_STEP = [
  { guard: 'isCurrentFinishing', target: 'checking' },
  { target: 'sending' },
] as const

const START = {
  target: 'planning',
  actions: 'takeCapability',
} as const

/** Plan, wait for the user, send each step, and re-check the copy and the name before every finishing step. */
export const registryUpgradeMachine = setup({
  types: {
    context: {} as Context,
    events: {} as RegistryUpgradeEvent,
    tags: {} as 'startable' | 'inModal',
    input: {} as { readonly runtime: RegistryUpgradeRuntime },
  },
  actors: {
    plan: fromPromise<RegistryUpdatePlan, RegistryUpgradeRuntime>(({ input }) =>
      input.plan(),
    ),
    sendStep: fromPromise<
      void,
      {
        readonly runtime: RegistryUpgradeRuntime
        readonly step: RegistryUpdateStep | undefined
        readonly index: number
      }
    >(({ input }) =>
      input.step
        ? input.runtime.sendStep(input.step, input.index)
        : Promise.reject(new Error('No step to send')),
    ),
  },
  actions: {
    openFlow: ({ context }) => context.runtime.openFlow(),
    closeFlow: ({ context }) => context.runtime.closeFlow(),
    finished: ({ context }) => context.runtime.finished(),
    recordFailure: assign({
      failure: ({ event }) =>
        getRegistryUpdateFailure('error' in event ? event.error : undefined),
    }),
    takeCapability: assign({
      canBatchAtomically: ({ event }) =>
        event.type === 'START' ? event.canBatchAtomically : false,
      failure: null,
    }),
    nextStep: assign({ index: ({ context }) => context.index + 1 }),
  },
  guards: {
    isDetached: stateIn('#registryUpgrade.sending.detached'),
    isLastStep: ({ context }) => context.index >= context.steps.length - 1,
    isCurrentFinishing: ({ context }) =>
      context.steps[context.index]?.kind === 'finish',
    isNextFinishing: ({ context }) =>
      context.steps[context.index + 1]?.kind === 'finish',
  },
}).createMachine({
  id: 'registryUpgrade',
  context: ({ input }) => ({
    runtime: input.runtime,
    canBatchAtomically: false,
    plan: null,
    steps: [],
    index: 0,
    failure: null,
  }),
  initial: 'idle',
  states: {
    idle: { tags: 'startable', on: { START } },
    planFailed: { tags: 'startable', on: { START } },
    incomplete: { tags: 'startable', on: { START } },
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
        onError: { target: 'planFailed', actions: 'recordFailure' },
      },
    },
    ready: {
      tags: 'inModal',
      on: { SEND: SEND_CURRENT_STEP, CANCEL: 'idle' },
    },
    sending: {
      tags: 'inModal',
      initial: 'attached',
      states: {
        attached: { on: { CANCEL: 'detached' } },
        // The modal closed, but the wallet may still land this step; wait for it so a restart doesn't send it again.
        detached: {},
      },
      invoke: {
        src: 'sendStep',
        input: ({ context }) => ({
          runtime: context.runtime,
          step: context.steps[context.index],
          index: context.index,
        }),
        onDone: [
          { guard: 'isLastStep', target: 'done' },
          { guard: 'isDetached', target: 'incomplete' },
          {
            guard: 'isNextFinishing',
            target: 'checking',
            actions: 'nextStep',
          },
          { target: 'sending', reenter: true, actions: 'nextStep' },
        ],
        onError: [
          { guard: 'isDetached', target: 'idle' },
          { target: 'stepFailed' },
        ],
      },
    },
    stepFailed: {
      tags: 'inModal',
      on: { SEND: SEND_CURRENT_STEP, CANCEL: 'idle' },
    },
    checking: {
      tags: 'inModal',
      invoke: {
        src: 'plan',
        input: ({ context }) => context.runtime,
        onDone: [
          {
            guard: ({ context, event }) => isStalePlan(context, event.output),
            target: 'incomplete',
            actions: 'closeFlow',
          },
          {
            // Send the finishing steps as they stand now, not as first planned.
            target: 'sending',
            actions: assign(({ context, event }) => ({
              plan: event.output,
              steps: [
                ...context.steps.slice(0, context.index),
                ...getRegistryUpdateSteps({
                  plan: event.output.plan,
                  canBatchAtomically: context.canBatchAtomically,
                }),
              ],
            })),
          },
        ],
        onError: {
          target: 'planFailed',
          actions: ['recordFailure', 'closeFlow'],
        },
      },
      on: { CANCEL: 'idle' },
    },
    done: {
      entry: ['closeFlow', 'finished'],
      type: 'final',
    },
  },
})

export type RegistryUpgradeState = StateValueFrom<typeof registryUpgradeMachine>

/** The top-level state; only `sending` has substates. */
export type RegistryUpgradeStage =
  | Extract<RegistryUpgradeState, string>
  | 'sending'

export const toRegistryUpgradeStage = (
  state: RegistryUpgradeState,
): RegistryUpgradeStage => (typeof state === 'string' ? state : 'sending')
