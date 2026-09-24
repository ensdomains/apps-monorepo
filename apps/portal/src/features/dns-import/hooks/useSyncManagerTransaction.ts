import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { resultMutationOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import type { GetDnsImportDataReturnType } from '@ensdomains/ensjs/dns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useRef, useState } from 'react'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { prepareSyncManagerTransaction } from '../helpers/syncManager'
import { getDnsImportDataResult } from '../queries/getDnsImportData'
import { getDnsOwnerQueryOptions } from '../queries/getDnsOwner'

const CHAIN_ID = sepoliaWithEns.id

/**
 * Sync Manager (WEB-465): re-proves the `_ens` TXT record and runs a plain
 * `proveAndClaim`, which re-points the v1 registry owner (manager) to the
 * current record address. One transaction; the fresh proof is fetched when the
 * user clicks the banner button so it can't be stale on open.
 */
export const useSyncManagerTransaction = ({
  name,
}: {
  readonly name: string
}) => {
  const config = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { address: connectedAddress } = useConnection()
  const { openModal, closeModal, clearTransaction } = useTransactionModal()

  const [proof, setProof] = useState<GetDnsImportDataReturnType | null>(null)
  const startedRef = useRef(false)

  const prepareMutation = useMutation(
    resultMutationOptions({
      mutationFn: () => getDnsImportDataResult({ name }),
      onSuccess: (dnsImportData) => {
        startedRef.current = false
        setProof(dnsImportData)
        openModal()
      },
    }),
  )

  const txId = `dns-sync-manager-${name}`

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setProof(null)
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: getDnsOwnerQueryOptions({ name, strict: false }).queryKey,
      }),
    ])
  }

  const runSync = async () => {
    if (startedRef.current) return
    startedRef.current = true
    try {
      if (!proof) throw new Error('DNS proof not ready')
      const walletClient = await getWalletClient(config, {
        account: connectedAddress,
      })
      if (!walletClient?.account || !publicClient) {
        throw new Error('No connected wallet')
      }
      const id = transactionManager.startTransaction(
        prepareSyncManagerTransaction({
          chain: sepoliaWithEns,
          name,
          dnsImportData: proof,
          from: walletClient.account.address,
        }),
        createEOASigner(walletClient),
        {
          id: txId,
          description: `Sync manager for ${name}`,
          publicClient,
          chainId: CHAIN_ID,
        },
      )
      await waitForTransaction(id)
    } catch (err) {
      console.error('Sync manager failed:', err)
      startedRef.current = false
    }
  }

  const transactions: Transaction[] = proof
    ? [
        {
          id: txId,
          title: 'Sync manager',
          transactionName: `Sync manager for ${name}`,
          intent: {
            prepare: connectedAddress
              ? ({ walletClient }) =>
                  prepareSyncManagerTransaction({
                    chain: sepoliaWithEns,
                    name,
                    dnsImportData: proof,
                    from: walletClient.account.address,
                  })
              : undefined,
          },
          onStart: () => void runSync(),
          onDone: finishFlow,
        },
      ]
    : []

  return {
    transactions,
    startSync: () => prepareMutation.mutate(),
    isPreparing: prepareMutation.isPending,
    prepareError: prepareMutation.error,
  }
}
