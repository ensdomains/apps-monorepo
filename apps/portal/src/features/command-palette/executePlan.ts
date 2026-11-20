import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import type { ExecutionPlan, PaletteNavigation } from './executionPlan'
import {
  cancelPaletteHandoff,
  getPaletteHandoffNavigation,
  preparePaletteHandoff,
} from './handoff'

export class ExecutePaletteCommandError extends TaggedError(
  'ExecutePaletteCommandError',
)<{
  readonly cause: unknown
}> {}

export type ExecutionDependencies = {
  readonly navigate: (navigation: PaletteNavigation) => Promise<void>
  readonly isAtDestination: (navigation: PaletteNavigation) => boolean
  readonly chainId: number
  readonly account?: Address
  readonly writeClipboard: (value: string) => Promise<void>
  readonly openRpc: () => void
  readonly connect: () => void
  readonly disconnect: () => Promise<void>
  readonly openDeveloper: (
    tool: Extract<ExecutionPlan, { type: 'developer' }>['tool'],
  ) => void
}

const attempt = <T>(operation: () => Promise<T> | T) =>
  ResultAsync.fromPromise(
    Promise.resolve().then(operation),
    (cause) => new ExecutePaletteCommandError({ cause }),
  )

const navigate = ResultFn(async function* (
  navigation: PaletteNavigation,
  dependencies: ExecutionDependencies,
) {
  yield* attempt(() => dependencies.navigate(navigation))
  return dependencies.isAtDestination(navigation)
    ? ok(undefined)
    : err(
        new ExecutePaletteCommandError({
          cause: 'Navigation was canceled. Your task is still available.',
        }),
      )
})

const handoff = (
  plan: Extract<ExecutionPlan, { type: 'handoff' | 'expiring-names' }>,
  dependencies: ExecutionDependencies,
) => {
  const intent =
    plan.type === 'handoff'
      ? {
          kind: plan.kind,
          name: plan.name,
          chainId: dependencies.chainId,
          account: dependencies.account,
        }
      : {
          kind: 'expiring-names' as const,
          address: plan.address,
          chainId: dependencies.chainId,
          account: dependencies.account,
        }
  const requestId = preparePaletteHandoff(intent)
  const destination = getPaletteHandoffNavigation(intent)
  return navigate(destination, dependencies).orElse((error) => {
    cancelPaletteHandoff(requestId)
    return err(error)
  })
}

export const executePlan = (
  plan: ExecutionPlan,
  dependencies: ExecutionDependencies,
) =>
  match(plan)
    .with({ type: 'navigate' }, ({ navigation }) =>
      navigate(navigation, dependencies),
    )
    .with({ type: 'handoff' }, { type: 'expiring-names' }, (selected) =>
      handoff(selected, dependencies),
    )
    .with({ type: 'copy' }, ({ value }) =>
      attempt(() => dependencies.writeClipboard(value)).map(() => undefined),
    )
    .with({ type: 'rpc' }, () => attempt(dependencies.openRpc))
    .with({ type: 'connect' }, () => attempt(dependencies.connect))
    .with({ type: 'disconnect' }, () => attempt(dependencies.disconnect))
    .with({ type: 'developer' }, ({ tool }) =>
      attempt(() => dependencies.openDeveloper(tool)),
    )
    .exhaustive()

export const describeExecutionError = (
  error: ExecutePaletteCommandError,
): string =>
  typeof error.cause === 'string'
    ? error.cause
    : 'Could not open this action. Your target is unchanged; try again.'
