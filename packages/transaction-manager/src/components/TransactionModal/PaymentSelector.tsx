import type {
  PaymentMethod,
  PaymentOption,
} from '../../types/transaction.types'

export interface PaymentSelectorProps {
  options: PaymentOption[]
  selected?: PaymentMethod
  onSelect?: (method: string) => void
}

export const PaymentSelector = ({
  options,
  selected,
  onSelect,
}: PaymentSelectorProps) => {
  if (!options || options.length === 0) return null

  return (
    <div style={{ marginTop: '20px' }}>
      <h3
        style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#333',
          marginBottom: '12px',
        }}
      >
        Choose payment
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((option) => {
          const isSelected = selected === option.method

          return (
            <button
              type="button"
              key={option.method}
              onClick={() => onSelect?.(option.method)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: isSelected ? '#E3F2FD' : 'white',
                border: `2px solid ${isSelected ? '#2196F3' : '#E0E0E0'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                {/* Radio button */}
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? '#2196F3' : '#ccc'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: '#2196F3',
                      }}
                    />
                  )}
                </div>

                {/* Token icon placeholder */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: option.method.includes('usdc')
                      ? '#2775CA'
                      : 'linear-gradient(135deg, #627EEA 0%, #8A92B2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  {option.method.includes('usdc') ? 'U' : 'Ξ'}
                </div>

                {/* Label and network */}
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#333',
                    }}
                  >
                    {option.label}
                  </div>
                  {option.network && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {option.network}
                    </div>
                  )}
                </div>
              </div>

              {/* Balance */}
              {option.balance && (
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {option.balance}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
