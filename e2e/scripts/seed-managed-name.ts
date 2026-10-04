/**
 * Seed a **managed-only** V2 name for MANUAL testing of the address-profile
 * "Managed" filter (PR #964).
 *
 * A managed-only name is one the connected wallet does NOT own but holds a
 * registry grant on — it surfaces in bigname's
 * `GET /v1/addresses/{address}/names?relation=any&include=role_summary` as an
 * ENSv2 row whose `role_summary` lists the wallet, and the profile classifies
 * it `managed`. There is no way to produce this from the in-app Dev Tools
 * drawer (no second wallet), so this script does it headlessly:
 *
 *   1. Register a fresh .eth name owned by a SEPARATE account (mnemonic #1),
 *      NOT the connected wallet — reusing the same makeV2Name flow as the
 *      e2e suite.
 *   2. From that owner, grant a per-name role (ROLE_SET_RESOLVER + ROLE_RENEW)
 *      to the connected wallet (mnemonic #0 = 0xf39…2266 by default).
 *   3. Poll bigname until it has indexed past the grant's block and lists the
 *      grant under `GET /v1/permissions?name=&address=`.
 *
 * After this, opening the connected wallet's address profile and switching to
 * the "Managed" chip should show the name.
 *
 * Prereqs:
 *   - Local stack up:  pnpm --filter @ens-apps/e2e infra:up
 *   - ANVIL_RPC_URL points at it (default http://127.0.0.1:8545)
 *   - BIGNAME_API_URL points at a bigname that indexes that chain. The public
 *     Sepolia deployment (the default) never sees fork transactions, so
 *     against it the grant lands on-chain but never shows as indexed.
 *
 * Usage:
 *   pnpm --filter @ens-apps/e2e seed:managed-name
 *   LABEL=mymanaged pnpm --filter @ens-apps/e2e seed:managed-name
 *   MANAGER_ADDRESS=0x… pnpm --filter @ens-apps/e2e seed:managed-name   # override the "connected" wallet
 *   ROLES='ROLE_RENEW' pnpm --filter @ens-apps/e2e seed:managed-name    # semicolon/comma list of ensjs role names
 *   BIGNAME_API_URL=http://127.0.0.1:8080 pnpm --filter @ens-apps/e2e seed:managed-name
 */
import { pathToFileURL } from 'node:url'
import { createBignameClient } from '@ens-apps/bigname'
import { NETWORKS } from '@ens-apps/config'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId, type Role } from '@ensdomains/ensjs/utils/v2'
import { grantRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { type Address, encodeFunctionData } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createMakeV2Name } from '../fixtures/makeV2Name.js'
import { publicClient, walletClient } from '../helpers/anvil-client.js'

const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk'

/**
 * The registry that holds `.eth` 2LD tokens on this fork — the same
 * `ensRegistry` address makeV2Name reads expiry from, and where the name's
 * owner holds the per-name admin roles required to grant. (This IS the .eth
 * PermissionedRegistry in the v2 contract set; the name is NOT in the
 * standalone ETH registry 0x796fff2e — the owner holds no roles there.)
 */
const ETH_REGISTRY = (process.env.REGISTRY_ADDRESS ??
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address) as Address

const bigname = createBignameClient({
  baseUrl:
    process.env.BIGNAME_API_URL ||
    process.env.VITE_BIGNAME_API_URL ||
    NETWORKS.sepolia.endpoints.bignameApi,
})

/**
 * ensjs role names granted to the manager. Must be roles the NAME OWNER holds
 * the *_ADMIN for — at registration the owner receives admin over
 * ROLE_SET_RESOLVER and ROLE_SET_SUBREGISTRY (but NOT ROLE_RENEW), so granting
 * ROLE_RENEW reverts with EACCannotGrantRoles. getManagedOnlyRoleNames only
 * needs a non-zero bitmap, so these suffice to classify the name as managed.
 */
const DEFAULT_ROLES: Role[] = ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY']

function parseRoles(raw: string | undefined): Role[] {
  const trimmed = raw?.trim()
  if (!trimmed) return DEFAULT_ROLES
  return trimmed
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean) as Role[]
}

/** Whether bigname lists a grant with any power for `account` on `name`. */
async function hasIndexedGrant(account: Address, name: string) {
  const { data } = await bigname.listPermissions({
    name,
    address: account.toLowerCase(),
  })
  return data.some((row) => row.powers.length > 0)
}

/**
 * Poll bigname until it has indexed the grant's block (`GET /v1/status`
 * `chains[chainId].indexed_block`) and lists the grant
 * (`GET /v1/permissions?name=&address=`).
 */
async function waitForIndexedGrant(
  account: Address,
  name: string,
  grantBlock: bigint,
  timeoutMs = 60_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const chainKey = String(sepolia.id)
  while (Date.now() < deadline) {
    try {
      const { data: status } = await bigname.getStatus()
      const indexedBlock = status.chains[chainKey]?.indexed_block ?? null
      if (
        indexedBlock !== null &&
        BigInt(indexedBlock) >= grantBlock &&
        (await hasIndexedGrant(account, name))
      ) {
        return true
      }
    } catch {
      /* bigname not ready yet */
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

async function main() {
  const label = process.env.LABEL ?? 'managed'
  const roles = parseRoles(process.env.ROLES)

  // Connected manager wallet (mnemonic #0 = 0xf39…2266) — the grantee.
  const managerAddress = (process.env.MANAGER_ADDRESS ??
    mnemonicToAccount(DEFAULT_MNEMONIC, { addressIndex: 0 }).address) as Address

  // Separate owner account (mnemonic #1) — owns the name, grants the role.
  const ownerAccount = mnemonicToAccount(DEFAULT_MNEMONIC, { addressIndex: 1 })

  if (ownerAccount.address.toLowerCase() === managerAddress.toLowerCase()) {
    throw new Error(
      'Owner and manager resolved to the same address — a managed-only name ' +
        'requires distinct accounts. Override MANAGER_ADDRESS.',
    )
  }

  console.log(
    `Seeding managed-only name "${label}" — owner=${ownerAccount.address}, ` +
      `manager(grantee)=${managerAddress}, roles=[${roles.join(', ')}]`,
  )

  // ── 1. Register the name to the owner (NOT the connected wallet) ─────
  const makeV2Name = createMakeV2Name({ otherAccount: ownerAccount })
  const name = await makeV2Name({ label, owner: 'other' })
  const nameLabel = name.replace(/\.eth$/, '')

  // ── 2. Grant a per-name role to the connected wallet ─────────────────
  const resource = labelToCanonicalId(nameLabel)
  const writeParams = grantRolesWriteParameters(
    // The clients used here only need chain/account for the type assertion.
    {
      chain: walletClient.chain,
      account: ownerAccount,
    } as unknown as Parameters<typeof grantRolesWriteParameters>[0],
    {
      registryAddress: ETH_REGISTRY,
      account: managerAddress,
      resource,
      roles,
    },
  )
  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const grantTx = await walletClient.sendTransaction({
    account: ownerAccount,
    chain: walletClient.chain,
    to: ETH_REGISTRY,
    data,
  })
  const grantReceipt = await publicClient.waitForTransactionReceipt({
    hash: grantTx,
  })
  console.log(
    `[grant] ✅ granted [${roles.join(', ')}] on ${name} to ${managerAddress}`,
  )

  // ── 3. Wait for bigname to pick it up ────────────────────────────────
  console.log(
    `[bigname] waiting for ${bigname.baseUrl} to index the grant (block ${grantReceipt.blockNumber})…`,
  )
  const indexed = await waitForIndexedGrant(
    managerAddress,
    name,
    grantReceipt.blockNumber,
  )

  const block = await publicClient.getBlock()
  console.log('\n──────────────────────────────────────────────')
  console.log(`  Managed name:    ${name}`)
  console.log(`  Owner:           ${ownerAccount.address}`)
  console.log(`  Manager (you):   ${managerAddress}`)
  console.log(`  Roles granted:   ${roles.join(', ')}`)
  console.log(
    `  Indexed:         ${indexed ? 'yes' : `NOT YET (check ${bigname.baseUrl})`}`,
  )
  console.log(`  Profile view:    /${managerAddress}  → "Managed" chip`)
  console.log(
    `  Anvil block time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`,
  )
  console.log('──────────────────────────────────────────────\n')
  if (!indexed) {
    console.warn(
      'Grant not indexed within the timeout — it landed on-chain, but ' +
        'bigname has not listed it. It may be lagging, or it does not index ' +
        'this chain (the public Sepolia deployment never sees fork ' +
        'transactions; set BIGNAME_API_URL).',
    )
  }
}

const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
