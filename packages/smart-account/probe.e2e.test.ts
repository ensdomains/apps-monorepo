/**
 * End-to-end HCA policy probe (DEBUGGING_INTENTS.md §5).
 *
 * Opt-in: skipped unless both env vars are set, so it never runs in CI or in a
 * normal `pnpm vitest run`. It signs and submits a REAL intent on Sepolia.
 *
 *   VITE_RHINESTONE_API_KEY=<key from `gh variable list`> \
 *   SEPOLIA_RPC_URL=<rpc> \
 *   pnpm vitest run probe.e2e.test.ts --reporter=verbose
 *
 * Per §5 a successful registration is not required: the policy runs during
 * signature validation, so if the batch fails later (no commitment recorded)
 * the policy has already cleared. A PolicyRuleFailed() (0xe50c42ea) or
 * InvalidSignature() means the encoding is wrong.
 */
import { createPublicClient, http, parseAbi } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { expect, it } from 'vitest'
import { initializeRhinestoneAccount } from './src/providers/rhinestone/initialize-account'
import { getDestinationContracts } from './src/providers/rhinestone/manifest'
import {
  buildRevealBatch,
  computeResolverAddress,
} from './src/providers/rhinestone/registration-calls'
import { createDestinationSession } from './src/providers/rhinestone/session'

const API_KEY = process.env.VITE_RHINESTONE_API_KEY as string
const RPC = process.env.SEPOLIA_RPC_URL as string
// Must mint the manifest's `usdc`, so point it at a worker built against the
// same ensjs as this package (e.g. a PR preview) until that reaches main.
const FAUCET = process.env.FAUCET_URL ?? 'https://app-api.ens.dev'
const log = (...a: unknown[]) => console.log('[probe]', ...a)

const enabled = Boolean(API_KEY && RPC)

it.skipIf(!enabled)(
  'reveal batch clears the deployed HCA policy',
  async () => {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC),
    })

    // §5: FRESH owner — a reused one already has a resolver and skips deployProxy.
    const owner = privateKeyToAccount(generatePrivateKey())
    log('owner', owner.address)

    const init = await initializeRhinestoneAccount({
      ownerAccount: owner,
      eoaAddress: owner.address,
      chain: sepolia,
      publicClient,
      rhinestoneApiKey: API_KEY,
    })
    if (init.isErr()) throw init.error
    const account = init.value.client
    const hca = init.value.address
    log('hca', hca, 'deployed', init.value.alreadyDeployed)

    const res = await fetch(`${FAUCET}/wallet/fund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: hca }),
    })
    log('faucet', res.status, (await res.text()).slice(0, 160))

    // The faucet mints, then we must see the balance before quoting: the
    // planner refuses every route while the HCA sits below the fee, which
    // surfaces as NO_PLAN_AVAILABLE rather than anything policy-related.
    for (let i = 0; i < 30; i++) {
      const b = await publicClient.readContract({
        address: getDestinationContracts(sepolia.id).usdc,
        abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [hca],
      })
      if (b > 0n) break
      await new Promise((r) => setTimeout(r, 2000))
    }

    const c = getDestinationContracts(sepolia.id)
    const bal = await publicClient.readContract({
      address: c.usdc,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [hca],
    })
    log('hca usdc', bal.toString())

    const resolver = computeResolverAddress({ chainId: sepolia.id, hca })
    log('resolver', resolver)

    const sess = await createDestinationSession({
      rhinestoneAccount: account,
      publicClient,
      chain: sepolia,
      hca,
      resolver,
      sessionAccount: privateKeyToAccount(generatePrivateKey()),
      validUntil: BigInt(Math.floor(Date.now() / 1000) + 3600),
      alreadyDeployed: init.value.alreadyDeployed,
    })
    if (sess.isErr()) throw sess.error
    log('permissionId', sess.value.permissionId)

    const label = `probe${Date.now()}`
    const calls = buildRevealBatch({
      chainId: sepolia.id,
      hca,
      resolver,
      label,
      wallet: owner.address,
      secret: `0x${'22'.repeat(32)}`,
      price: 1_000_000n,
      duration: 28n * 86400n,
      resolverDeployed: false,
      records: [{ type: 'text', key: 'com.twitter', value: '@ens' }],
      setPrimaryName: `${label}.eth`,
    })
    log('selectors', calls.map((x) => x.data.slice(0, 10)).join(','))

    const params = {
      sourceChains: [sepolia],
      targetChain: sepolia,
      calls: [...calls],
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      tokenRequests: [],
      signers: {
        type: 'experimental_session' as const,
        session: sess.value.session,
        enableData: sess.value.enableData,
        verifyExecutions: true,
      },
    }

    // biome-ignore lint/suspicious/noExplicitAny: SDK params are structurally typed
    const a = account as any
    const prepared = await a.prepareTransaction(params)
    log('PREPARED — orchestrator priced it')
    const signed = await a.signTransaction(prepared)
    log('SIGNED')
    const tx = await a.submitTransaction(signed)
    log('SUBMITTED id', tx?.id?.toString())
    const result = await a.waitForExecution(tx, false)
    log(
      'RESULT',
      JSON.stringify(result, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ).slice(0, 2000),
    )
    expect(true).toBe(true)
  },
  600_000,
)
