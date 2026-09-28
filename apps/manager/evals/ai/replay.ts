import { createHash } from 'node:crypto'
import type { AiEvalCase } from './corpus'
import {
  buildEvalRequest,
  type EvalModelCall,
  type EvalResult,
} from './evaluate'
import type { StoredInitialResponse } from './runner'

type CapturedReport = {
  readonly file: string
  readonly sourceHash: string
  readonly results: readonly EvalResult[]
}

const indexCapturedReports = (reports: readonly CapturedReport[]) => {
  const captured = new Map<
    string,
    { report: CapturedReport; row: EvalResult }
  >()
  for (const report of reports)
    for (const row of report.results) {
      if (captured.has(row.id))
        throw new Error(`Duplicate captured case: ${row.id}`)
      captured.set(row.id, { report, row })
    }
  return captured
}

const replayReason = (
  initial: EvalModelCall | undefined,
  currentRequestHash: string,
) => {
  if (!initial || initial.error || !('response' in initial))
    return 'initial_unavailable'
  return initial.requestHash === currentRequestHash
    ? 'unchanged'
    : 'request_changed'
}

// Reuse only the exact first request. A changed builder must make one new initial
// call; old provider responses and their provenance are never edited or relabelled.
export const prepareInitialReplay = (
  cases: readonly AiEvalCase[],
  reports: readonly CapturedReport[],
) => {
  const captured = indexCapturedReports(reports)
  const storedInitials: Record<string, StoredInitialResponse> = {}
  const freshInitialIds: string[] = []
  const decisions: {
    id: string
    reason: 'unchanged' | 'request_changed' | 'initial_unavailable'
    previousRequestHash?: string
    currentRequestHash: string
  }[] = []
  for (const testCase of cases) {
    const source = captured.get(testCase.id)
    if (!source) throw new Error(`Missing captured case: ${testCase.id}`)
    const initial = source.row.calls?.find(({ phase }) => phase === 'initial')
    const currentRequestHash = createHash('sha256')
      .update(JSON.stringify(buildEvalRequest(testCase)))
      .digest('hex')
    const reason = replayReason(initial, currentRequestHash)
    decisions.push({
      id: testCase.id,
      reason,
      previousRequestHash: initial?.requestHash,
      currentRequestHash,
    })
    if (reason !== 'unchanged' || !initial) {
      freshInitialIds.push(testCase.id)
      continue
    }
    storedInitials[testCase.id] = {
      body: initial.response,
      sourceReport: initial.sourceReport ?? source.report.file,
      sourceHash: initial.capturedSourceHash ?? source.report.sourceHash,
      requestHash: initial.requestHash,
    }
  }
  return { storedInitials, freshInitialIds, decisions }
}
