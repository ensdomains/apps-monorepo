import { ResultAsync } from 'neverthrow'
import type {
  StateTransition,
  AuditEntry,
  DebugReport,
  ErrorSummary,
  PerformanceMetrics
} from '../types/audit.types'
import { ImportError } from '../errors/transaction.errors'

// Constants
const MAX_TRANSITIONS = 1000
const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours
const STORAGE_KEY = '@ens/audit-trail'

// Types
interface AuditTrailData {
  transitions: StateTransition[]
  auditLog: AuditEntry[]
}

// Helper: UUID generator with fallback for non-secure contexts
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback for non-secure contexts (HTTP) or older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Helper: Get or create session ID
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  let sessionId = sessionStorage.getItem('ens-session-id')
  if (!sessionId) {
    sessionId = generateUUID()
    sessionStorage.setItem('ens-session-id', sessionId)
  }
  return sessionId
}

// Storage helpers (can be easily mocked in tests)
function loadFromStorage(): AuditTrailData {
  if (typeof window === 'undefined' || !localStorage) {
    return { transitions: [], auditLog: [] }
  }

  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return { transitions: [], auditLog: [] }

    const parsed = JSON.parse(data)
    return {
      transitions: parsed.transitions || [],
      auditLog: parsed.auditLog || []
    }
  } catch (error) {
    console.warn('Failed to load audit trail from storage:', error)
    return { transitions: [], auditLog: [] }
  }
}

function saveToStorage(data: AuditTrailData): void {
  if (typeof window === 'undefined' || !localStorage) return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, (key, value) => {
      // Convert BigInt to string for JSON serialization
      if (typeof value === 'bigint') {
        return value.toString()
      }
      return value
    }))
  } catch (error) {
    console.warn('Failed to save audit trail to storage:', error)
  }
}

// Public API

export function recordTransition(transition: Omit<StateTransition, 'id' | 'timestamp'>): void {
  try {
    const data = loadFromStorage()

    const entry: StateTransition = {
      ...transition,
      id: generateUUID(),
      timestamp: Date.now()
    }

    data.transitions.push(entry)

    // Keep only last MAX_TRANSITIONS entries
    if (data.transitions.length > MAX_TRANSITIONS) {
      data.transitions.shift()
    }

    saveToStorage(data)
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
  }
}

export function addAuditEntry(
  level: AuditEntry['level'],
  message: string,
  details: Record<string, unknown>
): void {
  try {
    const data = loadFromStorage()

    const entry: AuditEntry = {
      transitionId: data.transitions[data.transitions.length - 1]?.id || 'unknown',
      timestamp: Date.now(),
      level,
      message,
      details,
      stackTrace: level === 'error' || level === 'critical'
        ? new Error().stack
        : undefined
    }

    data.auditLog.push(entry)

    if (level === 'critical') {
      console.error('[CRITICAL]', message, details)
    }

    saveToStorage(data)
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
  }
}

export function getTransitionHistory(filters?: {
  machineId?: string
  fromTime?: number
  toTime?: number
  includeErrors?: boolean
}): StateTransition[] {
  try {
    const data = loadFromStorage()
    let history = [...data.transitions]

    if (filters?.machineId) {
      history = history.filter(t => t.machineId === filters.machineId)
    }

    if (filters?.fromTime !== undefined) {
      const fromTime = filters.fromTime
      history = history.filter(t => t.timestamp >= fromTime)
    }

    if (filters?.toTime !== undefined) {
      const toTime = filters.toTime
      history = history.filter(t => t.timestamp <= toTime)
    }

    if (filters?.includeErrors === false) {
      history = history.filter(t => !t.error)
    }

    return history
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
    return []
  }
}

export function generateDebugReport(transactionId?: string): DebugReport | null {
  try {
    const data = loadFromStorage()

    const relevantTransitions = transactionId
      ? data.transitions.filter(t =>
          t.metadata?.transactionHash === transactionId ||
          (t.context as any).transactionId === transactionId
        )
      : data.transitions.slice(-50)

    const relevantAuditLog = transactionId
      ? data.auditLog.filter(entry =>
          relevantTransitions.some(t => t.id === entry.transitionId)
        )
      : data.auditLog.slice(-100)

    return {
      generatedAt: Date.now(),
      systemInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        timestamp: Date.now(),
        sessionId: getSessionId()
      },
      transitions: relevantTransitions,
      auditLog: relevantAuditLog,
      errorSummary: generateErrorSummary(relevantTransitions),
      stateDistribution: calculateStateDistribution(relevantTransitions),
      performanceMetrics: calculatePerformanceMetrics(relevantTransitions)
    }
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
    return null
  }
}

export function exportToJson(): string {
  try {
    const data = loadFromStorage()
    return JSON.stringify({
      transitions: data.transitions,
      auditLog: data.auditLog,
      exported: Date.now()
    }, null, 2)
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
    return JSON.stringify({ transitions: [], auditLog: [], exported: Date.now() }, null, 2)
  }
}

export function importFromJson(json: string): ResultAsync<void, ImportError> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => {
      try {
        const parsed = JSON.parse(json)
        const data: AuditTrailData = {
          transitions: parsed.transitions || [],
          auditLog: parsed.auditLog || []
        }
        saveToStorage(data)
      } catch (error) {
        throw new ImportError({ cause: error })
      }
    }),
    (error) => new ImportError({ cause: error })
  )
}

export function clearAuditTrail(): void {
  try {
    if (typeof window !== 'undefined' && localStorage) {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Audit service error (non-fatal):', error)
  }
}

// Helper functions

function calculateStateDistribution(transitions: StateTransition[]): Record<string, number> {
  return transitions.reduce((acc, t) => {
    acc[t.toState] = (acc[t.toState] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}

function calculatePerformanceMetrics(transitions: StateTransition[]): PerformanceMetrics {
  if (transitions.length < 2) {
    return {
      avgTransitionTime: 0,
      maxTransitionTime: 0,
      minTransitionTime: 0,
      totalTransitions: transitions.length
    }
  }

  const durations: number[] = []
  for (let i = 1; i < transitions.length; i++) {
    durations.push(transitions[i].timestamp - transitions[i - 1].timestamp)
  }

  return {
    avgTransitionTime: durations.reduce((a, b) => a + b, 0) / durations.length,
    maxTransitionTime: Math.max(...durations),
    minTransitionTime: Math.min(...durations),
    totalTransitions: transitions.length
  }
}

function generateErrorSummary(transitions: StateTransition[]): ErrorSummary {
  const errors = transitions.filter(t => t.error)
  const errorTypes = errors.reduce((acc, t) => {
    const errorType = t.error?.name || 'Unknown'
    acc[errorType] = (acc[errorType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    totalErrors: errors.length,
    errorRate: transitions.length > 0 ? (errors.length / transitions.length) * 100 : 0,
    errorTypes,
    lastError: errors[errors.length - 1]?.error
  }
}

// Cleanup: Run periodically to remove old entries
if (typeof window !== 'undefined') {
  setInterval(() => {
    try {
      const data = loadFromStorage()
      const cutoff = Date.now() - MAX_AGE

      data.transitions = data.transitions.filter(t => t.timestamp > cutoff)
      data.auditLog = data.auditLog.filter(e => e.timestamp > cutoff)

      saveToStorage(data)
    } catch (error) {
      console.warn('Audit cleanup error (non-fatal):', error)
    }
  }, 60 * 60 * 1000) // Run every hour
}
