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
import { waitFor } from 'xstate'
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

/** States in which the machine is reading the chain before it moves on. */
const CHECKING_CHAIN_STATES: ReadonlySet<string> = new Set([
  'validatingCommitment',
  'verifyingRegistration',
])

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

  // Set when this run was picked back up after a reload, with what the chain
  // said about its commitment. The modal lists only the steps still ahead.
  const [resumed, setResumed] = useState<{
    readonly commitmentOnChain: boolean
  } | null>(null)

  // Whether this run approves the registrar, fixed when it starts or resumes.
  // The page's own allowance read can lag the chain, and a step list that
  // changes under a running flow misleads either way.
  const [approvalPlanned, setApprovalPlanned] = useState<boolean | null>(null)

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
  // Put the commit-reveal deadline on the register step from the moment it is
  // known. It runs from the commit, so it is shown while the approve is still
  // going too: hiding it until then made it appear partway through.
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
  // Any run the modal can still act on, a failed one included: its steps
  // carry the retry.
  const hasActiveRun = machineState !== 'idle' && machineState !== 'success'
  // The wallet the run belongs to, while stopping it still protects something:
  // any live stage, a failure included, since its retry would carry on with
  // that wallet's signer.
  const suspendableRunOwner = useSelector(actor, (state) =>
    state.value === 'idle' || state.value === 'success'
      ? undefined
      : (state.context.ownerAddress ?? state.context.accountAddress),
  )

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
      // The app default keeps reads for an hour. An allowance read before an
      // approve would then outlive it, listing the approve step again.
      staleTime: 0,
    },
  })
  const needsApproval =
    !savedParams ||
    allowanceQuery.data === undefined ||
    allowanceQuery.data < savedParams.tokenPrice
  const { refetch: refetchAllowance } = allowanceQuery
  const showApprovalStep = approvalPlanned ?? needsApproval

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
    setResumed(null)

    const walletClient = await getWalletClient(config, {
      account: connection.address,
    })

    if (!walletClient) {
      throw new Error('Failed to get wallet client')
    }

    // Read now, not from the cache: an approve from an earlier run on this page
    // may have landed since.
    const { data: allowance } = await refetchAllowance()
    setApprovalPlanned(
      allowance === undefined || allowance < savedParams.tokenPrice,
    )

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
  }, [
    actor,
    name,
    duration,
    publicClient,
    connection,
    config,
    savedParams,
    refetchAllowance,
  ])

  const handleProceed = useCallback(async () => {
    // A resumed run reads the chain before it takes a retry: a commit that was
    // never sent only fails its check after several seconds. A click landing in
    // that window waits for the verdict instead of being dropped, so Start on
    // that commit step puts the prompt back up. Only then — every other click
    // resolves from the state already in hand, in the same tick.
    if (CHECKING_CHAIN_STATES.has(String(actor.getSnapshot().value))) {
      await waitFor(
        actor,
        (snapshot) => !CHECKING_CHAIN_STATES.has(String(snapshot.value)),
      ).catch(() => null)
    }
    // Read the state now, not the snapshot the wait resolved with: several
    // clicks can be waiting on the same verdict, and only the first may retry.
    // A later one would retire the transaction that retry just started.
    if (actor.getSnapshot().value !== 'error') return
    // Only the failed attempt is retired. The machine resumes from that step,
    // so clearing every transaction would send steps that already landed back
    // to "Not Started".
    for (const id of Object.values(REGISTRATION_TX_IDS)) {
      if (transactionManager.getTransaction(id)?.getSnapshot().context.error)
        transactionManager.cancelTransaction(id)
    }
    actor.send({ type: 'RETRY' })
  }, [actor])

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  const transactions: Transaction[] = useMemo(() => {
    // A resumed run deployed its resolver in the earlier session: listing that
    // step would show it "Not Started", and its Start would begin a second
    // registration. The commit step stays until the commitment is on-chain.
    // The record holds a commitment from before the commit prompt opens, so a
    // run interrupted at that prompt never sent it (see
    // `assessRegistrationResume`).
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
    const steps: Transaction[] = setupSteps.filter(
      (step) =>
        !resumed ||
        (step.id === REGISTRATION_TX_IDS.commit && !resumed.commitmentOnChain),
    )

    if (showApprovalStep) {
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
    resumed,
    showApprovalStep,
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
    // A new token re-keys the read on its own. The same token keeps the key, so
    // ask again: an earlier run on this page may have approved meanwhile.
    if (savedParams?.tokenAddress === selectedTokenAddress) {
      void refetchAllowance()
    }
  }

  /**
   * Re-enter a run interrupted by a reload. Returns false, touching nothing,
   * when a registration is already going on this page: the machine only takes
   * RESUME from idle, and the page state belongs to the live run.
   */
  const resumeFlow = useCallback(
    ({
      record,
      token,
      signer,
      commitmentOnChain,
      approvalNeeded,
    }: ResumableRun): boolean => {
      if (!publicClient || actor.getSnapshot().value !== 'idle') return false

      setSavedParams({
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        // What the user confirmed. The machine approves the LIVE price
        // (`checkingAllowance`), so a premium that decayed meanwhile is safe.
        tokenPrice: record.context.tokenPrice,
        tokenDecimals: token.decimals,
      })
      setResumed({ commitmentOnChain })
      setApprovalPlanned(approvalNeeded)

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

  // Stop the run for a wallet that went away. Unlike a cancel, persistence
  // keeps its record, so the owner can resume it on reconnect.
  const suspendFlow = useCallback(() => {
    actor.send({ type: 'SUSPEND' })
    setResumed(null)
    setApprovalPlanned(null)
    closeModal()
    clearTransaction()
  }, [actor, closeModal, clearTransaction])

  const resetRegistration = useCallback(() => {
    actor.send({ type: 'CANCEL' })
    setResumed(null)
    setApprovalPlanned(null)
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
    hasActiveRun,
    isSuccess,
    selectedToken,
    paid,
    startFlow,
    resumeFlow,
    suspendableRunOwner,
    suspendFlow,
    resetRegistration,
  }
}
