/**
 * Seed one V1 name per subname-migration case, for manual testing of
 * /upgrade on the local stack (real bigname). Everything is owned by Anvil
 * account 0 — the manager's mock wallet (`VITE_USE_MOCK_WALLET=true`).
 *
 *   npx tsx scripts/seed-subname-grid.ts
 *
 * Each subname carries a text record (`description`) and an ETH address, so
 * resolution can be checked before and after an upgrade. Prints a table of
 * what was made and what the upgrade should do with it (scenario ids from
 * docs/e2e-test-catalogue.md, defects from docs/e2e-defects.md).
 */
import { privateKeyToAccount } from 'viem/accounts'

import { createMakeV1Name } from '../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../fixtures/makeV1RegistrySubname.js'
import {
  CHILD_FUSES,
  makeV1Subname,
  wrapAndEmancipateRegistryChild,
  wrapV1SubnameOfUnwrapped,
} from '../fixtures/makeV1Subname.js'
import { setV1RecordsOn, type V1Records } from '../fixtures/v1-records.js'
import { testClient } from '../helpers/anvil-client.js'
import { waitForBignameBlock } from '../helpers/bigname-sync.js'

const owner = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)
const makeV1Name = createMakeV1Name({ userAccount: owner })
const records = (what: string): V1Records => ({
  texts: [{ key: 'description', value: what }],
  addresses: [{ coinType: 60, value: owner.address }],
})

type Row = { case: string; parent: string; sub: string; expect: string }
const rows: Row[] = []

/** A registry-only `sub` under a fresh parent of `type`, made before any wrap. */
async function registryChild(
  label: string,
  type: 'unwrapped' | 'wrapped' | 'locked',
  childLabel = 'sub',
  seedLabel = true,
) {
  let sub = ''
  const create = async (ethName: string) => {
    sub = await makeV1RegistrySubname({
      parentName: ethName.replace(/\.eth$/, ''),
      childLabel,
      ownerAddress: owner.address,
      parentOwnerAccount: owner,
      seedLabel,
    })
  }
  const parent = await makeV1Name({ label, type, beforeWrap: create })
  if (type === 'unwrapped') await create(parent)
  return { parent, sub }
}

async function main() {
  // Account 0 carries leftover contract code on the Sepolia fork, which makes
  // the NameWrapper's ERC-1155 receiver check revert. Clear it, as the test
  // fixtures do (`playwright.manager.fixture.ts`).
  await testClient.setCode({ address: owner.address, bytecode: '0x' })

  // 1. Unwrapped parent, registry-only sub — copied (GS4).
  {
    const { parent, sub } = await registryChild('m1-unwrapped-reg', 'unwrapped')
    await setV1RecordsOn(sub, owner, false, records('case 1'))
    rows.push({
      case: '1 unwrapped parent / unwrapped sub',
      parent,
      sub,
      expect: 'sub listed under parent; copied; still resolves (GS4)',
    })
  }
  // 2. Unlocked wrapped parent, registry-only sub — copied (GS19).
  {
    const { parent, sub } = await registryChild('m2-wrapped-reg', 'wrapped')
    await setV1RecordsOn(sub, owner, false, records('case 2'))
    rows.push({
      case: '2 unlocked wrapped parent / unwrapped sub',
      parent,
      sub,
      expect: 'sub listed under parent; copied; still resolves (GS19)',
    })
  }
  // 3. Locked parent, registry-only sub — hidden, then stops resolving.
  {
    const { parent, sub } = await registryChild('m3-locked-reg', 'locked')
    await setV1RecordsOn(sub, owner, false, records('case 3'))
    rows.push({
      case: '3 locked parent / unwrapped sub',
      parent,
      sub,
      expect:
        'BUG E2E-031: sub not shown; after upgrading the parent the sub stops resolving',
    })
  }
  // 4. Case 3, wrapped and emancipated first — follows the parent (GS22).
  {
    const { parent, sub } = await registryChild('m4-locked-freed', 'locked')
    await setV1RecordsOn(sub, owner, false, records('case 4'))
    await wrapAndEmancipateRegistryChild({
      parentName: parent,
      childLabel: 'sub',
      parentOwnerAccount: owner,
      ownerAccount: owner,
    })
    rows.push({
      case: '4 locked parent / sub wrapped + emancipated',
      parent,
      sub,
      expect: 'sub listed under parent; moves into its WrapperRegistry (GS22)',
    })
  }
  // 5. Unwrapped parent, registry-only sub whose label bigname never learns.
  {
    const hidden = `hidden${Date.now().toString(36)}`
    const { parent, sub } = await registryChild(
      'm5-unknown-label',
      'unwrapped',
      hidden,
      false,
    )
    await setV1RecordsOn(sub, owner, false, records('case 5'))
    rows.push({
      case: '5 unwrapped parent / sub with unknown label',
      parent,
      sub,
      expect: `BUG E2E-032: sub not shown (index sees [hash].${parent})`,
    })
  }
  // 6. Unwrapped parent, sub wrapped with NameWrapper.wrap (no expiry).
  {
    const parent = await makeV1Name({ label: 'm6-unwrapped-wrapsub' })
    const sub = await wrapV1SubnameOfUnwrapped({
      parentLabel: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      parentOwnerAccount: owner,
      ownerAccount: owner,
    })
    await setV1RecordsOn(sub, owner, true, records('case 6'))
    rows.push({
      case: '6 unwrapped parent / wrapped sub',
      parent,
      sub,
      expect: 'BUG E2E-025: sub not shown; parent migrates without it',
    })
  }
  // 7. Unlocked wrapped parent, wrapped sub — copied (GS3).
  {
    const parent = await makeV1Name({
      label: 'm7-wrapped-wrapsub',
      type: 'wrapped',
    })
    const sub = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: owner.address,
      parentOwnerAccount: owner,
      fuses: CHILD_FUSES.UNLOCKED_CHILD,
    })
    await setV1RecordsOn(sub, owner, true, records('case 7'))
    rows.push({
      case: '7 unlocked wrapped parent / wrapped sub',
      parent,
      sub,
      expect: 'sub listed under parent; copied with its wrapper expiry (GS3)',
    })
  }
  // 8. Locked parent, locked sub — token migration (GS1).
  {
    const parent = await makeV1Name({
      label: 'm8-locked-locksub',
      type: 'locked',
    })
    const sub = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: owner.address,
      parentOwnerAccount: owner,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })
    await setV1RecordsOn(sub, owner, true, records('case 8'))
    rows.push({
      case: '8 locked parent / locked sub',
      parent,
      sub,
      expect:
        'both listed; parent first, sub gets its own WrapperRegistry (GS1)',
    })
  }

  await waitForBignameBlock()
  console.log('\nSeeded for the mock wallet', owner.address, '\n')
  console.table(rows)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
