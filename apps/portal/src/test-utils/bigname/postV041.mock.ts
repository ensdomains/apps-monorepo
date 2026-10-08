/**
 * Responses in the shapes bigname `main` serves after v0.4.1 (#1073 to
 * #1084). No deployment serves them yet, so unlike `v041.mock.ts` these are
 * not captures: they are written from bigname's `docs/api-v1.md` and
 * `docs/api-v1-routes.md` at 4a89b2d, over the v0.4.1 captures where a row
 * only gains fields. `satisfies` checks each one against the wire types.
 */
import type {
  AddressName,
  EnsV1Facts,
  Envelope,
  EventRow,
  NameHistoryRow,
  NameRecord,
  PermissionsResponse,
} from '@ens-apps/indexer/bigname'
import {
  mockAddressNameRoleHolder,
  mockNameNick,
  mockNameWrappedSub,
} from './v041.mock'

const SEPOLIA = 11155111
const ETH_REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'
const AS_OF = {
  '11155111': {
    block_number: 11844768,
    block_hash:
      '0x5b7755dc32765981b626a4520ab7d5e4772d2f1ef4174b236a030ce580a3445b',
    timestamp: '1791150840',
  },
} as const

/** Versioned ERC-1155 token (version 2), the version before it, and their shared `canonical_id` (low 32 bits cleared). */
const TOKEN_ID =
  '70622639689279718371527342103894932928233838121221666359043189029711095267330'
const PREVIOUS_TOKEN_ID =
  '70622639689279718371527342103894932928233838121221666359043189029711095267329'
const CANONICAL_ID =
  '70622639689279718371527342103894932928233838121221666359043189029711095267328'

/** `GET /v1/names/nick.eth`: a backed wrapper serves its NameWrapper entry expiry beside `wrapper_state`. */
export const mockNameWrapperExpiry = {
  ...mockNameNick.data,
  ens_v1: {
    ...mockNameNick.data.ens_v1,
    wrapper_expires_at: '1806384633',
  },
} as const satisfies NameRecord

/** `GET /v1/names/weeerewrew.nick.eth`: a wrapped subname whose NameWrapper expiry was never set. */
export const mockNameWrapperExpiryNotSet = {
  ...mockNameWrappedSub,
  ens_v1: {
    ...mockNameWrappedSub.ens_v1,
    wrapper_expires_at: null,
    wrapper_expires_at_reason: 'not_set',
  },
} as const satisfies NameRecord

/** `ens_v1` of a wrapped name stored with the NameWrapper maximum expiry (`type(uint64).max`). */
export const mockEnsV1WrapperNoExpiry = {
  expires_at: null,
  wrapper_state: mockNameNick.data.ens_v1.wrapper_state,
  wrapper_fuses: mockNameNick.data.ens_v1.wrapper_fuses,
  wrapper_expires_at: null,
  wrapper_expires_at_reason: 'no_expiry',
} as const satisfies EnsV1Facts

/** `ens_v1` of an emancipated subname whose wrapper has lapsed: no `wrapper_state`, the past expiry alone. */
export const mockEnsV1LapsedWrapper = {
  expires_at: null,
  wrapper_expires_at: '1759000000',
} as const satisfies EnsV1Facts

/** `ens_v1` of a wrapped `.eth` 2LD renewed through a controller that called only `BaseRegistrar.renew`: the entry trails the lease. */
export const mockEnsV1WrapperTrailsLease = {
  expires_at: '1830144633',
  wrapper_state: mockNameNick.data.ens_v1.wrapper_state,
  wrapper_fuses: mockNameNick.data.ens_v1.wrapper_fuses,
  wrapper_expires_at: '1806384633',
} as const satisfies EnsV1Facts

/** `GET /v1/permissions?registry=11155111:0xd4eb…`: the root holders of a manifest-declared registry, listed in full. */
export const mockPermissionsRegistryRoot = {
  data: [
    {
      address: '0x84d3a426d4e12e955d1df95db0b24fe26afe39d3',
      grant_scope: {
        kind: 'root',
        detail: { registry: { chain_id: SEPOLIA, address: ETH_REGISTRY } },
      },
      powers: ['registrar', 'admin_registrar'],
      registration_id: '0c1d7f0e-6e0c-5d0a-9f4b-6f1b3a5d2c11',
      authority_context: 'resource_audit',
    },
  ],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 50,
    total_count: null,
    has_more: false,
  },
  meta: { as_of: AS_OF },
} as const satisfies PermissionsResponse

/** The same read of a registry discovery admitted: partial, on an empty page too. */
export const mockPermissionsDiscoveredRegistryRoot = {
  data: [],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 50,
    total_count: null,
    has_more: false,
  },
  meta: {
    as_of: AS_OF,
    completeness: 'partial',
    unsupported_reason: 'permissions_partially_listed',
    unlisted_permission_surfaces: ['ens_v2_registry_operators'],
  },
} as const satisfies PermissionsResponse

/** `GET /v1/events?contract_address=<registry>&kind=RootPermissionChanged&include=data,raw`: no `name`, a null `registration_id`. */
export const mockEventRootPermissionChanged = {
  id: '5b1f0a7c2d3e4f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8',
  type: 'permission',
  namespace: 'ens',
  registration_id: null,
  block_number: 11820431,
  timestamp: '1790840952',
  transaction_hash:
    '0x7d0c1f6b5a4e3d2c1b0a9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a',
  log_index: 12,
  contract_address: ETH_REGISTRY,
  data: {
    address: '0x84d3a426d4e12e955d1df95db0b24fe26afe39d3',
    grant_scope: {
      kind: 'root',
      detail: { registry: { chain_id: SEPOLIA, address: ETH_REGISTRY } },
    },
    powers: ['registrar'],
    added_powers: [],
    removed_powers: ['admin_registrar'],
  },
  kind: 'RootPermissionChanged',
} as const satisfies EventRow

/** `GET /v1/names/{name}/history?include=data,raw`: an ENSv2 registration with its event-time token and registrar payment. */
export const mockHistoryRegistrationPayment = {
  id: '9a3f5d17c0b24e6881f2a7d9c4e0b6135f7a9d2c4e6b8a0c1d3f5a7b9c1e3d5f',
  type: 'registration',
  name: 'fox.eth',
  namespace: 'ens',
  registration_id: 'f974b0ec-dfb3-5630-8845-89252a6d5d23',
  block_number: 11832011,
  timestamp: '1790980428',
  transaction_hash:
    '0x2f4e6a8c0b1d3f5a7c9e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a',
  log_index: 41,
  contract_address: ETH_REGISTRY,
  data: {
    token_id: TOKEN_ID,
    canonical_id: CANONICAL_ID,
    base_cost: '5000000',
    premium: '0',
    payment_token: {
      chain_id: SEPOLIA,
      address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
    },
    referrer:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    registrant: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    owner: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    expires_at: '1793399628',
    action_id:
      'c4a1e9d27b6f4038a5d1c7e3b9f2046d8a1c5e7b3f9d2046a8c1e5b7d3f90246',
    action_role: 'registered',
  },
  kind: 'LabelRegistered',
} as const satisfies NameHistoryRow

/** Same read: an ENSv1 renewal paid in native wei, with no `payment_token`. */
export const mockHistoryRenewalPayment = {
  id: '1c3e5a7b9d0f2a4c6e8b0d1f3a5c7e9b2d4f6a8c0e1b3d5f7a9c0e2b4d6f8a1c',
  type: 'renewal',
  name: 'nick.eth',
  namespace: 'ens',
  registration_id: '3c5b78a0-5644-5493-bc42-b9dd14fbdca9',
  block_number: 11790022,
  timestamp: '1790400120',
  transaction_hash:
    '0x4b6d8f0a2c4e6b8d0f1a3c5e7b9d1f3a5c7e9b0d2f4a6c8e0b1d3f5a7c9e1b3d',
  log_index: 77,
  contract_address: '0xfb3ce5d01e0f33f41dbb39035db9745962f1f968',
  data: {
    expires_at: '1798608633',
    cost: '3125000000003490',
    referrer:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  kind: 'RegistrationRenewed',
} as const satisfies NameHistoryRow

/** Same read: an ENSv2 ERC-1155 transfer with its retained operator. */
export const mockHistoryTransferOperator = {
  id: '6e8b0d1f3a5c7e9b2d4f6a8c0e1b3d5f7a9c0e2b4d6f8a1c3e5a7b9d0f2a4c6e',
  type: 'transfer',
  name: 'fox.eth',
  namespace: 'ens',
  registration_id: 'f974b0ec-dfb3-5630-8845-89252a6d5d23',
  block_number: 11833100,
  timestamp: '1790993544',
  transaction_hash:
    '0x8d0f1a3c5e7b9d1f3a5c7e9b0d2f4a6c8e0b1d3f5a7c9e1b3d4b6d8f0a2c4e6b',
  log_index: 9,
  contract_address: ETH_REGISTRY,
  data: {
    token_id: TOKEN_ID,
    canonical_id: CANONICAL_ID,
    operator: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    from: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    to: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  },
  kind: 'TokenControlTransferred',
} as const satisfies NameHistoryRow

/** Same read: the role change that starts a token regeneration shows the token it was made on, the old one. */
export const mockHistoryPermissionToken = {
  id: '0e2b4d6f8a1c3e5a7b9d0f2a4c6e6e8b0d1f3a5c7e9b2d4f6a8c0e1b3d5f7a9c',
  type: 'permission',
  name: 'fox.eth',
  namespace: 'ens',
  registration_id: 'f974b0ec-dfb3-5630-8845-89252a6d5d23',
  block_number: 11832950,
  timestamp: '1790991732',
  transaction_hash:
    '0xa2c4e6b8d0f1a3c5e7b9d1f3a5c7e9b0d2f4a6c8e0b1d3f5a7c9e1b3d4b6d8f0',
  log_index: 3,
  contract_address: ETH_REGISTRY,
  data: {
    token_id: PREVIOUS_TOKEN_ID,
    canonical_id: CANONICAL_ID,
    address: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
    grant_scope: { kind: 'registry', detail: {} },
    powers: ['set_resolver'],
    added_powers: ['set_resolver'],
    removed_powers: [],
  },
  kind: 'PermissionChanged',
} as const satisfies NameHistoryRow

/** `GET /v1/addresses/{address}/names` for an address with more than 1,000 candidate names and no `include=total_count`. */
export const mockAddressNamesAboveCountCap = {
  data: [mockAddressNameRoleHolder],
  page: {
    cursor: null,
    next_cursor: 'eyJzIjoibmFtZSJ9',
    page_size: 1,
    total_count: null,
    has_more: true,
  },
  meta: { as_of: AS_OF },
} as const satisfies Envelope<readonly AddressName[]>
