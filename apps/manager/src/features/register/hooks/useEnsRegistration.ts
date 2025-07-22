import { useMachine } from '@xstate/react'
import { useCallback, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { wagmiConfig } from '@/lib/wagmi'
import {
  RegistrationStep,
  registrationMachine,
} from '../machines/registrationMachine'
import {
  CONTRACT_ADDRESSES,
  ETH_REGISTRAR_ABI,
  generateCommitment,
} from '../services/realEnsContractService'
import { calculateRegistrationPrice } from '../utils'

export { RegistrationStep } from '../machines/registrationMachine'

export function useEnsRegistration(initialName?: string) {
  const { address, isConnected, chainId } = useAccount()

  console.log('🌐 Current chain ID:', chainId)
  const { data: walletClient } = useWalletClient({ chainId })
  const [state, send] = useMachine(registrationMachine)

  useEffect(() => {
    if (initialName && initialName !== state.context.name) {
      if (
        state.context.registerTxHash &&
        state.context.name &&
        state.context.name !== initialName
      ) {
        console.log(
          '🔄 Starting new registration with different domain, resetting state',
        )
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
      console.log(
        '🔄 Recalculating pricing for:',
        state.context.name,
        'duration:',
        state.context.duration,
      )
      // Trigger pricing recalculation by setting the name again
      send({ type: 'SET_NAME', name: state.context.name })
    }
  }, [state.context.duration, state.context.name, send])

  // Timer logic for 60-second minimum commitment age (matches contract requirements)
  useEffect(() => {
    if (
      state.context.step === RegistrationStep.WAITING_FOR_COMMIT_TIME &&
      state.context.commitTimestamp > 0
    ) {
      console.log(
        '🕐 Starting timer with timestamp:',
        state.context.commitTimestamp,
      )

      const startTimestamp = state.context.commitTimestamp
      const now = Date.now()
      const elapsedTime = now - startTimestamp

      if (elapsedTime >= 60 * 1000) {
        console.log('⚡ Timer already complete, going to register')
        send({ type: 'TIMER_COMPLETE' })
      } else {
        const remaining = 60 - Math.floor(elapsedTime / 1000)
        console.log('⏰ Starting timer with remaining time:', remaining)
        send({ type: 'TIMER_TICK', remainingTime: remaining })

        const timer = setInterval(() => {
          const currentTime = Date.now()
          const elapsed = currentTime - startTimestamp

          if (elapsed >= 60 * 1000) {
            console.log('✅ Timer complete, going to register')
            send({ type: 'TIMER_COMPLETE' })
            clearInterval(timer)
          } else {
            const newRemaining = 60 - Math.floor(elapsed / 1000)
            send({ type: 'TIMER_TICK', remainingTime: newRemaining })
          }
        }, 1000)

        return () => {
          console.log('🧹 Cleaning up timer')
          clearInterval(timer)
        }
      }
    }
  }, [state.context.step, state.context.commitTimestamp, send])

  // Actions matching working implementation
  const startCommitment = useCallback(async () => {
    if (!state.context.name || !address || !isConnected || !walletClient) {
      console.log('❌ Missing required data:', {
        name: state.context.name,
        address,
        isConnected,
        walletClient: !!walletClient,
      })
      send({ type: 'ERROR', message: 'Missing required data for commitment' })
      return
    }

    try {
      console.log('🔒 Starting commit transaction for:', state.context.name)
      console.log('🌐 Current chain ID:', chainId)

      // Generate commitment like working version
      const { commitment, secret } = generateCommitment(
        state.context.name,
        address,
        state.context.duration,
      )

      console.log('🔑 Generated commitment:', commitment)
      console.log('🤫 Generated secret:', secret)

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
        abi: ETH_REGISTRAR_ABI,
        functionName: 'commit',
        args: [commitment],
      })

      console.log('✅ Commit transaction sent with hash:', hash)

      // ✅ Wait for transaction receipt to confirm it was mined
      console.log('⏳ Waiting for commit transaction confirmation...')
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
      })

      console.log('✅ Commit transaction confirmed:', receipt)

      const timestamp = Date.now()
      console.log('📅 Commit timestamp:', timestamp)

      // Send success result to state machine only after confirmation
      send({
        type: 'COMMIT_RESULT',
        commitment,
        secret,
        timestamp,
        txHash: hash,
      })

      console.log('📤 Sent COMMIT_RESULT event to state machine')
    } catch (error) {
      console.error('❌ Error in commit transaction:', error)
      send({
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to commit',
      })
    }
  }, [
    state.context.name,
    state.context.duration,
    address,
    isConnected,
    walletClient,
    chainId,
    send,
  ])

  const startRegistration = useCallback(async () => {
    if (
      !state.context.name ||
      !address ||
      !isConnected ||
      !walletClient ||
      !state.context.secret
    ) {
      send({ type: 'ERROR', message: 'Missing required data for registration' })
      return
    }

    try {
      console.log('📝 Starting register transaction for:', state.context.name)
      console.log('🌐 Current chain ID:', chainId)

      // Calculate ETH value using our price calculation function
      const valueInWei = calculateRegistrationPrice(state.context.duration)
      const durationInSeconds = BigInt(
        state.context.duration * 365 * 24 * 60 * 60,
      )
      const cleanName = state.context.name.replace('.eth', '')

      console.log('💰 Registration price in wei:', valueInWei.toString())
      console.log('⏱️ Duration in seconds:', durationInSeconds.toString())

      // Use walletClient.writeContract like working version
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
        abi: ETH_REGISTRAR_ABI,
        functionName: 'register',
        args: [
          cleanName,
          address as `0x${string}`,
          state.context.secret as `0x${string}`,
          '0x32850cAd1e9170614704fF8BA37a25e498e1B832' as `0x${string}`, // registry
          '0x0000000000000000000000000000000000000000' as `0x${string}`, // resolver
          durationInSeconds,
        ],
        value: valueInWei,
      })

      console.log('✅ Register transaction sent:', hash)

      // ✅ Wait for transaction receipt to confirm it was mined
      console.log('⏳ Waiting for register transaction confirmation...')
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId,
      })

      console.log('✅ Register transaction confirmed:', receipt)

      // Send success result to state machine only after confirmation
      send({
        type: 'REGISTER_RESULT',
        txHash: hash,
      })
    } catch (error) {
      console.error('❌ Error in register transaction:', error)
      send({
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to register',
      })
    }
  }, [
    state.context.name,
    state.context.duration,
    state.context.secret,
    address,
    isConnected,
    walletClient,
    chainId,
    send,
  ])

  // Auto-start registration when timer completes - but not if we're in an error state
  useEffect(() => {
    if (
      state.context.step === RegistrationStep.REGISTER &&
      !state.context.registerTxHash &&
      !state.context.error // Don't auto-start if there's an error
    ) {
      startRegistration()
    }
  }, [
    state.context.step,
    state.context.registerTxHash,
    state.context.error,
    startRegistration,
  ])

  // Public API
  return {
    // State
    step: state.context.step,
    domainName: state.context.name,
    duration: state.context.duration,
    pricing: state.context.pricing,
    currencyType: state.context.currencyType,
    selectedPaymentMethod: state.context.selectedPaymentMethod,
    selectedCrypto: state.context.selectedCrypto,
    error: state.context.error,

    // Timer
    remainingTime: state.context.remainingTime,

    // Transaction state
    commitTxHash: state.context.commitTxHash,
    registerTxHash: state.context.registerTxHash,
    isCommitPending: false, // We handle this differently now
    isRegisterPending: false, // We handle this differently now
    isCommitConfirming: false,
    isRegisterConfirming: false,
    isCommitSuccess: !!state.context.commitTxHash,
    isRegisterSuccess: !!state.context.registerTxHash,

    // Calculated price for registration
    calculatedPrice: calculateRegistrationPrice(state.context.duration),

    // Wallet state
    isConnected,
    address,

    // Actions
    setDomainName: (name: string) => send({ type: 'SET_NAME', name }),
    setDuration: (duration: number) => send({ type: 'SET_DURATION', duration }),
    setCurrency: (currencyType: 'ETH' | 'USD') =>
      send({ type: 'SET_CURRENCY', currencyType }),
    selectPayment: (method: 'crypto' | 'credit-card') =>
      send({ type: 'SELECT_PAYMENT', method }),
    selectCrypto: (cryptoId: string) =>
      send({ type: 'SELECT_CRYPTO', cryptoId }),

    // Flow actions
    confirmPayment: () => {
      send({ type: 'CONFIRM_PAYMENT' })
      startCommitment()
    },
    retryCommit: () => {
      send({ type: 'RETRY_COMMIT' })
      startCommitment()
    },
    skipNotifications: () => send({ type: 'SKIP_NOTIFICATIONS' }),
    setupAutorenewal: () => send({ type: 'SETUP_AUTORENEWAL' }),
    completeFlow: () => send({ type: 'COMPLETE_FLOW' }), // Clear localStorage when flow is complete
    reset: () => {
      send({ type: 'RESET' })
    },
  }
}
