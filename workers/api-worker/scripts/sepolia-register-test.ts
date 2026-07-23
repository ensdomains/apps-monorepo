/**
 * Standalone Sepolia validation of the server-side Crossmint fulfilment.
 * Imports the REAL functions from services/crossmint/fulfilment and runs the
 * full commit -> wait -> register flow, delivering a test .eth name to a
 * separate buyer address (payer != owner, as in the real flow).
 *
 * Run (direct-EOA mode — the key itself is the payer):
 *   PRIVATE_KEY=0x<funded payer> BUYER=0x<owner> pnpm exec tsx scripts/sepolia-register-test.ts
 *
 * Run (Zodiac Roles mode — the key is only a role member; the SAFE is the
 * payer and every write goes through the Roles modifier, see roles.ts):
 *   PRIVATE_KEY=0x<role member> BUYER=0x<owner> \
 *   REGISTRAR_SAFE_ADDRESS=0x<safe> REGISTRAR_ROLES_MODULE_ADDRESS=0x<modifier> \
 *   pnpm exec tsx scripts/sepolia-register-test.ts
 */
import { parseAbi, parseUnits } from 'viem'
import {
  assertCommitmentMatchesChain,
  authorizedPaymentAmount,
  createServerWalletClient,
  deployDedicatedResolver,
  ensureTokenAllowance,
  generateSecret,
  getRegisterPriceTotal,
  PAYMENT_TOKENS,
  precomputeOrderCommitment,
  readMinCommitmentAge,
  submitCommit,
  submitRegister,
  verifyRegistration,
} from '#services/crossmint/fulfilment.js'

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`
const BUYER = process.env.BUYER as `0x${string}`
if (!PRIVATE_KEY || !BUYER) throw new Error('PRIVATE_KEY and BUYER required')

const MOCK_MINT_ABI = parseAbi(['function mint(address to, uint256 amount)'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // Build the real server wallet client. In direct mode the EOA is the payer;
  // with the REGISTRAR_SAFE/ROLES vars set, the Safe is the payer and writes
  // route through execTransactionWithRole (exactly like the worker).
  const client = createServerWalletClient({
    ETH_PRIVATE_KEY: PRIVATE_KEY,
    REGISTRAR_SAFE_ADDRESS: process.env.REGISTRAR_SAFE_ADDRESS,
    REGISTRAR_ROLES_MODULE_ADDRESS: process.env.REGISTRAR_ROLES_MODULE_ADDRESS,
    REGISTRAR_ROLES_ROLE_KEY: process.env.REGISTRAR_ROLES_ROLE_KEY,
    // Standalone test script — allow the direct-EOA path when no Role vars given.
    ALLOW_DIRECT_EOA_SIGNER: '1',
  } as unknown as CloudflareBindings)
  const payer = client.payer
  console.log(
    'mode:',
    payer === client.account.address
      ? 'direct EOA'
      : 'Zodiac Roles (Safe payer)',
  )
  const usdc = PAYMENT_TOKENS.USDC
  const label = `cmtest${Date.now().toString(36)}`
  const duration = BigInt(365 * 24 * 60 * 60) // 1 year

  console.log('payer (server EOA):', payer)
  console.log('buyer (owner):', BUYER)
  console.log('label:', `${label}.eth`)
  console.log('usdc:', usdc)

  // 0) Fund the payer with mock USDC so the registrar can pull payment.
  console.log('\n[0] minting test USDC to payer...')
  const mintHash = await client.writeContract({
    address: usdc,
    abi: MOCK_MINT_ABI,
    functionName: 'mint',
    args: [payer, parseUnits('1000', 6)],
  })
  await client.waitForTransactionReceipt({ hash: mintHash })
  console.log('    minted, tx:', mintHash)

  // 1) Fix the buyer-bound commitment + counterfactual resolver at "order time"
  // (this is what the /orders route does and stores on the voucher).
  console.log('\n[1] precompute commitment + resolver (owner = buyer)...')
  const secret = generateSecret()
  const { resolver, commitment } = await precomputeOrderCommitment(
    client,
    client.payer,
    { label, buyer: BUYER, secret, duration },
  )
  console.log('    resolver (counterfactual):', resolver)
  console.log('    commitment:', commitment)

  // 2) Deploy the resolver at exactly that address; assert precompute matched.
  console.log('\n[2] deploy dedicated resolver...')
  const deployed = await deployDedicatedResolver(client, {
    owner: BUYER,
    secret,
    expectedResolver: resolver,
  })
  console.log('    deployed:', deployed, '(matches precompute)')
  await assertCommitmentMatchesChain(client, {
    label,
    owner: BUYER,
    secret,
    resolver: deployed,
    duration,
    expected: commitment,
  })
  console.log('    commitment matches on-chain makeCommitment ✓')

  // 3) Commit.
  console.log('\n[3] commit...')
  const commitTx = await submitCommit(client, commitment)
  console.log('    commit tx:', commitTx)

  // 4) Wait MIN_COMMITMENT_AGE.
  const minAge = await readMinCommitmentAge(client)
  const waitS = Number(minAge) + 15
  console.log(`\n[4] waiting ${waitS}s for MIN_COMMITMENT_AGE (${minAge})...`)
  await sleep(waitS * 1000)

  // 5) Price + approve.
  console.log('\n[5] price + approve USDC...')
  const price = await getRegisterPriceTotal(client, {
    label,
    duration,
    paymentToken: usdc,
  })
  console.log('    price (USDC units):', price.toString())
  await ensureTokenAllowance(client, {
    token: usdc,
    amount: authorizedPaymentAmount(price),
  })
  console.log('    approved')

  // 6) Register straight to the buyer — the payer (msg.sender) funds it.
  console.log('\n[6] register (owner = buyer, payer funds)...')
  const { hash: registerTx, tokenId } = await submitRegister(client, {
    label,
    owner: BUYER,
    secret,
    resolver: deployed,
    duration,
    paymentToken: usdc,
  })
  console.log('    register tx:', registerTx, 'tokenId:', tokenId.toString())

  // 7) Verify the buyer now owns the name token.
  console.log('\n[7] verify...')
  const verified = await verifyRegistration(client, {
    tokenId,
    owner: BUYER,
  })
  console.log('    verified (buyer owns tokenId):', verified)

  console.log(
    verified
      ? `\n✅ SUCCESS: ${label}.eth registered to ${BUYER}`
      : `\n❌ register landed but verification mismatch`,
  )
}

main().catch((e) => {
  console.error('\n❌ FAILED:', e)
  process.exit(1)
})
