import type { RegistryRepairCall } from '@ens-apps/migration'
import { describe, expect, it } from 'vitest'
import { createActor, type StateValueFrom, waitFor } from 'xstate'
import type { RegistryUpdatePlan } from '../queries/getRegistryUpdatePlan'
import {
  type RegistryUpgradeRuntime,
  registryUpgradeMachine,
} from './registryUpgrade.machine'

type RegistryUpgradeState = StateValueFrom<typeof registryUpgradeMachine>

const calls = (count: number): readonly RegistryRepairCall[] =>
  Array.from({ length: count }, () => ({
    to: '0x0000000000000000000000000000000000000001',
    data: '0x01',
    value: 0n,
  }))

const planOf = (copy: number, final: number): RegistryUpdatePlan => ({
  plan: {
    replacement: '0x0000000000000000000000000000000000000002',
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
}: {
  readonly plans: readonly (RegistryUpdatePlan | Error)[]
  readonly failSendAt?: readonly number[]
  readonly canBatchAtomically?: boolean
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
      return next
    },
    sendStep: async (_step, index) => {
      log.push(`send ${index}`)
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
  const settle = (state: RegistryUpgradeState) =>
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
      plans: [planOf(1, 2), planOf(0, 2)],
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
    const { settle, start } = run({ plans: [new Error('rpc'), planOf(1, 1)] })

    start()
    await settle('planFailed')
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
