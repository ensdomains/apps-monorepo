export interface TransactionModalHeaderProps {
  title?: string
  ensName?: string
  avatarUrl?: string
  status?: string
}

export const TransactionModalHeader = ({
  title,
  ensName,
  avatarUrl,
  status,
}: TransactionModalHeaderProps) => {
  // Determine status label
  const getStatusLabel = () => {
    if (status === 'success') return 'Done'
    if (status?.startsWith('error')) return 'Failed'
    if (
      status === 'submitting' ||
      status === 'pending' ||
      status === 'retrying'
    ) {
      return 'In Progress'
    }
    if (status === 'preparing' || status === 'idle') return 'Not started'
    return status
  }

  const statusLabel = getStatusLabel()

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Avatar and ENS Name */}
      {ensName && (
        <div style={{ marginBottom: '16px' }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={ensName}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                objectFit: 'cover',
                marginBottom: '12px',
              }}
            />
          ) : (
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                color: 'white',
                fontWeight: 'bold',
                marginBottom: '12px',
              }}
            >
              {ensName.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#333',
              marginBottom: '4px',
            }}
          >
            {ensName}
          </div>
        </div>
      )}

      {/* Title with status tag */}
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              color: '#666',
              background: '#f5f5f5',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            {title}
          </span>
          {statusLabel && (
            <span
              style={{
                fontSize: '12px',
                color: '#666',
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#f5f5f5',
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
