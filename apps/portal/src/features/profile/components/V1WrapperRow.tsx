import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { InfoRow } from './InfoRow'

const WrapperRow = ({ children }: { readonly children: ReactNode }) => (
  <InfoRow icon={Package} label="Name Wrapper">
    {children}
  </InfoRow>
)

/** Whether an ENSv1 name sits in the NameWrapper, where its owner holds every role. */
export const V1WrapperRow = ({ name }: { readonly name: string }) => {
  // Same entry the Owner row reads, so it's a cache hit.
  const { data, isLoading, error } = useQuery(
    getV1NameStateQueryOptions({ name }),
  )

  return (
    match({ subject: data?.subject, isLoading, error })
      .with({ error: P.nonNullable }, () => (
        <WrapperRow>
          <span className="text-base text-muted-foreground">
            Failed to load wrapper status
          </span>
        </WrapperRow>
      ))
      .with({ isLoading: true }, () => (
        <WrapperRow>
          <span className="text-base text-muted-foreground">Loading</span>
        </WrapperRow>
      ))
      .with({ subject: { kind: 'v1-wrapped' } }, () => (
        <WrapperRow>Wrapped</WrapperRow>
      ))
      .with({ subject: P.nonNullable }, () => (
        <WrapperRow>Unwrapped</WrapperRow>
      ))
      // A lapsed name has no holder, so there is nothing to describe.
      .otherwise(() => null)
  )
}
