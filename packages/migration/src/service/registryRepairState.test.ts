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
  explicitGrantsAt,
  literalLabelId,
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

describe('explicitGrantsAt', () => {
  const RESOURCE = 7n
  const change = (
    account: typeof ALICE,
    roleBitmap: bigint,
    resource = RESOURCE,
  ) => ({
    resource,
    account,
    roleBitmap,
  })

  it("keeps an operator's own grant even where it overlaps the owner's roles", () => {
    expect(
      explicitGrantsAt(
        [change(ALICE, 0x1110n), change(BOB, 0x0100n)],
        RESOURCE,
      ),
    ).toEqual([
      { account: ALICE, roleBitmap: 0x1110n },
      { account: BOB, roleBitmap: 0x0100n },
    ])
  })

  it('takes the last write per account, drops revoked ones, and ignores other resources', () => {
    expect(
      explicitGrantsAt(
        [
          change(ALICE, 0x1n),
          change(BOB, SOME),
          change(CONTROLLER, 0x1n, 8n),
          change(ALICE, 0x11n),
          change(BOB.toLowerCase() as typeof BOB, 0n),
        ],
        RESOURCE,
      ),
    ).toEqual([{ account: ALICE, roleBitmap: 0x11n }])
  })

  it('has nothing for a name whose resource was not read', () => {
    expect(explicitGrantsAt([change(ALICE, 0x1n)], undefined)).toEqual([])
  })
})

describe('uniqueCandidates', () => {
  it('keeps each label once and each account once, whatever its case', () => {
    expect(
      uniqueCandidates({
        labels: ['a', 'b', 'a'],
        accounts: [BOB, ALICE, BOB.toLowerCase() as typeof BOB],
        roleChanges: [],
      }),
    ).toEqual({ labels: ['a', 'b'], accounts: [BOB, ALICE], roleChanges: [] })
  })
})
