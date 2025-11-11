import type { TransactionStep } from '../../types/transaction.types'

export interface TransactionStepsProps {
  steps: TransactionStep[]
  currentStepIndex: number
}

export const TransactionSteps = ({
  steps,
  currentStepIndex,
}: TransactionStepsProps) => {
  if (!steps || steps.length === 0) return null

  return (
    <div style={{ marginTop: '20px' }}>
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex
        const isCompleted = step.status === 'completed'
        const isFailed = step.status === 'failed'
        const isInProgress = step.status === 'in_progress'

        // Icon based on status
        const getStepIcon = () => {
          if (isCompleted) return '✓'
          if (isFailed) return '✗'
          if (isInProgress) return '⟳'
          return '→'
        }

        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px',
              marginBottom: index < steps.length - 1 ? '8px' : 0,
              background: isActive ? '#f5f5f5' : 'transparent',
              borderRadius: '8px',
              borderLeft: `3px solid ${
                isCompleted
                  ? '#4CAF50'
                  : isFailed
                    ? '#F44336'
                    : isInProgress
                      ? '#2196F3'
                      : '#E0E0E0'
              }`,
            }}
          >
            {/* Step Icon */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                background: isCompleted
                  ? '#4CAF50'
                  : isFailed
                    ? '#F44336'
                    : isInProgress
                      ? '#2196F3'
                      : '#E0E0E0',
                color:
                  isCompleted || isFailed || isInProgress ? 'white' : '#666',
                flexShrink: 0,
              }}
            >
              {getStepIcon()}
            </div>

            {/* Step Content */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '500',
                  color: isFailed ? '#F44336' : '#333',
                  marginBottom: step.description ? '4px' : 0,
                }}
              >
                {step.title}
              </div>

              {step.description && (
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {step.description}
                </div>
              )}

              {/* Transaction Hash Link */}
              {step.hash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${step.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '12px',
                    color: '#2196F3',
                    textDecoration: 'none',
                    display: 'inline-block',
                    marginTop: '4px',
                  }}
                >
                  View transaction ↗
                </a>
              )}

              {/* Error Message */}
              {isFailed && step.error && (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#F44336',
                    marginTop: '4px',
                    padding: '8px',
                    background: '#FFEBEE',
                    borderRadius: '4px',
                  }}
                >
                  {step.error}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
