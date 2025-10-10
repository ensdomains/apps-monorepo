import React, { useState, useEffect } from 'react'
import * as auditTrail from '@ens-apps/transaction-manager'
import type { StateTransition, DebugReport } from '@ens-apps/transaction-manager'

export function AuditTrailDashboard() {
  const [history, setHistory] = useState<StateTransition[]>([])
  const [report, setReport] = useState<DebugReport | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        handleViewHistory()
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const handleViewHistory = () => {
    const transitions = auditTrail.getTransitionHistory({
      fromTime: Date.now() - 3600000, // Last hour
      includeErrors: true
    })
    setHistory(transitions)
  }

  const handleGenerateReport = () => {
    const debugReport = auditTrail.generateDebugReport()
    setReport(debugReport)
    console.log('Debug Report:', debugReport)
  }

  const handleExportAudit = () => {
    const json = auditTrail.exportToJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ens-audit-trail-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const text = await file.text()
        const result = await auditTrail.importFromJson(text)

        if (result.isErr()) {
          throw result.error
        }

        alert('Audit data imported successfully')
        handleViewHistory()
      } catch (error) {
        alert('Failed to import audit data')
      }
    }
  }

  const handleAddCustomEntry = () => {
    auditTrail.addAuditEntry(
      'info',
      'Manual audit entry added',
      {
        timestamp: Date.now(),
        source: 'manual',
        action: 'user_interaction'
      }
    )
    handleViewHistory()
  }

  const handleClearAudit = () => {
    if (confirm('Are you sure you want to clear all audit data?')) {
      auditTrail.clearAuditTrail()
      setHistory([])
      setReport(null)
    }
  }

  return (
    <div className="example-section">
      <h3>📊 Audit Trail Dashboard</h3>

      <div className="status-box info">
        <strong>ℹ️ About Audit Trail:</strong>
        <p>The audit trail records all state transitions from transactions, providing:</p>
        <ul style={{ marginTop: '10px', marginLeft: '20px' }}>
          <li>Complete history of state changes</li>
          <li>Performance metrics and error tracking</li>
          <li>Debug reports for troubleshooting</li>
          <li>Export/import for support tickets</li>
        </ul>
      </div>

      <div className="button-group">
        <button className="primary" onClick={handleViewHistory}>
          🔍 View History
        </button>
        <button className="primary" onClick={handleGenerateReport}>
          📈 Generate Report
        </button>
        <button className="secondary" onClick={handleExportAudit}>
          📥 Export Audit
        </button>
        <button className="secondary" onClick={handleAddCustomEntry}>
          ➕ Add Entry
        </button>
        <button className="danger" onClick={handleClearAudit}>
          🗑️ Clear All
        </button>
      </div>

      <div className="button-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (2s)
        </label>
      </div>

      <div className="file-input">
        <label>
          📤 Import Audit Data
          <input type="file" accept=".json" onChange={handleImport} />
        </label>
      </div>

      {report && (
        <>
          <h4 style={{ marginTop: '20px' }}>📊 Performance Metrics</h4>
          <div className="metrics-grid">
            <div className="metric-card">
              <h4>Total Transitions</h4>
              <div className="value">{report.performanceMetrics.totalTransitions}</div>
            </div>
            <div className="metric-card">
              <h4>Error Rate</h4>
              <div className="value">{report.errorSummary.errorRate.toFixed(1)}%</div>
            </div>
            <div className="metric-card">
              <h4>Avg Transition Time</h4>
              <div className="value">{report.performanceMetrics.avgTransitionTime.toFixed(0)}ms</div>
            </div>
            <div className="metric-card">
              <h4>Total Errors</h4>
              <div className="value">{report.errorSummary.totalErrors}</div>
            </div>
          </div>

          {Object.keys(report.errorSummary.errorTypes).length > 0 && (
            <>
              <h4 style={{ marginTop: '20px' }}>❌ Error Types</h4>
              <div className="status-box error">
                {Object.entries(report.errorSummary.errorTypes).map(([type, count]) => (
                  <div key={type}>
                    <strong>{type}:</strong> {count} occurrences
                  </div>
                ))}
              </div>
            </>
          )}

          <h4 style={{ marginTop: '20px' }}>📈 State Distribution</h4>
          <div className="metrics-grid">
            {Object.entries(report.stateDistribution).map(([state, count]) => (
              <div key={state} className="metric-card">
                <h4>{state}</h4>
                <div className="value">{count}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <h4 style={{ marginTop: '20px' }}>
            📜 Recent Transitions ({history.length})
          </h4>
          <div className="history-list">
            {history.slice(-20).reverse().map((transition, index) => (
              <div
                key={transition.id || index}
                className={`history-item ${transition.error ? 'error' : ''}`}
              >
                <div>
                  <div className="state-change">
                    {transition.fromState} → {transition.toState}
                  </div>
                  <div className="time">
                    {new Date(transition.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    {transition.machineId} | {transition.event}
                  </span>
                  {transition.error && <span> ❌</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          🔍 Full Debug Report
        </summary>
        {report && (
          <div className="debug-panel">
            <pre>{JSON.stringify(report, null, 2)}</pre>
          </div>
        )}
      </details>
    </div>
  )
}