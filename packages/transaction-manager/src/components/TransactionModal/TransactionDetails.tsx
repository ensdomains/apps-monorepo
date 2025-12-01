export interface TransactionDetailsProps {
  network: string
  estimatedCost?: string
  status?: string
}

export const TransactionDetails = ({
  network,
  estimatedCost,
}: TransactionDetailsProps) => {
  return (
    <div
      style={{
        marginTop: '20px',
        padding: '16px',
        background: '#f9f9f9',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
      }}
    >
      {/* Network */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: estimatedCost ? '12px' : 0,
        }}
      >
        <span style={{ fontSize: '14px', color: '#666' }}>Network</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Mainnet Icon (simple colored circle) */}
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: network.toLowerCase().includes('sepolia')
                ? '#FFA726'
                : 'linear-gradient(135deg, #627EEA 0%, #8A92B2 100%)',
            }}
          />
          <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
            {network}
          </span>
        </div>
      </div>

      {/* Est. cost */}
      {estimatedCost && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '14px', color: '#666' }}>Est. cost</span>
          <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
            {estimatedCost}
          </span>
        </div>
      )}
    </div>
  )
}
