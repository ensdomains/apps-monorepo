import { useCallback, useState, useEffect } from 'react'
import { AuditTrailService } from '../services/audit-trail.service'
import type { DebugReport, StateTransition } from '../types/audit.types'

export interface UseAuditTrailReturn {
  getDebugReport: (transactionId?: string) => DebugReport | null
  exportAudit: () => void
  importAudit: (file: File) => Promise<void>
  addEntry: (
    level: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    details: Record<string, unknown>
  ) => void
  getTransitionHistory: (filters?: {
    machineId?: string
    fromTime?: number
    toTime?: number
    includeErrors?: boolean
  }) => StateTransition[]
  clearAudit: () => void
}

let globalAuditService: AuditTrailService | null = null

export function useAuditTrail(): UseAuditTrailReturn {
  const [auditService] = useState(() => {
    if (!globalAuditService && typeof window !== 'undefined') {
      globalAuditService = new AuditTrailService()
    }
    return globalAuditService!
  })

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (auditService) {
        auditService.cleanup()
      }
    }
  }, [auditService])

  const getDebugReport = useCallback((transactionId?: string) => {
    if (!auditService) return null
    return auditService.generateDebugReport(transactionId)
  }, [auditService])

  const exportAudit = useCallback(() => {
    if (!auditService) return

    const json = auditService.exportToJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ens-audit-trail-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [auditService])

  const importAudit = useCallback(async (file: File) => {
    if (!auditService) return

    const text = await file.text()
    const result = await auditService.importFromJson(text)

    if (result.isErr()) {
      console.error('Failed to import audit data:', result.error)
      throw result.error
    }
  }, [auditService])

  const addEntry = useCallback((
    level: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    details: Record<string, unknown>
  ) => {
    if (!auditService) return
    auditService.addAuditEntry(level, message, details)
  }, [auditService])

  const getTransitionHistory = useCallback((filters?: {
    machineId?: string
    fromTime?: number
    toTime?: number
    includeErrors?: boolean
  }) => {
    if (!auditService) return []
    return auditService.getTransitionHistory(filters)
  }, [auditService])

  const clearAudit = useCallback(() => {
    if (!auditService || typeof window === 'undefined') return
    localStorage.removeItem('@ens/audit-trail')
    // Reinitialize the service
    globalAuditService = new AuditTrailService()
  }, [auditService])

  return {
    getDebugReport,
    exportAudit,
    importAudit,
    addEntry,
    getTransitionHistory,
    clearAudit
  }
}