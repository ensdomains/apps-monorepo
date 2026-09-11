import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import {
  encodeDeployDedicatedResolverCall,
  encodeRegisterCall,
  REGISTRATION_TX_IDS,
  registrationMachine,
  subscribeRegistrationPersistence,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getWalletClient } from '@wagmi/core/actions'
import { useActorRef, useSelector } from '@xstate/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Address,
  erc20Abi,
  hexToBigInt,
  keccak256,
  stringToBytes,
} from 'viem'
import {
  useConfig,
  useConnection,
  usePublicClient,
  useReadContract,
} from 'wagmi'
import { formatPriceDisplay } from '@/features/register/utils/registrationPrice'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  buildApproveIntent,
  toEoaCustomIntent,
} from '@/features/transaction-manager/helpers/intents'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { verifyProxyContract } from '@/utils/blockExplorer/verifyProxyContract'
import { createRegistrationPersistenceAdapter } from '../utils/registrationPersistence'
import type { ResumableRun } from './useRegistrationResume'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

type UseRegistrationTransactionsParams = {
  readonly name: string
  readonly duration: number
}

type SavedRegistrationParams = {
  readonly tokenSymbol: 'USDC' | 'DAI'
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenDecimals: number
}

/** Map machine states to whether registration is actively in progress */
function isInProgressState(
  stateValue: string | Record<string, unknown>,
): boolean {
  if (typeof stateValue === 'object') return false

  return (
    stateValue !== 'idle' && stateValue !== 'success' && stateValue !== 'error'
  )
}

export const useRegistrationTransactions = ({
  name,
  duration,
}: UseRegistrationTransactionsParams) => {
  const chainId = sepoliaWithEns.id
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()

  const { closeModal, clearTransaction } = useTransactionModal()

  const [savedParams, setSavedParams] =
    useState<SavedRegistrationParams | null>(null)

  // Set when this run was picked back up after a reload. Its resolver and
  // commitment were made in the earlier session, so there is no transaction
  // left to show for either and the modal lists only the steps still ahead.
  const [isResumed, setIsResumed] = useState(false)

  const actor: RegistrationMachineActor = useActorRef(registrationMachine, {
    input: { chainId },
  })

  // Mirror progress into localStorage so a reload can pick it back up.
  useEffect(
    () =>
      subscribeRegistrationPersistence(
        actor,
        createRegistrationPersistenceAdapter(),
      ),
    [actor],
  )

  const machineState = useSelector(actor, (state) => state.value)
  const selectedToken = useSelector(
    actor,
    (state) => state.context.selectedToken,
  )
  // The registration flow deploys a dedicated resolver proxy (step 1). Once its
  // address is known, ask Etherscan to link it to the already source-verified
  // implementation (Read/Write-as-Proxy). Fire-and-forget, latched per address.
  const resolverAddress = useSelector(
    actor,
    (state) => state.context.resolverAddress,
  )
  const commitment = useSelector(actor, (state) => state.context.commitment)
  const verifiedResolverRef = useRef<Address | null>(null)
  useEffect(() => {
    if (!resolverAddress || verifiedResolverRef.current === resolverAddress) {
      return
    }
    verifiedResolverRef.current = resolverAddress
    void verifyProxyContract(sepoliaWithEns, resolverAddress)
  }, [resolverAddress])
  const registerReadyTimestamp = useSelector(
    actor,
    (state) => state.context.registerReadyTimestamp,
  )
  // Keep the commit-reveal deadline on the register step whenever we know it.
  // Visibility is gated in the modal (only when register is next), so Approve
  // In Progress does not show a misleading "Ready in Xs" on Register.
  const registerWaitUntil =
    machineState === 'validatingCommitment' ||
    machineState === 'fetchingCommitmentAge' ||
    machineState === 'commitmentCooldown' ||
    machineState === 'checkingAllowance' ||
    machineState === 'approvingToken' ||
    machineState === 'waitingForApproval'
      ? registerReadyTimestamp
      : undefined
  const isSuccess = machineState === 'success'
  const isRegistering = isInProgressState(machineState)

  // Read existing allowance for the chosen token so we can omit the approval
  // step entirely when the user has already approved enough.
  const allowanceQuery = useReadContract({
    address: savedParams?.tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      connection.address && savedParams
        ? [connection.address as Address, ethRegistrar]
        : undefined,
    query: {
      enabled: Boolean(savedParams && connection.address),
    },
  })
  const needsApproval =
    !savedParams ||
    allowanceQuery.data === undefined ||
    allowanceQuery.data < savedParams.tokenPrice

  const handleStart = useCallback(async () => {
    if (!publicClient || !connection.address || !savedParams) {
      throw new Error(
        'Missing required parameters - publicClient, connection.address, or savedParams',
      )
    }

    const currentState = actor.getSnapshot().value

    // Already under way (e.g. resumed after a reload): starting over would
    // cancel it, discard its record and pay for a second commitment.
    if (isInProgressState(currentState)) return

    // Reset machine to idle if it's not already (e.g. after modal was closed on error)
    if (currentState !== 'idle') {
      actor.send({ type: 'CANCEL' })
    }
    setIsResumed(false)

    const walletClient = await getWalletClient(config, {
      account: connection.address,
    })

    if (!walletClient) {
      throw new Error('Failed to get wallet client')
    }

    transactionManager.clear()

    const signer = createEOASigner(walletClient)

    actor.send({
      type: 'START_REGISTRATION',
      name,
      duration: BigInt(duration),
      token: savedParams.tokenSymbol,
      price: savedParams.tokenPrice,
      signer,
      accountAddress: connection.address,
      publicClient,
    })
  }, [actor, name, duration, publicClient, connection, config, savedParams])

  const handleProceed = useCallback(() => {
    const currentState = actor.getSnapshot().value
    if (currentState === 'error') {
      for (const id of Object.values(REGISTRATION_TX_IDS)) {
        if (transactionManager.getTransaction(id)?.getSnapshot().context.error)
          transactionManager.cancelTransaction(id)
      }
      actor.send({ type: 'RETRY' })
    }
  }, [actor])

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  const transactions: Transaction[] = useMemo(() => {
    // A resumed run is past its commitment (see `assessRegistrationResume`).
    // Listing the deploy and commit steps would show them "Not Started", and
    // the deploy step's Start would begin a second registration.
    const setupSteps: Transaction[] = [
      {
        id: REGISTRATION_TX_IDS.deployResolver,
        title: 'Deploy resolver',
        transactionName: `Deploy resolver for ${name}`,
        // Deploys the name's dedicated resolver via the shared package builder,
        // so the estimate is byte-identical to what the machine submits. Uses a
        // stable throwaway salt: deploy gas is salt-independent, and a
        // name-derived salt never collides with a real (random-salt) deploy, so
        // estimateGas won't revert on an already-deployed address.
        intent: {
          prepare: connection.address
            ? ({ walletClient }) =>
                toEoaCustomIntent({
                  from: walletClient.account.address,
                  ...encodeDeployDedicatedResolverCall({
                    owner: connection.address as Address,
                    salt: hexToBigInt(
                      keccak256(stringToBytes(`estimate:${name}`)),
                    ),
                    chain: sepoliaWithEns,
                  }),
                  chainId,
                })
            : undefined,
        },
        onStart: handleStart,
        onDone: handleProceed,
      },
      {
        id: REGISTRATION_TX_IDS.commit,
        title: 'Submit commitment',
        transactionName: `Commit to register ${name}`,
        onStart: handleProceed,
        onDone: handleProceed,
      },
    ]
    const steps: Transaction[] = isResumed ? [] : setupSteps

    if (needsApproval) {
      steps.push({
        id: REGISTRATION_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${savedParams?.tokenSymbol ?? 'token'} for registration`,
        // A plain ERC-20 approval of the payment token to the registrar — known
        // upfront (no dependency on an earlier step), so the modal can estimate
        // it the moment it opens. approve gas is amount-independent, so the
        // estimate holds even if the submitted allowance differs slightly.
        intent: {
          prepare: savedParams
            ? ({ walletClient }) =>
                buildApproveIntent({
                  from: walletClient.account.address,
                  token: savedParams.tokenAddress,
                  spender: ethRegistrar,
                  amount: savedParams.tokenPrice,
                  chainId,
                })
            : undefined,
        },
        onStart: handleProceed,
        onDone: handleProceed,
      })
    }

    steps.push({
      id: REGISTRATION_TX_IDS.register,
      title: 'Register name',
      transactionName: `Register ${name}`,
      // Known once commitment + resolver exist; gas cap covers the commitment-age
      // window where live estimateGas reverts.
      intent: {
        prepare:
          commitment && resolverAddress && connection.address && savedParams
            ? ({ walletClient }) =>
                toEoaCustomIntent({
                  from: walletClient.account.address,
                  ...encodeRegisterCall({
                    name,
                    owner: connection.address as Address,
                    secret: commitment.secret,
                    duration: BigInt(duration),
                    paymentToken: savedParams.tokenAddress,
                    resolverAddress,
                    registrarAddress: ethRegistrar,
                  }),
                  chainId,
                  gas: 500_000n,
                })
            : undefined,
      },
      onStart: handleProceed,
      onDone: handleDone,
      waitUntil: registerWaitUntil,
    })

    return steps
  }, [
    name,
    duration,
    connection.address,
    savedParams,
    isResumed,
    needsApproval,
    commitment,
    resolverAddress,
    registerWaitUntil,
    handleStart,
    handleProceed,
    handleDone,
  ])

  const startFlow = (selectedTokenAddress: Address, tokenPrice: bigint) => {
    const tokenInfo = getTokenMetadataWithAddress(selectedTokenAddress)
    setSavedParams({
      tokenSymbol: tokenInfo.symbol,
      tokenAddress: selectedTokenAddress,
      tokenPrice,
      tokenDecimals: tokenInfo.decimals,
    })
  }

  /**
   * Re-enter a run interrupted by a reload. Returns false, touching nothing,
   * when a registration is already going on this page: the machine only takes
   * RESUME from idle, and the page state belongs to the live run.
   */
  const resumeFlow = useCallback(
    ({ record, token, signer }: ResumableRun): boolean => {
      if (!publicClient || actor.getSnapshot().value !== 'idle') return false

      setSavedParams({
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        // What the user confirmed. The machine approves the LIVE price
        // (`checkingAllowance`), so a premium that decayed meanwhile is safe.
        tokenPrice: record.context.tokenPrice,
        tokenDecimals: token.decimals,
      })
      setIsResumed(true)

      actor.send({
        type: 'RESUME',
        stage: record.stage,
        context: record.context,
        deps: { signer, publicClient },
      })
      return true
    },
    [actor, publicClient],
  )

  const paid = savedParams
    ? formatPriceDisplay(savedParams.tokenPrice, savedParams.tokenDecimals)
    : undefined

  const resetRegistration = useCallback(() => {
    actor.send({ type: 'CANCEL' })
    setIsResumed(false)
    closeModal()
    clearTransaction()
  }, [actor, closeModal, clearTransaction])

  useEffect(
    () => () => {
      const { value } = actor.getSnapshot()
      if (value === 'idle' || value === 'success') return
      for (const id of Object.values(REGISTRATION_TX_IDS)) {
        transactionManager.cancelTransaction(id)
      }
    },
    [actor],
  )

  return {
    transactions,
    actor,
    isRegistering,
    isSuccess,
    selectedToken,
    paid,
    startFlow,
    resumeFlow,
    resetRegistration,
  }
}
