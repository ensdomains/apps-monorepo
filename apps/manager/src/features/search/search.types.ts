import type { Address } from 'viem'

export type ParsedSearchQuery =
  | { readonly type: 'empty' }
  | { readonly type: 'address'; readonly value: Address }
  | { readonly type: 'name'; readonly value: string }

export type SearchNameInvalidReason =
  | 'too-short'
  | 'invalid-format'
  | 'unsupported-tld'

export type SearchNameKind =
  | { readonly type: 'eth-2ld'; readonly name: string; readonly label: string }
  | { readonly type: 'eth-subname'; readonly name: string }
  | {
      readonly type: 'invalid'
      readonly name: string
      readonly reason: SearchNameInvalidReason
    }

export type ExistenceSignal =
  | { readonly status: 'pending' }
  | { readonly status: 'owned' }
  | { readonly status: 'unowned' }
  | { readonly status: 'unknown' }

export type AvailabilitySignal =
  | { readonly status: 'pending' }
  | { readonly status: 'available' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'skipped' }

export type NameSearchOutcome =
  | {
      readonly type: 'invalid'
      readonly name: string
      readonly reason: SearchNameInvalidReason
    }
  | { readonly type: 'loading'; readonly name: string }
  | { readonly type: 'available'; readonly name: string }
  | { readonly type: 'owned'; readonly name: string }
  | { readonly type: 'unproven'; readonly name: string }
  | { readonly type: 'not-found'; readonly name: string }
