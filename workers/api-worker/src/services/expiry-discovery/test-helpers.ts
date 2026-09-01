import type { ExpiryStageId } from '#types/events/index.js'
import type { ExpiryStageConfig } from './stages.js'
import { STAGES } from './stages.js'

export type CursorState = Record<string, { expiry_timestamp: number }>

export function getStage(id: ExpiryStageId): ExpiryStageConfig {
  const stage = STAGES.find((candidate) => candidate.id === id)
  if (!stage) {
    throw new Error(`Test setup error: expiry stage "${id}" is not configured`)
  }
  return stage
}

export function requireStoredCursors(value: unknown): CursorState {
  if (value == null || typeof value !== 'object') {
    throw new Error('Test setup error: expiry cursors were not stored')
  }
  return value as CursorState
}

export function requireStoredValue(value: string | undefined): string {
  if (value == null) {
    throw new Error('Test setup error: expected a stored KV value')
  }
  return value
}
