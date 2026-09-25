import type { QueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { match } from 'ts-pattern'
import {
  NameFallbackCard,
  type NameFallbackReason,
} from '@/components/NameFallbackCard'
import { isPastGracePeriod } from '@/features/grace/utils/gracePeriod'
import { ProfileLoading } from '@/features/profile/components/view/ProfileLoading'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { ReverseNameView } from '@/features/profile/components/view/ReverseNameView'
import { dnsSecEnabledQuery } from '@/features/profile/service/dnsSecEnabled'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { normalizeProfileName } from '@/features/profile/service/profileName'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { getReverseNameAddress } from '@/features/profile/service/reverseNameAddress'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/data/queries/availability.query'
import { parseName } from '@/features/register-v2/utils/name-parser'
import { getSearchNameKind } from '@/features/search/getSearchNameKind'
import { isDebugProfileName } from '@/utils/debug-features'
import { defaultOgImageUrl, nameOgImageUrl, seo } from '@/utils/seo'

// `/register/$name` redirects straight back here when the registrar says the
// name isn't free, so every hand off to it is gated on this.
const isFreeToRegister = async (
  queryClient: QueryClient,
  name: string,
): Promise<boolean> => {
  const availability = await queryClient
    .fetchQuery(getRegistrationV2AvailabilityQueryOptions(name))
    .catch(() => undefined)

  return availability?.isAvailable === true
}

// Classifies an ownerless name: .eth 2LDs with 3+ code points (the
// registrar counts code points, not UTF-16 units) can be registered,
// everything else maps to a fallback card reason
const classifyMissingName = (
  name: string,
): NameFallbackReason | 'registrable' =>
  match(getSearchNameKind(name))
    .with({ type: 'eth-2ld' }, () => 'registrable' as const)
    .with({ type: 'eth-subname' }, () => 'not-found' as const)
    .with({ type: 'invalid', reason: 'too-short' }, () => 'too-short' as const)
    .otherwise(() => 'not-imported' as const)

const isEthName = (parsed: ReturnType<typeof parseName>): boolean =>
  parsed.isOk() && parsed.value.tld === 'eth'

const requiresDnssecCheck = (
  parsed: ReturnType<typeof parseName>,
  name: string,
): boolean => !isEthName(parsed) && !isDebugProfileName(name)

const isSupportedProfileTld = async (
  queryClient: QueryClient,
  name: string,
): Promise<boolean> => {
  const parsed = parseName(name)
  if (!requiresDnssecCheck(parsed, name)) return true
  if (parsed.isErr()) return false

  // A DoH failure should not classify a valid DNS name as unsupported.
  return queryClient
    .ensureQueryData(dnsSecEnabledQuery(parsed.value.tld))
    .catch(() => true)
}

const getCanonicalProfileName = (name: string): string => {
  const normalizedName = normalizeProfileName(name)

  if (!normalizedName) {
    throw new Error('Invalid ENS name')
  }

  if (normalizedName !== name) {
    throw redirect({
      params: { name: normalizedName },
      to: '/$name',
      replace: true,
    })
  }

  return normalizedName
}

export const Route = createFileRoute('/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const normalizedName = getCanonicalProfileName(name)

    if (getReverseNameAddress(normalizedName)) {
      return {
        fallback: undefined,
        description: undefined,
        name: normalizedName,
      }
    }

    const [profileRecords, ownerData] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(normalizedName)),
      // Always recheck ownership for redirect decisions, even when a recent
      // display query exists in the cache after registration or transfer.
      queryClient.fetchQuery({
        ...profileOwnerQuery(normalizedName),
        staleTime: 0,
      }),
    ])

    if (!(await isSupportedProfileTld(queryClient, normalizedName))) {
      return {
        fallback: 'unsupported-tld' as const,
        description: undefined,
        name: normalizedName,
      }
    }

    // Name doesn't exist in v2 or v1
    if (!ownerData) {
      const missing = classifyMissingName(normalizedName)

      if (missing === 'registrable') {
        if (await isFreeToRegister(queryClient, normalizedName)) {
          throw redirect({
            params: { name: normalizedName },
            to: '/register/$name',
            replace: true,
          })
        }

        return {
          fallback: 'not-found' as const,
          description: undefined,
          name: normalizedName,
        }
      }

      return {
        fallback: missing,
        description: undefined,
        name: normalizedName,
      }
    }

    const indexedRegistrationDate = profileRecords.indexedRegistrationDate
    if (ownerData.protocol === 'v2' && indexedRegistrationDate != null) {
      const registrationQuery = profileRegistrationQuery(
        normalizedName,
        ownerData.protocol,
      )
      queryClient.setQueryData(
        registrationQuery.queryKey,
        (current) =>
          current ?? {
            registrationDate: indexedRegistrationDate,
          },
      )
    }

    const expiryData = await queryClient.ensureQueryData(
      profileExpiryQuery(normalizedName, ownerData.protocol),
    )

    const expiryDate =
      expiryData?.expiry == null
        ? null
        : new Date(Number(expiryData.expiry) * 1000)
    const isPastGrace = isPastGracePeriod(expiryDate, ownerData.protocol)

    if (isPastGrace && (await isFreeToRegister(queryClient, normalizedName))) {
      throw redirect({
        params: { name: normalizedName },
        to: '/register/$name',
        replace: true,
      })
    }

    const description = profileRecords.texts.find(
      (r) => r.key === 'description',
    )?.value

    return {
      fallback: undefined,
      description,
      name: normalizedName,
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: seo({
          title: 'ENS App',
          description: 'Manage your ENS names, profiles and records.',
          image: defaultOgImageUrl(),
        }),
      }
    }

    const canonicalName = loaderData.name
    const metaDescription =
      loaderData.description || `View the ENS profile for ${canonicalName}`

    return {
      meta: seo({
        title: `${canonicalName} - ENS Profile`,
        description: metaDescription,
        image: nameOgImageUrl(canonicalName),
      }),
    }
  },
  ssr: false,
  component: RouteComponent,
  errorComponent: ProfileRouteError,
  pendingComponent: ProfileRoutePending,
})

function ProfileRoutePending() {
  // Pending UI can render before the loader redirects to the canonical URL.
  const name = Route.useParams({
    select: (params) => normalizeProfileName(params.name) ?? undefined,
  })
  return <ProfileLoading name={name} />
}

function ProfileRouteError({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="wrap-anywhere text-destructive">
          Error loading profile: {error.message}
        </div>
      </div>
    </div>
  )
}

function RouteComponent() {
  const { fallback, name } = Route.useLoaderData({
    select: (data) => ({ fallback: data.fallback, name: data.name }),
  })

  if (fallback) return <NameFallbackCard name={name} reason={fallback} />

  const reverseAddress = getReverseNameAddress(name)
  if (reverseAddress) {
    return <ReverseNameView address={reverseAddress} name={name} />
  }

  return <ProfileView name={name} />
}
