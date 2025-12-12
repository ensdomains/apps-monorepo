import {
  DomainDocument,
  type DomainFragment,
  type DomainQuery,
  type DomainQueryVariables,
  type ResolverFragment,
} from '@ens-apps/indexer'
import apolloClient from '@ens-apps/indexer/apollo'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import type { ProfileRecords } from '../types'
import { transformProfileRecords } from '../utils/transformRecords'

export type ProfileRecordsResult = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string; symbol?: string }>
  resolverAddress?: Address | null
}

export interface ProfileData {
  name: string
  normalizedName?: string | null
  ownerAddress?: Address | null
  expiryDate?: number | null
  createdAt: number
  resolverAddress?: Address | null
  records: ProfileRecords
}

export class GetProfileError extends TaggedError('GetProfileError')<{
  cause: unknown
}> {}

const buildProfileRecordsResult = (
  domain: DomainFragment | null | undefined,
): ProfileRecordsResult => {
  if (!domain || !domain.resolver) {
    return {
      texts: [],
      coins: [],
      resolverAddress: null,
    }
  }

  const resolver: ResolverFragment = domain.resolver

  const texts: ProfileRecordsResult['texts'] = []

  const pushIfValue = (value: string | null | undefined, key: string) => {
    if (value) {
      texts.push({ key, value })
    }
  }

  // Static/base records
  pushIfValue(resolver.avatar, 'avatar')
  pushIfValue(resolver.header, 'header')
  pushIfValue(resolver.description, 'description')
  pushIfValue(resolver.url, 'url')

  // Contact records
  pushIfValue(resolver.email, 'email')
  pushIfValue(resolver.location, 'location')
  pushIfValue(resolver.phone, 'phone')
  pushIfValue(resolver.mail, 'mail')
  pushIfValue(resolver.timezone, 'timezone')

  // Social records
  pushIfValue(resolver.twitter, 'com.twitter')
  pushIfValue(resolver.telegram, 'org.telegram')
  pushIfValue(resolver.farcaster, 'xyz.farcaster')
  pushIfValue(resolver.instagram, 'com.instagram')
  pushIfValue(resolver.discord, 'com.discord')
  pushIfValue(resolver.github, 'com.github')
  pushIfValue(resolver.linkedin, 'com.linkedin')
  pushIfValue(resolver.youtube, 'com.youtube')
  pushIfValue(resolver.reddit, 'com.reddit')
  pushIfValue(resolver.tiktok, 'com.tiktok')
  pushIfValue(resolver.twitch, 'com.twitch')
  pushIfValue(resolver.mastodon, 'com.mastodon')

  const coins: ProfileRecordsResult['coins'] = []

  // GraphQL resolver currently exposes a single addr (ETH / coinType 60)
  if (resolver.address) {
    coins.push({
      coinType: 60,
      value: resolver.address,
      symbol: 'ETH',
    })
  }

  return {
    texts,
    coins,
    resolverAddress: resolver.address as Address,
  }
}

export const getProfile = ResultFn(async function* (name: string) {
  const result = yield* await ResultAsync.fromPromise(
    apolloClient.query<DomainQuery, DomainQueryVariables>({
      query: DomainDocument,
      variables: { id: name },
      fetchPolicy: 'network-only',
    }),
    (error) => new GetProfileError({ cause: error }),
  )

  const domain: DomainFragment | null =
    (result.data.domain as DomainFragment | undefined) ?? null

  if (!domain) {
    return ok<ProfileData>({
      name,
      normalizedName: name,
      ownerAddress: null,
      expiryDate: null,
      createdAt: 0,
      resolverAddress: null,
      records: transformProfileRecords(undefined),
    })
  }

  const recordsResult = buildProfileRecordsResult(domain)
  const records = transformProfileRecords(recordsResult)

  return ok<ProfileData>({
    name: domain.name ?? name,
    normalizedName: domain.normalizedName ?? domain.name ?? name,
    ownerAddress: (domain.owner?.id as Address | undefined) ?? null,
    expiryDate: domain.expiryDate ?? null,
    createdAt: domain.createdAt,
    resolverAddress: recordsResult.resolverAddress ?? null,
    records,
  })
})

export const profileQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'full', { name }),
    queryFn: () => getProfile(name),
  })
