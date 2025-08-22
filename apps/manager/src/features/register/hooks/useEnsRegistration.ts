import { useMachine } from '@xstate/react'
import { useCallback, useEffect } from 'react'
import { useAccountAbstraction } from '@/lib/web3Auth/useAccountAbstraction'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'
import {
  RegistrationStep,
  registrationMachine,
} from '../machines/registrationMachine'
import {
  approveTokenForRegistration,
  commitToRegistration,
  generateCommitment,
  registerDomain,
} from '../services/nameChainContractService'

export { RegistrationStep } from '../machines/registrationMachine'

export function useEnsRegistration(initialName?: string) {
  const [state, send] = useMachine(registrationMachine)
  const { smartAccountInfo, refreshSmartAccountInfo } = useAccountAbstraction()

  useEffect(() => {
    if (initialName && initialName !== state.context.name) {
      send({ type: 'SET_NAME', name: initialName })
    }
  }, [initialName, state.context.name, send])

  useEffect(() => {
    if (
      smartAccountInfo?.address &&
      smartAccountInfo.address !== state.context.ownerAddress
    ) {
      send({ type: 'SET_OWNER_ADDRESS', address: smartAccountInfo.address })
    }
  }, [smartAccountInfo?.address, state.context.ownerAddress, send])

  useEffect(() => {
    if (state.context.duration === 0) {
      send({ type: 'SET_DURATION', duration: 1 })
    }
  }, [state.context.duration, send])

  useEffect(() => {
    if (state.context.step === RegistrationStep.WAITING_FOR_COMMIT_TIME) {
      let remainingTime = state.context.remainingTime
      if (remainingTime <= 0 && state.context.commitTimestamp > 0) {
        const now = Math.floor(Date.now() / 1000)
        const elapsed = now - state.context.commitTimestamp
        remainingTime = Math.max(0, 20 - elapsed)
      }

      if (remainingTime <= 0) {
        remainingTime = 20
      }

      const timer = setInterval(() => {
        remainingTime = Math.max(0, remainingTime - 1)

        if (remainingTime > 0) {
          send({
            type: 'TIMER_TICK',
            remainingTime,
          })
        } else {
          send({ type: 'TIMER_COMPLETE' })
          clearInterval(timer)
        }
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [
    state.context.step,
    state.context.commitTimestamp,
    state.context.remainingTime,
    send,
  ])

  useEffect(() => {
    if (
      state.context.step === RegistrationStep.MAKE_COMMITMENT &&
      state.context.name &&
      smartAccountInfo?.address &&
      state.context.duration > 0
    ) {
      const handleCommitment = async () => {
        try {
          const { commitment, secret } = await generateCommitment(
            state.context.name,
            smartAccountInfo.address,
            state.context.duration,
          )

          const walletClient = web3AuthService.getWalletClient()
          if (!walletClient) {
            throw new Error('Wallet client not available')
          }

          if (!smartAccountInfo?.address) {
            throw new Error('Smart account not available')
          }

          const commitTxHash = await commitToRegistration(
            commitment,
            walletClient,
          )

          send({
            type: 'COMMIT_RESULT',
            commitment,
            secret,
            timestamp: Math.floor(Date.now() / 1000),
            txHash: commitTxHash,
          })
        } catch (error) {
          console.error('❌ Error during commitment:', error)
        }
      }

      handleCommitment()
    }
  }, [
    state.context.step,
    state.context.name,
    state.context.duration,
    send,
    smartAccountInfo?.address,
  ])

  useEffect(() => {
    if (
      state.context.step === RegistrationStep.REGISTER &&
      state.context.name &&
      state.context.ownerAddress &&
      state.context.commitment &&
      state.context.secret
    ) {
      const handleRegistration = async () => {
        try {
          const walletClient = web3AuthService.getWalletClient()
          if (!walletClient) {
            throw new Error('Wallet client not available')
          }

          if (!smartAccountInfo?.address) {
            throw new Error('Smart account not available')
          }

          // First approve token if needed
          if (
            state.context.selectedTokenForRegistration &&
            state.context.tokenPrice
          ) {
            try {
              const approveTxHash = await approveTokenForRegistration(
                state.context.selectedTokenForRegistration as `0x${string}`,
                state.context.tokenPrice,
                walletClient,
              )
              console.log('✅ Token approval successful:', approveTxHash)
            } catch (error) {
              console.error('❌ Token approval failed:', error)
              send({
                type: 'ERROR',
                message: `Token approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              })
              return
            }
          }

          // Only proceed with registration if approval succeeded (or wasn't needed)
          try {
            const registerTxHash = await registerDomain(
              state.context.name,
              smartAccountInfo.address,
              state.context.duration,
              state.context.secret as `0x${string}`,
              walletClient,
              state.context.selectedTokenForRegistration as `0x${string}`,
            )

            send({
              type: 'REGISTER_RESULT',
              txHash: registerTxHash,
            })
          } catch (error) {
            console.error('❌ Domain registration failed:', error)
            send({
              type: 'ERROR',
              message: `Domain registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            })
          }
        } catch (error) {
          console.error('❌ Error during registration:', error)
        }
      }

      handleRegistration()
    }
  }, [
    state.context.step,
    state.context.name,
    state.context.ownerAddress,
    state.context.commitment,
    state.context.secret,
    state.context.selectedTokenForRegistration,
    state.context.tokenPrice,
    state.context.duration,
    send,
    smartAccountInfo?.address,
  ])

  return {
    step: state.context.step,
    domainName: state.context.name,
    duration: state.context.duration,
    remainingTime: state.context.remainingTime,
    commitTxHash: state.context.commitTxHash,
    registerTxHash: state.context.registerTxHash,
    isCommitPending: state.matches('makeCommitment'),
    isRegisterPending: state.matches('registerInProgress'),
    isRegisterConfirming: false,
    isConnected: web3AuthService.isConnected,
    selectedToken: state.context.selectedTokenForRegistration,
    smartAccount: {
      smartAccountAddress: smartAccountInfo?.address,
      smartAccountReady: !!smartAccountInfo?.address,
      stablecoinBalances: smartAccountInfo?.stablecoinBalances || [],
    },
    refreshSmartAccountInfo,
    setDuration: useCallback(
      (duration: number) => {
        send({ type: 'SET_DURATION', duration })
      },
      [send],
    ),
    selectPayment: useCallback(
      (method: 'crypto' | 'credit-card') => {
        send({ type: 'SELECT_PAYMENT', method })
      },
      [send],
    ),
    selectCrypto: useCallback(
      (cryptoId: string) => {
        send({ type: 'SELECT_CRYPTO', cryptoId })
      },
      [send],
    ),
    confirmPayment: useCallback(
      (tokenPrice: number, selectedToken: any) => {
        send({
          type: 'SET_TOKEN_INFO',
          tokenPrice: BigInt(tokenPrice),
          selectedToken: selectedToken.address || selectedToken,
        })
        send({ type: 'CONFIRM_PAYMENT' })
      },
      [send],
    ),
    retryCommit: useCallback(() => {
      send({ type: 'RETRY_COMMIT' })
    }, [send]),
    skipNotifications: useCallback(() => {
      send({ type: 'SKIP_NOTIFICATIONS' })
    }, [send]),
    setupAutorenewal: useCallback(() => {
      send({ type: 'SETUP_AUTORENEWAL' })
    }, [send]),
    completeFlow: useCallback(() => {
      send({ type: 'COMPLETE_FLOW' })
    }, [send]),
    reset: useCallback(() => {
      send({ type: 'RESET' })
    }, [send]),
  }
}
