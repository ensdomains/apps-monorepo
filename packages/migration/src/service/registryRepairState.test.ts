import { keccak256, stringToHex, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  ALICE,
  BOB,
  CONTROLLER,
  makeName,
  SOME,
} from './registryRepair.testUtils'
import {
  explicitNameGrants,
  literalLabelId,
  nameGrantsOf,
  splitRepairNames,
  uniqueCandidates,
} from './registryRepairState'

describe('literalLabelId', () => {
  it('hashes a label shaped like an encoded labelhash as its literal text', () => {
    const label = `[${'ab'.repeat(32)}]`

    expect(literalLabelId(label)).toBe(BigInt(keccak256(stringToHex(label))))
  })
})

describe('splitRepairNames', () => {
  it('keeps owned, unexpired names and lists the expired or unregistered ones', () => {
    const live = makeName({ label: 'live', expiry: 101n })
    const { names, expiredLabels } = splitRepairNames(
      [
        live,
        makeName({ label: 'expired', expiry: 100n }),
        makeName({ label: 'unregistered', owner: zeroAddress, expiry: 50n }),
        makeName({ label: 'never', owner: zeroAddress, expiry: 0n }),
      ],
      100n,
    )

    expect(names).toEqual([live])
    expect(expiredLabels).toEqual(['expired', 'unregistered'])
  })
})

describe('explicitNameGrants', () => {
  const OWNER_ROLES = 0x1110n

  it("drops the owner's roles from an account the owner approved for all, keeping its own", () => {
    expect(
      explicitNameGrants({
        grants: [
          { account: ALICE, roleBitmap: OWNER_ROLES },
          { account: BOB, roleBitmap: OWNER_ROLES | 0x1n },
          { account: CONTROLLER, roleBitmap: OWNER_ROLES },
        ],
        owner: ALICE,
        approvedAccounts: [BOB, CONTROLLER],
      }),
    ).toEqual([
      { account: ALICE, roleBitmap: OWNER_ROLES },
      { account: BOB, roleBitmap: 0x1n },
    ])
  })

  it('keeps the roles of an account the owner did not approve', () => {
    const grants = [
      { account: ALICE, roleBitmap: OWNER_ROLES },
      { account: BOB, roleBitmap: SOME },
    ]

    expect(
      explicitNameGrants({ grants, owner: ALICE, approvedAccounts: [] }),
    ).toEqual(grants)
  })
})

describe('uniqueCandidates', () => {
  it('keeps each label once and each account once, whatever its case', () => {
    expect(
      uniqueCandidates({
        labels: ['a', 'b', 'a'],
        accounts: [BOB, ALICE, BOB.toLowerCase() as typeof BOB],
      }),
    ).toEqual({ labels: ['a', 'b'], accounts: [BOB, ALICE] })
  })
})

describe('nameGrantsOf', () => {
  it("gives each name its own accounts' roles from the flat read", () => {
    expect(nameGrantsOf([ALICE, BOB], [0x1n, 0n, 0x2n, 0x3n], 2)).toEqual([
      [{ account: ALICE, roleBitmap: 0x1n }],
      [
        { account: ALICE, roleBitmap: 0x2n },
        { account: BOB, roleBitmap: 0x3n },
      ],
    ])
  })
})
