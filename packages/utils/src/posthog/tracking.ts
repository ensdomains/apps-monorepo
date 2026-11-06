const SAFE_KEYS = new Set([
  'is_bulk',
  'completed_count',
  'flow_id',
  'operation_id',
  'registration_method',
  'chain_id',
  'step',
  'outcome',
  'is_retryable',
  'error_code',
  'item_count',
  'payment_asset',
  'funding_source',
  'migrated_count',
  'copied_count',
  'ineligible_count',
  'result_type',
  'record_count',
  'is_wrapped',
  'action',
  'source',
  'name_length',
  'failure_stage',
  'execution_method',
  'attempt_count',
  'wallet_connector',
  'duration_ms',
  'remaining_count',
  'reason',
  'verdict',
  'failed_step',
])

/** Keep bounded scalar context; the legacy statistics event alone retains its name. */
export const sanitizeEventProperties = (
  event: string,
  properties: unknown,
): Readonly<Record<string, string | number | boolean | null>> => {
  if (!properties || typeof properties !== 'object') return {}
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (event === 'name:search_selected' && key === 'name')
        return typeof value === 'string' && value.length <= 255
      if (!SAFE_KEYS.has(key)) return false
      if (typeof value === 'string')
        return (
          value.length <= 100 &&
          !/0x[a-fA-F0-9]{40}|https?:\/\/|\.[a-z]{2,}(?:\b|$)/i.test(value)
        )
      return (
        value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
    }),
  )
}
