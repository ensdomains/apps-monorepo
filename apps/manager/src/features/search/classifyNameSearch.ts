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

const classifyProfileName = (
  name: string,
  existence: ExistenceSignal,
): NameSearchOutcome =>
  match(existence)
    .with({ status: 'pending' }, () => ({
      type: 'loading' as const,
      name,
    }))
    .with({ status: 'owned' }, () => ({
      type: 'owned' as const,
      name,
    }))
    .with({ status: 'unknown' }, () => ({
      type: 'error' as const,
      name,
    }))
    .with({ status: 'unowned' }, () => ({
      type: 'not-found' as const,
      name,
    }))
    .exhaustive()

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
        .with({ status: 'error' }, () => ({
          type: 'error' as const,
          name: eth2ld.name,
        }))
        .with({ status: 'skipped' }, () => ({
          type: 'error' as const,
          name: eth2ld.name,
        }))
        .exhaustive(),
    )
    .with({ type: 'eth-subname' }, (subname) =>
      classifyProfileName(subname.name, existence),
    )
    .with({ type: 'dns-name', isSubname: false }, (dnsName) => {
      const outcome = classifyProfileName(dnsName.name, existence)
      // An unowned DNS 2LD may just not be imported yet, so don't report it
      // as missing. DNS subnames keep the generic not-found outcome.
      return outcome.type === 'not-found'
        ? { type: 'not-imported' as const, name: dnsName.name }
        : outcome
    })
    .with({ type: 'dns-name' }, (dnsName) =>
      classifyProfileName(dnsName.name, existence),
    )
    .exhaustive()
