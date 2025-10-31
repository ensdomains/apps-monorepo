import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditTrailService } from './audit-trail.service'

describe('AuditTrailService', () => {
  let service: AuditTrailService
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } as unknown as Storage

    service = new AuditTrailService(mockStorage, false)
  })

  describe('recordTransition', () => {
    it('should record a state transition', () => {
      const transition = {
        machineId: 'test-machine',
        fromState: 'idle',
        toState: 'loading',
        event: 'START',
        context: { data: 'test' },
      }

      service.recordTransition(transition)

      const history = service.getTransitionHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject(transition)
      expect(history[0].id).toBeDefined()
      expect(history[0].timestamp).toBeDefined()
    })

    it('should maintain max transitions limit', () => {
      // Record more than MAX_TRANSITIONS (1000)
      for (let i = 0; i < 1005; i++) {
        service.recordTransition({
          machineId: 'test',
          fromState: 'state1',
          toState: 'state2',
          event: `EVENT_${i}`,
          context: {},
        })
      }

      const history = service.getTransitionHistory()
      expect(history).toHaveLength(1000)
      // First 5 should be removed
      expect(history[0].event).toBe('EVENT_5')
    })
  })

  describe('addAuditEntry', () => {
    it('should add an audit entry', () => {
      service.addAuditEntry('info', 'Test message', { detail: 'test' })

      const report = service.generateDebugReport()
      expect(report.auditLog).toHaveLength(1)
      expect(report.auditLog[0]).toMatchObject({
        level: 'info',
        message: 'Test message',
        details: { detail: 'test' },
      })
    })

    it('should include stack trace for error and critical levels', () => {
      service.addAuditEntry('error', 'Error message', {})
      service.addAuditEntry('critical', 'Critical message', {})
      service.addAuditEntry('info', 'Info message', {})

      const report = service.generateDebugReport()
      expect(report.auditLog[0].stackTrace).toBeDefined()
      expect(report.auditLog[1].stackTrace).toBeDefined()
      expect(report.auditLog[2].stackTrace).toBeUndefined()
    })
  })

  describe('getTransitionHistory', () => {
    beforeEach(() => {
      // Add test transitions
      service.recordTransition({
        machineId: 'machine1',
        fromState: 'idle',
        toState: 'loading',
        event: 'START',
        context: {},
        error: undefined,
      })

      service.recordTransition({
        machineId: 'machine2',
        fromState: 'loading',
        toState: 'error',
        event: 'FAIL',
        context: {},
        error: new Error('Test error'),
      })

      service.recordTransition({
        machineId: 'machine1',
        fromState: 'loading',
        toState: 'success',
        event: 'DONE',
        context: {},
      })
    })

    it('should filter by machineId', () => {
      const history = service.getTransitionHistory({ machineId: 'machine1' })
      expect(history).toHaveLength(2)
      expect(history.every((t) => t.machineId === 'machine1')).toBe(true)
    })

    it('should filter by includeErrors', () => {
      const history = service.getTransitionHistory({ includeErrors: false })
      expect(history).toHaveLength(2)
      expect(history.every((t) => !t.error)).toBe(true)
    })

    it('should filter by time range', () => {
      const now = Date.now()
      const history = service.getTransitionHistory({
        fromTime: now - 1000,
        toTime: now + 1000,
      })
      expect(history).toHaveLength(3)
    })
  })

  describe('generateDebugReport', () => {
    beforeEach(() => {
      // Add transitions with errors
      service.recordTransition({
        machineId: 'test',
        fromState: 'idle',
        toState: 'loading',
        event: 'START',
        context: {},
      })

      service.recordTransition({
        machineId: 'test',
        fromState: 'loading',
        toState: 'error',
        event: 'FAIL',
        context: {},
        error: new Error('Network error'),
      })

      service.recordTransition({
        machineId: 'test',
        fromState: 'error',
        toState: 'success',
        event: 'RETRY',
        context: {},
      })
    })

    it('should generate a complete debug report', () => {
      const report = service.generateDebugReport()

      expect(report).toHaveProperty('generatedAt')
      expect(report).toHaveProperty('systemInfo')
      expect(report).toHaveProperty('transitions')
      expect(report).toHaveProperty('auditLog')
      expect(report).toHaveProperty('errorSummary')
      expect(report).toHaveProperty('stateDistribution')
      expect(report).toHaveProperty('performanceMetrics')
    })

    it('should calculate error summary correctly', () => {
      const report = service.generateDebugReport()

      expect(report.errorSummary.totalErrors).toBe(1)
      expect(report.errorSummary.errorRate).toBeCloseTo(33.33, 1)
      expect(report.errorSummary.errorTypes).toEqual({
        Error: 1,
      })
    })

    it('should calculate state distribution', () => {
      const report = service.generateDebugReport()

      expect(report.stateDistribution).toEqual({
        loading: 1,
        error: 1,
        success: 1,
      })
    })

    it('should calculate performance metrics', () => {
      const report = service.generateDebugReport()

      expect(report.performanceMetrics.totalTransitions).toBe(3)
      expect(
        report.performanceMetrics.avgTransitionTime,
      ).toBeGreaterThanOrEqual(0)
      expect(
        report.performanceMetrics.maxTransitionTime,
      ).toBeGreaterThanOrEqual(0)
      expect(
        report.performanceMetrics.minTransitionTime,
      ).toBeGreaterThanOrEqual(0)
    })
  })

  describe('export and import', () => {
    it('should export to JSON', () => {
      service.recordTransition({
        machineId: 'test',
        fromState: 'idle',
        toState: 'loading',
        event: 'START',
        context: {},
      })

      service.addAuditEntry('info', 'Test entry', {})

      const json = service.exportToJson()
      const parsed = JSON.parse(json)

      expect(parsed).toHaveProperty('transitions')
      expect(parsed).toHaveProperty('auditLog')
      expect(parsed).toHaveProperty('exported')
      expect(parsed.transitions).toHaveLength(1)
      expect(parsed.auditLog).toHaveLength(1)
    })

    it('should import from JSON', async () => {
      const importData = {
        transitions: [
          {
            id: 'test-id',
            timestamp: Date.now(),
            machineId: 'imported',
            fromState: 'a',
            toState: 'b',
            event: 'TEST',
            context: {},
          },
        ],
        auditLog: [
          {
            transitionId: 'test-id',
            timestamp: Date.now(),
            level: 'info' as const,
            message: 'Imported',
            details: {},
          },
        ],
      }

      const result = await service.importFromJson(JSON.stringify(importData))

      expect(result.isOk()).toBe(true)

      const history = service.getTransitionHistory()
      expect(history).toHaveLength(1)
      expect(history[0].machineId).toBe('imported')
    })

    it('should handle import errors', async () => {
      const result = await service.importFromJson('invalid json')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.name).toBe('ImportError')
      }
    })
  })

  describe('persistence', () => {
    it('should save to storage on transition record', () => {
      service.recordTransition({
        machineId: 'test',
        fromState: 'idle',
        toState: 'loading',
        event: 'START',
        context: {},
      })

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        '@ens/audit-trail',
        expect.any(String),
      )
    })

    it('should load from storage on initialization', () => {
      const storedData = {
        transitions: [
          {
            id: 'stored-id',
            timestamp: Date.now(),
            machineId: 'stored',
            fromState: 'x',
            toState: 'y',
            event: 'STORED',
            context: {},
          },
        ],
        auditLog: [],
      }

      mockStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(storedData))

      const newService = new AuditTrailService(mockStorage, false)
      const history = newService.getTransitionHistory()

      expect(history).toHaveLength(1)
      expect(history[0].machineId).toBe('stored')
    })
  })
})
