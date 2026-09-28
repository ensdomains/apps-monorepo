import type { Envelope, Timestamp } from './common.types'

/** `GET /v1/status`: the only route with the ops status vocabulary. */
export type OpsStatus = 'ready' | 'degraded' | 'stale'

/** `GET /v1/status`: cached provider head comparison state. */
export type NetworkHeadStatus =
  | 'fresh'
  | 'stale'
  | 'unavailable'
  | 'pending'
  | 'unconfigured'

/** `GET /v1/status`: one chain entry under `data.chains`. */
export type ChainStatus = Readonly<{
  latest_block: number | null
  indexed_block: number | null
  safe_block: number | null
  finalized_block: number | null
  lag_blocks: number | null
  lag_seconds: number | null
  network_block: number | null
  network_head_observed_at: Timestamp | null
  network_head_age_seconds: number | null
  network_head_status: NetworkHeadStatus
  ingestion_lag_blocks: number | null
  ingestion_lag_seconds: number | null
  status: OpsStatus
}>

/** `GET /v1/status`: `data`; `chains` is keyed by decimal chain id string. */
export type StatusData = Readonly<{
  status: OpsStatus
  pending_invalidation_count: number
  pending_invalidation_count_capped: boolean
  dead_letter_count: number
  chains: Readonly<Record<string, ChainStatus>>
}>

/** `GET /v1/status`: response (no `page`; `meta` carries no snapshot fields). */
export type StatusResponse = Envelope<StatusData>
