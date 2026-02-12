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

export interface TransactionRunEvent {
  timestamp: number
  state: string
  eventType?: string
  hash?: string
  error?: {
    name?: string
    message?: string
    stack?: string
  }
  retryCount: number
  chainId?: number
  requestType?: string
  signerType?: string
}

export interface FailedRunPayloadV1 {
  schemaVersion: 'tm-failed-run-v1'
  runId: string
  txId: string
  status: Exclude<TransactionRunStatus, 'success'>
  startedAt: number
  endedAt: number
  durationMs: number
  eventCount: number
  truncated: boolean
  droppedEvents: number
  events: TransactionRunEvent[]
  summary: {
    finalState: string
    finalError?: {
      name?: string
      message?: string
      stack?: string
    }
    chainId?: number
    requestType?: string
    signerType?: string
  }
}

export type RunTelemetrySubscriber = (payload: FailedRunPayloadV1) => void
