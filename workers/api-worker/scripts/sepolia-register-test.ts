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
  authorizedPaymentAmount,
  createServerWalletClient,
  deployDedicatedResolver,
  ensureTokenAllowance,
  generateSecret,
  getRegisterPriceTotal,
  makeCommitment,
  PAYMENT_TOKENS,
  readMinCommitmentAge,
  submitCommit,
  submitRegister,
  transferName,
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

  // 1) Deploy the buyer's dedicated resolver (buyer-owned; independent of who
  // owns the name).
  console.log('\n[1] deploying dedicated resolver...')
  const resolver = await deployDedicatedResolver(client, BUYER)
  console.log('    resolver:', resolver)

  // 2) Commitment — owner = the SERVER (payer), since the registrar charges the
  // owner and the buyer has no on-chain funds.
  console.log('\n[2] makeCommitment...')
  const secret = generateSecret()
  const commitment = await makeCommitment(client, {
    label,
    owner: payer,
    secret,
    resolver,
    duration,
  })
  console.log('    commitment:', commitment)

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

  // 6) Register to the server (payer pays), then deliver the name to the buyer.
  console.log('\n[6] register (owner = server)...')
  const { hash: registerTx, tokenId } = await submitRegister(client, {
    label,
    owner: payer,
    secret,
    resolver,
    duration,
    paymentToken: usdc,
  })
  console.log('    register tx:', registerTx, 'tokenId:', tokenId.toString())

  console.log('\n[6b] transferring name to buyer...')
  const transferTx = await transferName(client, { tokenId, to: BUYER })
  console.log('    transfer tx:', transferTx)

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
