import type { RegistryRepairCall } from '@ens-apps/migration'
import { RegistryRepairPlanError } from '@ens-apps/migration'
import { err, ok } from 'neverthrow'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  computeRegistryUpdateSalt,
  getRegistryUpdateBlocker,
  getRegistryUpdateDetails,
  getRegistryUpdateFailure,
  getRegistryUpdateSteps,
  RegistryUpdateBlockedError,
  shouldStartFreshCopy,
} from './registryUpdate'

const calls = (count: number): readonly RegistryRepairCall[] =>
  Array.from({ length: count }, (_, i) => ({
    to: '0x0000000000000000000000000000000000000001',
    data: `0x${i.toString(16).padStart(2, '0')}`,
    value: 0n,
  }))

const shape = (canBatchAtomically: boolean, copy: number, final: number) =>
  getRegistryUpdateSteps({
    plan: { copyCalls: calls(copy), finalCalls: calls(final) },
    canBatchAtomically,
  }).map((step) => [step.kind, step.calls.length])

describe('getRegistryUpdateSteps', () => {
  it('bundles up to 10 calls per confirmation, finishing in their own steps after the copy', () => {
    expect(shape(true, 23, 2)).toEqual([
      ['copy', 10],
      ['copy', 10],
      ['copy', 3],
      ['finish', 2],
    ])
  })

  it('sends one call per confirmation when the wallet cannot batch', () => {
    expect(shape(false, 2, 1)).toEqual([
      ['copy', 1],
      ['copy', 1],
      ['finish', 1],
    ])
  })

  it('has only the finishing step once the copy is complete', () => {
    expect(shape(true, 0, 1)).toEqual([['finish', 1]])
  })
})

describe('getRegistryUpdateDetails', () => {
  const child = {
    label: 'kept',
    registry: '0x0000000000000000000000000000000000000002',
    action: 'leave',
  } as const

  it('lists expired names and the child registries that stay behind', () => {
    expect(
      getRegistryUpdateDetails({
        plan: { unmovedChildren: [child] },
        expiredLabels: ['old', 'older'],
      }),
    ).toEqual([
      { label: 'Expired, not copied', value: 'old, older' },
      { label: 'Subname registries left on the old parent', value: 'kept' },
    ])
  })

  it('adds nothing when everything carries over', () => {
    expect(
      getRegistryUpdateDetails({
        plan: { unmovedChildren: [] },
        expiredLabels: [],
      }),
    ).toEqual([])
  })
})

describe('getRegistryUpdateBlocker', () => {
  const REGISTRY = '0x0000000000000000000000000000000000000a01'
  const run = (
    overrides: Partial<Parameters<typeof getRegistryUpdateBlocker>[0]>,
  ) =>
    getRegistryUpdateBlocker({
      chainId: sepolia.id,
      implementation: '0x0822d199699f0a9D378617817a1439663234a126',
      registry: REGISTRY,
      currentSubregistry: REGISTRY,
      label: 'jooooe',
      canSwitch: true,
      ...overrides,
    })

  it.each([
    ['nothing in the way', {}, null],
    [
      'an outdated implementation to copy onto',
      { implementation: '0x9BD8a88719068D09ecee662f36C0E3856708366a' },
      'outdated-implementation',
    ],
    [
      'a name now pointing at another registry',
      { currentSubregistry: '0x0000000000000000000000000000000000000b02' },
      'registry-replaced',
    ],
    [
      'a label known only by its hash',
      { label: `[${'ab'.repeat(32)}]` },
      'unknown-label',
    ],
    [
      "an account that can't switch the name",
      { canSwitch: false },
      'cannot-switch',
    ],
  ] as const)('with %s: %s', (_case, overrides, expected) => {
    expect(run(overrides)).toBe(expected)
  })
})

describe('getRegistryUpdateFailure', () => {
  const blocked = (reason: RegistryUpdateBlockedError['reason']) =>
    new RegistryUpdateBlockedError({ reason })
  const refused = (reason: RegistryRepairPlanError['reason']) =>
    new RegistryRepairPlanError({ reason })

  it.each([
    ['missing root roles', refused('missing-root-roles'), 'missing-roles'],
    ['a role it cannot grant', refused('cannot-grant'), 'missing-roles'],
    ['no right to switch the name', blocked('cannot-switch'), 'missing-roles'],
    [
      'a name moved elsewhere',
      blocked('registry-replaced'),
      'registry-replaced',
    ],
    ['a hashed label', blocked('unknown-label'), 'unknown-label'],
    ['an outdated target', blocked('outdated-implementation'), 'unavailable'],
    ['too many attempts', blocked('too-many-attempts'), 'unavailable'],
    ['a failed read', new Error('rpc'), 'read-failed'],
  ] as const)('explains %s as %s', (_case, error, expected) => {
    expect(getRegistryUpdateFailure(error)).toBe(expected)
  })
})

describe('computeRegistryUpdateSalt', () => {
  // Pinned on purpose: a changed salt would lose every upgrade that stopped part way.
  it('keeps the salt an in-flight upgrade was deployed with', () => {
    expect(
      computeRegistryUpdateSalt(
        '0x0000000000000000000000000000000000000a01',
        0n,
      ).toString(16),
    ).toBe('c1c4db113f7554d388c2e4f251d755cdb3ea71f079e8f67655ea25d03b805018')
  })
})

describe('shouldStartFreshCopy', () => {
  it.each([
    [
      'a copy the original drifted from',
      err(new RegistryRepairPlanError({ reason: 'replacement-diverged' })),
      true,
    ],
    [
      'an account missing a role',
      err(new RegistryRepairPlanError({ reason: 'missing-root-roles' })),
      false,
    ],
    ['a copy that can resume', ok(null), false],
  ] as const)('for %s: %s', (_case, resumed, expected) => {
    expect(shouldStartFreshCopy(resumed)).toBe(expected)
  })
})
