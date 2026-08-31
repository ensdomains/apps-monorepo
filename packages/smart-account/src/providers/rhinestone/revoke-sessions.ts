/**
 * Session revocation — the owner-signed on-chain kill switch.
 *
 * `StandaloneSingleOwnerHCA.revokeSessions()` increments the account's session
 * nonce. The validator compares that nonce on every path AND mixes it into the
 * salt that derives the `permissionId`, so one call permanently invalidates
 * every enabled session and every outstanding enable proof for the account.
 *
 * This is the ONLY real revocation. Clearing `localStorage` forgets our copy of
 * a session; it does not stop a key that already left the device, because the
 * stored record carries the owner-signed enable proof and
 * `_validateSessionEnableProof` never reads the on-chain session slot.
 *
 * It must be a DIRECT owner EOA transaction, and it costs the owner gas.
 * `revokeSessions()` is `onlyOwner`, and every account-routed path (an
 * IntentExecutor intent, a 4337 userOp, `executeByOwner`) makes the inner call
 * with the ACCOUNT as `msg.sender`; delegatecall is rejected outright. That is
 * deliberate — revocation depends only on the owner key, so nothing holding a
 * valid intent signature can undo or front-run it. Do NOT try to route this
 * through `buildHcaOwnerExecutionCall`; it will revert `CallerNotOwner()`.
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
   * Sending there would be worse than failing: the HCA address has no code on
   * another chain, so `revokeSessions()` would succeed as a no-op, report a
   * confirmed receipt, and let us clear the session while the real ones stay
   * live. Both clients are checked against this before anything is sent.
   */
  readonly chain: Chain
  readonly hca: Address
  /**
   * Deploy the HCA first when it has no code yet, from
   * `getHcaDirectExecutionReadiness`. An undeployed account has no enabled
   * session, but a leaked stored record still carries an authorization signed
   * against nonce 0 — and deployment is permissionless, so a holder of that
   * record can deploy the account themselves and use it. Passing the
   * deployment call makes revocation complete at the cost of a second
   * transaction; omitting it makes an undeployed account an error rather than
   * a false success.
   */
  readonly deploymentCall?: Call
}

export interface RevokeSessionsResult {
  /** The `revokeSessions()` transaction. */
  readonly transactionHash: Hex
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
): Promise<Hex> {
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
  return hash
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
      'HCA is not deployed, so there is nothing to revoke on-chain. Its stored authorization stays usable once the account is deployed — pass a deploymentCall to revoke completely.',
    )
  }
  return sendAndConfirm(
    params,
    account,
    params.deploymentCall,
    'HCA deployment transaction reverted',
  )
}

/**
 * `onlyOwner` compares msg.sender to the account's immutable owner, so a
 * mismatch reverts CallerNotOwner(). Check first to fail with a readable
 * message instead of an opaque wallet error.
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
 * Revoke every session for an HCA, then drop the local record.
 *
 * Storage is cleared only AFTER the receipt confirms, so a rejected or reverted
 * transaction never leaves the user believing they revoked.
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

      const transactionHash = await sendAndConfirm(
        params,
        account,
        buildRevokeSessionsCall({ hca: params.hca }),
        'revokeSessions transaction reverted',
      )

      // Only now is the stored record genuinely dead.
      removeSession(params.hca)

      return { transactionHash, deploymentTransactionHash }
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
