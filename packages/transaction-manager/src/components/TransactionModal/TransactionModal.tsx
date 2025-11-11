import { useEffect } from 'react'
import type { TransactionModalState } from '../../types/transaction.types'
import { PaymentSelector } from './PaymentSelector'
import { TransactionDetails } from './TransactionDetails'
import { TransactionModalHeader } from './TransactionModalHeader'
import { TransactionSteps } from './TransactionSteps'

export interface TransactionModalProps extends TransactionModalState {
  onClose: () => void
  onStart?: () => void
  onContinue?: () => void
  onDone?: () => void
  onRetry?: () => void
  onPaymentSelect?: (method: string) => void
  onBack?: () => void
  machineState?: string
}

export const TransactionModal = ({
  isOpen,
  title,
  ensName,
  avatarUrl,
  network,
  estimatedCost,
  steps,
  currentStepIndex = 0,
  flowType = 'single',
  selectedPayment,
  paymentOptions,
  machineState = 'idle',
  onClose,
  onStart,
  onContinue,
  onDone,
  onRetry,
  onPaymentSelect,
  onBack,
}: TransactionModalProps) => {
  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  // Determine modal state based on machine state
  const isIdle = machineState === 'idle' || machineState === 'preparing'
  const isInProgress =
    machineState === 'submitting' ||
    machineState === 'pending' ||
    machineState === 'confirming'
  const isSuccess = machineState === 'success'
  const isError = machineState.startsWith('error')
  const isRetrying = machineState === 'retrying'

  // Debug logging
  console.log('TransactionModal - machineState:', machineState, {
    isIdle,
    isInProgress,
    isSuccess,
    isError,
    isRetrying,
  })

  // Determine button state
  const getButtonConfig = () => {
    if (isSuccess) {
      return {
        text: 'Done',
        onClick: onDone,
        disabled: false,
      }
    }

    if (isError) {
      return {
        text: 'Retry',
        onClick: onRetry,
        disabled: false,
      }
    }

    if (isInProgress || isRetrying) {
      return {
        text: isRetrying ? 'Retrying...' : 'Waiting...',
        onClick: undefined,
        disabled: true,
      }
    }

    if (steps && steps.length > 1 && currentStepIndex < steps.length - 1) {
      return {
        text: 'Continue',
        onClick: onContinue,
        disabled: false,
      }
    }

    return {
      text: 'Start',
      onClick: onStart,
      disabled: false,
    }
  }

  const buttonConfig = getButtonConfig()
  const showPaymentSelector =
    isIdle && paymentOptions && paymentOptions.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '420px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: 1,
            color: '#666',
          }}
          aria-label="Close modal"
        >
          ×
        </button>

        {/* Modal Content */}
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <TransactionModalHeader
            title={title}
            ensName={ensName}
            avatarUrl={avatarUrl}
            status={machineState}
          />

          {/* Status Indicator */}
          {isInProgress && (
            <div
              style={{
                marginTop: '16px',
                padding: '8px 12px',
                background: '#FFF3E0',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#F57C00',
                textAlign: 'center',
              }}
            >
              ⏳{' '}
              {isRetrying
                ? 'Retrying transaction...'
                : 'Transaction in progress...'}
            </div>
          )}

          {isSuccess && (
            <div
              style={{
                marginTop: '16px',
                padding: '8px 12px',
                background: '#E8F5E9',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#2E7D32',
                textAlign: 'center',
              }}
            >
              ✓ Transaction completed
            </div>
          )}

          {isError && (
            <div
              style={{
                marginTop: '16px',
                padding: '8px 12px',
                background: '#FFEBEE',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#C62828',
                textAlign: 'center',
              }}
            >
              ✗ Transaction failed
            </div>
          )}

          {/* Transaction Details */}
          <TransactionDetails
            network={network || 'Mainnet'}
            estimatedCost={estimatedCost}
            status={machineState}
          />

          {/* Multi-step Progress */}
          {steps && steps.length > 1 && (
            <TransactionSteps
              steps={steps}
              currentStepIndex={currentStepIndex}
            />
          )}

          {/* Payment Selector */}
          {showPaymentSelector && (
            <PaymentSelector
              options={paymentOptions}
              selected={selectedPayment}
              onSelect={onPaymentSelect}
            />
          )}

          {/* Action Buttons */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            {onBack && currentStepIndex > 0 && (
              <button
                onClick={onBack}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  fontSize: '16px',
                  background: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                ← Back
              </button>
            )}

            {buttonConfig.onClick && (
              <button
                onClick={buttonConfig.onClick}
                disabled={buttonConfig.disabled}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  fontSize: '16px',
                  background: buttonConfig.disabled ? '#ccc' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: buttonConfig.disabled ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {buttonConfig.text}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
