/**
 * Seeds an offchain (CCIP-Read) name for MANUAL QA and serves its gateway
 * until interrupted.
 *
 *   pnpm --filter @ens-apps/e2e seed:offchain-name
 *
 * Registers `offchain-<ts>.eth` to `user` (Anvil account 0, the mock-wallet
 * account), points it at a fresh `TestOffchainResolver`, and serves records
 * for it and for `alice.<name>` (a wildcard subname with no owner). Keep the
 * process running while you look at the name; the resolver's gateway URL is
 * fixed to PORT, so restart with NAME=<name> to serve an existing name again.
 *
 *   PORT=8788           gateway port
 *   NAME=<name>         reuse a name seeded earlier instead of registering one
 *   MAX_URL_LENGTH=4000 500 on longer URLs, like Namespace's batch limit
 *   STATUS=429          answer every request with this status
 *
 * Run `pnpm e2e:infra:up` first.
 */
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeOffchainName,
  OFFCHAIN_RECORDS,
  OFFCHAIN_SUBNAME_RECORDS,
} from '../fixtures/offchainName.js'
import { createAccounts } from '../fixtures/playwright.manager.fixture.js'
import { startCcipGateway } from '../helpers/ccip-gateway.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

async function main() {
  const gateway = await startCcipGateway(Number(process.env.PORT ?? 8788))
  gateway.configure({
    maxUrlLength: process.env.MAX_URL_LENGTH
      ? Number(process.env.MAX_URL_LENGTH)
      : undefined,
    status: process.env.STATUS ? Number(process.env.STATUS) : undefined,
  })

  let name = process.env.NAME
  if (name) {
    gateway.setRecords(name, OFFCHAIN_RECORDS)
    gateway.setRecords(`alice.${name}`, OFFCHAIN_SUBNAME_RECORDS)
  } else {
    const owner = privateKeyToAccount(createAccounts().getPrivateKey('user'))
    ;({ name } = await createMakeOffchainName({
      gateway,
      userAccount: owner,
    })())
  }

  console.log(`
Gateway: ${gateway.url}
  manager  ${MANAGER_APP_URL}/${name}
           ${MANAGER_APP_URL}/alice.${name}
  portal   ${PORTAL_APP_URL}/${name}
           ${PORTAL_APP_URL}/alice.${name}
Serving until Ctrl-C; each request is logged below.`)

  let seen = 0
  setInterval(() => {
    for (const request of gateway.requests().slice(seen))
      console.log(
        `  ${request.status} ${request.method} ${request.isBatch ? 'batch' : 'single'} ` +
          `url=${request.urlLength} keys=${request.keys.length}`,
      )
    seen = gateway.requests().length
  }, 1_000)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
