/**
 * Resume preflight: whether a stored registration is worth re-entering on this
 * name's page, decided before the machine is touched. Every outcome is a
 * verdict, not an exception — "cannot read the chain" and "record is stale"
 * are both normal, and the caller has a defined response to each.
 *
 * Only a run that got as far as its commitment is resumed. Before that nothing
 * is paid that resuming could save: the package would restart the flow from
 * the resolver deploy, prompting the wallet the moment the page loads. Such a
 * record is dropped and the user simply registers again.
 */

import {
  getResumeTarget,
  type PersistedRegistrationRecord,
} from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ResultAsync } from 'neverthrow'
import { type Address, type Client, erc20Abi, type Hash, parseAbi } from 'viem'
import { getBlock, readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { PAYMENT_TOKENS, type PaymentToken } from '../constants/paymentTokens'

const registrarAbi = parseAbi([
  'function commitmentAt(bytes32 commitment) view returns (uint64)',
  'function MAX_COMMITMENT_AGE() view returns (uint256)',
])

/** The EOA path commits, approves and registers here (`submitCommitmentActor`). */
const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export type RegistrationResumeStaleReason =
  /** Written against a different chain. */
  | 'chain-mismatch'
  /** Not an EOA run: the portal never registers any other way. */
  | 'signer-mode-mismatch'
  /** Paid in a token the portal's L1 registrar flow does not offer. */
  | 'unsupported-token'
  /** A finished run whose record outlived its own cleanup. */
  | 'already-finished'
  /** Stopped before its commitment: nothing paid worth resuming. */
  | 'before-commit'
  /** Past MAX_COMMITMENT_AGE: the reveal would revert `CommitmentTooOld`. */
  | 'commitment-expired'

export type RegistrationResumeVerdict =
  | { readonly status: 'none' }
  | { readonly status: 'stale'; readonly reason: RegistrationResumeStaleReason }
  | {
      readonly status: 'resumable'
      readonly record: PersistedRegistrationRecord
      /** The record's token, narrowed to the ones the portal offers. */
      readonly token: PaymentToken
      /**
       * Whether the commit is confirmed on-chain. A record holds its commitment
       * from before the commit prompt opens, so a run interrupted at that
       * prompt has one that was never sent; its commit step is still ahead.
       */
      readonly commitmentOnChain: boolean
      /**
       * Whether the registrar still lacks the allowance for this run, read from
       * the chain now. The page's own allowance read can predate the approve,
       * and listing a done approve step again reads as a step still ahead.
       */
      readonly approvalNeeded: boolean
    }

const stale = (
  reason: RegistrationResumeStaleReason,
): RegistrationResumeVerdict => ({ status: 'stale', reason })

type CommitmentState = {
  readonly onChain: boolean
  readonly expired: boolean
}

/**
 * Chain time, not wall-clock: `commitmentAt` is a block timestamp. A failed
 * read counts as "not expired": resuming a dead commitment costs a reveal that
 * fails and can be retried, while discarding a live one costs a second commit.
 * It also counts as "not on-chain", which keeps the commit step in view; the
 * machine checks the chain again before it acts either way.
 */
const readCommitment = (
  client: Client,
  commitment: Hash,
): Promise<CommitmentState> =>
  ResultAsync.fromPromise(
    Promise.all([
      readContract(client, {
        address: ethRegistrar,
        abi: registrarAbi,
        functionName: 'commitmentAt',
        args: [commitment],
      }),
      readContract(client, {
        address: ethRegistrar,
        abi: registrarAbi,
        functionName: 'MAX_COMMITMENT_AGE',
      }),
      getBlock(client),
    ]),
    (error) => error,
  )
    .map(([committedAt, maxAge, block]) => ({
      // 0 means not recorded: never sent, still pending, or failed. Only
      // `validatingCommitment` can tell those apart.
      onChain: committedAt !== 0n,
      // `>=` because the reveal runs after this check: a commitment at the
      // boundary is already doomed.
      expired: committedAt !== 0n && block.timestamp - committedAt >= maxAge,
    }))
    .unwrapOr({ onChain: false, expired: false })

/**
 * Whether `owner` has yet to allow the registrar `price` of `token`. A failed read
 * counts as needed: the step stays listed, and the machine reads the allowance
 * itself before it prompts.
 */
const readApprovalNeeded = (
  client: Client,
  params: {
    readonly token: Address
    readonly owner: Address
    readonly price: bigint
  },
): Promise<boolean> =>
  ResultAsync.fromPromise(
    readContract(client, {
      address: params.token,
      abi: erc20Abi,
      functionName: 'allowance',
      // The EOA path approves and registers on this registrar.
      args: [params.owner, ethRegistrar],
    }),
    (error) => error,
  )
    .map((allowance) => allowance < params.price)
    .unwrapOr(true)

export const assessRegistrationResume = async (params: {
  /** The name this page is for, as passed to START_REGISTRATION. */
  readonly name: string
  readonly chainId: number
  readonly client: Client
  readonly record: PersistedRegistrationRecord | null
}): Promise<RegistrationResumeVerdict> => {
  const { record } = params

  // A record for another name is not dead: that name's page resumes it, and
  // starting a registration here overwrites it anyway.
  if (!record || record.context.name !== params.name) return { status: 'none' }

  if (record.context.chainId !== params.chainId) return stale('chain-mismatch')
  if (record.context.signerType !== 'eoa') return stale('signer-mode-mismatch')

  const token = PAYMENT_TOKENS.find(
    (t) => t.symbol === record.context.selectedToken,
  )
  if (!token) return stale('unsupported-token')

  if (record.stage === 'success' || record.stage === 'idle') {
    return stale('already-finished')
  }
  if (getResumeTarget(record) === 'settingUpRegistration') {
    return stale('before-commit')
  }

  const commitment = record.context.commitment?.commitment
  const chain = commitment
    ? await readCommitment(params.client, commitment)
    : { onChain: false, expired: false }
  if (chain.expired) return stale('commitment-expired')

  // A register that went out was accepted against a landed commitment, and
  // spent the allowance it needed.
  const registerSent = getResumeTarget(record) === 'verifyingRegistration'
  const owner = record.context.ownerAddress ?? record.context.accountAddress
  const approvalNeeded =
    !registerSent &&
    (owner
      ? await readApprovalNeeded(params.client, {
          token: token.address,
          owner,
          price: record.context.tokenPrice,
        })
      : true)

  return {
    status: 'resumable',
    record,
    token,
    commitmentOnChain: chain.onChain || registerSent,
    approvalNeeded,
  }
}

export const isSameAddress = (a: Address, b: Address) =>
  a.toLowerCase() === b.toLowerCase()

export type RegistrationResumeDecision =
  /** Nothing stored for this name; nothing to do. */
  | { readonly kind: 'none' }
  /** Drop the record; `notify` when the user paid for what is being dropped. */
  | { readonly kind: 'discard'; readonly notify: boolean }
  /** The connected wallet owns a live run: resume it. */
  | {
      readonly kind: 'resume'
      readonly verdict: Extract<
        RegistrationResumeVerdict,
        { status: 'resumable' }
      >
    }
  /** A live run, but no wallet is connected: say which one resumes it. */
  | { readonly kind: 'await-owner'; readonly owner: Address }
  /** A live run owned by another wallet: keep it out of sight until it returns. */
  | { readonly kind: 'hide' }

export const decideRegistrationResume = (
  verdict: RegistrationResumeVerdict,
  connectedAddress: Address | undefined,
): RegistrationResumeDecision => {
  if (verdict.status === 'none') return { kind: 'none' }

  if (verdict.status === 'stale') {
    // Only the expiry gets a notice: the user paid for that commitment, and its
    // silent disappearance would read as a bug. The rest are technical
    // mismatches, or runs with nothing paid, where a quiet restart is right.
    return { kind: 'discard', notify: verdict.reason === 'commitment-expired' }
  }

  const { context } = verdict.record
  const owner = context.ownerAddress ?? context.accountAddress
  // A record with no owner cannot be bound to a wallet; nobody can resume it.
  if (!owner) return { kind: 'discard', notify: false }

  if (!connectedAddress) return { kind: 'await-owner', owner }
  if (!isSameAddress(owner, connectedAddress)) return { kind: 'hide' }

  return { kind: 'resume', verdict }
}
