import type {
  Address,
  Cursor,
  Envelope,
  Hex,
  Namespace,
  RegistrationId,
  RegistryRef,
  ResolverRef,
  Timestamp,
  WrapperFuses,
  WrapperState,
} from './common.types'

/**
 * Permission rows, role summaries, permission event data: one effective power.
 * Closed ~60-value snake_case vocabulary; see api-v1.md "Permission powers vocabulary"
 * (`registration_control`, `resolver_control`, `registry_control`, `set_resolver`, ENSv2
 * `ROLE_*` names and their `admin_*` counterparts, ...). Not enumerated here.
 */
export type Power = string

/** Address-name rows, reverse lookup rows: address-to-name relation values. */
export type Relation =
  | 'owner'
  | 'manager'
  | 'role_holder'
  | 'resolves_to'
  | 'former_owner'

/** Authority relations that `any` expands to. */
export type AuthorityRelation = 'owner' | 'manager' | 'role_holder'

/**
 * `relation` query/body filter: one authority relation, a comma-separated set of them,
 * `any` (all three), or `resolves_to` on its own.
 */
export type RelationFilter =
  | AuthorityRelation
  | 'any'
  | 'resolves_to'
  | `${AuthorityRelation},${string}`

/** `GET /v1/permissions`, `include=role_summary`: explicit grant relation; direct rows omit it. */
export type GrantRelation = 'operator'

/** `GET /v1/permissions`, `include=role_summary`: protocol scope kinds of a permission row. */
export type GrantScopeKind =
  | 'root'
  | 'registry'
  | 'registration'
  | 'resolver'
  | 'record_manager'
  | 'account'

/** `GET /v1/permissions`, `include=role_summary`: `grant_scope` `{kind, detail}`. */
export type GrantScope =
  | Readonly<{
      kind: 'registry' | 'registration'
      detail: Readonly<Record<never, never>>
    }>
  /** A registry's root resource; history rows name the registry. */
  | Readonly<{ kind: 'root'; detail: Readonly<{ registry?: RegistryRef }> }>
  | Readonly<{ kind: 'resolver'; detail: Readonly<{ resolver: ResolverRef }> }>
  | Readonly<{
      kind: 'record_manager'
      detail: Readonly<{ chain_id: number; manager: Address }>
    }>
  | Readonly<{
      kind: 'account'
      detail: Readonly<{
        chain_id: number
        authority_kind: string
        authority_contract: Address
        owner: Address
      }>
    }>

/** `include=role_summary`, permission rows: one grant `{grant_relation?, grant_scope, powers}`. */
export type Grant = Readonly<{
  grant_relation?: GrantRelation
  grant_scope: GrantScope
  powers: readonly Power[]
}>

/** `GET /v1/addresses/{address}/names?include=role_summary`: grants grouped by subject address. */
export type RoleSummary = Readonly<{
  address: Address
  grants: readonly Grant[]
}>

/** `ens_v2_registry` restrictions: token-scoped roles whose assignment can no longer change. */
export type LockedRole =
  | 'unregister'
  | 'renew'
  | 'set_subregistry'
  | 'set_resolver'
  | 'transfer'

/** `GET /v1/permissions` (top level), `include=role_summary` rows: resource restrictions. */
export type Restrictions =
  | Readonly<{
      registration_id: RegistrationId
      kind: 'ens_v1_wrapper'
      wrapper_state: WrapperState
      wrapper_fuses: WrapperFuses
      wrapper_expires_at?: Timestamp
    }>
  | Readonly<{
      registration_id: RegistrationId
      kind: 'ens_v2_registry'
      locked_roles: readonly LockedRole[]
    }>

/** `GET /v1/permissions`: the subject a read is anchored on; one is required. */
export type PermissionsSubject =
  | Readonly<{
      name: string
      registration_id?: RegistrationId
      address?: Address
    }>
  | Readonly<{
      name?: string
      registration_id: RegistrationId
      address?: Address
    }>
  | Readonly<{
      name?: string
      registration_id?: RegistrationId
      address: Address
    }>
  /** One registry's grants, as `<chain_id>:<address>`. */
  | Readonly<{ registry: `${number}:${string}` }>

/** `GET /v1/permissions`: query. */
export type PermissionsQuery = PermissionsSubject &
  Readonly<{
    namespace?: Namespace
    include?: readonly 'lineage'[]
    finality?: 'latest'
    cursor?: Cursor
    page_size?: number
  }>

/** `GET /v1/permissions`: how a row was admitted under the per-name ownership rule. */
export type AuthorityContext = 'current_for_name' | 'resource_audit'

/** `GET /v1/permissions`: one decoded setter-argument reading of an ENSv2 record-ID resolver grant. */
export type RecordResourceSelector =
  | Readonly<{
      kind: 'address'
      hash: Hex
      coin_type?: number
      coin_type_decimal?: string
    }>
  | Readonly<{
      kind: 'text' | 'data'
      hash: Hex
      key?: string
      key_bytes?: Hex
    }>
  | Readonly<{
      kind: 'abi'
      hash: Hex
      content_type?: number
      content_type_decimal?: string
    }>
  | Readonly<{ kind: 'interface'; hash: Hex; interface_id: Hex }>

/** `GET /v1/permissions`: `record_resource`; `argument` when one argument authorizes several setters. */
export type RecordResource =
  | RecordResourceSelector
  | Readonly<{
      kind: 'argument'
      hash: Hex
      selectors: readonly RecordResourceSelector[]
    }>

/**
 * `GET /v1/permissions?include=lineage`: bounded lineage summary. Only loosely described
 * (api-v1-routes.md:2029-2041: allowlisted fields `kind`, `registration_id`, `resolver`,
 * `powers`, `relation`), so each object is typed as an open record.
 */
export type PermissionLineage = Readonly<{
  grant: Readonly<Record<string, unknown>>
  revocation?: Readonly<Record<string, unknown>>
  inheritance_path?: Readonly<Record<string, unknown>>
  transfer_behavior?: Readonly<Record<string, unknown>>
}>

/** `GET /v1/permissions`: one permission row. */
export type PermissionRow = Readonly<{
  address: Address
  /** `operator` on effective registry-operator rows; omitted on direct rows. */
  grant_relation?: GrantRelation
  grant_scope: GrantScope
  powers: readonly Power[]
  /** Absent on a registry's root rows. */
  registration_id?: RegistrationId
  /** ENSv2 record-ID resolver grants only. */
  record_resource?: RecordResource
  name?: string
  authority_context?: AuthorityContext
  /** Present exactly when `wrapper_fuses` is present (current ENSv1 wrapper registrations). */
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  /** `include=lineage` only. */
  lineage?: PermissionLineage
}>

/** `GET /v1/permissions`: response; `restrictions` sits beside `data` on resource-bound reads. */
export type PermissionsResponse = Envelope<readonly PermissionRow[]> &
  Readonly<{
    restrictions?: Restrictions
  }>
