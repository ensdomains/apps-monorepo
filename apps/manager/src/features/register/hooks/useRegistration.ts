/**
 * ENS Registration Hook - Following POC Pattern
 * - Uses useEffect to respond to step changes (like your working POC)
 * - Clean separation between commitment and registration steps
 * - Proper state management with step-based flow control
 */
import { useCallback, useEffect, useState } from 'react'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import {
  approveTokenForRegistration,
  commitToRegistration,
  generateCommitment,
  registerDomain,
  SUPPORTED_TOKENS,
} from '../services/nameChainContractService'
import { RhinestoneTransactionResult } from '@/lib/rhinestone/utils'

// ============================================================================
// TYPES
// ============================================================================

export enum RegistrationStep {
  PRICING = 'pricing',
  COMMITTING = 'committing',
  APPROVING = 'approving',
  REGISTERING = 'registering',
  SUCCESS = 'success',
  AUTORENEWAL = 'autorenewal',
  ERROR = 'error',
}

// ============================================================================
// HOOK (Following your POC pattern with useEffect step handlers)
// ============================================================================

export function useRegistration(initialName?: string) {
  const { accountAddress, sendTransaction, isConnected } = useRhinestoneAccount()

  // State management
  const [step, setStep] = useState<RegistrationStep>(RegistrationStep.PRICING)
  const [name, setName] = useState(initialName || '')
  const [duration, setDuration] = useState(1)
  const [selectedToken, setSelectedToken] = useState<`0x${string}`>(SUPPORTED_TOKENS.USDC)
  const [tokenPrice, setTokenPrice] = useState<bigint | null>(null)
  const [commitment, setCommitment] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [commitTxHash, setCommitTxHash] = useState<RhinestoneTransactionResult | null>(null)
  const [registerTxHash, setRegisterTxHash] = useState<RhinestoneTransactionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialName && initialName !== name) {
      setName(initialName)
    }
  }, [initialName, name])

  useEffect(() => {
    if (
      step === RegistrationStep.COMMITTING &&
      name &&
      accountAddress &&
      duration > 0 &&
      tokenPrice &&
      selectedToken
    ) {
      const handleCommitment = async () => {
        try {
          console.log('🔄 Starting commitment process...')

          // Step 1: Generate commitment
          // selectedToken is already an address
          const commitmentResult = await generateCommitment(
            name,
            accountAddress,
            duration,
            selectedToken,
          )

          if (commitmentResult.isErr()) {
            throw new Error(`Commitment generation failed: ${commitmentResult.error.message}`)
          }

          const { commitment: newCommitment, secret: newSecret } = commitmentResult.value

          // Step 2: Send commit transaction
          console.log('🔄 About to send commit transaction...')
          console.log('🔍 Commitment details:', {
            commitment: newCommitment,
            secret: newSecret,
            name,
            duration,
            selectedToken,
            accountAddress,
          })

          console.log('🔍 About to commit with hash:', newCommitment)
          console.log('🔍 Secret being used:', newSecret)
          console.log('🔍 Verifying commitment hash matches...')

          const commitResult = await commitToRegistration(
            newCommitment,
            sendTransaction,
            accountAddress as `0x${string}`
          )
          console.log('🔄 Commit result received:', commitResult)

          if (commitResult.isErr()) {
            console.error('❌ Commit failed:', commitResult.error)
            throw new Error(`Commitment failed: ${commitResult.error.message}`)
          }

          console.log('✅ Commit transaction successful!')
          setCommitment(newCommitment)
          setSecret(newSecret)
          setCommitTxHash(commitResult.value)

          // Move to approval step (if token needs approval)
          console.log('✅ Commitment successful, proceeding to token approval...')
          setStep(RegistrationStep.APPROVING)
        } catch (error) {
          console.error('❌ Error during commitment:', error)
          setError(error instanceof Error ? error.message : 'Commitment failed')
          setStep(RegistrationStep.ERROR)
        }
      }

      handleCommitment()
    }
  }, [
    step,
    name,
    accountAddress,
    duration,
    tokenPrice,
    selectedToken,
    sendTransaction,
  ])

  // Handle approval step - triggered when step changes to APPROVING
  useEffect(() => {
    if (
      step === RegistrationStep.APPROVING &&
      tokenPrice &&
      selectedToken
    ) {
      const handleApproval = async () => {
        try {
          // selectedToken is already an address

          // Only approve if not using ETH
          if (selectedToken !== '0x0000000000000000000000000000000000000000') {
            console.log('🔐 Approving token for registration...')
            console.log('🔍 About to call approveTokenForRegistration with:', {
              tokenAddress: selectedToken,
              amount: tokenPrice.toString(),
              ownerAddress: accountAddress,
              accountAddressType: typeof accountAddress,
              isAccountAddressValid: accountAddress?.startsWith('0x'),
            })

            const approveResult = await approveTokenForRegistration(
              selectedToken,
              tokenPrice,
              accountAddress as `0x${string}`,
              sendTransaction
            )

            if (approveResult.isErr()) {
              console.error('❌ Token approval failed:', approveResult.error)
              throw new Error(`Token approval failed: ${approveResult.error.message}`)
            }

            console.log('✅ Token approval successful:', approveResult.value)
          } else {
            console.log('⚡ Using ETH - no approval needed')
          }

          // Move to registration step after approval
          console.log('✅ Approval complete, proceeding to registration...')
          setStep(RegistrationStep.REGISTERING)
        } catch (error) {
          console.error('❌ Error during token approval:', error)
          setError(error instanceof Error ? error.message : 'Token approval failed')
          setStep(RegistrationStep.ERROR)
        }
      }

      handleApproval()
    }
  }, [step, tokenPrice, selectedToken, accountAddress, sendTransaction])

  // Handle registration step - triggered when step changes to REGISTERING
  useEffect(() => {
    if (
      step === RegistrationStep.REGISTERING &&
      name &&
      accountAddress &&
      commitment &&
      secret &&
      tokenPrice &&
      selectedToken
    ) {
      const handleRegistration = async () => {
        try {
          console.log('🚀 Starting registration process...')

          // selectedToken is already an address

          // Step 4: Register domain - approval already done in previous step
          console.log('🚀 Registering domain...')
          console.log('🔍 Registration details:', {
            name,
            accountAddress,
            secret,
            duration,
            selectedToken,
            commitment
          })

          const registerResult = await registerDomain(
            name,
            accountAddress,
            secret as `0x${string}`,
            duration,
            selectedToken,
            sendTransaction,
          )

          if (registerResult.isErr()) {
            console.error('❌ Domain registration failed:', registerResult.error)
            throw new Error(`Domain registration failed: ${registerResult.error.message}`)
          }

          console.log('✅ Domain registration successful:', registerResult.value)
          setRegisterTxHash(registerResult.value)
          setStep(RegistrationStep.SUCCESS)
        } catch (error) {
          console.error('❌ Error during registration:', error)
          setError(error instanceof Error ? error.message : 'Registration failed')
          setStep(RegistrationStep.ERROR)
        }
      }

      handleRegistration()
    }
  }, [
    step,
    name,
    accountAddress,
    commitment,
    secret,
    tokenPrice,
    selectedToken,
    duration,
    sendTransaction,
  ])

  const startCommitment = useCallback(
    (params: { tokenPrice: bigint; selectedToken?: `0x${string}` }) => {
      if (!accountAddress || !sendTransaction) {
        setError('Account not connected')
        return
      }

      setTokenPrice(params.tokenPrice)
      // Default to USDC if no token specified
      setSelectedToken(params.selectedToken || SUPPORTED_TOKENS.USDC)
      setError(null)
      setStep(RegistrationStep.COMMITTING)
    },
    [accountAddress, sendTransaction],
  )

  const retry = useCallback(() => {
    setError(null)
    setStep(RegistrationStep.PRICING)
  }, [])

  const reset = useCallback(() => {
    setName('')
    setDuration(1)
    setSelectedToken(SUPPORTED_TOKENS.USDC)
    setTokenPrice(null)
    setCommitment(null)
    setSecret(null)
    setCommitTxHash(null)
    setRegisterTxHash(null)
    setError(null)
    setStep(RegistrationStep.PRICING)
  }, [])

  const handleSetupAutorenewal = useCallback(() => {
    // Move to autorenewal step after successful registration
    setStep(RegistrationStep.AUTORENEWAL)
  }, [])

  const handleRegisterAnotherName = useCallback(() => {
    // Reset the registration state to start over with a new name
    reset()
  }, [reset])

  return {
    step,
    name,
    duration,
    selectedToken,
    commitTxHash,
    registerTxHash,
    error,
    isConnected,
    isCommitting: step === RegistrationStep.COMMITTING,
    isApproving: step === RegistrationStep.APPROVING,
    isRegistering: step === RegistrationStep.REGISTERING,
    isSuccess: step === RegistrationStep.SUCCESS,
    isAutorenewal: step === RegistrationStep.AUTORENEWAL,
    isError: step === RegistrationStep.ERROR,
    startCommitment,
    setDuration,
    setName,
    setSelectedToken,
    retry,
    reset,
    handleSetupAutorenewal,
    handleRegisterAnotherName,
  }
}