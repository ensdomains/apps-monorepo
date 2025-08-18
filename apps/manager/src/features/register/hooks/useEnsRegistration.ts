import { useMachine } from '@xstate/react'
import { useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'
import {
  RegistrationStep,
  registrationMachine,
} from '../machines/registrationMachine'
import {
  approveTokenForRegistration,
  CONTRACT_ADDRESSES,
  ETH_REGISTRAR_ABI,
  generateCommitmentViaContract,
  registerDomain,
} from '../services/nameChainContractService'

export { RegistrationStep } from '../machines/registrationMachine'

export function useEnsRegistration(initialName?: string) {
  const [state, send] = useMachine(registrationMachine)

  // Use wagmi useAccount hook which now integrates with Web3Auth
  const { address, isConnected } = useAccount()

  // Get token selection from machine state
  const selectedToken = state.context.selectedToken

  useEffect(() => {
    if (initialName && initialName !== state.context.name) {
      if (
        state.context.registerTxHash &&
        state.context.name &&
        state.context.name !== initialName
      ) {
        send({ type: 'RESET' })
      }

      send({ type: 'SET_NAME', name: initialName })
    }
  }, [initialName, state.context.name, state.context.registerTxHash, send])

  useEffect(() => {
    if (address && address !== state.context.ownerAddress) {
      send({ type: 'SET_OWNER_ADDRESS', address })
    }
  }, [address, state.context.ownerAddress, send])

  useEffect(() => {
    if (state.context.name && state.context.duration > 0) {
      // Trigger pricing recalculation by setting the name again
      send({ type: 'SET_NAME', name: state.context.name })
    }
  }, [state.context.duration, state.context.name, send])

  // Note: Token pricing is now handled in UI components

  useEffect(() => {
    if (
      state.context.step === RegistrationStep.WAITING_FOR_COMMIT_TIME &&
      state.context.commitTimestamp > 0
    ) {
      // ✅ FIX: Use seconds consistently
      const startTimestamp = state.context.commitTimestamp // This is in SECONDS
      const now = Math.floor(Date.now() / 1000) // Convert to SECONDS
      const elapsedTime = now - startTimestamp // Now both are in SECONDS

      if (elapsedTime >= 90) {
        console.log('✅ Timer complete, proceeding to register')
        send({ type: 'TIMER_COMPLETE' })
      } else {
        const remaining = 90 - elapsedTime // Remaining seconds
        send({ type: 'TIMER_TICK', remainingTime: remaining })

        const timer = setInterval(() => {
          const currentTime = Math.floor(Date.now() / 1000) // Convert to SECONDS
          const elapsed = currentTime - startTimestamp // Both in SECONDS

          if (elapsed >= 90) {
            console.log('✅ Timer complete, proceeding to register')
            send({ type: 'TIMER_COMPLETE' })
            clearInterval(timer)
          } else {
            const newRemaining = 90 - elapsed
            send({ type: 'TIMER_TICK', remainingTime: newRemaining })
          }
        }, 1000)

        return () => {
          clearInterval(timer)
        }
      }
    }
  }, [state.context.step, state.context.commitTimestamp, send])
  // OLD
  // const startCommitment = useCallback(async () => {
  //   if (
  //     !state.context.name ||
  //     !address ||
  //     !isConnected ||
  //     !web3AuthService.isReady
  //   ) {
  //     console.log('❌ Missing required data:', {
  //       name: state.context.name,
  //       address,
  //       isConnected,
  //       web3AuthReady: web3AuthService.isReady,
  //     })
  //     send({ type: 'ERROR', message: 'Missing required data for commitment' })
  //     return
  //   }

  //   try {
  //     console.log('🔒 Starting commit transaction for:', state.context.name)
  //     console.log('🌐 Current chain ID:', chainId)

  //     const { commitment, secret } = generateCommitment(
  //       state.context.name,
  //       address,
  //       state.context.duration,
  //     )

  //     console.log('🔑 Generated commitment:', commitment)
  //     console.log('🤫 Generated secret:', secret)

  //     // Use Web3Auth service instead of wagmi walletClient
  //     const hash = await web3AuthService.writeContract(
  //       CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
  //       ETH_REGISTRAR_ABI as unknown as unknown[],
  //       'commit',
  //       [commitment],
  //     )

  //     console.log('✅ Commit transaction sent with hash:', hash)

  //     console.log('📅 Commit timestamp:', Date.now())

  //     send({
  //       type: 'COMMIT_RESULT',
  //       commitment,
  //       secret,
  //       timestamp: Math.floor(Date.now() / 1000),
  //       txHash: hash,
  //     })

  //     console.log('📤 Sent COMMIT_RESULT event to state machine')
  //     console.log('🔑 Sent secret in COMMIT_RESULT:', secret)
  //   } catch (error) {
  //     console.error('❌ Error in commit transaction:', error)
  //     send({
  //       type: 'ERROR',
  //       message: error instanceof Error ? error.message : 'Failed to commit',
  //     })
  //   }
  // }, [
  //   state.context.name,
  //   state.context.duration,
  //   address,
  //   isConnected,
  //   chainId,
  //   send,
  // ])

  const startCommitment = useCallback(async () => {
    if (
      !state.context.name ||
      !address ||
      !isConnected ||
      !web3AuthService.isReady
    ) {
      send({ type: 'ERROR', message: 'Missing required data for commitment' })
      return
    }

    try {
      // ✅ Use service function for commitment generation
      const commitmentResult = await generateCommitmentViaContract(
        state.context.name,
        address,
        state.context.duration,
        web3AuthService,
      )

      if (commitmentResult.isErr()) {
        throw new Error(
          `Failed to generate commitment: ${commitmentResult.error.message}`,
        )
      }

      const { commitment, secret } = commitmentResult.value

      // Use Web3Auth service instead of wagmi walletClient
      const hash = await web3AuthService.writeContract(
        CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
        ETH_REGISTRAR_ABI as unknown as unknown[],
        'commit',
        [commitment],
      )

      console.log('✅ Commitment transaction sent:', hash)

      send({
        type: 'COMMIT_RESULT',
        commitment,
        secret,
        timestamp: Math.floor(Date.now() / 1000), // ✅ Seconds, not milliseconds
        txHash: hash,
      })
    } catch (error) {
      console.error('❌ Error in commit transaction:', error)
      send({
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to commit',
      })
    }
  }, [state.context.name, state.context.duration, address, isConnected, send])

  const startRegistration = useCallback(
    async (tokenPrice: bigint, selectedToken: string) => {
      try {
        // Note: Duration conversion and name cleaning now handled in registerDomain service

        // Step 1: Approve tokens for the registrar

        const approveResult = await approveTokenForRegistration(
          selectedToken,
          tokenPrice,
          web3AuthService,
        )

        if (approveResult.isErr()) {
          throw new Error(
            `Token approval failed: ${approveResult.error.message}`,
          )
        }

        // Step 2: Register the domain using the service function

        const registerResult = await registerDomain(
          state.context.name,
          address as `0x${string}`,
          state.context.secret,
          state.context.duration,
          selectedToken,
          web3AuthService,
        )

        if (registerResult.isErr()) {
          throw new Error(
            `Domain registration failed: ${registerResult.error.message}`,
          )
        }

        const registerHash = registerResult.value
        console.log('✅ Registration complete:', registerHash)

        send({
          type: 'REGISTER_RESULT',
          txHash: registerHash,
        })
      } catch (error) {
        console.error('❌ Registration failed:', error)
        send({
          type: 'ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to register',
        })
      }
    },
    [
      state.context.name,
      state.context.duration,
      state.context.secret,
      address,
      send,
    ],
  )

  // Auto-trigger registration when timer completes
  useEffect(() => {
    if (
      state.context.step === RegistrationStep.REGISTER &&
      state.context.tokenPrice &&
      state.context.selectedTokenForRegistration &&
      state.context.secret
    ) {
      // Start registration with stored token info
      startRegistration(
        state.context.tokenPrice,
        state.context.selectedTokenForRegistration,
      )
    }
  }, [
    state.context.step,
    state.context.tokenPrice,
    state.context.selectedTokenForRegistration,
    state.context.secret,
    startRegistration,
  ])

  // Note: startRegistration now requires tokenPrice and selectedToken parameters
  // These will be passed when confirmPayment is called

  // Public API
  return {
    step: state.context.step,
    domainName: state.context.name,
    duration: state.context.duration,
    selectedPaymentMethod: state.context.selectedPaymentMethod,
    selectedCrypto: state.context.selectedCrypto,
    error: state.context.error,
    remainingTime: state.context.remainingTime,
    commitTxHash: state.context.commitTxHash,
    registerTxHash: state.context.registerTxHash,
    isCommitPending: false,
    isRegisterPending: false,
    isCommitConfirming: false,
    isRegisterConfirming: false,
    isCommitSuccess: !!state.context.commitTxHash,
    isRegisterSuccess: !!state.context.registerTxHash,
    isConnected,
    address,
    selectedToken,
    setSelectedToken: (tokenAddress: string) =>
      send({ type: 'SELECT_TOKEN', tokenAddress }),
    setDomainName: (name: string) => send({ type: 'SET_NAME', name }),
    setDuration: (duration: number) => send({ type: 'SET_DURATION', duration }),
    selectPayment: (method: 'crypto' | 'credit-card') =>
      send({ type: 'SELECT_PAYMENT', method }),
    selectCrypto: (cryptoId: string) =>
      send({ type: 'SELECT_CRYPTO', cryptoId }),
    confirmPayment: (tokenPrice: bigint, selectedToken: string) => {
      // Store token info for later use when timer completes
      send({ type: 'SET_TOKEN_INFO', tokenPrice, selectedToken })
      send({ type: 'CONFIRM_PAYMENT' })
      startCommitment()
      // Note: startRegistration will be called when timer completes
      // via the TIMER_COMPLETE event in the state machine
    },
    retryCommit: () => {
      send({ type: 'RETRY_COMMIT' })
      startCommitment()
    },
    skipNotifications: () => {
      send({ type: 'SKIP_NOTIFICATIONS' })
    },
    setupAutorenewal: () => {
      send({ type: 'SETUP_AUTORENEWAL' })
    },
    completeFlow: () => {
      send({ type: 'COMPLETE_FLOW' })
    },
    reset: () => {
      send({ type: 'RESET' })
    },
  }
}
