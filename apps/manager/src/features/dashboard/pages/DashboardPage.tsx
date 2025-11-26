import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNamesForAddressErrorType,
  GetNamesForAddressParameters,
  NameWithRelation,
} from '@ensdomains/ensjs/subgraph'
import { getNamesForAddress as ensjs_getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { useWallet } from '@getpara/react-sdk-lite'
import { skipToken, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Info, Star } from 'lucide-react'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetDashboardNamesError extends TaggedError('GetDashboardNamesError')<{
  cause: GetNamesForAddressErrorType
}> {}

const dashboardNamesQueryKey = createQueryKey<
  'dashboard-names',
  { address: Address | undefined }
>('dashboard-names')

const getDashboardNames = ResultFn(async function* (
  params: GetNamesForAddressParameters,
) {
  const client = yield* safeGetClient()

  const names = yield* await fromPromise(
    // biome-ignore lint/suspicious/noExplicitAny: ENSJS subgraph client typing is more specific than our Wagmi client
    ensjs_getNamesForAddress(client as any, params),
    (e) =>
      new GetDashboardNamesError({
        cause: e as GetNamesForAddressErrorType,
      }),
  )

  return ok(names)
})

const getDashboardNamesQueryOptions = (
  address: Address | undefined,
  // Use skipToken behaviour when address is undefined
) =>
  resultQueryOptions({
    queryKey: dashboardNamesQueryKey({ address }),
    queryFn: address
      ? () =>
          getDashboardNames({
            address,
            orderBy: 'createdAt',
            orderDirection: 'desc',
          })
      : skipToken,
  })

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const formatDate = (
  value: NameWithRelation['expiryDate'] | NameWithRelation['registrationDate'],
) => {
  if (!value?.date) return '—'
  try {
    return dateFormatter.format(value.date)
  } catch {
    return '—'
  }
}

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const faqItems = [
  {
    question: 'How do I renew a name?',
    answer:
      'Go to Manage renewals to see upcoming expiries and extend your names before they lapse.',
  },
  {
    question: 'Can I transfer my ENS name?',
    answer:
      'Yes. From a name’s profile you can transfer ownership to another address at any time.',
  },
  {
    question: 'What is a primary name?',
    answer:
      'A primary name is the main ENS name attached to your wallet address. Apps can display it instead of your address.',
  },
  {
    question: 'Can I use ENS across chains?',
    answer:
      'ENS names are registered on Ethereum mainnet but can be used as identities across many ecosystems.',
  },
  {
    question: 'How can I keep my ENS names safe?',
    answer:
      'Use a secure wallet, be cautious of signing unknown transactions, and verify links before connecting.',
  },
]

const PrimaryNameCard = ({
  primaryName,
  address,
}: {
  primaryName?: string
  address?: string
}) => {
  const metadataQuery = useQuery({
    ...profileMetadataQuery(primaryName),
  })

  if (!primaryName && !address) return null

  return (
    <Card className="border bg-white/90 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-2xl">
            {primaryName ?? 'No primary name yet'}
          </CardTitle>
          <CardDescription className="mt-1">
            {primaryName
              ? 'This is the main ENS name connected to your wallet.'
              : 'Set a primary ENS name so apps can show it instead of your address.'}
          </CardDescription>
        </div>
        {primaryName && (
          <LinkButton
            to="/p/$name"
            params={{ name: primaryName }}
            variant="outline"
            size="sm"
          >
            View profile
          </LinkButton>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Wallet
          </div>
          <div className="text-sm">
            {address ? truncateAddress(address) : 'Not connected'}
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Registered
          </div>
          <div className="text-sm">
            {metadataQuery.data?.registeredDate
              ? dateFormatter.format(metadataQuery.data.registeredDate)
              : '—'}
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Expires
          </div>
          <div className="text-sm">
            {metadataQuery.data?.expiryDate
              ? dateFormatter.format(metadataQuery.data.expiryDate)
              : '—'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const NamesTable = ({
  names,
  isLoading,
  error,
}: {
  names?: NameWithRelation[]
  isLoading: boolean
  error: unknown
}) => {
  if (isLoading) {
    return (
      <div className="py-6 text-center text-muted-foreground text-sm">
        Loading your names...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive text-sm">
        <Info className="size-4" />
        <span>We couldn&apos;t load your names. Please try again.</span>
      </div>
    )
  }

  if (!names || names.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground text-sm">
        No ENS names found for this wallet yet.
      </div>
    )
  }

  const favouriteSlice = names.slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Relation</th>
            </tr>
          </thead>
          <tbody>
            {names.map((name) => (
              <tr
                key={name.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  {name.name ? (
                    <Link
                      to="/p/$name"
                      params={{ name: name.name }}
                      className="font-medium text-ens-blue hover:underline"
                    >
                      {name.name}
                    </Link>
                  ) : (
                    <span className="font-mono text-muted-foreground text-xs">
                      {name.id.slice(0, 10)}…
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {formatDate(name.registrationDate)}
                </td>
                <td className="px-4 py-3">{formatDate(name.expiryDate)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {name.relation.owner && (
                      <Badge variant="outline" className="text-xs">
                        Owner
                      </Badge>
                    )}
                    {name.relation.registrant && (
                      <Badge variant="outline" className="text-xs">
                        Registrant
                      </Badge>
                    )}
                    {name.relation.resolvedAddress && (
                      <Badge variant="outline" className="text-xs">
                        Resolver
                      </Badge>
                    )}
                    {name.relation.wrappedOwner && (
                      <Badge variant="outline" className="text-xs">
                        Wrapped
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t bg-muted/40 px-4 py-3 text-center text-muted-foreground text-xs">
          Showing {names.length} name{names.length === 1 ? '' : 's'} on Sepolia
        </div>
      </div>

      <Card className="border bg-white/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="size-4 text-ens-blue" />
            Favourites
          </CardTitle>
          <CardDescription>
            A quick list of names you use the most.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {favouriteSlice.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              When you start collecting names, you&apos;ll be able to pin your
              favourites here.
            </p>
          ) : (
            <ul className="space-y-2">
              {favouriteSlice.map((name) => (
                <li
                  key={name.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Star className="size-4 text-ens-blue" />
                    <span className="text-sm">
                      {name.name ?? name.truncatedName ?? 'Unnamed'}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Expires {formatDate(name.expiryDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const DidYouKnowSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle>Did you know?</CardTitle>
      <CardDescription>
        ENS names are more than just .eth usernames. Use them across apps,
        networks, and wallets.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 rounded-xl bg-ens-blue/5 p-4">
        <div className="font-semibold text-ens-blue text-xs uppercase">
          One username, many places
        </div>
        <p className="text-muted-foreground text-sm">
          Set a primary name once and use it across compatible apps, wallets,
          and dapps instead of copying long addresses.
        </p>
      </div>
      <div className="space-y-2 rounded-xl bg-pink-50 p-4">
        <div className="font-semibold text-pink-600 text-xs uppercase">
          Stay safe
        </div>
        <p className="text-muted-foreground text-sm">
          Always double-check links and transactions before signing. ENS names
          help you recognise trusted accounts more easily.
        </p>
      </div>
    </CardContent>
  </Card>
)

const FaqSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle>Frequently Asked Questions</CardTitle>
      <CardDescription>
        Quick answers to common questions about managing your ENS names.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-1">
      {faqItems.map(({ question, answer }) => (
        <Collapsible key={question}>
          <div className="border-t first:border-t-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-1 py-3 text-left font-medium text-sm">
              <span>{question}</span>
              <span className="ml-4 text-muted-foreground text-xs">+</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 pb-3 text-muted-foreground text-sm">
              {answer}
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </CardContent>
  </Card>
)

export const DashboardPage = () => {
  const { data: wallet } = useWallet()
  const address = wallet?.address as Address | undefined

  const reverseNameQuery = useQuery({
    ...profileReverseNameQuery(address),
  })

  const primaryEnsName = reverseNameQuery.data?.name ?? wallet?.ensName ?? ''

  const namesQuery = useQuery(getDashboardNamesQueryOptions(address))

  const displayName =
    primaryEnsName || (address ? truncateAddress(address) : 'there')

  const hasProfile = Boolean(primaryEnsName)

  const hasNames = Boolean(namesQuery.data && namesQuery.data.length > 0)

  return (
    <div className="mx-auto flex max-w-6xl items-start gap-8 px-6 py-8">
      <DashboardSidebar hasProfile={hasProfile} profileName={primaryEnsName} />

      <div className="flex-1 space-y-6">
        <section className="space-y-4">
          {hasNames && (
            <div className="flex flex-col gap-2 rounded-xl border border-ens-blue/20 bg-ens-blue/5 px-4 py-3 text-ens-blue text-sm">
              <div className="flex items-center gap-2">
                <Info className="size-4" />
                <span className="font-medium">
                  You have ENS names ready to use
                </span>
              </div>
              <p>
                Set one as your primary name and share it instead of your wallet
                address.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h1 className="font-semibold text-3xl">Hello {displayName}</h1>
            <p className="text-muted-foreground text-sm">
              View your primary ENS name, manage your names, and explore tips
              and resources.
            </p>
          </div>
        </section>

        <PrimaryNameCard
          primaryName={primaryEnsName || undefined}
          address={address}
        />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-xl">My Names</h2>
            {hasNames && (
              <span className="text-muted-foreground text-xs">
                Showing {namesQuery.data?.length ?? 0} names linked to this
                wallet
              </span>
            )}
          </div>
          <NamesTable
            names={namesQuery.data}
            isLoading={namesQuery.isLoading}
            error={namesQuery.error}
          />
        </section>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
