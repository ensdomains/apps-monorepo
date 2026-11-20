import { zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  ALICE,
  ALL,
  BOB,
  CONTROLLER,
  HCA,
  makeName,
  makeState,
  SOME,
} from './registryRepair.testUtils'
import { compareRegistryRepair } from './registryRepairCompare'

describe('compareRegistryRepair', () => {
  it('finds nothing when the copy matches', () => {
    expect(compareRegistryRepair(makeState(), makeState())).toEqual([])
  })

  it('reports each field, role and name the copy lost', () => {
    const before = makeState({
      names: [makeName(), makeName({ label: 'bob', owner: BOB, roles: [] })],
    })
    const after = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: ALL }],
      names: [
        makeName({
          resolver: zeroAddress,
          roles: [{ account: ALICE, roleBitmap: SOME }],
        }),
      ],
    })

    expect(compareRegistryRepair(before, after)).toEqual([
      { kind: 'root-roles', account: HCA },
      { kind: 'name-field', label: 'alice', field: 'resolver' },
      { kind: 'name-roles', label: 'alice', account: ALICE },
      { kind: 'missing-name', label: 'bob' },
    ])
  })
})
