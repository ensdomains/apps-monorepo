import { describe, expect, it } from 'vitest'
import { makeClassified, OTHER, OWNER } from './_fixtures'
import {
  getMigrationRecipientAddresses,
  getMigrationRecipientDelegate,
  isKnownIncompatibleMigrationDelegate,
} from './migrationRecipientPolicy'

describe('delegated migration recipient policy', () => {
  it('checks copied child owners as well as the migrating owner', () => {
    expect(
      getMigrationRecipientAddresses(
        [
          makeClassified(),
          makeClassified({ action: 'copy', tokenHolder: OTHER }),
          makeClassified({ action: 'copy', tokenHolder: OTHER }),
        ],
        OWNER,
      ),
    ).toEqual([OWNER, OTHER])
  })

  it.each([
    [undefined, null],
    ['0x', null],
    ['0x6000', null],
    [
      '0xef010000000000000000000000000000000000000000ab',
      '0x00000000000000000000000000000000000000AB',
    ],
    ['0xef0100ab', null],
  ] as const)(
    'reads a delegate only from a full designator: %s',
    (code, want) => {
      expect(getMigrationRecipientDelegate(code)).toBe(want)
    },
  )

  it.each([
    [null, true],
    [
      '0xc674c708ae140044638fdde55cb6f788595177ccc35c17083d1d7cc02640c241',
      true,
    ],
    [
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      false,
    ],
  ] as const)(
    'blocks only an empty or verified incompatible runtime: %s',
    (hash, want) => {
      expect(isKnownIncompatibleMigrationDelegate(hash)).toBe(want)
    },
  )
})
