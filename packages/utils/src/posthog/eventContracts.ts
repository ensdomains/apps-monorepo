/** Shared product vocabulary; trigger locations and QA sequences live in docs/analytics-*-matrix.md. */
export type FlowProperties = {
  readonly is_bulk?: boolean
  readonly flow_id: string
  readonly registration_method?: 'eoa' | 'hca' | 'safe'
  readonly chain_id?: number
}
export type FlowStep =
  | 'duration'
  | 'payment'
  | 'execution'
  | 'post_registration'
  | 'review'
  | 'renewal'
  | 'setup'
  | 'commit'
  | 'cooldown'
  | 'approval'
  | 'registration'
  | 'verification'
type StepProperties = FlowProperties & { readonly step: FlowStep }
type StepResult = StepProperties & {
  readonly completed_count?: number
  readonly item_count?: number
  readonly outcome: 'success' | 'failure'
  readonly is_retryable: boolean
  readonly error_code?:
    | 'transaction_failed'
    | 'insufficient_funds'
    | 'user_rejected'
    | 'unknown'
}
type FlowEvents<Category extends string> = {
  readonly [Name in
    | `${Category}:flow_view`
    | `${Category}:flow_start`
    | `${Category}:flow_resume`
    | `${Category}:flow_retry`]: FlowProperties
} & {
  readonly [Name in `${Category}:step_view`]: StepProperties
} & {
  readonly [Name in `${Category}:step_result`]: StepResult
} & {
  readonly [Name in `${Category}:flow_complete`]: FlowProperties & {
    readonly item_count: number
    readonly migrated_count?: number
    readonly copied_count?: number
    readonly ineligible_count?: number
  }
} & {
  readonly [Name in `${Category}:payment_option_select`]: FlowProperties & {
    readonly payment_asset: 'eth' | 'stablecoin'
    readonly funding_source: 'wallet' | 'l2'
  }
}
type WriteProperties = {
  readonly chain_id?: number
  readonly operation_id?: string
}
export type AnalyticsEvents = FlowEvents<'registration'> &
  FlowEvents<'renewal'> &
  FlowEvents<'migration'> & {
    readonly 'profile:records_update': WriteProperties & {
      readonly record_count?: number
    }
    readonly 'profile:primary_name_update': WriteProperties
    readonly 'subname:name_create': WriteProperties
    readonly 'resolver:configuration_update': WriteProperties & {
      readonly action:
        | 'change'
        | 'link'
        | 'unlink'
        | 'deploy'
        | 'roles_grant'
        | 'roles_revoke'
    }
    readonly 'roles:permissions_update': WriteProperties & {
      readonly action: 'grant' | 'revoke'
    }
    readonly 'notifications:preferences_update': WriteProperties
    readonly 'migration:manager_open': { readonly is_wrapped: boolean }
    readonly 'dns:manager_sync': WriteProperties
    readonly 'name_search:result_select': {
      readonly source: 'header_search' | 'search'
      readonly name_length?: number
      readonly result_type?:
        | 'name'
        | 'address'
        | 'resolver'
        | 'available'
        | 'owned'
    }
    readonly 'transaction:execution_end': {
      readonly operation_id: string
      readonly outcome: 'failure' | 'cancelled'
      readonly failure_stage: string
      readonly chain_id?: number
      readonly execution_method?: string
      readonly attempt_count: number
    }
  }

export type PostHogEvents = AnalyticsEvents & {
  readonly 'nft:completion_check': {
    readonly outcome:
      | 'complete'
      | 'incomplete'
      | 'reconciling'
      | 'error'
      | 'aborted'
    readonly duration_ms: number
    readonly remaining_count?: number
  }
  readonly 'nft:claim_outcome': {
    readonly outcome:
      | 'submitted'
      | 'minted'
      | 'cancelled'
      | 'replaced'
      | 'reverted'
      | 'pending'
      | 'error'
  }
  readonly 'nft:renderer_fallback': {
    readonly reason: 'renderer_failed' | 'renderer_timeout' | 'reduced_motion'
  }
  readonly 'nft:download_failure': {
    readonly reason: 'network' | 'http' | 'timeout' | 'aborted' | 'unknown'
  }
  readonly 'name:search_selected': {
    readonly name: string
    readonly source: 'header_search'
  }

  readonly 'wallet:connect': {
    readonly wallet_address: string
    readonly chain_id: number
    readonly wallet_connector: string
  }

  readonly 'wallet:disconnect': undefined

  readonly 'intercom:booted': undefined

  readonly 'dnssec_debug:opened': {
    readonly name: string
    readonly source: 'sidebar' | 'import' | 'sync' | 'direct'
  }

  readonly 'dnssec_debug:result': {
    readonly name: string
    readonly verdict: string
    readonly failed_step: string | null
  }
}
