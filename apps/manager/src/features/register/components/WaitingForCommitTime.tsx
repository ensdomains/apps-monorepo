

interface WaitingForCommitTimeProps {
  domainName: string
  remainingTime: number
  commitTxHash?: string
  onSkip?: () => void
}

export function WaitingForCommitTime({
  domainName,
  remainingTime,
  commitTxHash,
  onSkip,
}: WaitingForCommitTimeProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercentage = ((60 - remainingTime) / 60) * 100

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 text-lg font-semibold text-gray-900">
          Waiting for commit confirmation
        </div>
        <div className="inline-flex items-center rounded bg-foreground px-3 py-1 font-bold font-mono text-background text-lg">
          {domainName}
        </div>
      </div>

      {/* Timer Circle */}
      <div className="relative mx-auto mb-6 h-32 w-32">
        <svg className="h-32 w-32 -rotate-90 transform" aria-label="Countdown timer">
          <title>Countdown Timer</title>
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={`${2 * Math.PI * 56}`}
            strokeDashoffset={`${2 * Math.PI * 56 * (1 - progressPercentage / 100)}`}
            className="text-blue-500 transition-all duration-1000 ease-linear"
            strokeLinecap="round"
          />
        </svg>
        
        {/* Timer text in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatTime(remainingTime)}
            </div>
            <div className="text-xs text-gray-500">remaining</div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 space-y-2 text-sm text-gray-600">
        <p>
          Your commit transaction has been confirmed. We need to wait 1 minute
          before proceeding with the registration.
        </p>
        <p>
          This waiting period is required by the ENS protocol to prevent front-running attacks.
        </p>
        {commitTxHash && (
          <p className="text-xs">
            <span className="font-medium">Commit TX:</span>{' '}
            <span className="font-mono break-all">{commitTxHash}</span>
          </p>
        )}
      </div>

      {/* Status */}
      <div className="mb-6">
        {remainingTime > 0 ? (
          <div className="flex items-center justify-center space-x-2 text-sm text-amber-600">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
            <span>Please wait, registration will start automatically...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2 text-sm text-green-600">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>Ready to register! Starting registration...</span>
          </div>
        )}
      </div>

      
    </div>
  )
} 