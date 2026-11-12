/**
 * Seeds names for manual QA of the WEB-446 transfer flow, and prints the
 * portal URLs to open.
 *
 *   npx tsx scripts/seed-transfer-names.ts
 *
 * Creates one migrated name per V1 token type, all owned by the `user`
 * account (Anvil mnemonic index 0) — the account the portal e2e fixture
 * connects as.
 */

import { createMakeMigratedName } from '../fixtures/makeMigratedName.js'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

async function main() {
  const accounts = createAccounts()
  const makeMigratedName = createMakeMigratedName({ accounts })

  console.log(`owner (user):  ${accounts.getAddress('user')}`)
  console.log(`recipient (user2): ${accounts.getAddress('user2')}\n`)

  for (const type of ['unwrapped', 'unlocked', 'locked'] as const) {
    const name = await makeMigratedName({ label: `qa-${type}`, type })
    console.log(
      `  ${type.padEnd(10)} ${PORTAL_APP_URL}/${name}/ownership/transfer`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
