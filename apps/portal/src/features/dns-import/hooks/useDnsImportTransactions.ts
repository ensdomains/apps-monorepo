import {
  type CustomTransactionIntent,
  scopeTransactionId,
  transactionManager,
  useAtomicBatchSupport,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { importDnsName } from '@ensdomains/ensjs/dns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import { useRef, useState } from 'react'
import { type Address, encodeFunctionData, parseAbi } from 'viem'
import {
  useConfig,
  useConnection,
  usePublicClient,
  useReadContract,
} from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  toEoaBatchIntent,
  toEoaCustomIntent,
} from '@/features/transaction-manager/helpers/intents'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { ensChain } from '@/lib/wagmi'
import { getDnsImportDataQueryOptions } from '../queries/getDnsImportData'
import { getDnsOwnerQueryOptions } from '../queries/getDnsOwner'

const resolverApprovalAbi = parseAbi([
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
])

const chainId = ensChain.id

const dnsRegistrarAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensLegacyDnsRegistrar',
})

const publicResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPublicResolver',
})

/**
 * How the onchain import claims the name:
 * - `claim` — the connected wallet is the DNS owner: `proveAndClaimWithResolver`
 *   (owner + public resolver + address record), preceded by a one-time
 *   PublicResolver operator approval for the DNSRegistrar when missing (the
 *   registrar calls `setAddr` on the user's behalf).
 * - `importWithoutOwnership` — the record points elsewhere: plain
 *   `proveAndClaim`, which assigns the name to the address in the record.
 */
export type DnsImportMode = 'claim' | 'importWithoutOwnership'

type UseDnsImportTransactionsParams = {
  readonly name: string
  readonly mode: DnsImportMode
  /** The verify step gates this — only fetch proof/approval once verified. */
  readonly enabled: boolean
}

export const useDnsImportTransactions = ({
  name,
  mode,
  enabled,
}: UseDnsImportTransactionsParams) => {
  const config = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { address: connectedAddress } = useConnection()
  const { closeModal, clearTransaction } = useTransactionModal()
  const attempt = useFlowAttempt()

  // Idempotent per-step start guard — both the modal UI and the previous
  // step's auto-advance `onDone` route into the runners (transfer-flow pattern).
  const startedStepsRef = useRef<Set<string>>(new Set())

  const importDataQuery = useQuery({
    ...getDnsImportDataQueryOptions({ name }),
    enabled: enabled && !!connectedAddress,
  })

  const approvalQuery = useReadContract({
    address: publicResolverAddress,
    abi: resolverApprovalAbi,
    functionName: 'isApprovedForAll',
    args: connectedAddress
      ? [connectedAddress as Address, dnsRegistrarAddress]
      : undefined,
    query: {
      enabled: enabled && mode === 'claim' && !!connectedAddress,
    },
  })
  const needsApproval = mode === 'claim' && approvalQuery.data === false
  // Approve + claim as one EIP-5792 bundle when the wallet supports it. Fixed
  // when the import starts so a late capabilities answer can't reshape the modal.
  const atomicBatching = useAtomicBatchSupport(chainId)
  const [atomicAtStart, setAtomicAtStart] = useState<boolean | null>(null)
  const bundleApproval = needsApproval && (atomicAtStart ?? atomicBatching)

  const buildApproveIntent = (from: Address): CustomTransactionIntent =>
    toEoaCustomIntent({
      from,
      to: publicResolverAddress,
      data: encodeFunctionData({
        abi: resolverApprovalAbi,
        functionName: 'setApprovalForAll',
        args: [dnsRegistrarAddress, true],
      }),
      chainId,
    })

  const buildClaimIntent = (
    from: Address,
    dnsImportData: NonNullable<typeof importDataQuery.data>,
  ): CustomTransactionIntent => {
    const call = buildClaimCall(dnsImportData)
    return toEoaCustomIntent({ from, to: call.to, data: call.data, chainId })
  }

  const buildClaimCall = (
    dnsImportData: NonNullable<typeof importDataQuery.data>,
  ) =>
    importDnsName.makeFunctionData(
      ensChain,
      mode === 'claim'
        ? {
            name,
            dnsImportData,
            address: connectedAddress as Address,
          }
        : { name, dnsImportData },
    )

  const getRuntime = async () => {
    const walletClient = await getWalletClient(config, {
      account: connectedAddress,
    })
    if (!walletClient || !publicClient) throw new Error('No connected wallet')
    return { walletClient, signer: createEOASigner(walletClient) }
  }

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    attempt.end()
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: getDnsOwnerQueryOptions({ name, strict: true }).queryKey,
      }),
    ])
    void navigate({ to: '/$name', params: { name } })
  }

  const runStep = async (id: string, run: () => Promise<unknown>) => {
    if (startedStepsRef.current.has(id)) return
    startedStepsRef.current.add(id)
    try {
      await run()
    } catch (err) {
      // Tx reverts surface via the modal's machine state; non-tx failures
      // (e.g. wallet not connected) are logged. Clearing the guard allows retry.
      console.error(`DNS import step "${id}" failed:`, err)
      startedStepsRef.current.delete(id)
    }
  }

  const approveId = scopeTransactionId(
    `dns-import-approve-${name}`,
    attempt.scope,
  )
  const claimId = scopeTransactionId(`dns-import-claim-${name}`, attempt.scope)
  const bundleId = scopeTransactionId(
    `dns-import-bundle-${name}`,
    attempt.scope,
  )

  const runApprove = () =>
    runStep(approveId, async () => {
      const { walletClient, signer } = await getRuntime()
      const account = walletClient.account
      if (!account) throw new Error('Wallet client must have an account')
      const txId = transactionManager.startTransaction(
        buildApproveIntent(account.address),
        signer,
        {
          id: approveId,
          description: `Approve DNS registrar for ${name}`,
          publicClient,
          chainId,
        },
      )
      await waitForTransaction(txId)
    })

  const runClaim = () =>
    runStep(claimId, async () => {
      const dnsImportData = importDataQuery.data
      if (!dnsImportData) throw new Error('DNS proof not ready')
      const { walletClient, signer } = await getRuntime()
      const account = walletClient.account
      if (!account) throw new Error('Wallet client must have an account')
      const call = buildClaimCall(dnsImportData)
      const txId = transactionManager.startTransaction(
        toEoaCustomIntent({
          from: account.address,
          to: call.to,
          data: call.data,
          chainId,
        }),
        signer,
        {
          id: claimId,
          description: `Import ${name}`,
          publicClient,
          chainId,
        },
      )
      await waitForTransaction(txId)
    })

  const runBundle = () =>
    runStep(bundleId, async () => {
      const dnsImportData = importDataQuery.data
      if (!dnsImportData) throw new Error('DNS proof not ready')
      const { walletClient, signer } = await getRuntime()
      const account = walletClient.account
      if (!account) throw new Error('Wallet client must have an account')
      const txId = transactionManager.startTransaction(
        toEoaBatchIntent([
          buildApproveIntent(account.address),
          buildClaimIntent(account.address, dnsImportData),
        ]),
        signer,
        {
          id: bundleId,
          description: `Import ${name}`,
          publicClient,
          chainId,
        },
      )
      await waitForTransaction(txId)
    })

  const dnsImportData = importDataQuery.data

  const claimTransaction: Transaction = {
    id: claimId,
    title: mode === 'claim' ? 'Import name' : 'Import for DNS owner',
    transactionName: `Import ${name}`,
    intent: {
      prepare:
        dnsImportData && connectedAddress
          ? ({ walletClient }) => {
              const call = buildClaimCall(dnsImportData)
              return toEoaCustomIntent({
                from: walletClient.account.address,
                to: call.to,
                data: call.data,
                chainId,
                // Before the approval lands, a live estimate of the claim
                // reverts (the registrar can't setAddr yet) — fall back to a
                // cap so the modal shows an honest upper bound. Preview only:
                // `runClaim` submits without a cap, and by then the approval
                // has been mined so the wallet estimates it for real.
                //
                // Verifying the DNSSEC chain onchain dominates the cost — a
                // measured claim (6 RRSets, RSA + P-256) uses ~3.3M gas, so
                // anything near 600k understates it several-fold.
                ...(needsApproval ? { gas: 3_500_000n } : {}),
              })
            }
          : undefined,
      isPending: importDataQuery.isLoading,
      isError: importDataQuery.isError,
    },
    onStart: runClaim,
    onDone: finishFlow,
  }

  const bundleTransaction: Transaction = {
    id: bundleId,
    title: 'Import name',
    transactionName: `Approve DNS registrar and import ${name}`,
    intent: {
      prepare:
        dnsImportData && connectedAddress
          ? ({ walletClient }) =>
              toEoaBatchIntent([
                buildApproveIntent(walletClient.account.address),
                buildClaimIntent(walletClient.account.address, dnsImportData),
              ])
          : undefined,
      isPending: importDataQuery.isLoading,
      isError: importDataQuery.isError,
    },
    onStart: runBundle,
    onDone: finishFlow,
  }

  const approveTransaction: Transaction = {
    id: approveId,
    title: 'Approve DNS registrar',
    transactionName: `Approve DNS registrar for ${name}`,
    intent: {
      prepare: ({ walletClient }) =>
        buildApproveIntent(walletClient.account.address),
    },
    onStart: runApprove,
    onDone: runClaim,
  }
  const sequentialTransactions = needsApproval
    ? [approveTransaction, claimTransaction]
    : [claimTransaction]
  const transactions: Transaction[] = bundleApproval
    ? [bundleTransaction]
    : sequentialTransactions

  const startImport = () => {
    startedStepsRef.current = new Set()
    setAtomicAtStart(atomicBatching)
    if (connectedAddress) attempt.start(connectedAddress)
  }

  return {
    transactions,
    startImport,
    isReady:
      !!dnsImportData && (mode !== 'claim' || approvalQuery.data !== undefined),
    /**
     * Fetching, building or pre-verifying the DNSSEC proof failed — for any
     * reason: a DNS or RPC error as much as an oracle rejection, which ensjs
     * doesn't tell apart. Word it neutrally; the debugger finds the cause.
     */
    isProofError: importDataQuery.isError,
  }
}
