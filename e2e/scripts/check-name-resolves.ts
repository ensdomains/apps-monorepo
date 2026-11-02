/**
 * Does a name resolve on the local fork? Reads the `description` text record
 * and the ETH address through the UniversalResolver — the same path wallets
 * and the e2e suite use — for each name given.
 *
 *   npx tsx scripts/check-name-resolves.ts sub.m3-locked-reg-1792003789.eth …
 *
 * Pairs with `seed-subname-grid.ts`, whose subnames all carry both records:
 * run it before and after an upgrade to see whether a subname survived.
 */
import type { V1Records } from '../fixtures/v1-records.js'
import { resolveRecords, resolverFor } from '../helpers/resolve-records.js'

const PROBE: V1Records = {
  texts: [{ key: 'description', value: '' }],
  addresses: [{ coinType: 60, value: '0x' }],
}

async function main() {
  const names = process.argv.slice(2)
  if (names.length === 0)
    throw new Error('usage: check-name-resolves.ts <name> [<name> …]')
  for (const name of names) {
    const resolver = await resolverFor(name).catch(
      (error: Error) => `none (${error.message.split('\n')[0]})`,
    )
    const read = await resolveRecords(name, PROBE)
    console.log(`\n${name}\n  resolver: ${resolver}`)
    for (const { what, got } of read)
      console.log(`  ${what}: ${got === '' || got === '0x' ? '(empty)' : got}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
