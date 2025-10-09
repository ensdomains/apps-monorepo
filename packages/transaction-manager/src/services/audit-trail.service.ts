import { ok, err, ResultAsync } from 'neverthrow'
import type {
  StateTransition,
  AuditEntry,
  DebugReport,
  ErrorSummary,
  PerformanceMetrics
} from '../types/audit.types'
import { ImportError } from '../errors/transaction.errors'

export class AuditTrailService {
  // UUID generator with fallback for non-secure contexts (HTTP)
  private generateUUID(): string {
    // Use native crypto.randomUUID if available (HTTPS/localhost)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    // Fallback for non-secure contexts (HTTP) or older browsers
    // This is typically only needed in development with IP-based URLs
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  private readonly MAX_TRANSITIONS = 1000
  private readonly MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours
  private readonly STORAGE_KEY = '@ens/audit-trail'
  private transitions: StateTransition[] = []
  private auditLog: AuditEntry[] = []
  private cleanupInterval?: NodeJS.Timeout

  constructor(
    private readonly storage: Storage = typeof window !== 'undefined' ? localStorage : null!,
    private readonly enableRemoteLogging = false
  ) {
    if (this.storage) {
      this.loadFromStorage()
      this.setupCleanupInterval()
    }
  }

  recordTransition(transition: Omit<StateTransition, 'id' | 'timestamp'>): void {
    const entry: StateTransition = {
      ...transition,
      id: this.generateUUID(),
      timestamp: Date.now()
    }

    this.transitions.push(entry)

    if (this.transitions.length > this.MAX_TRANSITIONS) {
      this.transitions.shift()
    }

    this.saveToStorage()

    if (this.enableRemoteLogging && this.shouldLogRemotely(entry)) {
      this.logToRemote(entry).catch(console.error)
    }
  }

  addAuditEntry(
    level: AuditEntry['level'],
    message: string,
    details: Record<string, unknown>
  ): void {
    const entry: AuditEntry = {
      transitionId: this.transitions[this.transitions.length - 1]?.id || 'unknown',
      timestamp: Date.now(),
      level,
      message,
      details,
      stackTrace: level === 'error' || level === 'critical'
        ? new Error().stack
        : undefined
    }

    this.auditLog.push(entry)

    if (level === 'critical') {
      console.error('[CRITICAL]', message, details)
      this.logToRemote(entry).catch(console.error)
    }

    this.saveToStorage()
  }

  getTransitionHistory(filters?: {
    machineId?: string
    fromTime?: number
    toTime?: number
    includeErrors?: boolean
  }): StateTransition[] {
    let history = [...this.transitions]

    if (filters?.machineId) {
      history = history.filter(t => t.machineId === filters.machineId)
    }

    if (filters?.fromTime) {
      history = history.filter(t => t.timestamp >= filters.fromTime)
    }

    if (filters?.toTime) {
      history = history.filter(t => t.timestamp <= filters.toTime)
    }

    if (filters?.includeErrors === false) {
      history = history.filter(t => !t.error)
    }

    return history
  }

  generateDebugReport(transactionId?: string): DebugReport {
    const relevantTransitions = transactionId
      ? this.transitions.filter(t =>
          t.metadata?.transactionHash === transactionId ||
          (t.context as any).transactionId === transactionId
        )
      : this.transitions.slice(-50)

    const relevantAuditLog = transactionId
      ? this.auditLog.filter(entry =>
          relevantTransitions.some(t => t.id === entry.transitionId)
        )
      : this.auditLog.slice(-100)

    return {
      generatedAt: Date.now(),
      systemInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        timestamp: Date.now(),
        sessionId: this.getSessionId()
      },
      transitions: relevantTransitions,
      auditLog: relevantAuditLog,
      errorSummary: this.generateErrorSummary(relevantTransitions),
      stateDistribution: this.calculateStateDistribution(relevantTransitions),
      performanceMetrics: this.calculatePerformanceMetrics(relevantTransitions)
    }
  }

  exportToJson(): string {
    return JSON.stringify({
      transitions: this.transitions,
      auditLog: this.auditLog,
      exported: Date.now()
    }, null, 2)
  }

  importFromJson(json: string): ResultAsync<void, ImportError> {
    return ResultAsync.fromPromise(
      Promise.resolve().then(() => {
        const data = JSON.parse(json)
        this.transitions = data.transitions || []
        this.auditLog = data.auditLog || []
        this.saveToStorage()
      }),
      (error) => new ImportError({ cause: error })
    )
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }

  private calculateStateDistribution(transitions: StateTransition[]): Record<string, number> {
    return transitions.reduce((acc, t) => {
      acc[t.toState] = (acc[t.toState] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  private calculatePerformanceMetrics(transitions: StateTransition[]): PerformanceMetrics {
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

  private generateErrorSummary(transitions: StateTransition[]): ErrorSummary {
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

  private setupCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.MAX_AGE
      this.transitions = this.transitions.filter(t => t.timestamp > cutoff)
      this.auditLog = this.auditLog.filter(e => e.timestamp > cutoff)
      this.saveToStorage()
    }, 60 * 60 * 1000) // Cleanup every hour
  }

  private saveToStorage(): void {
    if (!this.storage) return

    try {
      this.storage.setItem(this.STORAGE_KEY, JSON.stringify({
        transitions: this.transitions,
        auditLog: this.auditLog
      }, (key, value) => {
        // Convert BigInt to string for JSON serialization
        if (typeof value === 'bigint') {
          return value.toString()
        }
        return value
      }))
    } catch (error) {
      console.error('Failed to save audit trail:', error)
    }
  }

  private loadFromStorage(): void {
    if (!this.storage) return

    try {
      const data = this.storage.getItem(this.STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        this.transitions = parsed.transitions || []
        this.auditLog = parsed.auditLog || []
      }
    } catch (error) {
      console.error('Failed to load audit trail:', error)
    }
  }

  private shouldLogRemotely(entry: StateTransition | AuditEntry): boolean {
    return !!(
      ('error' in entry && entry.error) ||
      ('level' in entry && (entry.level === 'error' || entry.level === 'critical'))
    )
  }

  private async logToRemote(entry: StateTransition | AuditEntry): Promise<void> {
    if (!this.enableRemoteLogging) return

    try {
      await fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
    } catch (error) {
      console.error('Failed to send audit log to remote:', error)
    }
  }

  private getSessionId(): string {
    if (typeof window === 'undefined') return 'server'

    let sessionId = sessionStorage.getItem('ens-session-id')
    if (!sessionId) {
      sessionId = this.generateUUID()
      sessionStorage.setItem('ens-session-id', sessionId)
    }
    return sessionId
  }
}