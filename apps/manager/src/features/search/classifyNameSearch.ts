import { match } from 'ts-pattern'
import type {
  AvailabilitySignal,
  ExistenceSignal,
  NameSearchOutcome,
  SearchNameKind,
} from './search.types'

export type ClassifyNameSearchParams = {
  readonly kind: SearchNameKind
  readonly existence: ExistenceSignal
  readonly availability: AvailabilitySignal
}

export const classifyNameSearch = ({
  kind,
  existence,
  availability,
}: ClassifyNameSearchParams): NameSearchOutcome =>
  match(kind)
    .with({ type: 'invalid' }, (invalid) => ({
      type: 'invalid' as const,
      name: invalid.name,
      reason: invalid.reason,
    }))
    .with({ type: 'eth-2ld' }, (eth2ld) =>
      match(availability)
        .with({ status: 'pending' }, () => ({
          type: 'loading' as const,
          name: eth2ld.name,
        }))
        .with({ status: 'available' }, () => ({
          type: 'available' as const,
          name: eth2ld.name,
        }))
        .with({ status: 'unavailable' }, () => ({
          type: 'owned' as const,
          name: eth2ld.name,
        }))
        .with({ status: 'skipped' }, () => ({
          type: 'unproven' as const,
          name: eth2ld.name,
        }))
        .exhaustive(),
    )
    .with({ type: 'eth-subname' }, (subname) =>
      match(existence)
        .with({ status: 'pending' }, () => ({
          type: 'loading' as const,
          name: subname.name,
        }))
        .with({ status: 'owned' }, () => ({
          type: 'owned' as const,
          name: subname.name,
        }))
        .with({ status: 'unknown' }, () => ({
          type: 'unproven' as const,
          name: subname.name,
        }))
        .with({ status: 'unowned' }, () => ({
          type: 'not-found' as const,
          name: subname.name,
        }))
        .exhaustive(),
    )
    .exhaustive()
