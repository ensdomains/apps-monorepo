/**
 * Session revocation — the owner-signed on-chain kill switch.
 *
 * Built against the stateless `HCAOwnerAndSessionValidator` (contracts-v2 #426,
 * the 2026-09-15 Sepolia deployment). That validator keeps NO per-session
 * state: there is no `enableSessionWithRefund`, no stored session slot, and
 * `isPermissionEnabled` always returns false. Every session-signed intent
 * carries the owner-signed authorization inline, and `_validateSessionEnableProof`
 * checks it against the account's CURRENT session nonce (`ownerAndSessionNonce`)
 * on every call, and mixes that nonce into the salt the `permissionId` derives
 * from. So the stored record is the session: anyone holding a copy can keep
 * using it until `validUntil`, and the nonce is the only thing that can end it
 * early.
 *
 * `StandaloneSingleOwnerHCA.revokeSessions()` increments that nonce and emits
 * `SessionsRevoked(uint96 indexed sessionNonce)`. One call invalidates every
 * authorization the owner has signed for the account on this chain. Clearing
 * `localStorage` forgets our copy; it does not stop a copy that already left
 * the device.
 *
 * It must be a DIRECT owner EOA transaction, and it costs the owner gas.
 * `revokeSessions()` is `onlyOwner` (the owner the factory certified,
 * `StandaloneHCAFactory.hcaOwners`), and every account-routed path (an
 * IntentExecutor intent, a 4337 userOp, `executeByOwner`) makes the inner call
 * with the ACCOUNT as `msg.sender`; delegatecall is rejected outright. That is
 * deliberate — revocation depends only on the owner key, so nothing holding a
 * valid session can undo or front-run it. Do NOT try to route this through
 * `buildHcaOwnerExecutionCall`; it will revert `CallerNotOwner()` (`0x5cd83192`).
 */

import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Address,
  type Chain,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  parseEventLogs,
  type TransactionReceipt,
  type WalletClient,
} from 'viem'
import { SessionRevokeError, type SessionRevokeReason } from '../../errors'
import type { Call } from './registration-calls'
import { removeSession } from './session-storage'

/** Thrown internally so the async body can name a reason; never escapes. */
class RevokeFailure extends Error {
  constructor(
    readonly reason: SessionRevokeReason,
    message: string,
  ) {
    super(message)
  }
}

const standaloneHcaRevokeAbi = parseAbi([
  'function revokeSessions()',
  'function ownerAndSessionNonce() view returns (address owner, uint96 sessionNonce)',
  'event SessionsRevoked(uint96 indexed sessionNonce)',
])

/**
 * Encode the `revokeSessions()` call.
 *
 * The owner EOA must be the immediate caller, so this is only ever sent as a
 * top-level transaction from the owner's wallet — never nested in an HCA batch.
 */
export function buildRevokeSessionsCall(params: {
  readonly hca: Address
}): Call {
  return {
    to: params.hca,
    value: 0n,
    data: encodeFunctionData({
      abi: standaloneHcaRevokeAbi,
      functionName: 'revokeSessions',
    }),
  }
}

export interface RevokeSessionsParams {
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  /**
   * The chain the HCA lives on, and the ONLY chain this may transact against.
   *
   * The app pins its public client to the registration chain while the wallet
   * client follows whatever network the wallet is on, so the two can diverge.
   * The nonce is per chain, so revoking anywhere else leaves this chain's
   * sessions live. Both clients are checked against this before anything is
   * sent.
   */
  readonly chain: Chain
  readonly hca: Address
  /**
   * Deploy the HCA first when it has no code yet — `buildHcaDeploymentCall`,
   * built for the connected wallet as `expectedOwner` (it refuses any other
   * owner, so a wrong wallet fails before paying for a deployment).
   *
   * An undeployed account still has live sessions: its authorizations are
   * signed against nonce 0, every intent carries them inline, and deployment
   * is permissionless, so a holder of a copied record can deploy the account
   * and use it. Passing the deployment call makes revocation complete at the
   * cost of a second transaction; omitting it makes an undeployed account an
   * error rather than a false success.
   */
  readonly deploymentCall?: Call
}

export interface RevokeSessionsResult {
  /** The `revokeSessions()` transaction. */
  readonly transactionHash: Hex
  /**
   * The account's session nonce after the revoke, from `SessionsRevoked`.
   * Every authorization signed against a lower nonce is now rejected.
   */
  readonly sessionNonce: bigint
  /** The deployment transaction, when the account had to be deployed first. */
  readonly deploymentTransactionHash?: Hex
}

/** Reads and writes must agree on the chain, or a passing precondition says
 *  nothing about where the transaction lands. */
function assertChain(params: RevokeSessionsParams): void {
  const { chain } = params
  if (
    params.walletClient.chain?.id !== chain.id ||
    params.publicClient.chain?.id !== chain.id
  ) {
    throw new RevokeFailure(
      'wrong-chain',
      `Wallet must be on ${chain.name} (chain ${chain.id}) to revoke sessions`,
    )
  }
}

/** Send one owner transaction and require a successful receipt. */
async function sendAndConfirm(
  params: RevokeSessionsParams,
  account: NonNullable<WalletClient['account']>,
  call: Call,
  failureMessage: string,
): Promise<TransactionReceipt> {
  const hash = await params.walletClient.sendTransaction({
    account,
    chain: params.chain,
    to: call.to,
    value: call.value,
    data: call.data,
  })
  const receipt = await params.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new RevokeFailure('transaction-failed', failureMessage)
  }
  return receipt
}

/** Deploy the HCA when it has no code, or refuse if no deployment call exists. */
async function ensureDeployed(
  params: RevokeSessionsParams,
  account: NonNullable<WalletClient['account']>,
): Promise<Hex | undefined> {
  const code = await params.publicClient.getCode({ address: params.hca })
  if (code && code !== '0x') return undefined
  if (!params.deploymentCall) {
    throw new RevokeFailure(
      'not-deployed',
      'HCA is not deployed yet. Its signed session authorizations still work once anyone deploys it — pass a deploymentCall to deploy and revoke.',
    )
  }
  const receipt = await sendAndConfirm(
    params,
    account,
    params.deploymentCall,
    'HCA deployment transaction reverted',
  )
  return receipt.transactionHash
}

/**
 * `onlyOwner` compares msg.sender to the factory-certified owner, so a mismatch
 * reverts CallerNotOwner(). Check first to fail with a readable message instead
 * of an opaque wallet error.
 */
async function assertOwner(
  params: RevokeSessionsParams,
  owner: Address,
): Promise<void> {
  const [onChainOwner] = await params.publicClient.readContract({
    address: params.hca,
    abi: standaloneHcaRevokeAbi,
    functionName: 'ownerAndSessionNonce',
  })
  if (!isAddressEqual(onChainOwner, owner)) {
    throw new RevokeFailure(
      'not-owner',
      `Connected wallet ${owner} is not the HCA owner ${onChainOwner}`,
    )
  }
}

/**
 * The new nonce from the HCA's own `SessionsRevoked` event.
 *
 * A successful receipt alone is not proof: a call to an address with no code
 * also succeeds. Requiring the event, emitted by this HCA, is.
 */
function readRevokedNonce(
  receipt: TransactionReceipt,
  hca: Address,
): bigint | undefined {
  const [event] = parseEventLogs({
    abi: standaloneHcaRevokeAbi,
    eventName: 'SessionsRevoked',
    logs: receipt.logs.filter((log) => isAddressEqual(log.address, hca)),
  })
  return event?.args.sessionNonce
}

/**
 * Revoke every session for an HCA, then drop the local record.
 *
 * Storage is cleared only AFTER the receipt confirms and carries the HCA's
 * `SessionsRevoked` event, so a rejected, reverted, or no-op transaction never
 * leaves the user believing they revoked.
 */
export function revokeSessionsOnChain(
  params: RevokeSessionsParams,
): ResultAsync<RevokeSessionsResult, SessionRevokeError> {
  return fromPromise(
    (async (): Promise<RevokeSessionsResult> => {
      const account = params.walletClient.account
      if (!account) {
        throw new RevokeFailure('unknown', 'Wallet client has no account')
      }
      assertChain(params)

      const deploymentTransactionHash = await ensureDeployed(params, account)
      await assertOwner(params, account.address)

      const receipt = await sendAndConfirm(
        params,
        account,
        buildRevokeSessionsCall({ hca: params.hca }),
        'revokeSessions transaction reverted',
      )
      const sessionNonce = readRevokedNonce(receipt, params.hca)
      if (sessionNonce === undefined) {
        throw new RevokeFailure(
          'transaction-failed',
          'revokeSessions confirmed without a SessionsRevoked event from the HCA',
        )
      }

      // Only now is the stored record genuinely dead.
      removeSession(params.hca)

      return {
        transactionHash: receipt.transactionHash,
        sessionNonce,
        ...(deploymentTransactionHash ? { deploymentTransactionHash } : {}),
      }
    })(),
    (error: unknown) =>
      new SessionRevokeError({
        message:
          error instanceof Error ? error.message : 'Failed to revoke sessions',
        reason: error instanceof RevokeFailure ? error.reason : 'unknown',
        cause: error,
      }),
  )
}
