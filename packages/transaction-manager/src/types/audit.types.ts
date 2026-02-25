export interface StateTransition {
  id: string
  timestamp: number
  machineId: string
  fromState: string
  toState: string
  event: string
  context: Record<string, unknown>
  error?: Error
  metadata?: {
    userId?: string
    sessionId?: string
    chainId?: number
    transactionHash?: string
  }
}

export interface AuditEntry {
  transitionId: string
  timestamp: number
  level: 'info' | 'warning' | 'error' | 'critical'
  message: string
  details: Record<string, unknown>
  stackTrace?: string
}

export interface DebugReport {
  generatedAt: number
  systemInfo: {
    userAgent: string
    timestamp: number
    sessionId?: string
  }
  transitions: StateTransition[]
  auditLog: AuditEntry[]
  errorSummary: ErrorSummary
  stateDistribution: Record<string, number>
  performanceMetrics: PerformanceMetrics
}

export interface ErrorSummary {
  totalErrors: number
  errorRate: number
  errorTypes: Record<string, number>
  lastError?: Error
}

export interface PerformanceMetrics {
  avgTransitionTime: number
  maxTransitionTime: number
  minTransitionTime: number
  totalTransitions: number
}

export type TransactionRunStatus = 'success' | 'error' | 'cancelled'

export type TransactionPhase =
  | 'idle'
  | 'preparing'
  | 'submitting'
  | 'pending'
  | 'checkingFallback'
  | 'confirming'
  | 'retrying'
  | 'success'
  | 'error'
  | 'unknown'

export interface SerializedRunError {
  name?: string
  message?: string
  stack?: string
  code?: string | number
  cause?: SerializedRunError
}

export interface TransactionRunEventV2 {
  sequence: number
  timestamp: number
  deltaMs: number
  phase: TransactionPhase
  substate?: string
  reason: string
  state: string
  retryCount: number
  hash?: string
  userOpHash?: string
  context: Record<string, unknown>
  error?: SerializedRunError
  isTerminal: boolean
}

export interface TransactionRunInitialSnapshot {
  txId: string
  createdAt: number
  chainId?: number
  intentType?: string
  requestType?: string
  signerType?: string
  useSmartAccount: boolean
  options: {
    retryCount?: number
    retryDelay?: number
    timeout?: number
    confirmations?: number
    usePrivateMempool?: boolean
    hasModalConfig: boolean
  }
  request?: {
    from?: string
    to?: string
    value?: string
    nonce?: number
    gas?: string
    gasPrice?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
    data?: string
    dataTruncated?: boolean
    dataBytes?: number
    dataSelector?: string
  }
  smartAccount: {
    enabled: boolean
    signerType?: string
    accountType?: string
    sponsored?: boolean
  }
}

export interface FailedRunPayloadV2 {
  schemaVersion: 'tm-failed-run-v2'
  run: {
    runId: string
    txId: string
    status: Exclude<TransactionRunStatus, 'success'>
    startedAt: number
    endedAt: number
    durationMs: number
  }
  initial: TransactionRunInitialSnapshot
  timeline: TransactionRunEventV2[]
  summary: {
    finalState: string
    failureStage: string
    attemptCount: number
    firstErrorName?: string
    finalErrorName?: string
    finalError?: SerializedRunError
    chainId?: number
    intentType?: string
    requestType?: string
    signerType?: string
    hash?: string
    userOpHash?: string
    requestFingerprint: string
  }
  truncation: {
    truncated: boolean
    droppedEvents: number
    totalEvents: number
  }
}

export type RunTelemetrySubscriber = (payload: FailedRunPayloadV2) => void

export type RunTelemetryEventSubscriber = (event: {
  runId: string
  txId: string
  status?: TransactionRunStatus
  event: TransactionRunEventV2
}) => void
