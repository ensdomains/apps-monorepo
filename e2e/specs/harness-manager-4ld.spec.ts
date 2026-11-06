/**
 * Harness integrity gate for the V1 4LD fixture (`makeV1FourLD`), run only by
 * the migration config: it seeds four full trees owned by `user`, which every
 * other manager run (smoke included) has no use for.
 *
 * Rule 5: each tree's leaf owner and records are read back from chain. Rule 6:
 * bigname serves every level, the path the manager's upgrade list reads.
 */
import { makeV1FourLD } from '../fixtures/makeV1FourLD.js'
import { expect, test } from '../fixtures/playwright.manager.fixture.js'
import { isRealBigname, waitForBignameNames } from '../helpers/bigname-sync.js'
import { readRecords } from '../matrix/chain.js'

for (const shape of [
  { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry' },
  { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'unlocked' },
  { twoLd: 'unwrapped', threeLd: 'unlocked', fourLd: 'registry' },
  {
    twoLd: 'locked',
    threeLd: 'locked',
    fourLd: { type: 'locked', extraFuses: 4 },
  },
] as const) {
  test(`4LD fixture: ${shape.twoLd}/${shape.threeLd}/${typeof shape.fourLd === 'string' ? shape.fourLd : 'fused'}`, async ({
    accounts,
  }) => {
    test.skip(!isRealBigname, 'V1 trees require the real indexer')
    const tree = await makeV1FourLD(
      {
        ...shape,
        owners: { fourLd: 'user2' },
        records: { texts: [{ key: 'com.twitter', value: 'fourld-harness' }] },
      },
      accounts,
    )
    expect(tree.levels).toHaveLength(3)
    expect(tree.fourLd.owner.toLowerCase()).toBe(
      accounts.getAddress('user2').toLowerCase(),
    )
    expect(
      (await readRecords(tree.name, ['com.twitter'], [])).texts['com.twitter'],
    ).toBe('fourld-harness')
    await waitForBignameNames(tree.levels.map((level) => level.name))
  })
}
