import {
  generateCommitmentActor,
  resolveResolverDeploymentActor,
  submitApprovalActor,
  submitCommitmentActor,
  submitRegistrationActor,
  submitResolverDeploymentActor,
  transactionManager,
  validateCommitmentActor,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'

const DEPLOY_RESOLVER_TX_ID = 'tx-reg-deploy-resolver'
const COMMIT_TX_ID = 'tx-reg-commit'
const APPROVE_TX_ID = 'tx-reg-approve'
const REGISTER_TX_ID = 'tx-reg-register'

type UseRegistrationTransactionsParams = {
  readonly name: string
  readonly duration: number
}

type RegistrationParams = {
  readonly selectedTokenAddress: Address
  readonly tokenPrice: bigint
  readonly selectedToken: 'USDC' | 'DAI'
}

export const useRegistrationTransactions = ({
  name,
  duration,
}: UseRegistrationTransactionsParams) => {
  const chainId = sepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const { closeModal, clearTransaction } = useTransactionModal()

  const [registrationParams, setRegistrationParams] =
    useState<RegistrationParams | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  // Intermediate state
  const resolverAddressRef = useRef<Address | undefined>(undefined)
  const commitmentDataRef = useRef<
    { commitment: `0x${string}`; secret: `0x${string}` } | undefined
  >(undefined)

  // Prevent double-firing of async handlers
  const isPreparingRef = useRef(false)

  // --- Deploy Resolver ---
  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      const signer = createEOASigner(walletClient)

      const result = await submitResolverDeploymentActor({
        name,
        owner: walletClient.account.address,
        signer,
        publicClient,
        sponsored: false,
        id: DEPLOY_RESOLVER_TX_ID,
      })

      if (result.isErr()) throw result.error

      await waitForTransaction(result.value.txId)

      const resolveResult = await resolveResolverDeploymentActor({
        txId: result.value.txId,
      })

      if (resolveResult.isErr()) throw resolveResult.error

      resolverAddressRef.current = resolveResult.value.resolverAddress
      return resolveResult.value
    },
  })

  // --- Submit Commitment ---
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient || !registrationParams) {
        throw new Error('Missing required data for commitment')
      }

      const resolverAddress = resolverAddressRef.current
      if (!resolverAddress) {
        throw new Error('Resolver address not available')
      }

      const signer = createEOASigner(walletClient)

      // Generate commitment hash
      const commitmentResult = await generateCommitmentActor({
        name,
        owner: walletClient.account.address,
        duration: BigInt(duration),
        publicClient,
        selectedToken: registrationParams.selectedToken,
        useFastRegistrar: true,
        resolverAddress,
      })

      if (commitmentResult.isErr()) throw commitmentResult.error

      commitmentDataRef.current = commitmentResult.value

      // Submit commitment transaction
      const txResult = await submitCommitmentActor({
        commitment: commitmentResult.value,
        signer,
        name,
        duration: BigInt(duration),
        publicClient,
        useFastRegistrar: true,
        sponsored: false,
        id: COMMIT_TX_ID,
      })

      if (txResult.isErr()) throw txResult.error

      await waitForTransaction(txResult.value)

      // Validate commitment on-chain
      await validateCommitmentActor({
        commitment: commitmentResult.value,
        publicClient,
        useFastRegistrar: true,
      }).match(
        () => {},
        (error) => {
          throw error
        },
      )

      return txResult.value
    },
  })

  // --- Approve Token ---
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient || !registrationParams) {
        throw new Error('Missing required data for approval')
      }

      const signer = createEOASigner(walletClient)

      const result = await submitApprovalActor({
        tokenPrice: registrationParams.tokenPrice,
        selectedToken: registrationParams.selectedToken,
        signer,
        publicClient,
        useFastRegistrar: true,
        sponsored: false,
        id: APPROVE_TX_ID,
      })

      if (result.isErr()) throw result.error

      await waitForTransaction(result.value)
      return result.value
    },
  })

  // --- Register Domain ---
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient || !registrationParams) {
        throw new Error('Missing required data for registration')
      }

      const commitment = commitmentDataRef.current
      const resolverAddress = resolverAddressRef.current
      if (!commitment || !resolverAddress) {
        throw new Error('Commitment or resolver address not available')
      }

      const signer = createEOASigner(walletClient)

      const result = await submitRegistrationActor({
        name,
        commitment,
        signer,
        duration: BigInt(duration),
        selectedToken: registrationParams.selectedToken,
        owner: walletClient.account.address,
        publicClient,
        useFastRegistrar: true,
        sponsored: false,
        resolverAddress,
        id: REGISTER_TX_ID,
      })

      if (result.isErr()) throw result.error

      await waitForTransaction(result.value)
      return result.value
    },
  })

  // --- Chained handlers ---

  const handleDeployStart = useCallback(() => {
    transactionManager.clear()
    deployMutation.mutate()
  }, [deployMutation])

  const handleDeployDoneAndCommitStart = useCallback(() => {
    if (isPreparingRef.current) return
    if (!deployMutation.data) return
    isPreparingRef.current = true
    commitMutation.mutate(undefined, {
      onSettled: () => {
        isPreparingRef.current = false
      },
    })
  }, [deployMutation.data, commitMutation])

  const handleCommitDoneAndApproveStart = useCallback(() => {
    if (isPreparingRef.current) return
    if (!commitMutation.data) return
    isPreparingRef.current = true
    approveMutation.mutate(undefined, {
      onSettled: () => {
        isPreparingRef.current = false
      },
    })
  }, [commitMutation.data, approveMutation])

  const handleApproveDoneAndRegisterStart = useCallback(() => {
    if (isPreparingRef.current) return
    if (!approveMutation.data) return
    isPreparingRef.current = true
    registerMutation.mutate(undefined, {
      onSettled: () => {
        isPreparingRef.current = false
      },
    })
  }, [approveMutation.data, registerMutation])

  const handleRegisterDone = useCallback(() => {
    closeModal()
    clearTransaction()
    setIsSuccess(true)
  }, [closeModal, clearTransaction])

  // --- Transactions array for TransactionModal ---

  const transactions: Transaction[] = [
    {
      id: DEPLOY_RESOLVER_TX_ID,
      title: 'Deploy resolver',
      transactionName: `Deploy resolver for ${name}`,
      estimatedGasCost: 0.001,
      onStart: handleDeployStart,
      onDone: handleDeployDoneAndCommitStart,
    },
    {
      id: COMMIT_TX_ID,
      title: 'Submit commitment',
      transactionName: `Commit to register ${name}`,
      estimatedGasCost: 0.0005,
      onStart: handleDeployDoneAndCommitStart,
      onDone: handleCommitDoneAndApproveStart,
    },
    {
      id: APPROVE_TX_ID,
      title: 'Approve payment',
      transactionName: `Approve ${registrationParams?.selectedToken ?? 'token'} for registration`,
      estimatedGasCost: 0.0003,
      onStart: handleCommitDoneAndApproveStart,
      onDone: handleApproveDoneAndRegisterStart,
    },
    {
      id: REGISTER_TX_ID,
      title: 'Register name',
      transactionName: `Register ${name}`,
      estimatedGasCost: 0.001,
      onStart: handleApproveDoneAndRegisterStart,
      onDone: handleRegisterDone,
    },
  ]

  const startFlow = useCallback(
    (selectedTokenAddress: Address, tokenPrice: bigint) => {
      const tokenInfo = getTokenMetadataWithAddress(selectedTokenAddress)
      setRegistrationParams({
        selectedTokenAddress,
        tokenPrice,
        selectedToken: tokenInfo.symbol,
      })
      setIsSuccess(false)
    },
    [],
  )

  const isRegistering =
    deployMutation.isPending ||
    commitMutation.isPending ||
    approveMutation.isPending ||
    registerMutation.isPending

  return {
    transactions,
    isRegistering,
    isSuccess,
    selectedToken: registrationParams?.selectedToken,
    startFlow,
  }
}
