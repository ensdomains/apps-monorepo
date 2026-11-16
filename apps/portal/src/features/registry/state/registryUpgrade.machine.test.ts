import type { RegistryRepairCall } from '@ens-apps/migration'
import { describe, expect, it } from 'vitest'
import { createActor, waitFor } from 'xstate'
import type { RegistryUpdatePlan } from '../queries/getRegistryUpdatePlan'
import {
  type RegistryUpgradeRuntime,
  type RegistryUpgradeStage,
  registryUpgradeMachine,
} from './registryUpgrade.machine'

const calls = (count: number): readonly RegistryRepairCall[] =>
  Array.from({ length: count }, () => ({
    to: '0x0000000000000000000000000000000000000001',
    data: '0x01',
    value: 0n,
  }))

const planOf = (
  copy: number,
  final: number,
  replacement: `0x${string}` = '0x0000000000000000000000000000000000000002',
): RegistryUpdatePlan => ({
  plan: {
    replacement,
    copyCalls: calls(copy),
    finalCalls: calls(final),
    unmovedChildren: [],
  },
  expiredLabels: [],
  salt: 1n,
})

/** A runtime that answers plans in order and records what the machine did. */
const run = ({
  plans,
  failSendAt = [],
  canBatchAtomically = true,
  holdSendAt,
}: {
  readonly plans: readonly (
    | RegistryUpdatePlan
    | Error
    | Promise<RegistryUpdatePlan>
  )[]
  readonly failSendAt?: readonly number[]
  readonly canBatchAtomically?: boolean
  /** Holds one step open until `until` settles, as a wallet does while it mines. */
  readonly holdSendAt?: {
    readonly index: number
    readonly until: Promise<void>
  }
}) => {
  const log: string[] = []
  const failures = [...failSendAt]
  let planCalls = 0
  const runtime: RegistryUpgradeRuntime = {
    plan: async () => {
      const next = plans[Math.min(planCalls, plans.length - 1)]
      planCalls += 1
      log.push('plan')
      if (!next || next instanceof Error) throw next ?? new Error('no plan')
      return await next
    },
    sendStep: async (_step, index) => {
      log.push(`send ${index}`)
      if (holdSendAt?.index === index) await holdSendAt.until
      if (failures[0] === index) {
        failures.shift()
        throw new Error('declined')
      }
    },
    openFlow: () => log.push('open'),
    closeFlow: () => log.push('close'),
    finished: () => log.push('finished'),
  }
  const actor = createActor(registryUpgradeMachine, {
    input: { runtime },
  }).start()
  const start = () => actor.send({ type: 'START', canBatchAtomically })
  const settle = (state: RegistryUpgradeStage) =>
    waitFor(actor, (snapshot) => snapshot.matches(state))
  return { actor, log, settle, start }
}

describe('registryUpgradeMachine', () => {
  it('copies, re-checks, then switches, and closes once the name has moved', async () => {
    const { actor, log, settle, start } = run({
      plans: [planOf(3, 1), planOf(0, 1)],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log).toEqual([
      'plan',
      'open',
      'send 0',
      'plan',
      'send 1',
      'close',
      'finished',
    ])
  })

  it('re-checks before every finishing step, not just the first', async () => {
    const { actor, log, settle, start } = run({
      plans: [planOf(1, 2), planOf(0, 2), planOf(0, 1)],
      canBatchAtomically: false,
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log.filter((entry) => entry !== 'open')).toEqual([
      'plan',
      'send 0',
      'plan',
      'send 1',
      'plan',
      'send 2',
      'close',
      'finished',
    ])
  })

  it("stops before the switch when the re-check finds the copy isn't whole", async () => {
    const { actor, log, settle, start } = run({
      plans: [planOf(2, 1), planOf(1, 1)],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('incomplete')

    expect(log).not.toContain('send 1')
    expect(log.at(-1)).toBe('close')
  })

  it('stops before the switch when the re-check fails', async () => {
    const { actor, log, settle, start } = run({
      plans: [planOf(1, 1), new Error('registry-replaced')],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('planFailed')

    expect(log).not.toContain('send 1')
  })

  it('retries a declined step on the next SEND and ignores a second SEND while one is in flight', async () => {
    const { actor, log, settle, start } = run({
      plans: [planOf(1, 1), planOf(0, 1)],
      failSendAt: [0],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('stepFailed')
    actor.send({ type: 'SEND' })
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log.filter((entry) => entry === 'send 0')).toHaveLength(2)
    expect(log.filter((entry) => entry === 'send 1')).toHaveLength(1)
  })

  it('reports a plan that could not be built, and plans again on the next start', async () => {
    const { actor, settle, start } = run({
      plans: [new Error('rpc'), planOf(1, 1)],
    })

    start()
    await settle('planFailed')
    expect(actor.getSnapshot().context.failure).toBe('read-failed')
    start()

    await settle('ready')
  })
})

describe('registryUpgradeMachine, batching', () => {
  it('splits the steps by the batching support given at each start, not at mount', async () => {
    const { actor, log, settle } = run({
      plans: [new Error('rpc'), planOf(2, 1), planOf(0, 1)],
    })

    actor.send({ type: 'START', canBatchAtomically: true })
    await settle('planFailed')
    actor.send({ type: 'START', canBatchAtomically: false })
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log.filter((entry) => entry.startsWith('send'))).toEqual([
      'send 0',
      'send 1',
      'send 2',
    ])
  })
})

describe('registryUpgradeMachine, closing the modal', () => {
  const held = () => {
    const outcome = { land: () => {}, fail: () => {} }
    const until = new Promise<void>((resolve, reject) => {
      outcome.land = resolve
      outcome.fail = () => reject(new Error('reverted'))
    })
    return { until, outcome }
  }

  it('waits for a step still in flight, then offers to continue without sending it again', async () => {
    const { until, outcome } = held()
    const { actor, log, settle, start } = run({
      plans: [planOf(1, 1)],
      holdSendAt: { index: 0, until },
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    actor.send({ type: 'CANCEL' })
    start()
    expect(actor.getSnapshot().matches('sending')).toBe(true)
    outcome.land()
    await settle('incomplete')

    expect(log.filter((entry) => entry.startsWith('send'))).toEqual(['send 0'])
  })

  it('lets the user start again once a step in flight fails after the modal closed', async () => {
    const { until, outcome } = held()
    const { actor, settle, start } = run({
      plans: [planOf(1, 1)],
      holdSendAt: { index: 0, until },
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    actor.send({ type: 'CANCEL' })
    outcome.fail()
    await settle('idle')

    expect(actor.getSnapshot().hasTag('startable')).toBe(true)
  })

  it('finishes and refreshes when the switch lands after the modal closed', async () => {
    const { until, outcome } = held()
    const { actor, log, settle, start } = run({
      plans: [planOf(0, 1)],
      holdSendAt: { index: 0, until },
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('sending')
    actor.send({ type: 'CANCEL' })
    outcome.land()
    await settle('done')

    expect(log).toContain('finished')
  })

  it("doesn't switch when the modal closes during the check before it", async () => {
    const check = { answer: (_plan: RegistryUpdatePlan) => {} }
    const checked = new Promise<RegistryUpdatePlan>((resolve) => {
      check.answer = resolve
    })
    const { actor, log, settle, start } = run({
      plans: [planOf(0, 1), checked],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('checking')
    actor.send({ type: 'CANCEL' })
    check.answer(planOf(0, 1))
    await settle('idle')

    expect(log.filter((entry) => entry.startsWith('send'))).toEqual([])
  })
})

describe('registryUpgradeMachine, a stale check', () => {
  it('stops instead of switching when another attempt has replaced the copy being finished', async () => {
    const { actor, log, settle, start } = run({
      plans: [
        planOf(0, 1),
        planOf(0, 1, '0x0000000000000000000000000000000000000003'),
      ],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('incomplete')

    expect(log.filter((entry) => entry.startsWith('send'))).toEqual([])
  })
})

describe('registryUpgradeMachine, finishing steps', () => {
  it('re-checks before a resume whose first step is the switch', async () => {
    const { log, settle, start, actor } = run({ plans: [planOf(0, 1)] })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log).toEqual(['plan', 'open', 'plan', 'send 0', 'close', 'finished'])
  })

  it('re-checks before retrying a switch that failed', async () => {
    const { log, settle, start, actor } = run({
      plans: [planOf(1, 1), planOf(0, 1)],
      failSendAt: [1],
    })

    start()
    await settle('ready')
    actor.send({ type: 'SEND' })
    await settle('stepFailed')
    actor.send({ type: 'SEND' })
    await settle('done')

    expect(log.filter((entry) => entry !== 'open')).toEqual([
      'plan',
      'send 0',
      'plan',
      'send 1',
      'plan',
      'send 1',
      'close',
      'finished',
    ])
  })
})
