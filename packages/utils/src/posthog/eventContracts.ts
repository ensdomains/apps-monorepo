/** Shared event names and payloads; QA sequences live in docs/analytics-*-matrix.md. */
type FlowIdentity = { readonly flow_id: string }

type RegistrationProperties = FlowIdentity & {
  readonly execution_method?: 'eoa' | 'hca'
  readonly chain_id?: number
}

export type RegistrationStep =
  | 'duration'
  | 'payment'
  | 'execution'
  | 'post_registration'
  | 'setup'
  | 'commit'
  | 'cooldown'
  | 'approval'
  | 'registration'
  | 'verification'

type RenewalProperties = FlowIdentity & {
  readonly is_bulk?: boolean
  readonly execution_method?: 'eoa' | 'hca'
  readonly chain_id?: number
}

type RenewalStep =
  | 'duration'
  | 'payment'
  | 'execution'
  | 'approval'
  | 'verification'
  | 'review'

type MigrationStep = 'execution' | 'renewal'

type StepOutcome = {
  readonly outcome: 'success' | 'failure'
  readonly is_retryable: boolean
}

type PaymentSelection = FlowIdentity & {
  readonly payment_asset: 'eth' | 'stablecoin'
  readonly funding_chain_id?: number
}

export type AnalyticsEvents = {
  /** Registration entry screen opens. */
  readonly 'registration:flow_view': FlowIdentity
  /** The user starts registration execution. */
  readonly 'registration:flow_start': RegistrationProperties
  /** The user resumes a saved registration. */
  readonly 'registration:flow_resume': RegistrationProperties
  /** The user retries a failed registration stage. */
  readonly 'registration:flow_retry': RegistrationProperties
  /** Registration enters a user-visible stage. */
  readonly 'registration:step_view': RegistrationProperties & {
    readonly step: RegistrationStep
  }
  /** A registration stage succeeds or reports a recoverable or terminal failure. */
  readonly 'registration:step_result': RegistrationProperties &
    StepOutcome & {
      readonly step: RegistrationStep
      readonly error_code?: 'transaction_failed' | 'user_rejected'
    }
  /** Registration verification succeeds. */
  readonly 'registration:flow_complete': RegistrationProperties
  /** The user chooses a payment asset, token or funding chain. */
  readonly 'registration:payment_option_select': PaymentSelection
  /** Renewal entry screen opens. */
  readonly 'renewal:flow_view': FlowIdentity
  /** The user starts single or bulk renewal execution. */
  readonly 'renewal:flow_start': RenewalProperties
  /** The user retries a failed renewal. */
  readonly 'renewal:flow_retry': RenewalProperties
  /** Renewal enters review, payment or an execution stage. */
  readonly 'renewal:step_view': RenewalProperties & {
    readonly step: RenewalStep
  }
  /** A renewal stage confirms or execution fails; bulk failure includes confirmed names. */
  readonly 'renewal:step_result': RenewalProperties &
    StepOutcome & {
      readonly step: RenewalStep
      readonly completed_count?: number
    }
  /** All selected names finish renewal. */
  readonly 'renewal:flow_complete': RenewalProperties & {
    readonly item_count: number
  }
  /** The user chooses a renewal payment asset, token or funding chain. */
  readonly 'renewal:payment_option_select': PaymentSelection
  /** Migration entry screen opens. */
  readonly 'migration:flow_view': FlowIdentity
  /** The user starts migration execution. */
  readonly 'migration:flow_start': FlowIdentity
  /** The user retries a failed migration. */
  readonly 'migration:flow_retry': FlowIdentity
  /** Migration enters execution or its renewal handoff. */
  readonly 'migration:step_view': FlowIdentity & {
    readonly step: MigrationStep
  }
  /** Migration execution fails. */
  readonly 'migration:step_result': FlowIdentity &
    StepOutcome & {
      readonly step: MigrationStep
    }
  /** Migration finishes and reports migrated, copied and ineligible operations. */
  readonly 'migration:flow_complete': FlowIdentity & {
    readonly item_count: number
    readonly migrated_count: number
    readonly copied_count: number
    readonly ineligible_count: number
  }
  /** Profile record writes confirm onchain. */
  readonly 'profile:records_update': {
    readonly chain_id: number
    readonly record_count?: number
  }
  /** A reverse primary-name write confirms onchain. */
  readonly 'profile:primary_name_update': { readonly chain_id: number }
  /** Subname creation confirms onchain. */
  readonly 'subname:name_create': { readonly chain_id: number }
  /** A resolver configuration or role write confirms onchain. */
  readonly 'resolver:configuration_update': {
    readonly chain_id: number
    readonly action:
      | 'change'
      | 'link'
      | 'unlink'
      | 'roles_grant'
      | 'roles_revoke'
  }
  /** A registry role grant or revocation confirms onchain. */
  readonly 'roles:permissions_update': {
    readonly chain_id: number
    readonly action: 'grant' | 'revoke'
  }
  /** Notification preference changes are saved successfully. */
  readonly 'notifications:preferences_update': undefined
  /** The user follows Explorer's migration link to Manager. */
  readonly 'migration:manager_open': { readonly is_wrapped: boolean }
  /** DNS manager synchronization confirms onchain. */
  readonly 'dns:manager_sync': { readonly chain_id: number }
  /** The user selects a search result and navigates to its destination. */
  readonly 'name_search:result_select': {
    readonly source: 'header_search' | 'search'
    readonly name_length?: number
    readonly result_type: 'name' | 'address' | 'resolver'
    readonly is_available?: boolean
  }
  /** Transaction execution ends in failure or cancellation. */
  readonly 'transaction:execution_end': {
    readonly operation_id: string
    readonly outcome: 'failure' | 'cancelled'
    readonly failure_stage: string
    readonly chain_id?: number
    readonly execution_method?: string
    readonly attempt_count: number
  }

  /** NFT completion reconciliation settles or is interrupted. */
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
  /** An NFT claim changes transaction outcome. */
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
  /** The NFT renderer switches to its fallback. */
  readonly 'nft:renderer_fallback': {
    readonly reason: 'renderer_failed' | 'renderer_timeout' | 'reduced_motion'
  }
  /** An NFT download fails. */
  readonly 'nft:download_failure': {
    readonly reason: 'network' | 'http' | 'timeout' | 'aborted' | 'unknown'
  }
  /** Manager selects a name; the availability worker requires its normalized name. */
  readonly 'name:search_selected': {
    readonly name: string
    readonly source: 'header_search'
  }

  /** A connected wallet identity is established. */
  readonly 'wallet:connect': {
    readonly chain_id: number
    readonly wallet_connector: string
  }

  /** The wallet disconnects. */
  readonly 'wallet:disconnect': undefined

  /** Intercom boots for the current consenting identity. */
  readonly 'intercom:booted': undefined

  /** DNSSEC debugger opens for a name or source change. */
  readonly 'dnssec_debug:opened': {
    readonly source: 'sidebar' | 'import' | 'sync' | 'direct'
  }

  /** DNSSEC checks settle on a verdict. */
  readonly 'dnssec_debug:result': {
    readonly verdict:
      | 'valid'
      | 'no-records'
      | 'name-not-found'
      | 'not-enabled'
      | 'broken'
      | 'path-broken'
      | 'oracle-rejected'
      | 'oracle-unavailable'
  }
}
